import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const packageRoot = process.env.PGLITE_PACKAGE_ROOT;
if (!packageRoot) throw new Error('PGLITE_PACKAGE_ROOT is required');
const { PGlite } = await import(pathToFileURL(path.join(packageRoot, 'dist/index.js')).href);
const db = new PGlite();
const query = sql => db.query(sql).then(result => result.rows);
const draft = fs.readFileSync(path.resolve('db/notice_attachments_deposit_access_draft.sql'), 'utf8');
const rollback = fs.readFileSync(path.resolve('db/notice_attachments_deposit_access_rollback.sql'), 'utf8');
const staff = '11111111-1111-1111-1111-111111111111';
const desk = '22222222-2222-2222-2222-222222222222';
const chief = '33333333-3333-3333-3333-333333333333';
const owner = '44444444-4444-4444-4444-444444444444';
const inactive = '55555555-5555-5555-5555-555555555555';

const prelude = `
create role anon; create role authenticated; create schema auth; create schema storage;
create or replace function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('app.test_uid',true),'')::uuid $$;
create or replace function storage.foldername(value text) returns text[] language sql immutable as $$ select case when strpos(value,'/')=0 then array[]::text[] else string_to_array(regexp_replace(value,'/[^/]*$',''),'/') end $$;
create table public.profiles(user_id uuid primary key, name text, role text, dept text, active boolean default true, approved boolean default true);
create or replace function public.my_role() returns text language sql stable as $$ select coalesce((select role from public.profiles where user_id=auth.uid()),'staff') $$;
create table public.notices(id bigint generated always as identity primary key, title text, body text, author text, created_at timestamptz default now());
create table public.deposits(id bigint generated always as identity primary key, amount numeric not null);
create table storage.buckets(id text primary key, name text unique, public boolean not null default false, file_size_limit bigint, allowed_mime_types text[]);
create table storage.objects(id bigint generated always as identity primary key, bucket_id text, name text, owner_id uuid, metadata jsonb default '{}'::jsonb);
alter table public.notices enable row level security;
alter table public.deposits enable row level security;
alter table storage.objects enable row level security;
grant usage on schema auth, storage to authenticated;
grant execute on function auth.uid() to authenticated;
grant select on public.profiles to authenticated;
grant select, insert on public.notices to authenticated;
grant select on public.deposits to authenticated;
grant select, insert on storage.objects to authenticated;
grant delete on storage.objects to authenticated;
grant update on public.notices to authenticated;
create policy notices_insert_approvers on public.notices for insert to authenticated with check (public.my_role() in ('chief','owner'));
create policy notices_update_approvers on public.notices for update to authenticated using (public.my_role() in ('chief','owner')) with check (public.my_role() in ('chief','owner'));
create policy notices_select_authenticated on public.notices for select to authenticated using (true);
create policy deposits_select_active on public.deposits for select to authenticated using (exists (select 1 from public.profiles as p where p.user_id=auth.uid() and p.active));
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values ('notice-attachments','notice-attachments',false,null,null);
`;

async function as(uid) {
  await query(`select set_config('app.test_uid','${uid}',false)`);
}
async function denied(sql) {
  let error = '';
  try { await query(sql); } catch (caught) { error = String(caught); }
  assert.match(error, /row-level security|permission denied|notice author must match|immutable/);
}
async function snapshotPolicies() {
  return query(`select schemaname,tablename,policyname,permissive,roles,cmd,qual,with_check
    from pg_policies
    where (schemaname='public' and tablename in ('notices','deposits'))
       or (schemaname='storage' and tablename='objects')
    order by schemaname,tablename,policyname`);
}
async function snapshotPrivileges() {
  return query(`select table_schema,table_name,grantee,privilege_type
    from information_schema.role_table_grants
    where grantee in ('anon','authenticated')
      and ((table_schema='public' and table_name in ('notices','deposits'))
        or (table_schema='storage' and table_name='objects'))
    order by table_schema,table_name,grantee,privilege_type`);
}

