import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';

const root=process.env.PGLITE_PACKAGE_ROOT;
if(!root)throw new Error('PGLITE_PACKAGE_ROOT is required');
const {PGlite}=await import(pathToFileURL(path.join(root,'dist/index.js')).href);
const delta=fs.readFileSync('db/consultation_journal_source_fields_delta_20260926.sql','utf8');
const db=new PGlite();
const q=async sql=>(await db.query(sql)).rows;
try{
  await db.exec(`create role anon; create role authenticated; create role service_role;
    create table public.consultation_journals(id bigint generated always as identity primary key,patient_name text not null,consultation_note text not null);
    insert into public.consultation_journals(patient_name,consultation_note) values('합성 기존 행','합성 상담 내용');
    alter table public.consultation_journals enable row level security;
    create policy consultation_journals_select on public.consultation_journals for select to authenticated using (current_user in ('manager','chief','owner'));
    create policy consultation_journals_insert on public.consultation_journals for insert to authenticated with check (current_user in ('manager','chief','owner'));
    create policy consultation_journals_update on public.consultation_journals for update to authenticated using (current_user in ('manager','chief','owner')) with check (current_user in ('manager','chief','owner'));
    grant select,insert,update on public.consultation_journals to authenticated;
    grant select,insert,update,delete on public.consultation_journals to service_role;`);
  const snapshot=async()=>({
    rls:(await q(`select relrowsecurity from pg_class where oid='public.consultation_journals'::regclass`))[0].relrowsecurity,
    policies:await q(`select policyname,cmd,roles,qual,with_check from pg_policies where schemaname='public' and tablename='consultation_journals' order by policyname`),
    grants:await q(`select grantee,privilege_type,is_grantable from information_schema.role_table_grants where table_schema='public' and table_name='consultation_journals' order by grantee,privilege_type`)
  });
  const before=await snapshot();
  await db.exec(delta);
  await db.exec(delta);
  assert.deepEqual(await snapshot(),before,'RLS, policies, and existing grants stay unchanged');
  const rows=await q(`select id,patient_name,consultation_note,source_fields from public.consultation_journals`);
  assert.deepEqual(rows,[{id:1,patient_name:'합성 기존 행',consultation_note:'합성 상담 내용',source_fields:{}}]);
  await q(`update public.consultation_journals set source_fields='{"followup":"합성 예정"}'::jsonb where id=1`);
  await assert.rejects(q(`update public.consultation_journals set source_fields='[]'::jsonb where id=1`),/consultation_journals_source_fields_object_check/);
  console.log('PGLITE_CONSULTATION_SOURCE_FIELDS_DELTA_PASS: 기존 행 보존·재실행·RLS/정책/권한 보존·객체 JSON 검사');
}finally{await db.close();}

const bad=new PGlite();
try{
  await bad.exec(`create table public.consultation_journals(source_fields text not null default '{}'::text); alter table public.consultation_journals enable row level security;`);
  await assert.rejects(bad.exec(delta),/existing source_fields definition differs/);
  console.log('PGLITE_CONSULTATION_SOURCE_FIELDS_DELTA_GUARD_PASS: 다른 기존 열 정의에서 중단');
}finally{await bad.close();}

const noRls=new PGlite();
try{
  await noRls.exec(`create table public.consultation_journals(id bigint primary key);`);
  await assert.rejects(noRls.exec(delta),/expected RLS is not enabled/);
  console.log('PGLITE_CONSULTATION_SOURCE_FIELDS_DELTA_RLS_GUARD_PASS: RLS 비활성 상태에서 중단');
}finally{await noRls.close();}
