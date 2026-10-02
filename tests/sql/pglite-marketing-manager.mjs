import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
const pkg=process.env.PGLITE_PACKAGE_ROOT;
if(!pkg)throw new Error('PGLITE_PACKAGE_ROOT required');
const {PGlite}=await import(pathToFileURL(path.join(pkg,'dist/index.js')).href);
const draftPath='db/marketing_manager_view_20261003.sql';
const db=new PGlite(),q=sql=>db.query(sql).then(r=>r.rows);
const ids={owner:'11111111-1111-1111-1111-111111111111',manager:'22222222-2222-2222-2222-222222222222',staff:'33333333-3333-3333-3333-333333333333'};
const asUser=async role=>db.exec(`reset role;select set_config('app.test_uid','${ids[role]}',false);set role authenticated;`);
const root=()=>db.exec('reset role');
const hashes=Object.fromEntries(['ad','excluded','unknown','foreign','charge','cancel','failed','longest','literal'].map((name,i)=>[name,String(i+1).repeat(64)]));
const purchase=(name,merchant,key,override=null,currency='KRW')=>`insert into public.marketing_expense_events(event_hash,transaction_at,event_kind,parse_status,currency,amount_native,amount_krw,merchant,merchant_key,category_override) values ('${hashes[name]}','2026-10-01T00:00:00Z','purchase','recorded','${currency}',1000,${currency==='KRW'?1000:'null'},'${merchant}','${key}',${override?`'${override}'`:'null'});`;
const visible=async()=> (await q('select event_hash from public.marketing_expense_events order by event_hash')).map(r=>r.event_hash);
const denied=async sql=>assert.rejects(db.exec(sql),/permission denied|row-level security/i);
try{
  await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;
    create schema auth;create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('app.test_uid',true),'')::uuid$$;
    grant usage on schema auth to authenticated;grant execute on function auth.uid() to authenticated;
    create table public.profiles(user_id uuid primary key,role text not null);
    create function public.my_role() returns text language sql stable security definer set search_path=public,pg_temp as $$select role from public.profiles where user_id=auth.uid()$$;
    insert into public.profiles values ('${ids.owner}','owner'),('${ids.manager}','manager'),('${ids.staff}','staff');`);
  await db.exec(fs.readFileSync('db/hr_settings.sql','utf8'));
  // Supabase public-schema default grants, separate from its owner-write RLS policies.
  await db.exec('grant select,insert,update on public.app_settings to authenticated');
  await db.exec(fs.readFileSync('db/marketing_expenses_draft.sql','utf8'));
  await db.exec(purchase('ad','Google Ads','googleads')+purchase('excluded','Private excluded','googleads','not_marketing')+purchase('unknown','Private unknown','unknown')+purchase('foreign','Foreign ad','foreign','google','INR')+purchase('charge','Linked ad','unknowncharge')+purchase('longest','Excluded subscription','googleadspremium')+purchase('literal','Literal match','googleadspercent'));
  await db.exec(`insert into public.marketing_merchant_rules(merchant_key,merchant_label,category) values ('googleadspremium','Private subscription','not_marketing'),('googleads%','Literal percent','not_marketing');
    insert into public.marketing_expense_events(event_hash,transaction_at,event_kind,parse_status,currency,amount_native,amount_krw,merchant,merchant_key,category_override,reversed_event_id)
      select '${hashes.cancel}',transaction_at,'cancellation','recorded','KRW',-1000,-1000,'Ad refund','unknowncancel','not_marketing',id from public.marketing_expense_events where event_hash='${hashes.ad}';
    insert into public.marketing_expense_events(event_hash,event_kind,parse_status,failure_code) values ('${hashes.failed}','purchase','failed','unsupported_shape');
    insert into public.marketing_foreign_charge_links(foreign_event_id,krw_event_id,created_by) select f.id,k.id,'${ids.owner}' from public.marketing_expense_events f,public.marketing_expense_events k where f.event_hash='${hashes.foreign}' and k.event_hash='${hashes.charge}';
    insert into public.marketing_month_budgets(month,amount_krw) values ('2026-10-01',500000);`);
  // Run against the old policies first, without the new SQL, to demonstrate the missing manager access.
  if(!process.env.MARKETING_MANAGER_BASELINE)await db.exec(fs.readFileSync(draftPath,'utf8'));
  await asUser('manager');
  assert.deepEqual(await visible(),['ad','foreign','charge','cancel','literal'].map(k=>hashes[k]).sort(),'manager reads only classified marketing rows (default on), including inherited categories');
  console.log('PASS manager default ON: 5 marketing rows; excluded, unknown, failed, longest exclusion hidden');
  assert.equal((await q('select * from public.marketing_month_budgets')).length,1);
  assert.ok((await q('select category from public.marketing_merchant_rules')).every(r=>r.category!=='not_marketing'));
  assert.equal((await q('select * from public.marketing_foreign_charge_links')).length,1);
  assert.equal((await q("update public.marketing_expense_events set category_override='meta' returning id")).length,0);
  assert.equal((await q('update public.marketing_month_budgets set amount_krw=1 returning month')).length,0);
  assert.equal((await q("update public.marketing_merchant_rules set category='meta' returning merchant_key")).length,0);
  await denied("insert into public.marketing_month_budgets values ('2026-11-01',1,now())");
  await denied("insert into public.app_settings(key,value) values ('marketing.manager_view_enabled','false') on conflict(key) do update set value='false'");
  await denied('select public.marketing_manager_event_category(null)');
  await root();
  for(const value of ['false','invalid','true']){
    await asUser('owner');await q(`update public.app_settings set value='${value}' where key='marketing.manager_view_enabled'`);
    assert.equal((await visible()).length,9,'owner sees all events with switch '+value);
    await asUser('manager');assert.equal((await visible()).length,value==='true'?5:0,'manager switch '+value);
    for(const table of ['marketing_month_budgets','marketing_merchant_rules','marketing_foreign_charge_links'])assert.equal((await q(`select count(*)::int as n from public.${table}`))[0].n>0,value==='true',table+' follows switch '+value);
    await asUser('staff');assert.equal((await visible()).length,0,'staff denied with switch '+value);
    for(const table of ['marketing_month_budgets','marketing_merchant_rules','marketing_foreign_charge_links'])assert.equal((await q(`select count(*)::int as n from public.${table}`))[0].n,0,'staff denied '+table);
    await root();console.log('PASS switch '+value+': owner 9, manager '+(value==='true'?5:0)+', staff 0; ancillary tables follow access');
  }
  await asUser('owner');await q("update public.marketing_expense_events set category_override='not_marketing' where event_hash='"+hashes.ad+"'");
  await asUser('manager');assert.equal((await visible()).length,3,'recategorizing approval also hides its cancellation immediately');
  await asUser('owner');await q("update public.marketing_expense_events set category_override='not_marketing' where event_hash='"+hashes.foreign+"'");
  await asUser('manager');assert.equal((await visible()).length,1,'recategorizing foreign approval hides linked KRW event');
  assert.equal((await q('select * from public.marketing_foreign_charge_links')).length,0,'hidden endpoints do not leak through links');
  await root();await db.exec(fs.readFileSync(draftPath,'utf8'));
  await asUser('owner');await q("update public.app_settings set value='false' where key='marketing.manager_view_enabled'");
  await root();await db.exec(fs.readFileSync(draftPath,'utf8'));
  assert.equal((await q("select value from public.app_settings where key='marketing.manager_view_enabled'"))[0].value,'false','rerun preserves owner off switch');
  await db.exec(fs.readFileSync('db/marketing_manager_view_20261003_rollback.sql','utf8'));
  await asUser('manager');assert.equal((await visible()).length,0,'rollback restores owner-only RLS');
  await asUser('owner');assert.equal((await visible()).length,9,'rollback preserves events');
  assert.equal((await q("select value from public.app_settings where key='marketing.manager_view_enabled'"))[0].value,'false','rollback preserves configured preference');
  await root();await db.exec(fs.readFileSync('db/marketing_manager_view_20261003_rollback.sql','utf8'));
  await db.exec(fs.readFileSync(draftPath,'utf8'));
  await asUser('manager');assert.equal((await visible()).length,0,'reapply still honors off switch');
  console.log('PGlite marketing manager: role matrix, owner-only writes, inherited classification, switch, idempotence and non-destructive rollback PASS');
}finally{await db.close();}
