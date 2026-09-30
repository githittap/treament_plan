import { createWebhookHandler } from './webhook_core.ts';

const SECRET='local-test-only';
function fixture(cancellationCandidates: {id:string}[]=[],alreadyReversedIds:string[]=[],simulateUniqueReversalCollision=false){
  const inserts: Record<string, unknown>[]=[];const marketingWrites:{row:Record<string,unknown>,options:Record<string,unknown>}[]=[];let secretLookupName='';
  const createClient=()=>({from(table: string): any {
    if(table==='webhook_secrets')return{select(){return this},eq(_column: string,value: string){secretLookupName=value;return this},async single(){return{data:{value:SECRET},error:null}}};
    if(table==='ai_billing_events')return{async insert(row: Record<string, unknown>){inserts.push(row);return{error:null}}};
    if(table==='marketing_expense_events'){
      const filters:Record<string,unknown>={},excludedIds:string[]=[];
      return{
        select(){return this},eq(column:string,value:unknown){filters[column]=value;return this},is(){return this},lte(){return this},
        not(column:string,operator:string,value:string){if(column==='id'&&operator==='in')excludedIds.push(...value.replace(/^\(|\)$/g,'').split(',').filter(Boolean));return this},
        async limit(){return filters.event_kind==='cancellation'?{data:alreadyReversedIds.map(id=>({reversed_event_id:id})),error:null}:{data:cancellationCandidates.filter(item=>!alreadyReversedIds.includes(item.id)&&!excludedIds.includes(item.id)),error:null}},
        async upsert(row:Record<string,unknown>,options:Record<string,unknown>){
          if(row.reversed_event_id&&simulateUniqueReversalCollision){simulateUniqueReversalCollision=false;return{error:{code:'23505'}};}
          marketingWrites.push({row,options});if(row.reversed_event_id)alreadyReversedIds.push(String(row.reversed_event_id));return{error:null};
        },
      };
    }
    throw new Error(`unexpected table ${table}`);
  }});
  const handler=createWebhookHandler(createClient,name=>name==='SUPABASE_URL'?'https://db.test':name==='SUPABASE_SERVICE_ROLE_KEY'?'not-a-real-key':undefined);
  return{handler,inserts,marketingWrites,get secretLookupName(){return secretLookupName}};
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
Deno.test('Marketing branch stores a privacy-safe Samsung event and deduplicates by HMAC key',async()=>{
 const f=fixture(),raw='[Web발신] 삼성1234승인 홍*길 / 23,900원 일시불 / 09/30 17:58 쿠팡 / 누적14,532,777원';
 const r=await f.handler(req({raw_text:raw},'marketing'));const body=await json(r);
 if(r.status!==200||body.recorded!==true||f.marketingWrites.length!==1||f.inserts.length)throw new Error('marketing SMS did not use the isolated event table');
 const {row,options}=f.marketingWrites[0];
 if(row.amount_krw!==23900||row.currency!=='KRW'||row.merchant!=='쿠팡'||row.parse_status!=='recorded'||row.raw_text||row.cardholder||row.card_last4||options.ignoreDuplicates!==true||options.onConflict!=='event_hash')throw new Error('marketing event is not private/idempotent');
 if(JSON.stringify(body).includes('홍*길')||JSON.stringify(row).includes('홍*길')||JSON.stringify(row).includes('14,532,777'))throw new Error('sensitive message fields escaped into a response or row');
 await f.handler(req({raw_text:raw},'marketing'));
 if(f.marketingWrites[1]?.row.event_hash!==row.event_hash)throw new Error('identical retry did not reuse its HMAC digest');
});
Deno.test('Marketing branch excludes point/rejected messages and stores only a failure code for unreadable messages',async()=>{
 const f=fixture();let r=await f.handler(req({raw_text:'신한카드P사용 이름 100포인트 결제시차감청구 상점'},'marketing'));
 if(r.status!==200||f.marketingWrites.length)throw new Error('points must be excluded');
 r=await f.handler(req({raw_text:'삼성해외승인 이름(0000) USD 4.00 상점'},'marketing'));
 const row=f.marketingWrites[0]?.row;if(r.status!==200||row?.parse_status!=='failed'||row.failure_code!=='unsupported_shape'||row.merchant||row.raw_text)throw new Error('unreadable message should retain only a safe failure code');
});
Deno.test('Matched cancellation is stored as a negative linked event',async()=>{
 const f=fixture([{id:'prior-approval'}]);const r=await f.handler(req({raw_text:'[Web발신] 삼성0000승인취소 가*림 / 1,000원 일시불 / 09/30 17:58 Google1234 / 누적14,532,777원'},'marketing'));
 const body=await json(r),row=f.marketingWrites[0]?.row;
 if(r.status!==200||body.recorded!==true||row?.event_kind!=='cancellation'||row?.amount_native!==-1000||row?.amount_krw!==-1000||row?.reversed_event_id!=='prior-approval')throw new Error('matched cancellation did not offset its prior approval');
 if(row?.merchant!=='Google'||row?.merchant_key!=='google'||JSON.stringify(row).match(/가\*림|0000|14,532,777/))throw new Error('cancellation row retained sensitive or invalid merchant data');
});
Deno.test('Unmatched cancellation is preserved for review and never reported as recorded',async()=>{
 const f=fixture();const r=await f.handler(req({raw_text:'[Web발신] 삼성0000승인취소 가*림 / 1,000원 일시불 / 09/30 17:58 Google1234'},'marketing'));
 const body=await json(r),row=f.marketingWrites[0]?.row;
 if(r.status!==200||body.recorded!==false||body.review!==true||row?.event_kind!=='cancellation'||row?.parse_status!=='failed'||row?.failure_code!=='unmatched_cancellation'||row?.amount_native!==1000||row?.amount_krw!==1000||row?.merchant!=='Google'||row?.merchant_key!=='google')throw new Error('unmatched cancellation was not safely retained for review');
});
Deno.test('Second distinct cancellation for the same approval is preserved as duplicate review, not a unique-key 500',async()=>{
 const f=fixture([{id:'prior-approval'}]);
 const first=await f.handler(req({raw_text:'[Web발신] 삼성0000승인취소 가*림 / 1,000원 일시불 / 09/30 17:58 Google1234 / 누적14,532,777원'},'marketing'));
 const second=await f.handler(req({raw_text:'[Web발신] 삼성0000승인취소 가*림 / 1,000원 일시불 / 09/30 17:58 Google1234 / 누적14,532,778원'},'marketing'));
 const body=await json(second),row=f.marketingWrites[1]?.row;
 if(first.status!==200||second.status!==200||body.recorded!==false||body.review!==true||row?.parse_status!=='failed'||row.failure_code!=='duplicate_cancellation'||row.reversed_event_id)throw new Error('second cancellation must remain safely reviewable instead of reusing the approval');
});
Deno.test('A concurrent reversed_event_id unique-key collision falls back to a duplicate review row',async()=>{
 const f=fixture([{id:'prior-approval'}],[],true),r=await f.handler(req({raw_text:'[Web발신] 삼성0000승인취소 가*림 / 1,000원 일시불 / 09/30 17:58 Google1234'},'marketing'));
 const body=await json(r),row=f.marketingWrites[0]?.row;
 if(r.status!==200||body.recorded!==false||body.review!==true||row?.failure_code!=='duplicate_cancellation'||row?.reversed_event_id)throw new Error('unique cancellation race was not converted to a review row');
});