try {
  await db.exec(prelude);
  const policiesBefore = await snapshotPolicies();
  const privilegesBefore = await snapshotPrivileges();
  const bucketBefore = (await query("select id,name,public,file_size_limit,allowed_mime_types from storage.buckets where id='notice-attachments'"))[0];
  await db.exec(draft);
  assert.equal((await query(`select count(*)::int n from information_schema.role_table_grants where table_schema='public' and table_name='notice_attachments_migration_snapshot' and grantee in ('PUBLIC','anon','authenticated')`))[0].n,0);
  assert.deepEqual((await query("select id, public from storage.buckets where id='notice-attachments'"))[0], { id: 'notice-attachments', public: false });
  assert.deepEqual((await query("select public,file_size_limit,allowed_mime_types from storage.buckets where id='notice-attachments'"))[0], { public: false, file_size_limit: 10485760, allowed_mime_types: ['application/pdf','image/jpeg','image/png','application/vnd.openxmlformats-officedocument.wordprocessingml.document','application/x-hwp','application/haansofthwp'] });
  await db.exec('set role anon');
  await denied(`select * from public.notice_attachments_migration_snapshot`);
  await denied(`update public.notice_attachments_migration_snapshot set bucket_existed=false where bucket_id='notice-attachments'`);
  await db.exec('reset role');
  await query(`insert into public.profiles values
    ('${staff}','직원','staff','진료',true,true),('${desk}','데스크','staff','데스크',true,true),
    ('${chief}','실장','chief','진료',true,true),('${owner}','원장','owner','원장',true,true),
    ('${inactive}','비활성','staff','데스크',false,true)`);
  await query('insert into public.deposits(amount) values (100)');
  await db.exec('set role authenticated');

  await as(staff);
  await denied(`select * from public.notice_attachments_migration_snapshot`);
  await denied(`update public.notice_attachments_migration_snapshot set bucket_existed=false where bucket_id='notice-attachments'`);
  const insertStartedAt = new Date();
  await query(`insert into public.notices(title, author, author_id, attachments, created_at, updated_at) values ('공지','위조 문자열','${staff}','[]'::jsonb,'2000-01-01','2000-01-01')`);
  assert.equal((await query("select author from public.notices where title='공지'"))[0].author, '직원');
  const storedTimes = (await query("select created_at,updated_at from public.notices where title='공지'"))[0];
  assert.ok(new Date(storedTimes.created_at) >= insertStartedAt);
  assert.ok(new Date(storedTimes.updated_at) >= insertStartedAt);
  await denied(`insert into public.notices(title, author, author_id) values ('위조','직원','${chief}')`);
  await query(`update public.notices set author_id='${chief}' where title='공지'`);
  await query(`update public.notices set author='위조' where title='공지'`);
  await query(`update public.notices set created_at=now()+interval '1 day' where title='공지'`);
  await query(`update public.notices set updated_at='2000-01-01' where title='공지'`);
  assert.deepEqual((await query(`select author_id='${staff}' id_ok,author='직원' author_ok,created_at<now()+interval '1 minute' created_ok,updated_at>='${insertStartedAt.toISOString()}'::timestamptz updated_ok from public.notices where title='공지'`))[0], { id_ok: true, author_ok: true, created_ok: true, updated_ok: true });
  await query(`insert into storage.objects(bucket_id,name,owner_id,metadata) values ('notice-attachments','${staff}/tmp/a.pdf','${staff}','{"mimetype":"application/pdf","size":100}'::jsonb)`);
  assert.equal((await query("select count(*)::int n from storage.objects where bucket_id='notice-attachments'"))[0].n,1);
  await query(`delete from storage.objects where bucket_id='notice-attachments' and name='${staff}/tmp/a.pdf'`);
  assert.equal((await query("select count(*)::int n from storage.objects where bucket_id='notice-attachments'"))[0].n,0);
  await query(`insert into storage.objects(bucket_id,name,owner_id,metadata) values ('notice-attachments','${staff}/tmp/cleanup.pdf','${staff}','{"mimetype":"application/pdf","size":100}'::jsonb)`);
  await query(`delete from storage.objects where bucket_id='notice-attachments' and name='${staff}/tmp/cleanup.pdf'`);
  assert.equal((await query("select count(*)::int n from storage.objects where bucket_id='notice-attachments'"))[0].n,0);
  await query(`insert into storage.objects(bucket_id,name,owner_id,metadata) values ('notice-attachments','${staff}/tmp/published.pdf','${staff}','{"mimetype":"application/pdf","size":100}'::jsonb)`);
  await query(`insert into public.notices(title, author, author_id, attachments) values ('게시 첨부','위조 문자열','${staff}',jsonb_build_array(jsonb_build_object('path','${staff}/tmp/published.pdf')))`);
  assert.deepEqual(await query(`delete from storage.objects where bucket_id='notice-attachments' and name='${staff}/tmp/published.pdf' returning name`), [], '게시된 첨부는 작성자도 삭제할 수 없어야 한다');
  await db.exec('reset role');
  await query(`insert into storage.objects(bucket_id,name,owner_id,metadata) values
    ('notice-attachments','${staff}/final/kept.pdf','${staff}','{}'::jsonb),
    ('other-bucket','${staff}/tmp/other.pdf','${staff}','{}'::jsonb)`);
  await db.exec('set role authenticated'); await as(staff);
  assert.deepEqual(await query(`delete from storage.objects where bucket_id='notice-attachments' and name='${staff}/final/kept.pdf' returning name`), []);
  assert.deepEqual(await query(`delete from storage.objects where bucket_id='other-bucket' and name='${staff}/tmp/other.pdf' returning name`), []);
  await db.exec('reset role');
  await query(`delete from storage.objects where bucket_id in ('notice-attachments','other-bucket')`);
  await db.exec('set role authenticated'); await as(staff);
  await denied(`insert into storage.objects(bucket_id,name,owner_id,metadata) values ('notice-attachments','${staff}/final/a.pdf','${staff}','{"mimetype":"application/pdf","size":100}'::jsonb)`);
  await denied(`insert into storage.objects(bucket_id,name,owner_id,metadata) values ('notice-attachments','${staff}/tmp/a.exe','${staff}','{"mimetype":"application/x-msdownload","size":100}'::jsonb)`);
  await denied(`insert into storage.objects(bucket_id,name,owner_id,metadata) values ('notice-attachments','${staff}/tmp/large.pdf','${staff}','{"mimetype":"application/pdf","size":10485761}'::jsonb)`);
  await denied(`insert into storage.objects(bucket_id,name,owner_id,metadata) values ('notice-attachments','${chief}/tmp/b.pdf','${staff}','{"mimetype":"application/pdf","size":100}'::jsonb)`);
  assert.equal((await query('select count(*)::int n from public.deposits'))[0].n, 0);

  await as(desk); assert.equal((await query('select count(*)::int n from public.deposits'))[0].n, 1);
  await as(staff); await query(`insert into storage.objects(bucket_id,name,owner_id,metadata) values ('notice-attachments','${staff}/tmp/foreign.pdf','${staff}','{"mimetype":"application/pdf","size":100}'::jsonb)`);
  await as(chief); await query(`insert into public.notices(title,author,author_id) values ('실장 공지','위조','${chief}')`); await query("update public.notices set body='수정' where title='공지'"); await denied(`update public.notices set author='위조' where title='공지'`); assert.equal((await query('select count(*)::int n from public.deposits'))[0].n, 1);
  await query(`delete from storage.objects where bucket_id='notice-attachments' and name='${staff}/tmp/foreign.pdf'`);
  assert.equal((await query("select count(*)::int n from storage.objects where bucket_id='notice-attachments'"))[0].n,1);
  await as(staff); await query(`delete from storage.objects where bucket_id='notice-attachments' and name='${staff}/tmp/foreign.pdf'`);
  assert.equal((await query("select count(*)::int n from storage.objects where bucket_id='notice-attachments'"))[0].n,0);
  await as(owner); await query(`insert into public.notices(title,author,author_id) values ('원장 공지','위조','${owner}')`); assert.equal((await query('select count(*)::int n from public.deposits'))[0].n, 1);
  await as(inactive); assert.equal((await query('select count(*)::int n from public.deposits'))[0].n, 0);
  assert.equal((await query("select count(*)::int n from storage.objects where bucket_id='notice-attachments'"))[0].n,0);
  await denied(`insert into storage.objects(bucket_id,name,owner_id) values ('notice-attachments','${inactive}/tmp/c.pdf','${inactive}')`);
  await db.exec('reset role');
  await db.exec(rollback);
  assert.deepEqual((await query("select id,name,public,file_size_limit,allowed_mime_types from storage.buckets where id='notice-attachments'"))[0], bucketBefore);
  assert.deepEqual(await snapshotPolicies(), policiesBefore);
  assert.deepEqual(await snapshotPrivileges(), privilegesBefore);

  await query("delete from storage.buckets where id='notice-attachments'");
  await db.exec(draft);
  assert.equal((await query("select count(*)::int n from storage.buckets where id='notice-attachments'"))[0].n,1);
  await query(`insert into storage.objects(bucket_id,name,owner_id,metadata) values ('notice-attachments','${staff}/tmp/preserve.pdf','${staff}','{}'::jsonb)`);
  let blocked = '';
  try { await db.exec(rollback); } catch (caught) { blocked = String(caught); }
  assert.match(blocked,/objects exist; preserve data and stop rollback/);
  await db.exec('rollback');
  assert.equal((await query("select count(*)::int n from storage.objects where bucket_id='notice-attachments'"))[0].n,1);
  assert.equal((await query("select count(*)::int n from storage.buckets where id='notice-attachments'"))[0].n,1);
  await query("delete from storage.objects where bucket_id='notice-attachments'");
  await db.exec(rollback);
  assert.equal((await query("select count(*)::int n from storage.buckets where id='notice-attachments'"))[0].n,0);
  assert.equal((await query("select count(*)::int n from information_schema.tables where table_schema='public' and table_name='notice_attachments_migration_snapshot'"))[0].n,0);
  assert.deepEqual(await snapshotPolicies(), policiesBefore);
  assert.deepEqual(await snapshotPrivileges(), privilegesBefore);
  console.log('PGLITE_NOTICE_ATTACHMENTS_DEPOSIT_ACCESS_PASS: DELETE 경계와 apply/rollback 정책·버킷·권한 왕복 일치');
} finally {
  await db.close();
}
