// 리뷰 요청 문자 — verify_jwt=true(supabase/config.toml). hr.html 「📥 문의함 › ⭐ 리뷰 요청」이 functions.invoke로 부른다.
// 순서: ① 호출자 세션으로 review_sms_prepare(권한·시험 모드·재발송 막기·시간·문구 검사 + 기록 · 보내는 길이 pc면 대기함에 넣음) →
//       ② 보내는 길이 edge일 때만 pending 줄을 솔라피로 발송 → ③ service_role로 review_sms_finish(결과 기록).
// 2026-11-27부터 기본은 pc(병원 PC 중계 tools/review_sms_relay.py): 솔라피가 문자 발송을 고정 IP에서만 받아서 클라우드인 여기서는 못 보냄.
// 솔라피 키(SOLAPI_API_KEY·SOLAPI_API_SECRET)가 없으면 보내지 않고 not_configured로 적는다.
import {MAX_BODY_BYTES,SOLAPI_SEND_URL,corsHeaders,mapPrepareError,mapSolapiResult,publicRows,sendsDirect,solapiAuthHeader,solapiRequestBody,validateRequest} from './core.mjs';

type Row={log_id:string;status:string;phone_tail:string;to_number:string|null;message_text:string|null;sender:string|null;mode:string};
type Result={log_id:string;status:string;provider_id:string|null;error:string|null};

function json(status:number,body:Record<string,unknown>,cors:Record<string,string>):Response{
  return new Response(JSON.stringify(body),{status,headers:{...cors,'content-type':'application/json; charset=utf-8'}});
}

Deno.serve(async(req:Request)=>{
  const cors=corsHeaders(req.headers.get('origin'));
  if(req.method==='OPTIONS')return new Response('ok',{headers:cors});
  if(req.method!=='POST')return json(405,{error:'method_not_allowed'},cors);
  const auth=req.headers.get('authorization')||'';
  if(!/^Bearer [A-Za-z0-9._-]+$/.test(auth))return json(401,{error:'auth_required'},cors);
  const raw=await req.text();
  if(new TextEncoder().encode(raw).length>MAX_BODY_BYTES)return json(413,{error:'body_too_large'},cors);
  let body:unknown;try{body=JSON.parse(raw);}catch{return json(400,{error:'invalid_json'},cors);}
  const input=validateRequest(body);
  if(!input)return json(400,{error:'invalid_request'},cors);

  const url=Deno.env.get('SUPABASE_URL'),anon=Deno.env.get('SUPABASE_ANON_KEY'),service=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if(!url||!anon||!service)return json(500,{error:'server_config_missing'},cors);

  const prep=await fetch(new URL('/rest/v1/rpc/review_sms_prepare',url),{method:'POST',
    headers:{apikey:anon,Authorization:auth,'Content-Type':'application/json'},body:JSON.stringify({p_phones:input.phones,p_name:input.name})});
  if(!prep.ok){
    const detail=await prep.json().catch(()=>({}));
    const mapped=mapPrepareError((detail as {message?:string})?.message);
    return json(mapped.status,{error:mapped.error},cors);
  }
  const rows=await prep.json() as Row[];
  const pending=rows.filter(r=>r.status==='pending'&&r.to_number&&r.message_text&&r.sender);
  let results:Result[]=[];
  if(pending.length){
    let transport='pc';
    try{
      const t=await fetch(new URL('/rest/v1/app_settings?key=eq.review_sms.transport&select=value',url),{headers:{apikey:service,Authorization:'Bearer '+service}});
      if(t.ok){const list=await t.json() as {value?:string}[];transport=list[0]?.value||'pc';}else await t.body?.cancel();
    }catch{transport='pc';}
    if(!sendsDirect(transport))return json(200,{rows:publicRows(rows,[]),relay:'pc'},cors);
  }
  if(pending.length){
    const key=Deno.env.get('SOLAPI_API_KEY')||'',secret=Deno.env.get('SOLAPI_API_SECRET')||'';
    if(!key||!secret){
      results=pending.map(r=>({log_id:r.log_id,status:'not_configured',provider_id:null,error:'SOLAPI key missing'}));
    }else{
      try{
        const salt=crypto.randomUUID().replace(/-/g,'');
        const authHeader=await solapiAuthHeader(key,secret,new Date().toISOString(),salt);
        const res=await fetch(SOLAPI_SEND_URL,{method:'POST',headers:{Authorization:authHeader,'Content-Type':'application/json'},body:JSON.stringify(solapiRequestBody(pending))});
        const data=await res.json().catch(()=>null);
        results=mapSolapiResult(pending,res.status,data);
      }catch(e){
        results=pending.map(r=>({log_id:r.log_id,status:'failed',provider_id:null,error:String((e as Error)?.message||e).slice(0,500)}));
      }
    }
    const fin=await fetch(new URL('/rest/v1/rpc/review_sms_finish',url),{method:'POST',
      headers:{apikey:service,Authorization:'Bearer '+service,'Content-Type':'application/json'},body:JSON.stringify({p_results:results})});
    if(!fin.ok)return json(502,{error:'finish_failed',rows:publicRows(rows,results)},cors);
    await fin.body?.cancel();
  }
  return json(200,{rows:publicRows(rows,results)},cors);
});
