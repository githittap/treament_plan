import { isSafePushEndpoint, safeNotification } from './transport.ts';
Deno.test('advertising push types produce generic same-origin notices',()=>{
 const expected=new Map([
  ['ai_billing_stop','네이버 광고 노출 중단'],
  ['ai_billing_low_balance','네이버 광고 잔액 안내'],
  ['ai_billing_charge','네이버 광고 충전 완료'],
 ]);
 for(const [type,title] of expected){const n=safeNotification(type);if(!n||n.title!==title||n.url!=='/hr.html?tab=inbox')throw new Error(`missing safe notification ${type}`);}
 if(isSafePushEndpoint('https://evil.example'))throw new Error('endpoint guard regression');
});

Deno.test('advertising push includes only validated account and amount fields',()=>{
 const n=safeNotification('ai_billing_charge',{account_id:'1970043',account_name:'계정B\n위험',amount_krw:500000,raw_text:'secret raw sms'});
 if(!n?.body.includes('1970043')||!n.body.includes('500,000원')||n.body.includes('secret raw sms')||n.body.includes('\n'))throw new Error(`advertising detail payload was not safely rendered: ${n?.body}`);
});
