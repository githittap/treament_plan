import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const packageRoot = process.env.PGLITE_PACKAGE_ROOT;
if (!packageRoot) throw new Error('PGLITE_PACKAGE_ROOT is required');
const { PGlite } = await import(pathToFileURL(path.join(packageRoot, 'dist/index.js')).href);
const db = new PGlite();
const query = sql => db.query(sql).then(result => result.rows);
const draft = fs.readFileSync(path.resolve('db/leave_application_documents_draft.sql'), 'utf8');
const prelude = `
create role anon; create role authenticated; create schema auth; create schema storage;
create or replace function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('app.test_uid',true),'')::uuid $$;
create or replace function storage.foldername(value text) returns text[] language sql immutable as $$ select string_to_array(value,'/') $$;
create table public.profiles(user_id uuid primary key,role text,active boolean default true,approved boolean default true);
create or replace function public.my_role() returns text language sql stable security definer set search_path=public as $$ select coalesce((select role from public.profiles where user_id=auth.uid()),'staff') $$;
create table public.leave_requests(id bigint primary key,user_id uuid);
create table storage.objects(id bigint generated always as identity primary key,bucket_id text,name text,owner_id uuid);
alter table storage.objects enable row level security;
grant usage on schema auth,storage to authenticated; grant execute on function auth.uid(),public.my_role() to authenticated; grant select on public.profiles to authenticated; grant select,insert,delete on public.leave_requests to authenticated; grant select,insert,delete on storage.objects to authenticated;
`;
try {
  await db.exec(prelude + draft); const staff='11111111-1111-1111-1111-111111111111',chief='33333333-3333-3333-3333-333333333333',manager='22222222-2222-2222-2222-222222222222';
  await query(`insert into public.profiles values ('${staff}','staff',true,true),('${chief}','chief',true,true),('${manager}','manager',true,true)`); await query(`insert into public.leave_requests values (1,'${staff}'),(2,'${manager}')`); await db.exec('set role authenticated'); await query(`select set_config('app.test_uid','${staff}',false)`);
  let wrongRequest=''; try { await query(`insert into public.leave_application_documents(request_id,user_id,original_name,storage_path,mime_type,size_bytes) values (2,'${staff}','wrong.pdf','${staff}/tmp/wrong.pdf','application/pdf',100)`); } catch(error) { wrongRequest=String(error); } assert.match(wrongRequest,/row-level security|permission denied/);
  await query(`insert into storage.objects(bucket_id,name,owner_id) values ('leave-docs','${staff}/tmp/orphan.pdf','${staff}'),('leave-docs','${staff}/tmp/kept.pdf','${staff}')`); await query(`insert into public.leave_application_documents(request_id,user_id,original_name,storage_path,mime_type,size_bytes) values (1,'${staff}','kept.pdf','${staff}/tmp/kept.pdf','application/pdf',100)`); assert.equal((await query('select count(*)::int n from public.leave_application_documents'))[0].n,1);
  const deleted=await query(`delete from storage.objects where bucket_id='leave-docs' and name in ('${staff}/tmp/orphan.pdf','${staff}/tmp/kept.pdf') returning name`); assert.deepEqual(deleted.map(row=>row.name),[staff+'/tmp/orphan.pdf']);
  await query(`select set_config('app.test_uid','${manager}',false)`); assert.equal((await query('select count(*)::int n from public.leave_application_documents'))[0].n,1); await query(`select set_config('app.test_uid','${chief}',false)`); assert.equal((await query('select count(*)::int n from public.leave_application_documents'))[0].n,1);
  console.log('PGLITE_LEAVE_DOCUMENTS_PASS: 별도 테이블, 본인 신청 연결, lead 조회, 임시 경로 보호');
} finally { await db.close(); }
