// Deploy only with verify_jwt:true (supabase/config.toml). The only caller is the PC script ~/.claude/scripts/codex_model_usage_sync.py.
// X-Sync-Token is checked by SHA-256 against webhook_secrets(name='ai_usage_sync_sha256'); the token and request body are never stored or logged.
import { createClient } from "npm:@supabase/supabase-js@2";
import { MAX_BODY_BYTES,kstToday,sameHex,sha256Hex,validateUsagePayload } from "./payload.mjs";
function response(status:number,extra:Record<string,unknown>={}){return new Response(JSON.stringify({ok:status<400,...extra}),{status,headers:{'content-type':'application/json'}});}
Deno.serve(async req=>{
  if(req.method!=='POST')return response(405);
  if(Number(req.headers.get('content-length')||0)>MAX_BODY_BYTES)return response(413);
  const token=req.headers.get('x-sync-token')||'';
  if(token.length<32||token.length>256)return response(401);
  const url=Deno.env.get('SUPABASE_URL')||'',serviceKey=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')||'';
  if(!url||!serviceKey)return response(500);
  const sb=createClient(url,serviceKey,{auth:{persistSession:false},global:{headers:{Authorization:`Bearer ${serviceKey}`}}});
  const {data:secret,error:secretError}=await sb.from('webhook_secrets').select('value').eq('name','ai_usage_sync_sha256').maybeSingle();
  if(secretError||!secret?.value||!sameHex(await sha256Hex(token),String(secret.value)))return response(401);
  const raw=await req.text();
  if(new TextEncoder().encode(raw).length>MAX_BODY_BYTES)return response(413);
  let body:unknown;try{body=JSON.parse(raw);}catch{return response(400,{error:'invalid_json'});}
  const parsed=validateUsagePayload(body,kstToday(Date.now()));
  if(!parsed.ok||!parsed.value)return response(400,{error:parsed.error});
  const {data,error}=await sb.rpc('ai_model_usage_replace',{p_usage:parsed.value.usage});
  if(error)return response(500,{error:'replace_failed'});
  return response(200,{rows:data,dates:parsed.value.dates.length});
});
