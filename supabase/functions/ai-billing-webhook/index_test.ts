import { createWebhookHandler } from './webhook_core.ts';

const SECRET='local-test-only';
function fixture(){
  const inserts: Record<string, unknown>[]=[];let secretLookupName='';
  const createClient=()=>({from(table: string): any {
    if(table==='webhook_secrets')return{select(){return this},eq(_column: string,value: string){secretLookupName=value;return this},async single(){return{data:{value:SECRET},error:null}}};
    if(table==='ai_billing_events')return{async insert(row: Record<string, unknown>){inserts.push(row);return{error:null}}};
    throw new Error(`unexpected table ${table}`);
  }});
  const handler=createWebhookHandler(createClient,name=>name==='SUPABASE_URL'?'https://db.test':name==='SUPABASE_SERVICE_ROLE_KEY'?'not-a-real-key':undefined);
  return{handler,inserts,get secretLookupName(){return secretLookupName}};
}
const json=async (response: Response)=>await response.json();
const req=(body: Record<string, unknown>,platform='naver_ads',token=SECRET)=>new Request(`https://fn.test/ai-billing-webhook?platform=${platform}`,{method:'POST',headers:{'x-webhook-token':token},body:JSON.stringify(body)});

Deno.test('GET receives 405 without contacting the database',async()=>{
 const f=fixture();const r=await f.handler(new Request('https://fn.test/ai-billing-webhook'));
 if(r.status!==405||f.inserts.length)throw new Error('GET must return 405 without writes');
});
Deno.test('Naver low balance ignores caller-supplied classification and amount',async()=>{
 const f=fixture();const r=await f.handler(req({raw_text:'[Web발신]\n제목: [네이버 광고] 잔액 안내\n지역+파워컨텐츠 키워드(모바일)(2410390) 잔액 100,000원 이하 알림\nhttps://ads.naver.com/',platform:'Claude',note:'NAVER_AD_STOP',amount_krw:500000}));
 const body=await json(r);if(r.status!==200||body.amount_krw!==0)throw new Error('low balance must store zero transaction amount');
 if(f.inserts.length!==1)throw new Error('one event should be inserted');
 const row=f.inserts[0];if(row.platform!=='naver_ads'||row.note!=='NAVER_AD_LOW_BALANCE'||row.amount_krw!==0||row.threshold_krw!==100000||row.account_id!=='2410390'||row.account_name!=='지역+파워컨텐츠 키워드(모바일)')throw new Error(`parser result not authoritative: ${JSON.stringify(row)}`);
 if(f.secretLookupName!=='ai_billing_webhook')throw new Error('existing token name changed');
});
Deno.test('Unknown Naver ads are recorded but unrelated SMS is rejected',async()=>{
 const f=fixture();let r=await f.handler(req({raw_text:'[네이버 광고] 새 유형 안내\n계정 정보'}));
 if(r.status!==200||f.inserts[0]?.note!=='NAVER_AD_UNKNOWN'||f.inserts[0]?.amount_krw!==0)throw new Error('unknown Naver message was not safely recorded');
 r=await f.handler(req({raw_text:'택배 도착 안내 100원'}));if(r.status!==400||f.inserts.length!==1)throw new Error('unrelated SMS must be rejected without storage');
});
Deno.test('Invalid secret and foreign-platform marker do not write events',async()=>{
 const f=fixture();let r=await f.handler(req({raw_text:'[네이버 광고] 검색광고 캠페인 노출 중단'} ,'naver_ads','bad'));
 if(r.status!==401)throw new Error('wrong token must return 401');
 r=await f.handler(req({raw_text:'USD 2.12',note:'NAVER_AD_CHARGE',amount_krw:1},'StepFun'));
 if(r.status!==400||f.inserts.length)throw new Error('Naver marker must be rejected on another platform');
});
Deno.test('Regular platform continues to honor its existing amount field',async()=>{
 const f=fixture();const r=await f.handler(req({raw_text:'삼성카드 해외승인',amount_krw:3180},'StepFun'));
 if(r.status!==200||f.inserts[0]?.platform!=='StepFun'||f.inserts[0]?.amount_krw!==3180)throw new Error('legacy platform path changed');
});
