/** 카드 승인·취소의 공통 파서. 원문은 반환하지 않음. */
const CUR='USD|KRW|EUR|JPY|CNY|GBP|AUD|CAD|HKD|SGD|INR|TWD|THB|VND|PHP|MYR|CHF|NZD';
export function normalizeSms(raw) {
  return String(raw || '').normalize('NFKC').replace(/\r\n?/g,'\n')
    .replace(/^\s*\[web발신\]\s*/i,'').replace(/[\t ]+\/\s+/g,'\n').trim();
}
export function merchantKey(value) {
  return String(value||'').normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]/gu,'').slice(0,120);
}
export function isCardSms(raw) {
  return /^(?:삼성(?:\d{4}|카드)|KB국민카드|하나카드)/.test(normalizeSms(raw));
}
export function transactionTimestamp(value,receivedAt) {
  const m=String(value).match(/^(\d{2})\/(\d{2})\s+(\d{2}):(\d{2})$/),received=new Date(receivedAt);
  if(!m || !Number.isFinite(received.getTime()))return null;
  const [,mo,day,hour,minute]=m.map(Number),kst=new Date(received.getTime()+32400000);
  if(mo<1||mo>12||day<1||day>31||hour>23||minute>59)return null;
  const candidates=[kst.getUTCFullYear()-1,kst.getUTCFullYear(),kst.getUTCFullYear()+1].map(y=>Date.UTC(y,mo-1,day,hour-9,minute))
    .filter(t=>{const d=new Date(t+32400000);return d.getUTCMonth()===mo-1&&d.getUTCDate()===day&&d.getUTCHours()===hour&&d.getUTCMinutes()===minute;});
  const past=candidates.filter(t=>t<=received.getTime()+300000).sort((a,b)=>b-a);
  return past.length ? new Date(past[0]).toISOString():null;
}
export function parseCardSms(raw,receivedAt=new Date().toISOString()) {
  const text=normalizeSms(raw);
  if(!text)return {status:'failed',failureCode:'empty'};
  if(!isCardSms(text))return {status:'ignored',reason:'not_card'};
  if(/거절|사용불가|P사용|포인트\s*결제시차감청구/.test(text))return {status:'ignored',reason:'not_transaction'};
  const header=text.match(/^(삼성(?:카드)?|KB국민카드|하나카드)\s*(\d{4})?\s*(해외)?(승인취소|승인|취소)?/);
  const issuer=header?.[1].startsWith('삼성')?'samsung':header?.[1]==='KB국민카드'?'kb':'hana';
  if(!/승인|취소/.test(text))return {status:'ignored',reason:'notice'};
  if(issuer==='hana')return {status:'failed',failureCode:'hana_sample_needed'};
  const dt=text.match(/(\d{2}\/\d{2}\s+\d{2}:\d{2})/);
  if(!dt)return {status:'failed',failureCode:'unreadable_fields'};
  const amountRx=new RegExp(`(?:\\b(${CUR})[ \\t]*(-?[\\d,]+(?:\\.\\d{1,4})?)|(-?[\\d,]+(?:\\.\\d{1,4})?)[ \\t]*\\([ \\t]*(${CUR})[ \\t]*\\)|(-?[\\d,]+)[ \\t]*원)`,'i');
  const price=text.replace(/(?:누적|잔액|한도)[^\n]*/g,'').match(amountRx);
  if(!price)return {status:'failed',failureCode:'unreadable_fields'};
  const currency=(price[1]||price[4]||'KRW').toUpperCase(),amount=Math.abs(Number((price[2]||price[3]||price[5]).replace(/,/g,'')));
  let tail=text.slice(dt.index+dt[0].length).trim();
  // 국민 해외의 날짜→금액→국가→가맹점 순서도 처리함.
  if(price.index>=dt.index)tail=tail.replace(amountRx,'').trim();
  tail=tail.replace(/^(?:미국|미\s*국|영국|일본|중국|호주|캐나다|독일|프랑스|아일랜드|아일|싱가포르|싱가|네덜란드|홍콩|캐나|스위스|인도|한국)\s+/,'')
    .replace(/^\([A-Z]{2}\)\s*/,'').split(/\n|\s*누적|\s*잔액/)[0].replace(/\s*(?:승인취소|승인|취소)$/,'').trim();
  const merchant=tail.slice(0,120),at=transactionTimestamp(dt[0],receivedAt);
  const explicit=header?.[4]||text.match(/(승인취소|승인|취소)\s*$/)?.[1];
  if(!explicit||!merchant||!merchantKey(merchant)||!at||!Number.isFinite(amount)||amount<=0)return {status:'failed',failureCode:'unreadable_fields'};
  const kind=explicit==='승인'?'purchase':'cancellation';
  return {status:kind==='purchase'?'recorded':'cancellation',issuer,cardLast4:header?.[2]||null,eventKind:kind,
    transactionAt:at,currency,amount,merchant,merchantKey:merchantKey(merchant),
    abroad:header?.[3]||currency!=='KRW'||price[4]?'overseas':'domestic'};
}
export async function dedupeHash(raw) {
  const normalized=normalizeSms(raw).replace(/\s+/g,' ').trim();
  const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(normalized));
  return [...new Uint8Array(bytes)].map(b=>b.toString(16).padStart(2,'0')).join('');
}
export function planRawStorage(parsed,now=new Date().toISOString()) {
  return parsed.status==='failed'?{storeRaw:true,failReason:parsed.failureCode,expiresAtIso:new Date(new Date(now).getTime()+2592000000).toISOString()}:
    {storeRaw:false,failReason:null,expiresAtIso:null};
}
export function toKrw(amount,currency) { return currency==='KRW'?Math.round(amount):currency==='USD'?Math.round(amount*1500):null; }
export async function cardTransactionRow(raw,receivedAt,source='sms') {
  const p=parseCardSms(raw,receivedAt);
  if(p.status!=='recorded'&&p.status!=='cancellation')return null;
  const sign=p.eventKind==='cancellation'?-1:1;
  return {source,received_at:receivedAt,card_issuer:p.issuer,card_last4:p.cardLast4,event_kind:p.eventKind,
    transaction_at:p.transactionAt,currency:p.currency,amount_native:sign*p.amount,
    amount_krw:toKrw(p.amount,p.currency)==null?null:sign*toKrw(p.amount,p.currency),
    fx_rate:p.currency==='KRW'?1:p.currency==='USD'?1500:null,fx_source:p.currency==='KRW'?'native':p.currency==='USD'?'fixed_estimate':'unconverted',
    merchant:p.merchant,merchant_key:p.merchantKey,abroad:p.abroad,dedupe_hash:await dedupeHash(raw)};
}
/** 스키마가 아직 없거나 이중 기록에 실패해도 기존 쓰기 경로는 이어감. 실패 여부는 응답으로 알림. */
export async function recordCardLedger(client,raw,receivedAt=new Date().toISOString()) {
  const p=parseCardSms(raw,receivedAt);
  if(p.status==='ignored')return {status:'ignored',reason:p.reason};
  try {
    if(p.status==='failed') {
      const plan=planRawStorage(p,receivedAt);
      const {error}=await client.from('card_sms_failed_raw').upsert({dedupe_hash:await dedupeHash(raw),received_at:receivedAt,
        body:String(raw).slice(0,16000),fail_reason:p.failureCode,expires_at:plan.expiresAtIso},{onConflict:'dedupe_hash',ignoreDuplicates:true});
      return error?{status:'error',code:'failed_raw_write'}:{status:'review',reason:p.failureCode};
    }
    const row=await cardTransactionRow(raw,receivedAt);
    const {data,error}=await client.rpc('record_card_transaction',{p_transaction:row});
    return error?{status:'error',code:'ledger_write'}:{status:'recorded',...data};
  }catch {return {status:'error',code:'ledger_unavailable'};}
}