/** Python이 전달한 문자를 웹훅과 같은 파서로 변환함. 원문 파일은 만들지 않음. */
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { isCardSms,parseCardSms,cardTransactionRow } from '../supabase/functions/ai-billing-webhook/card_ledger.mjs';
const output=process.argv[process.argv.indexOf('--out')+1];
if(!output||!path.isAbsolute(output))throw new Error('--out 절대 경로 필요');
fs.mkdirSync(output,{recursive:true});
const rows=[],seen=new Set(),counts={records:0,card_messages:0,ignored:0,failed:0,duplicates:0,missing_timestamp:0},failures={},issuers={},months={},sourceKinds={};
for await(const line of readline.createInterface({input:process.stdin,crlfDelay:Infinity})) {
  let sms;try{sms=JSON.parse(line);}catch{throw new Error('문자 전달 형식을 읽지 못했음(원문 미출력)');}counts.records++;
  if(!isCardSms(sms.text))continue;
  counts.card_messages++;
  if(!sms.received_at){counts.missing_timestamp++;continue;}
  const p=parseCardSms(sms.text,sms.received_at);
  if(p.status==='ignored'){counts.ignored++;continue;}
  if(p.status==='failed'){counts.failed++;failures[p.failureCode]=(failures[p.failureCode]||0)+1;continue;}
  const row=await cardTransactionRow(sms.text,sms.received_at,'backup_import');
  if(seen.has(row.dedupe_hash)){counts.duplicates++;continue;}
  seen.add(row.dedupe_hash);rows.push(row);sourceKinds[sms.source_kind||'unknown']=(sourceKinds[sms.source_kind||'unknown']||0)+1;
}
rows.sort((a,b)=>a.transaction_at.localeCompare(b.transaction_at)||a.dedupe_hash.localeCompare(b.dedupe_hash));
const groups=new Map(),pairs=[],totals={};
for(const r of rows){
  const key=JSON.stringify([r.card_issuer,r.card_last4,r.currency,r.merchant_key,Math.abs(r.amount_native)]);
  const prior=groups.get(key)||[];
  if(r.event_kind==='cancellation'){
    const open=prior.filter(p=>!p.used);
    if(open.length===1){open[0].used=true;pairs.push({purchase_hash:open[0].row.dedupe_hash,cancellation_hash:r.dedupe_hash});}
    else r.cancellation_review=open.length>1?'ambiguous':prior.length?'duplicate':'unmatched';
  }else{prior.push({row:r,used:false});groups.set(key,prior);}
  const month=new Date(new Date(r.transaction_at).getTime()+32400000).toISOString().slice(0,7);
  const bucket=months[month] ||= {count:0,purchases:0,cancellations:0,krw_native:0,krw_estimate:0,currencies:{}};
  bucket.count++;bucket[r.event_kind==='purchase'?'purchases':'cancellations']++;
  bucket.currencies[r.currency]=(bucket.currencies[r.currency]||0)+Math.round(r.amount_native*10000);
  if(r.currency==='KRW')bucket.krw_native+=r.amount_krw;
  if(r.amount_krw!=null)bucket.krw_estimate+=r.amount_krw;
  totals[r.currency]=(totals[r.currency]||0)+Math.round(r.amount_native*10000);
  issuers[r.card_issuer]=(issuers[r.card_issuer]||0)+1;
}
for(const b of Object.values(months))for(const c of Object.keys(b.currencies))b.currencies[c]/=10000;
for(const c of Object.keys(totals))totals[c]/=10000;
const columns=['source','received_at','card_issuer','card_last4','event_kind','transaction_at','currency','amount_native','amount_krw','fx_rate','fx_source','merchant','merchant_key','abroad','dedupe_hash','cancellation_review'];
const csv=v=>v==null?'':`"${String(v).replace(/"/g,'""')}"`;
fs.writeFileSync(path.join(output,'card_transactions_import.csv'),'\ufeff'+[columns.join(','),...rows.map(r=>columns.map(c=>csv(r[c])).join(','))].join('\n')+'\n','utf8');
fs.writeFileSync(path.join(output,'card_transactions_import.json'),JSON.stringify(rows,null,2)+'\n');
fs.writeFileSync(path.join(output,'cancellation_pairs.json'),JSON.stringify(pairs,null,2)+'\n');
const summary={...counts,import_rows:rows.length,issuers,import_source_kinds:sourceKinds,failures,totals,paired_cancellations:pairs.length,unpaired_cancellations:rows.filter(r=>r.cancellation_review).length,months,
  usd_krw_rate:1500,fx_kind:'fixed_estimate',raw_stored:false,import_method:'record_card_transaction RPC에 시간순으로 한 건씩 전달하는 적재 초안임. 운영 DB에는 쓰지 않았음.'};
fs.writeFileSync(path.join(output,'summary.json'),JSON.stringify(summary,null,2)+'\n');
const otherCurrencies=Object.keys(totals).filter(c=>c!=='KRW'&&c!=='USD').sort();
fs.writeFileSync(path.join(output,'monthly_summary.csv'),['month','count','purchases','cancellations','krw_native','krw_estimate','usd_native',...otherCurrencies.map(c=>c.toLowerCase()+'_native')].join(',')+'\n'+Object.entries(months).sort().map(([m,b])=>[m,b.count,b.purchases,b.cancellations,b.krw_native,b.krw_estimate,b.currencies.USD||0,...otherCurrencies.map(c=>b.currencies[c]||0)].join(',')).join('\n')+'\n');
console.log(JSON.stringify({import_rows:rows.length,failed:counts.failed,ignored:counts.ignored,duplicates:counts.duplicates,issuers,totals,paired:pairs.length}));