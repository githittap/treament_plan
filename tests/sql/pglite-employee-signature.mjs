import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const packageRoot = process.env.PGLITE_PACKAGE_ROOT;
if (!packageRoot) { console.log('PGLITE_EMPLOYEE_SIGNATURE_SKIP: PGLITE_PACKAGE_ROOT is not set'); process.exit(0); }
const { PGlite } = await import(pathToFileURL(path.join(packageRoot, 'dist/index.js')).href);
const db = new PGlite();
const query = sql => db.query(sql).then(result => result.rows);
const draft = fs.readFileSync(path.resolve('db/employee_signature_vault_draft.sql'), 'utf8');
const staff='11111111-1111-1111-1111-111111111111',manager='22222222-2222-2222-2222-222222222222',chief='33333333-3333-3333-3333-333333333333';
const prelude = `
create role anon; create role authenticated; create schema auth; create schema storage;
create or replace function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('app.test_uid',true),'')::uuid $$;
create or replace function storage.foldername(value text) returns text[] language sql immutable as $$ select string_to_array(value,'/') $$;
create table public.profiles(user_id uuid primary key,role text,active boolean default true,approved boolean default true);
create table public.contracts(id bigint primary key,user_id uuid not null,merged_html text,sign_slots jsonb default '{}'::jsonb,status text not null default '대기',signed_at timestamptz);
create or replace function public.my_role() returns text language sql stable security definer set search_path=public as $$ select coalesce((select role from public.profiles where user_id=auth.uid()),'staff') $$;
create table storage.buckets(id text primary key,name text unique,public boolean not null default false,file_size_limit bigint,allowed_mime_types text[]);
create table storage.objects(id bigint generated always as identity primary key,bucket_id text,name text,metadata jsonb default '{}'::jsonb,owner_id uuid);
alter table storage.objects enable row level security;
grant usage on schema auth,storage to authenticated; grant execute on function auth.uid(),public.my_role() to authenticated; grant select,insert on public.profiles to authenticated; grant select,insert,delete on storage.objects to authenticated;
`;
try {
  await db.exec(prelude + draft); await query(`insert into public.profiles values ('${staff}','staff',true,true),('${manager}','manager',true,true),('${chief}','chief',true,true)`); await db.exec('set role authenticated'); await query(`select set_config('app.test_uid','${staff}',false)`);
  await query(`insert into public.employee_signature_vault(user_id,storage_path,mime_type,size_bytes) values ('${staff}','${staff}/signature.png','image/png',100)`);
  await query(`insert into storage.objects(bucket_id,name,metadata,owner_id) values ('employee-signatures','${staff}/signature.png','{"mimetype":"image/png","size":100}','${staff}')`);
  await query(`select set_config('app.test_uid','${manager}',false)`); assert.equal((await query(`select * from public.employee_signature_vault`)).length,0);
  await query(`select set_config('app.test_uid','${staff}',false)`); let unsignedCopy=''; try { await query(`insert into public.employee_signature_uses(signature_id,document_kind,confirmed_at) values (1,'근로계약서',null)`); } catch (error) { unsignedCopy=String(error); } assert.match(unsignedCopy,/row-level security|permission denied/);
  await query(`insert into public.contracts(id,user_id,merged_html,status) values (10,'${staff}','old','대기')`);
  let failedRpc=''; try { await query(`select public.apply_employee_contract_signature(10,'new','{}'::jsonb,now(),999)`); } catch (error) { failedRpc=String(error); }
  assert.match(failedRpc,/signature is not available/); assert.equal((await query(`select status from public.contracts where id=10`))[0].status,'대기'); assert.equal((await query(`select count(*)::int n from public.employee_signature_uses`))[0].n,0);
  await query(`select public.apply_employee_contract_signature(10,'new','{}'::jsonb,now(),1)`); assert.equal((await query(`select status from public.contracts where id=10`))[0].status,'서명완료'); assert.equal((await query(`select count(*)::int n from public.employee_signature_uses`))[0].n,1);
  let retryError=''; try { await query(`select public.apply_employee_contract_signature(10,'newer','{}'::jsonb,now(),1)`); } catch (error) { retryError=String(error); } assert.match(retryError,/not pending|not owned/); assert.equal((await query(`select count(*)::int n from public.employee_signature_uses where contract_id=10`))[0].n,1);
  await query(`insert into public.contracts(id,user_id,status) values (11,'${manager}','대기')`); let foreignError=''; try { await query(`select public.apply_employee_contract_signature(11,'x','{}'::jsonb,now(),1)`); } catch (error) { foreignError=String(error); } assert.match(foreignError,/not pending|not owned/);
  assert.equal((await query('select count(*)::int n from public.employee_signature_audit'))[0].n,1);
  await query(`delete from storage.objects where name='${staff}/signature.png'`); assert.equal((await query(`select count(*)::int n from storage.objects where name='${staff}/signature.png'`))[0].n,1);
  await query(`select set_config('app.test_uid','${chief}',false)`); assert.equal((await query(`select * from public.employee_signature_vault`)).length,0);
  await db.exec('reset role');
  assert.equal((await query(`select has_table_privilege('authenticated','public.employee_signature_uses','insert') allowed`))[0].allowed,false);
  assert.equal((await query(`select has_table_privilege('authenticated','public.employee_signature_uses','delete') allowed`))[0].allowed,false);
  assert.equal((await query(`select has_table_privilege('authenticated','public.employee_signature_audit','insert') allowed`))[0].allowed,false);
  assert.equal((await query(`select has_function_privilege('authenticated','employee_private.audit_employee_signature_use()','execute') allowed`))[0].allowed,false);
  const edge=fs.readFileSync(path.resolve('supabase/functions/contract-pdf-sign/index.ts'),'utf8'); assert.match(edge,/record_contract_pdf_signature_with_use/); assert.match(edge,/signature_id/);
  const rollback=fs.readFileSync(path.resolve('db/employee_signature_contract_rpc_rollback.sql'),'utf8'); assert.match(rollback,/rollback blocked: contract signature use records exist/);
  console.log('PGLITE_EMPLOYEE_SIGNATURE_PASS: RPC 원자성·멱등성·소유권·직접 INSERT 차단·PDF 호출 계약');
} finally { await db.close(); }
