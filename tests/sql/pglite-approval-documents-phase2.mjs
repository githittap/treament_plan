import assert from 'node:assert/strict';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const packageRoot = process.env.PGLITE_PACKAGE_ROOT;
if (!packageRoot) throw new Error('PGLITE_PACKAGE_ROOT is required');
const { PGlite } = await import(pathToFileURL(path.join(packageRoot, 'dist/index.js')).href);
const db = new PGlite();
const query = sql => db.query(sql).then(result => result.rows);
const owner = '33333333-3333-3333-3333-333333333333';
const staff = '11111111-1111-1111-1111-111111111111';
const manager = '22222222-2222-2222-2222-222222222222';
const chief = '77777777-7777-7777-7777-777777777777';
const prelude = `
create role anon; create role authenticated; create schema auth;
create or replace function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('app.test_uid',true),'')::uuid $$;
create table public.profiles(user_id uuid primary key,name text not null,role text not null check(role in('owner','chief','manager','staff')));
create or replace function public.my_role() returns text language sql stable security definer set search_path=public as $$ select coalesce((select role from public.profiles where user_id=auth.uid()),'') $$;
create table public.approval_docs(id bigint generated always as identity primary key,kind text not null check(kind in('연차','소명','사직서','보고','기타')),title text not null,body text,author uuid not null,status text not null default '진행' check(status in('진행','완결','반려')),created_at timestamptz default now());
alter table public.approval_docs enable row level security;
create policy approval_docs_insert_author on public.approval_docs for insert to authenticated with check(author=auth.uid());
create policy approval_docs_select_scoped on public.approval_docs for select to authenticated using(author=auth.uid() or public.my_role() in('chief','owner'));
grant usage on schema auth to authenticated; grant execute on function auth.uid(),public.my_role() to authenticated;
grant select on public.profiles to authenticated; grant select,insert on public.approval_docs to authenticated;
grant usage,select on sequence public.approval_docs_id_seq to authenticated;
`;

try {
  await db.exec(prelude);
  await query(`insert into public.profiles values
    ('${owner}','합성원장','owner'),('${staff}','합성직원','staff'),
    ('${manager}','합성관리자','manager'),('${chief}','합성실장','chief')`);
  const asUser = async uid => { await query('set role authenticated'); await query(`select set_config('app.test_uid','${uid}',false)`); };
  await asUser(staff);
  await query(`insert into public.approval_docs(kind,title,body,author) values ('기타','직원 문서','staff 작성','${staff}')`);
  await asUser(manager);
  await query(`insert into public.approval_docs(kind,title,body,author) values ('사직서','관리자 문서','manager 작성','${manager}')`);
  await asUser(staff);
  assert.deepEqual((await query('select title,author from public.approval_docs order by id')).map(row => row.title), ['직원 문서']);
  await asUser(manager);
  assert.deepEqual((await query('select title,author from public.approval_docs order by id')).map(row => row.title), ['관리자 문서']);
  await asUser(chief);
  assert.deepEqual((await query('select title from public.approval_docs order by id')).map(row => row.title), ['직원 문서','관리자 문서']);
  await asUser(owner);
  assert.deepEqual((await query('select title from public.approval_docs order by id')).map(row => row.title), ['직원 문서','관리자 문서']);
  console.log('PGLITE_APPROVAL_DOCUMENTS_PHASE2_PASS: staff·manager 본인 문서만, chief·owner 전체 문서 조회');
} finally { await db.close(); }
