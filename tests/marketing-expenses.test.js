const test=require('node:test'),assert=require('node:assert/strict');
const {parseMarketingSms,merchantKey,marketingSmsDigest}=require('../supabase/functions/ai-billing-webhook/marketing_expenses.mjs');

test('Samsung domestic amount is separated from cumulative amount and cardholder fields are not returned',()=>{
  const result=parseMarketingSms('[Web발신] 삼성1234승인 홍*길 / 23,900원 일시불 / 09/30 17:58 쿠팡 / 누적14,532,777원','2026-10-01T00:00:00+09:00');
  assert.equal(result.status,'recorded');assert.equal(result.amountKrw,23900);assert.equal(result.merchant,'쿠팡');
  assert.equal(result.transactionAt,'2026-09-30T08:58:00.000Z');assert.deepEqual(Object.keys(result).sort(),['amount','amountKrw','currency','eventKind','merchant','merchantKey','status','transactionAt'].sort());
  assert.doesNotMatch(JSON.stringify(result),/홍\*길|1234|14,532,777/);
});

test('Shinhan domestic and overseas forms preserve purchase time and original currency',()=>{
  const krw=parseMarketingSms('[Web발신] [신한체크승인] 가*림(0000) 09/30 18:02 (금액)39,674원 주식회사카카','2026-10-01T00:00:00+09:00');
  assert.equal(krw.merchant,'주식회사카카');assert.equal(krw.amountKrw,39674);
  const foreign=parseMarketingSms('[Web발신] 신한체크해외승인 가*림(0000) 09/30 18:03 INR 129.00 (US)Google YouTubePremium','2026-10-01T00:00:00+09:00');
  assert.equal(foreign.currency,'INR');assert.equal(foreign.amount,129);assert.equal(foreign.amountKrw,null);assert.match(foreign.merchant,/Google YouTubePremium/);
});

test('yearless dates crossing the year boundary use the nearest past KST year',()=>{
  const result=parseMarketingSms('[Web발신] 신한체크승인 이름(0000) 12/31 23:59 (금액)1,000원 상점','2026-01-01T00:10:00+09:00');
  assert.equal(result.transactionAt,'2025-12-31T14:59:00.000Z');
});

test('rejected, points, and cancellations are excluded without becoming failed rows',()=>{
  for(const [message,reason] of [
    ['신한체크해외거절 이름(0000) 유효기간경과사용불가 09/30 18:02 INR 129.00 (US)Google','rejected'],
    ['신한카드P사용 이름 100포인트 결제시차감청구 상점','points'],
    ['승인취소 09/30 상점','cancellation'],
  ])assert.deepEqual(parseMarketingSms(message,'2026-10-01T00:00:00+09:00'),{status:'ignored',reason});
});

test('unsupported shapes retain only a safe failure code and merchant ids are stripped',()=>{
  const failed=parseMarketingSms('삼성해외승인 이름(0000) USD 4.00 상점','2026-10-01T00:00:00+09:00');
  assert.deepEqual(failed,{status:'failed',failureCode:'unsupported_shape'});
  assert.equal(merchantKey('Google Ads 2410390'),'googleads');
  const sanitized=parseMarketingSms('[Web발신] 삼성1234승인 이름 / 1,000원 일시불 / 09/30 17:58 매장 2410390 / 누적2,000원','2026-10-01T00:00:00+09:00');
  assert.equal(sanitized.merchant,'매장');
});

test('message digest is deterministic and does not expose the message text',async()=>{
  const text='synthetic SMS with no real identity';
  const a=await marketingSmsDigest(text,'test-only-secret'),b=await marketingSmsDigest(text,'test-only-secret');
  assert.equal(a,b);assert.match(a,/^[0-9a-f]{64}$/);assert.doesNotMatch(a,/synthetic|identity/);
});
