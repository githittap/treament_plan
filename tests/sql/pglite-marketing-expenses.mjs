import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
const pkg=process.env.PGLITE_PACKAGE_ROOT;
if(!pkg)throw new Error('PGLITE_PACKAGE_ROOT required');
const {PGlite}=await import(pathToFileURL(path.join(pkg,'dist/index.js')).href);
const draft=fs.readFileSync('db/marketing_expenses_draft.sql','utf8');
const rollback=fs.readFileSync('db/marketing_expenses_rollback.sql','utf8');
const ids={owner:'11111111-1111-1111-1111-111111111111',manager:'22222222-2222-2222-2222-222222222222',staff:'33333333-3333-3333-3333-333333333333'};
const hashes={krw:'a'.repeat(64),foreign:'b'.repeat(64),failed:'c'.repeat(64)};
const db=new PGlite(),q=sql=>db.query(sql).then(result=>result.rows);
await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;
 create schema auth;create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('app.test_uid',true),'')::uuid$$;
 grant usage on schema auth to authenticated;grant execute on function auth.uid() to authenticated;
 create table public.profiles(user_id uuid primary key,role text not null);
 create function public.my_role() returns text language sql stable security definer set search_path=public,pg_temp as $$select role from public.profiles where user_id=auth.uid()$$;
 grant execute on function public.my_role() to authenticated;
 insert into public.profiles values ('${ids.owner}','owner'),('${ids.manager}','manager'),('${ids.staff}','staff');`);
const asUser=async id=>db.exec(`reset role;select set_config('app.test_uid','${id}',false);set role authenticated;`);
const expectDenied=async sql=>{let denied=false;try{await db.exec(sql)}catch{denied=true;await db.exec('rollback')}assert.ok(denied,'expected owner-only write to be denied');};
try{
  await db.exec(draft);
  const tables=await q(`select table_name from information_schema.tables where table_schema='public' and table_name like 'marketing_%' order by table_name`);
  assert.deepEqual(tables.map(row=>row.table_name),['marketing_expense_events','marketing_foreign_charge_links','marketing_merchant_rules','marketing_month_budgets']);
  const cols=await q(`select column_name from information_schema.columns where table_name='marketing_expense_events'`);
  for(const forbidden of ['raw_text','cardholder','card_last4','owner_name'])assert.ok(!cols.some(row=>row.column_name===forbidden),`${forbidden} must not be stored`);
  assert.equal((await q(`select count(*)::int as n from public.marketing_merchant_rules`))[0].n,12,'safe default merchant rules are seeded');
  await db.exec(`set role service_role;
    insert into public.marketing_expense_events(event_hash,transaction_at,event_kind,parse_status,currency,amount_native,amount_krw,merchant,merchant_key)
      values ('${hashes.krw}',now(),'purchase','recorded','KRW',1200,1200,'Google Ads','googleads');
    insert into public.marketing_expense_events(event_hash,transaction_at,event_kind,parse_status,currency,amount_native,merchant,merchant_key)
      values ('${hashes.foreign}',now(),'purchase','recorded','INR',129,'Google YouTubePremium','googleyoutubepremium');
    insert into public.marketing_expense_events(event_hash,received_at,event_kind,parse_status,failure_code)
      values ('${hashes.failed}',now(),'purchase','failed','unsupported_shape');
    reset role;`);
  await asUser(ids.owner);
  assert.equal((await q(`select count(*)::int as n from public.marketing_expense_events`))[0].n,3,'owner reads all marketing events');
  await q(`update public.marketing_expense_events set category_override='naver' where event_hash='${hashes.krw}'`);
  await q(`insert into public.marketing_month_budgets(month,amount_krw) values ('2026-10-01',500000)`);
  await q(`insert into public.marketing_foreign_charge_links(foreign_event_id,krw_event_id,created_by)
    select f.id,k.id,'${ids.owner}' from public.marketing_expense_events f,public.marketing_expense_events k where f.event_hash='${hashes.foreign}' and k.event_hash='${hashes.krw}'`);
  await db.exec('reset role');
  await asUser(ids.manager);
  assert.equal((await q(`select count(*)::int as n from public.marketing_expense_events`))[0].n,0,'manager sees no event rows');
  assert.equal((await q(`select count(*)::int as n from public.marketing_month_budgets`))[0].n,0,'manager sees no budget rows');
  await expectDenied(`insert into public.marketing_month_budgets(month,amount_krw) values ('2026-11-01',1)`);
  await db.exec('reset role');
  await asUser(ids.staff);
  assert.equal((await q(`select count(*)::int as n from public.marketing_merchant_rules`))[0].n,0,'staff sees no merchant rules');
  assert.equal((await q(`update public.marketing_expense_events set category_override='meta' where event_hash='${hashes.krw}' returning id`)).length,0,'staff update is filtered by owner-only RLS');
  await db.exec('reset role');
  await assert.rejects(db.exec(rollback),/rollback blocked/i,'rollback stops once rows or rules change exist');
  await db.exec('rollback');
  await db.exec(`delete from public.marketing_foreign_charge_links;delete from public.marketing_month_budgets;delete from public.marketing_expense_events;`);
  await db.exec(rollback);
  assert.equal((await q(`select count(*)::int as n from information_schema.tables where table_schema='public' and table_name like 'marketing_%'`))[0].n,0,'empty-data rollback removes only marketing objects');
  console.log('PGlite marketing expenses: RLS, owner writes, privacy schema, links, and guarded rollback PASS');
}finally{await db.close();}
