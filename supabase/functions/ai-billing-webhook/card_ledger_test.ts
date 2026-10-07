import {createWebhookHandler} from './webhook_core.ts';
const TOKEN='synthetic-ledger-token';
function fixture(failLedger=false, missingMerchant=false){
 const legacy:any[]=[],marketing:any[]=[],failed:any[]=[],ledger:any[]=[],seen=new Set<string>();
 const client={from(table:string):any{
  if(table==='webhook_secrets')return {select(){return this},eq(){return this},single:async()=>({data:{value:TOKEN},error:null})};
  if(table==='card_sms_failed_raw')return {upsert:async(row:any)=>{failed.push(row);return {error:null}}};
  if(table==='ai_billing_events')return {insert:async(row:any)=>{if(missingMerchant && 'card_merchant' in row)return {error:{code:'PGRST204',message:'card_merchant missing'}};legacy.push(row);return {error:null}}};
  if(table==='marketing_expense_events')return {upsert:async(row:any)=>{marketing.push(row);return {error:null}}};
  throw new Error('unexpected table');
 },rpc:async(name:string,args?:any)=>{
  if(name==='card_sms_failed_raw_purge')return {data:0,error:null};
  if(failLedger)return {data:null,error:{code:'42P01'}};
  const row=args.p_transaction,duplicate=seen.has(row.dedupe_hash);seen.add(row.dedupe_hash);
  if(!duplicate)ledger.push(row);return {data:{id:1,duplicate},error:null};
 }};
 const handler=createWebhookHandler(()=>client,()=> 'synthetic-env');
 return {legacy,marketing,failed,ledger,run:(sms:string,platform='AI',token=TOKEN)=>handler(new Request('https://synthetic.invalid/?platform='+platform,{method:'POST',headers:{'x-webhook-token':token},body:sms}))};
}
function check(value:any,message:string){if(!value)throw new Error(message);}
Deno.test('성공: 기존 AI 기록과 새 원장을 같이 쓰고 기존 원문을 남기지 않음',async()=>{
 const f=fixture(),r=await f.run('삼성4430승인 합*성\n12,000원 일시불\n10/06 12:00 TYPECAST.AI\n누적999,999원');
 check(r.status===200&&f.legacy.length===1&&f.ledger.length===1,'dual write');
 check(f.legacy[0].raw_text===null&&f.legacy[0].card_merchant==='TYPECAST.AI','legacy structured merchant');
 check(f.ledger[0].amount_krw===12000&&f.failed.length===0,'no cumulative/no failed raw');
 check(!JSON.stringify(f.legacy.concat(f.ledger)).includes('합*성'),'identity retained');
});
Deno.test('마케팅 경로·국민 국내도 이중 기록하며 일반 카드 경로는 기존 AI 표를 오염시키지 않음',async()=>{
 const f=fixture(),sms='KB국민카드0051승인\n합*성님\n21,116원 일시불\n10/02 21:10\nTEST\n누적999,999원';
 check((await f.run(sms,'marketing')).status===200&&f.marketing.length===1&&f.ledger.length===1,'marketing dual write');
 check((await f.run(sms,'card_ledger')).status===200&&f.legacy.length===0&&f.ledger.length===1,'unified only and dedup');
});
Deno.test('해외 KRW 앞표시와 국민 괄호 USD를 기록함(환율 대역만 사용)',async()=>{
 const old=globalThis.fetch;globalThis.fetch=()=>Promise.resolve(new Response(JSON.stringify({rates:{KRW:1500}})));
 try{
 const f=fixture();check((await f.run('삼성4430해외승인 합성\nKRW 91,477\n09/25 17:11 HIGGSFIELDINC.')).status===200,'KRW');
 check((await f.run('KB국민카드 합성님 09/15 10:03 10.76(USD) 미국 TEST 승인')).status===200,'USD');
 check(f.legacy[0].amount_krw===91477&&f.ledger[1].amount_krw===16140,'fx values');
 }finally{globalThis.fetch=old;}
});
Deno.test('읽기 실패만 30일 원문 저장하고 무인증 요청은 쓰지 않음',async()=>{
 const f=fixture(),sms='삼성4430승인 합성\n금액읽기실패';
 check((await f.run(sms,'card_ledger','wrong')).status===401&&f.failed.length===0,'auth');
 check((await f.run(sms,'card_ledger')).status===200&&f.failed.length===1&&f.legacy.length===0,'failed only');
 check(new Date(f.failed[0].expires_at).getTime()-new Date(f.failed[0].received_at).getTime()===30*86400000,'30 days');
});
Deno.test('새 표 미설치 때 기존 기록을 계속하고 응답에 이중 기록 실패를 표시함',async()=>{
 const f=fixture(true),r=await f.run('삼성4430승인 합성\n1,000원 일시불\n10/06 12:00 TEST');
 check(r.status===200&&f.legacy.length===1,'legacy continues');check((await r.json()).card_ledger.status==='error','failure visible');
});
Deno.test('USD 쉼표 금액·거절 제외·새 가맹점 열 미설치 호환',async()=>{
 const old=globalThis.fetch;globalThis.fetch=()=>Promise.resolve(new Response(JSON.stringify({rates:{KRW:1500}})));
 try{
  const f=fixture(true,true);
  check((await f.run('삼성4430해외승인 합성\nUSD 1,234.56\n10/06 12:00 TEST')).status===200,'legacy fallback');
  check(f.legacy.length===1&&f.legacy[0].amount_krw===1851840&&f.legacy[0].raw_text===null,'comma value');
  check((await f.run('삼성4430해외거절 합성\nUSD 1,234.56\n10/06 12:00 TEST')).status===200&&f.legacy.length===1,'rejected is not billed');
 }finally{globalThis.fetch=old;}
});

Deno.test('통합 원장 전용 경로는 환율 외부 호출 없이 외화를 저장함',async()=>{
 const old=globalThis.fetch;let calls=0;globalThis.fetch=()=>{calls++;return Promise.reject(new Error('offline'));};
 try{
  const f=fixture(),response=await f.run('삼성4430해외승인 합성\nUSD 20.00\n10/06 12:00 TEST','card_ledger');
  check(response.status===200&&calls===0&&f.legacy.length===0&&f.ledger[0].amount_krw===30000,'ledger offline');
 }finally{globalThis.fetch=old;}
});
