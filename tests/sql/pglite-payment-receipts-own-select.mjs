import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';

const packageRoot=process.env.PGLITE_PACKAGE_ROOT;
if(!packageRoot)throw new Error('PGLITE_PACKAGE_ROOT required');
const {PGlite}=await import(pathToFileURL(path.join(packageRoot,'dist/index.js')).href);
const db=new PGlite(),q=sql=>db.query(sql).then(result=>result.rows);
const ids={staff:'11111111-1111-1111-1111-111111111111',manager:'22222222-2222-2222-2222-222222222222',chief:'33333333-3333-3333-3333-333333333333',owner:'44444444-4444-4444-4444-444444444444',other:'55555555-5555-5555-5555-555555555555',deputy:'66666666-6666-6666-6666-666666666666',blocked:'77777777-7777-7777-7777-777777777777'};
const sqlText=name=>fs.readFileSync(path.join('db',name),'utf8');
const count=async sql=>(await q(sql))[0].n;
const as=async id=>{await db.exec('reset role');await db.exec(`set role authenticated;select set_config('request.jwt.claims','{"sub":"${id}","role":"authenticated"}',false)`)};
const unlinked=async id=>`${id}/999999999/unlinked.pdf`;
const policyRows=async()=>q("select policyname,cmd,permissive,roles::text roles,qual,with_check from pg_policies where schemaname='storage' and tablename='objects' order by policyname");
const receiptPolicy=rows=>rows.find(row=>row.policyname==='payment_receipts_select_approval_line');
const otherPolicies=rows=>rows.filter(row=>row.policyname!=='payment_receipts_select_approval_line');
const resetReceiptPolicies=async()=>db.exec(`drop policy if exists payment_receipts_select_approval_line on storage.objects;
create policy payment_receipts_select_approval_line on storage.objects for select to authenticated using (bucket_id='payment-receipts' and public.employee_hub_access_allowed() and exists(select 1 from public.payment_request_receipts r join public.payment_requests p on p.id=r.request_id where r.storage_path=name and (p.requester_id=auth.uid() or public.my_role() in ('chief','owner'))));
drop policy if exists payment_receipts_insert_requester_pending on storage.objects;
create policy payment_receipts_insert_requester_pending on storage.objects for insert to authenticated with check (bucket_id='payment-receipts' and public.employee_hub_access_allowed() and split_part(name,'/',1)=auth.uid()::text and split_part(name,'/',2)~'^[0-9]+$' and exists(select 1 from public.payment_requests p where p.id=split_part(name,'/',2)::bigint and p.requester_id=auth.uid() and p.status='chief_pending') and metadata->>'mimetype' in ('image/jpeg','image/png','application/pdf'));
drop policy if exists payment_receipts_deputy_block on storage.objects;
create policy payment_receipts_deputy_block on storage.objects as restrictive for all to authenticated using (bucket_id<>'payment-receipts' or public.my_role()<>'deputy') with check (bucket_id<>'payment-receipts' or public.my_role()<>'deputy');`);
const apply=async file=>db.exec(sqlText(file));
try{
  await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;
    create schema auth;create function auth.uid()returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claims',true)::jsonb->>'sub','')::uuid$$;
    grant usage on schema auth to authenticated;grant execute on function auth.uid() to authenticated;
    create table public.profiles(user_id uuid primary key,role text,active boolean default true,approved boolean default true,account_access_status text default '활성');
    create function public.employee_hub_access_allowed()returns boolean language sql stable security definer set search_path='' as $$select exists(select 1 from public.profiles p where p.user_id=auth.uid() and p.active and p.approved and p.account_access_status='활성')$$;
    create function public.my_role()returns text language sql stable security definer set search_path='' as $$select case when public.employee_hub_access_allowed() then coalesce((select p.role from public.profiles p where p.user_id=auth.uid()),'staff') else 'pending' end$$;
    grant execute on function public.employee_hub_access_allowed(),public.my_role() to authenticated;
    create schema storage;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
    create table storage.objects(id bigint generated always as identity primary key,bucket_id text,name text,owner_id text,metadata jsonb default '{}'::jsonb);
    grant usage on schema storage to authenticated;grant select,insert,delete on storage.objects to authenticated;alter table storage.objects enable row level security;
    insert into public.profiles(user_id,role,account_access_status) values
    ('${ids.staff}','staff','활성'),('${ids.manager}','manager','활성'),('${ids.chief}','chief','활성'),('${ids.owner}','owner','활성'),('${ids.other}','staff','활성'),('${ids.deputy}','deputy','활성'),('${ids.blocked}','staff','차단');`);
  await db.exec(sqlText('payment_requests_draft.sql'));
  await resetReceiptPolicies();
  await db.exec(`create policy fixture_other_bucket_probe on storage.objects as permissive for all to authenticated using(bucket_id='fixture-other') with check(bucket_id='fixture-other');`);
  await db.exec(`insert into public.payment_requests(requester_id,payment_item,bank_name,account_holder,account_number,amount_krw,status) values('${ids.staff}','시험','은행','직원','1234',1000,'chief_pending');
    insert into public.payment_request_receipts(request_id,storage_path,original_name,mime_type,size_bytes) values(1,'${ids.staff}/1/linked.pdf','linked.pdf','application/pdf',100);
    insert into storage.objects(bucket_id,name,owner_id,metadata) values
    ('payment-receipts','${ids.staff}/1/linked.pdf','${ids.staff}','{"mimetype":"application/pdf"}'),
    ('payment-receipts','${await unlinked(ids.staff)}','${ids.staff}','{"mimetype":"application/pdf"}'),
    ('payment-receipts','${await unlinked(ids.other)}','${ids.other}','{"mimetype":"application/pdf"}'),
    ('payment-receipts','${await unlinked(ids.deputy)}','${ids.deputy}','{"mimetype":"application/pdf"}'),
    ('payment-receipts','${await unlinked(ids.blocked)}','${ids.blocked}','{"mimetype":"application/pdf"}'),
    ('fixture-other','${ids.deputy}/other-bucket/before.pdf','${ids.deputy}','{}');`);
  const before=await policyRows();
  assert.equal(receiptPolicy(before).qual.includes('payment_request_receipts'),true);
  await as(ids.staff);
  assert.equal(await count(`select count(*)::int n from storage.objects where name='${await unlinked(ids.staff)}'`),0,'pre-fix select hides own unlinked object');
  assert.equal((await q(`delete from storage.objects where name='${await unlinked(ids.staff)}' returning id`)).length,0,'pre-fix DELETE RETURNING selects zero rows');
  await db.exec('reset role');
  const preQual=(await q("select qual from pg_policies where schemaname='storage' and tablename='objects' and policyname='payment_receipts_select_approval_line'"))[0].qual;
  console.log('PGLITE_PRE_QUAL='+JSON.stringify(preQual));
  await apply('payment_receipts_select_own_folder.sql');
  await apply('payment_receipts_select_own_folder.sql');
  const after=await policyRows();
  assert.deepEqual(otherPolicies(after),otherPolicies(before),'all other storage policies remain exactly unchanged');
  assert.equal(receiptPolicy(after).cmd,'SELECT');
  assert.equal(receiptPolicy(after).permissive,'PERMISSIVE');
  assert.equal(receiptPolicy(after).roles,'{authenticated}');
  assert.equal(receiptPolicy(after).qual.includes('split_part'),true);
  assert.equal(receiptPolicy(after).qual.includes('payment_request_receipts'),true);
  await as(ids.staff);
  assert.equal(await count(`select count(*)::int n from storage.objects where name='${await unlinked(ids.staff)}'`),1);
  const deleted=await q(`delete from storage.objects where name='${await unlinked(ids.staff)}' returning id`);
  assert.equal(deleted.length,1,'self unlinked DELETE RETURNING yields actual row');
  await db.exec('reset role');
  assert.equal(await count(`select count(*)::int n from storage.objects where name='${await unlinked(ids.staff)}'`),0,'deleted row is actually absent after RESET ROLE');
  await db.exec(`insert into storage.objects(bucket_id,name,owner_id,metadata) values('payment-receipts','${await unlinked(ids.staff)}','${ids.staff}','{"mimetype":"application/pdf"}')`);
  await as(ids.staff);
  assert.equal(await count(`select count(*)::int n from storage.objects where name='${ids.staff}/1/linked.pdf'`),1);
  assert.equal((await q(`delete from storage.objects where name='${ids.staff}/1/linked.pdf' returning id`)).length,0);
  await as(ids.other);
  assert.equal(await count(`select count(*)::int n from storage.objects where name='${ids.staff}/1/linked.pdf' or name='${await unlinked(ids.staff)}'`),0);
  assert.equal((await q(`delete from storage.objects where name='${await unlinked(ids.staff)}' returning id`)).length,0);
  for(const id of [ids.chief,ids.owner]){
    await as(id);
    assert.equal(await count(`select count(*)::int n from storage.objects where name='${ids.staff}/1/linked.pdf'`),1);
    assert.equal(await count(`select count(*)::int n from storage.objects where name='${await unlinked(ids.staff)}'`),0);
    assert.equal((await q(`delete from storage.objects where name='${ids.staff}/1/linked.pdf' returning id`)).length,0);
  }
  for(const id of [ids.chief,ids.owner,ids.manager]){
    await db.exec('reset role');
    await db.exec(`insert into storage.objects(bucket_id,name,owner_id,metadata) values('payment-receipts','${await unlinked(id)}','${id}','{"mimetype":"application/pdf"}')`);
    await as(id);
    assert.equal(await count(`select count(*)::int n from storage.objects where name='${await unlinked(id)}'`),1,'manager, chief and owner intentionally see their own unlinked folder file');
  }
  await as(ids.manager);
  assert.equal(await count(`select count(*)::int n from storage.objects where name='${await unlinked(ids.staff)}'`),0);
  await as(ids.deputy);
  assert.equal(await count(`select count(*)::int n from storage.objects where name='${await unlinked(ids.deputy)}'`),0);
  assert.equal(await count(`select count(*)::int n from storage.objects where bucket_id='fixture-other' and name='${ids.deputy}/other-bucket/before.pdf'`),1,'deputy restrictive policy preserves the actual non-receipt bucket exception for USING');
  await db.exec(`insert into storage.objects(bucket_id,name,owner_id,metadata) values('fixture-other','${ids.deputy}/other-bucket/after.pdf','${ids.deputy}','{}')`);
  await db.exec('reset role');
  assert.equal(await count(`select count(*)::int n from storage.objects where bucket_id='fixture-other' and name='${ids.deputy}/other-bucket/after.pdf'`),1,'deputy restrictive policy preserves the actual non-receipt bucket exception for WITH CHECK');
  await as(ids.blocked);
  assert.equal(await count(`select count(*)::int n from storage.objects where name='${await unlinked(ids.blocked)}'`),0);
  await db.exec('reset role');
  const beforeRollback=await policyRows();
  await apply('payment_receipts_select_own_folder_rollback.sql');
  await apply('payment_receipts_select_own_folder_rollback.sql');
  const rolledBack=await policyRows();
  assert.deepEqual(otherPolicies(rolledBack),otherPolicies(beforeRollback));
  assert.equal(receiptPolicy(rolledBack).qual.includes('split_part'),false);
  await as(ids.staff);
  assert.equal(await count(`select count(*)::int n from storage.objects where name='${await unlinked(ids.staff)}'`),0,'rollback restores original bug');
  await db.exec('reset role');
  await apply('payment_receipts_select_own_folder.sql');
  const finalPolicies=await policyRows();
  assert.deepEqual(otherPolicies(finalPolicies),otherPolicies(before));
  assert.equal(receiptPolicy(finalPolicies).qual.includes('split_part'),true);
  assert.equal(receiptPolicy(finalPolicies).qual.includes('payment_request_receipts'),true);
  const qual=(await q("select qual from pg_policies where schemaname='storage' and tablename='objects' and policyname='payment_receipts_select_approval_line'"))[0].qual;
  console.log('PGLITE_EXPECTED_QUAL='+JSON.stringify(qual));
  console.log('PGLITE_PAYMENT_RECEIPTS_OWN_SELECT_PASS');
}finally{await db.close();}
