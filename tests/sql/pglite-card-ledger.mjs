import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';import {pathToFileURL} from 'node:url';
const {PGlite}=await import(pathToFileURL(path.join(process.env.PGLITE_PACKAGE_ROOT,'dist/index.js')).href);
const db=new PGlite();
const q=async(sql,args)=> (await db.query(sql,args)).rows;
await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;
 create function public.my_role() returns text language sql stable as $$select coalesce(current_setting('test.role',true),'owner')$$;
 create table public.ai_billing_events(id bigint primary key,raw_text text);`);
const migration=fs.readFileSync('db/card_ledger_v1.sql','utf8'),rollback=fs.readFileSync('db/card_ledger_v1_rollback.sql','utf8');
let checks=0;
async function record(overrides){const row={source:'sms',received_at:'2026-10-08T00:00:00+09:00',card_issuer:'samsung',card_last4:'4430',event_kind:'purchase',transaction_at:'2026-10-07T10:00:00+09:00',currency:'KRW',amount_native:1000,amount_krw:1000,fx_rate:1,fx_source:'native',merchant:'한글 가맹점',merchant_key:'한글가맹점',abroad:'domestic',...overrides};return (await q('select public.record_card_transaction($1::jsonb) as result',[JSON.stringify(row)]))[0].result;}
try{
 await db.exec(migration);await db.exec(migration);checks++;
 await db.exec('set role service_role');
 const first=await record({dedupe_hash:'a'.repeat(64)});assert.equal((await record({dedupe_hash:'a'.repeat(64)})).duplicate,true);checks++;
 const c=await record({event_kind:'cancellation',amount_native:-1000,amount_krw:-1000,dedupe_hash:'b'.repeat(64)});
 assert.equal((await q('select reversed_transaction_id from public.card_transactions where id=$1',[c.id]))[0].reversed_transaction_id,first.id);checks++;
 assert.equal((await record({event_kind:'cancellation',amount_native:-1000,amount_krw:-1000,dedupe_hash:'c'.repeat(64)})).cancellation_review,'duplicate');checks++;
 assert.equal((await record({card_last4:'0051',event_kind:'cancellation',amount_native:-1000,amount_krw:-1000,dedupe_hash:'d'.repeat(64)})).cancellation_review,'unmatched');checks++;
 await record({amount_native:2000,amount_krw:2000,dedupe_hash:'e'.repeat(64)});await record({amount_native:2000,amount_krw:2000,dedupe_hash:'f'.repeat(64)});
 assert.equal((await record({event_kind:'cancellation',amount_native:-2000,amount_krw:-2000,dedupe_hash:'1'.repeat(64)})).cancellation_review,'ambiguous');checks++;
 const cols=await q("select column_name from information_schema.columns where table_name='card_transactions'");assert.ok(!cols.some(c=>/body|raw/.test(c.column_name)));checks++;
 await db.exec(`insert into public.card_sms_failed_raw(dedupe_hash,body,fail_reason,received_at,expires_at) values ('${'2'.repeat(64)}','synthetic expired','test',now()-interval '31 days',now()-interval '1 day'),('${'3'.repeat(64)}','synthetic fresh','test',now(),now()+interval '30 days');`);
 assert.equal((await q('select public.card_sms_failed_raw_purge() as n'))[0].n,1);assert.equal((await q('select count(*)::int as n from public.card_sms_failed_raw'))[0].n,1);checks++;
 await db.exec("reset role;set role authenticated;select set_config('test.role','staff',false);");assert.equal((await q('select count(*)::int as n from public.card_transactions'))[0].n,0);checks++;
 await db.exec("select set_config('test.role','owner',false)");assert.ok((await q('select count(*)::int as n from public.card_transactions'))[0].n>0);await db.exec("update public.card_merchants set category='병원' where merchant_key='한글가맹점'");assert.equal((await q("select category from public.card_merchants where merchant_key='한글가맹점'"))[0].category,'병원');checks++;
 await db.exec('reset role');await assert.rejects(()=>db.exec(rollback),/preserve data and stop rollback/);await db.exec('rollback');checks++;
 console.log('PASS SQL checks: '+checks);
}finally{await db.close();}
// 빈 새 DB에서 실제 rollback과 재적용을 확인함.
const empty=new PGlite();try{await empty.exec(`create role anon;create role authenticated;create role service_role bypassrls;create function public.my_role() returns text language sql stable as $$select 'owner'::text$$;create table public.ai_billing_events(id bigint);`);await empty.exec(migration);await empty.exec(rollback);await empty.exec(rollback);await empty.exec(migration);console.log('PASS empty rollback/reapply: 4');}finally{await empty.close();}