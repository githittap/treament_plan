import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const packageRoot = process.env.PGLITE_PACKAGE_ROOT;
if (!packageRoot) throw new Error('PGLITE_PACKAGE_ROOT is required');
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
create or replace function public.my_role() returns text language sql stable security definer set search_path=public as $$ select coalesce((select role from public.profiles where user_id=auth.uid()),'staff') $$;
create table storage.buckets(id text primary key,name text unique,public boolean not null default false);
create table storage.objects(id bigint generated always as identity primary key,bucket_id text,name text,owner_id uuid);
alter table storage.objects enable row level security;
grant usage on schema auth,storage to authenticated; grant execute on function auth.uid(),public.my_role() to authenticated; grant select,insert on public.profiles to authenticated; grant select,insert on storage.objects to authenticated;
`;
try {
  await db.exec(prelude + draft); await query(`insert into public.profiles values ('${staff}','staff',true,true),('${manager}','manager',true,true),('${chief}','chief',true,true)`); await db.exec('set role authenticated'); await query(`select set_config('app.test_uid','${staff}',false)`);
  await query(`insert into public.employee_signature_vault(user_id,storage_path,mime_type,size_bytes) values ('${staff}','${staff}/signature.png','image/png',100)`);
  await query(`select set_config('app.test_uid','${manager}',false)`); assert.equal((await query(`select * from public.employee_signature_vault`)).length,0);
  await query(`select set_config('app.test_uid','${staff}',false)`); let unsignedCopy=''; try { await query(`insert into public.employee_signature_uses(signature_id,document_kind,confirmed_at) values (1,'근로계약서',null)`); } catch (error) { unsignedCopy=String(error); } assert.match(unsignedCopy,/row-level security|permission denied/);
  await query(`insert into public.employee_signature_uses(signature_id,document_kind,confirmed_at) values (1,'근로계약서',now())`); assert.equal((await query('select count(*)::int n from public.employee_signature_audit'))[0].n,1);
  await query(`select set_config('app.test_uid','${chief}',false)`); assert.equal((await query(`select * from public.employee_signature_vault`)).length,0);
  console.log('PGLITE_EMPLOYEE_SIGNATURE_PASS: 비공개 서명 보관, 명시확인 복사, 감사기록');
} finally { await db.close(); }
