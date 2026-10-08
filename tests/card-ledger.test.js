const test=require('node:test'),assert=require('node:assert/strict');
const {parseCardSms,cardTransactionRow,dedupeHash,recordCardLedger,transactionTimestamp}=require('../supabase/functions/ai-billing-webhook/card_ledger.mjs');
const at='2026-10-08T00:00:00+09:00';
const messages=[
 ['삼성4430승인 합*성\n39,000원 일시불\n09/29 00:42 네오사피엔스\n누적999,999원','samsung','4430','KRW',39000,'네오사피엔스'],
 ['삼성4430해외승인 합*성\nUSD 1,234.56\n10/03 02:00 OPENAI','samsung','4430','USD',1234.56,'OPENAI'],
 ['삼성4430해외승인 합*성\nKRW 91,477\n09/25 17:11 HIGGSFIELDINC.','samsung','4430','KRW',91477,'HIGGSFIELDINC.'],
 ['KB국민카드0051승인\n합*성님\n21,116원 일시불\n10/02 21:10\nImagineArt\n누적999,999원','kb','0051','KRW',21116,'ImagineArt'],
 ['KB국민카드0051 해외승인 합*성\n10.76(USD)\n09/15 10:03 미국 TEST STORE','kb','0051','USD',10.76,'TEST STORE'],
 ['KB국민카드 합*성님 09/15 10:03 21,116(KRW) 미국 TEST STORE 승인','kb',null,'KRW',21116,'TEST STORE'],
 ['삼성4430승인 합*성 39,000원 일시불/09/29 00:42 네오사피엔스/누적999,999원','samsung','4430','KRW',39000,'네오사피엔스'],
];
for(const [sms,issuer,last,currency,amount,merchant] of messages)test('공통 파서: '+issuer+' '+currency+' '+merchant,()=>{
 const p=parseCardSms('[Web발신]\n'+sms,at);assert.equal(p.status,'recorded');assert.equal(p.issuer,issuer);assert.equal(p.cardLast4,last);
 assert.equal(p.currency,currency);assert.equal(p.amount,amount);assert.equal(p.merchant,merchant);assert.doesNotMatch(JSON.stringify(p),/합\*성|누적/);
});
test('취소는 음수·원문 미포함이며 외화는 1500원 추정환산 표시를 남김',async()=>{
 const row=await cardTransactionRow('삼성4430해외취소 합*성\nUSD 10.50\n10/07 10:10 TEST',at);
 assert.equal(row.amount_native,-10.5);assert.equal(row.amount_krw,-15750);assert.equal(row.fx_source,'fixed_estimate');assert.equal(row.fx_rate,1500);assert.equal(row.raw_text,undefined);
});
test('월경계·연경계·윤년·날짜 오류를 수신 시각 기준으로 해석함',()=>{
 assert.equal(transactionTimestamp('12/31 23:59','2026-01-01T00:01:00+09:00'),'2025-12-31T14:59:00.000Z');
 assert.equal(transactionTimestamp('02/30 10:10',at),null);assert.equal(transactionTimestamp('10/07 24:10',at),null);
 assert.equal(transactionTimestamp('02/29 10:00','2024-03-01T00:00:00+09:00'),'2024-02-29T01:00:00.000Z');
});
test('거절·안내는 제외하고 하나카드 승인 표본은 읽기 실패로 남김',()=>{
 assert.equal(parseCardSms('하나카드4801승인\n100원',at).failureCode,'hana_sample_needed');
 assert.equal(parseCardSms('KB국민카드 사용 안내',at).status,'ignored');
 assert.equal(parseCardSms('삼성4430해외거절 USD 1',at).status,'ignored');
});
test('줄바꿈·Web발신·슬래시 구분 차이에도 중복 해시가 같음',async()=>{
 assert.equal(await dedupeHash('[Web발신]\n'+messages[0][0]),await dedupeHash(messages[0][0].replace(/\n/g,' / ')));
});
test('성공 RPC·실패 원문 30일·원문 중복·스키마 누락을 구별함',async()=>{
 const writes=[],client={rpc:async(name,params)=>{writes.push({name,params});return {data:{id:1},error:null};},from:table=>({upsert:async(row,options)=>{writes.push({table,row,options});return {error:null};}})};
 assert.equal((await recordCardLedger(client,messages[0][0],at)).status,'recorded');assert.equal(writes[0].name,'record_card_transaction');assert.doesNotMatch(JSON.stringify(writes[0]),/합\*성|누적/);
 const bad='삼성4430승인 합성\n금액읽기실패';assert.equal((await recordCardLedger(client,bad,at)).status,'review');
 assert.equal(writes[1].table,'card_sms_failed_raw');assert.equal(writes[1].row.body,bad);assert.equal(writes[1].options.ignoreDuplicates,true);
 assert.equal(new Date(writes[1].row.expires_at)-new Date(at),30*86400000);
 assert.equal((await recordCardLedger({},messages[0][0],at)).status,'error');
});