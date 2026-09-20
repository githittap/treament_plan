import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const packageRoot = process.env.PGLITE_PACKAGE_ROOT;
if (!packageRoot) throw new Error('PGLITE_PACKAGE_ROOT is required');
const { PGlite } = await import(pathToFileURL(path.join(packageRoot, 'dist/index.js')).href);
const db = new PGlite();
const query = sql => db.query(sql).then(result => result.rows);
const draft = fs.readFileSync(path.resolve('db/employee_documents.sql'), 'utf8')+'\n'+fs.readFileSync(path.resolve('db/employee_documents_onboarding_hardening_draft.sql'), 'utf8')+'\n'+fs.readFileSync(path.resolve('db/onboarding_evidence_requirements_draft.sql'), 'utf8');
const staff='11111111-1111-1111-1111-111111111111',manager='22222222-2222-2222-2222-222222222222',chief='33333333-3333-3333-3333-333333333333',other='44444444-4444-4444-4444-444444444444',inactiveManager='55555555-5555-5555-5555-555555555555';
const prelude = `
create role anon; create role authenticated; create schema auth; create schema storage;
create or replace function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('app.test_uid',true),'')::uuid $$;
create or replace function storage.foldername(value text) returns text[] language sql immutable as $$ select string_to_array(value,'/') $$;
create table public.profiles(user_id uuid primary key,role text,active boolean default true,approved boolean default true);
create or replace function public.my_role() returns text language sql stable security definer set search_path=public as $$ select coalesce((select role from public.profiles where user_id=auth.uid()),'staff') $$;
create table storage.buckets(id text primary key,name text unique,public boolean not null default false);
create table storage.objects(id bigint generated always as identity primary key,bucket_id text,name text,metadata jsonb default '{}'::jsonb,owner_id uuid);
alter table storage.objects enable row level security;
grant usage on schema auth,storage to authenticated; grant execute on function auth.uid(),public.my_role() to authenticated; grant select,insert on public.profiles to authenticated; grant select,insert on storage.objects to authenticated;
`;
try {
  await db.exec(prelude + draft);
  await query(`insert into public.profiles values ('${staff}','staff',true,true),('${manager}','manager',true,true),('${chief}','chief',true,true),('${other}','staff',true,true),('${inactiveManager}','manager',false,true)`);
  await db.exec('set role authenticated'); await query(`select set_config('app.test_uid','${staff}',false)`);
  await query(`insert into public.onboarding_evidence(user_id,bank_name,account_number) values ('${staff}','국민','123')`);
  assert.equal((await query(`select * from public.onboarding_evidence where user_id='${other}'`)).length,0);
  let otherDocument=''; try { await query(`insert into public.employee_documents(user_id,document_type,original_name,storage_path,mime_type,size_bytes) values ('${other}','자격증','x.pdf','${other}/x.pdf','application/pdf',1)`); } catch (error) { otherDocument=String(error); } assert.match(otherDocument,/row-level security|permission denied/);
  await query(`select set_config('app.test_uid','${manager}',false)`); assert.equal((await query(`select * from public.onboarding_evidence`)).length,0); assert.equal((await query(`select * from public.onboarding_evidence_completion where user_id='${staff}'`))[0].bank_complete,true);
  await query(`select set_config('app.test_uid','${inactiveManager}',false)`); assert.equal((await query(`select * from public.onboarding_evidence_completion`)).length,0);
  await db.exec('reset role');
  assert.equal((await query(`select has_table_privilege('anon','public.employee_documents','select') allowed`))[0].allowed,false);
  assert.equal((await query(`select has_table_privilege('anon','public.onboarding_evidence','select') allowed`))[0].allowed,false);
  assert.equal((await query(`select count(*)::int n from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='onboarding_evidence_completion'`))[0].n,0);
  assert.equal((await query(`select has_function_privilege('authenticated','employee_private.sync_onboarding_evidence_completion()','execute') allowed`))[0].allowed,false);
  await query(`select set_config('app.test_uid','${chief}',false)`); assert.equal((await query(`select count(*)::int n from public.employee_documents where user_id='${staff}'`))[0].n,0);
  console.log('PGLITE_EMPLOYEE_HARDENING_PASS: 본인·관리자 문서/증빙 범위와 MIME·크기 제한');
} finally { await db.close(); }
