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
const staff = '11111111-1111-1111-1111-111111111111';
const desk = '22222222-2222-2222-2222-222222222222';
const chief = '33333333-3333-3333-3333-333333333333';
const owner = '44444444-4444-4444-4444-444444444444';
const inactive = '55555555-5555-5555-5555-555555555555';

const prelude = `
create role anon; create role authenticated; create schema auth; create schema storage;
create or replace function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('app.test_uid',true),'')::uuid $$;
create or replace function storage.foldername(value text) returns text[] language sql immutable as $$ select string_to_array(value,'/') $$;
create table public.profiles(user_id uuid primary key, role text, dept text, active boolean default true, approved boolean default true);
create table public.notices(id bigint generated always as identity primary key, title text, body text, author text);
create table public.deposits(id bigint generated always as identity primary key, amount numeric not null);
create table storage.buckets(id text primary key, name text unique, public boolean not null default false);
create table storage.objects(id bigint generated always as identity primary key, bucket_id text, name text, owner_id uuid);
alter table public.notices enable row level security;
alter table public.deposits enable row level security;
alter table storage.objects enable row level security;
grant usage on schema auth, storage to authenticated;
grant execute on function auth.uid() to authenticated;
grant select on public.profiles to authenticated;
grant select, insert on public.notices to authenticated;
grant select on public.deposits to authenticated;
grant select, insert on storage.objects to authenticated;
`;

async function as(uid) {
  await query(`select set_config('app.test_uid','${uid}',false)`);
}
async function denied(sql) {
  let error = '';
  try { await query(sql); } catch (caught) { error = String(caught); }
  assert.match(error, /row-level security|permission denied/);
}

try {
  await db.exec(prelude + draft);
  assert.deepEqual((await query("select id, public from storage.buckets where id='notice-attachments'"))[0], { id: 'notice-attachments', public: false });
  await query(`insert into public.profiles values
    ('${staff}','staff','진료',true,true),('${desk}','staff','데스크',true,true),
    ('${chief}','chief','진료',true,true),('${owner}','owner','원장',true,true),
    ('${inactive}','staff','데스크',false,true)`);
  await query('insert into public.deposits(amount) values (100)');
  await db.exec('set role authenticated');

  await as(staff);
  await query(`insert into public.notices(title, author, author_id, attachments) values ('공지','직원','${staff}','[]'::jsonb)`);
  await denied(`insert into public.notices(title, author, author_id) values ('위조','직원','${chief}')`);
  await query(`insert into storage.objects(bucket_id,name,owner_id) values ('notice-attachments','${staff}/tmp/a.pdf','${staff}')`);
  await denied(`insert into storage.objects(bucket_id,name,owner_id) values ('notice-attachments','${chief}/tmp/b.pdf','${staff}')`);
  assert.equal((await query('select count(*)::int n from public.deposits'))[0].n, 0);

  await as(desk); assert.equal((await query('select count(*)::int n from public.deposits'))[0].n, 1);
  await as(chief); assert.equal((await query('select count(*)::int n from public.deposits'))[0].n, 1);
  await as(owner); assert.equal((await query('select count(*)::int n from public.deposits'))[0].n, 1);
  await as(inactive); assert.equal((await query('select count(*)::int n from public.deposits'))[0].n, 0);
  await denied(`insert into storage.objects(bucket_id,name,owner_id) values ('notice-attachments','${inactive}/tmp/c.pdf','${inactive}')`);
  console.log('PGLITE_NOTICE_ATTACHMENTS_DEPOSIT_ACCESS_PASS: 승인 직원 공지·개인 경로 첨부, 예치금 데스크·lead 분리');
} finally {
  await db.close();
}
