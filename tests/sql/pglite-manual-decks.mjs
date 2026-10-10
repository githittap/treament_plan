// 업무매뉴얼 설명덱 DB 초안(db/manual_decks.sql) 시험 — 미승인·비활성 0건 / 직원은 공개본·공개 사진만 / 직원 쓰기 거절 / 원장·실장 쓰기 / 롤백
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const packageRoot = process.env.PGLITE_PACKAGE_ROOT || 'Z:/09_claude-output/_tmp/pglite-0.5.8/node_modules/@electric-sql/pglite';
if (!fs.existsSync(path.join(packageRoot, 'dist/index.js'))) { console.log('PGLITE_SKIP: PGLITE_PACKAGE_ROOT 미설정'); process.exit(0); }
const { PGlite } = await import(pathToFileURL(path.join(packageRoot, 'dist/index.js')).href);
const db = new PGlite();
const query = sql => db.query(sql).then(result => result.rows);
const draft = fs.readFileSync(path.resolve('db/manual_decks.sql'), 'utf8');
const rollback = fs.readFileSync(path.resolve('db/manual_decks_rollback.sql'), 'utf8');
const U = { staff: '11111111-1111-1111-1111-111111111111', chief: '22222222-2222-2222-2222-222222222222', owner: '33333333-3333-3333-3333-333333333333',
  pending: '44444444-4444-4444-4444-444444444444', inactive: '55555555-5555-5555-5555-555555555555', deputy: '66666666-6666-6666-6666-666666666666', nobody: '77777777-7777-7777-7777-777777777777' };
const PUB = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', DRAFT = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', NEW = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', CHIEF_DECK = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const img = (folder, file = 'a.webp', size = 1000, mime = 'image/webp', bucket = 'manual-media') =>
  `insert into storage.objects(bucket_id,name,owner_id,metadata) values ('${bucket}','${folder}/${file}','${U.owner}','{"mimetype":"${mime}","size":${size}}'::jsonb)`;

const prelude = `
create role anon; create role authenticated; create schema auth; create schema storage;
create or replace function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('app.test_uid',true),'')::uuid $$;
create or replace function storage.foldername(value text) returns text[] language sql immutable as $$ select case when strpos(value,'/')=0 then array[]::text[] else string_to_array(regexp_replace(value,'/[^/]*$',''),'/') end $$;
create table public.profiles(user_id uuid primary key, name text, role text, active boolean default true, approved boolean default true);
create table storage.buckets(id text primary key, name text unique, public boolean not null default false, file_size_limit bigint, allowed_mime_types text[]);
create table storage.objects(id bigint generated always as identity primary key, bucket_id text, name text, owner_id uuid, metadata jsonb default '{}'::jsonb);
alter table storage.objects enable row level security;
grant usage on schema auth, storage to authenticated;
grant execute on function auth.uid() to authenticated;
grant select on public.profiles to authenticated;
grant select, insert, delete on storage.objects to authenticated;
`;
async function as(uid) { await query(`select set_config('app.test_uid','${uid}',false)`); }
async function denied(sql, re = /row-level security|permission denied|violates check/) {
  let error = '';
  try { await query(sql); } catch (caught) { error = String(caught); }
  assert.match(error, re, sql);
}
const count = async sql => (await query(`select count(*)::int n from (${sql}) t`))[0].n;
let checks = 0;
try {
  await db.exec(prelude);
  await db.exec(draft);
  await db.exec(draft); checks++; // 재적용 안전
  assert.deepEqual((await query("select public,file_size_limit,allowed_mime_types from storage.buckets where id='manual-media'"))[0], { public: false, file_size_limit: 5242880, allowed_mime_types: ['image/webp', 'image/jpeg', 'image/png'] }); checks++;
  await query(`insert into public.profiles values
    ('${U.staff}','직원','staff',true,true),('${U.chief}','실장','chief',true,true),('${U.owner}','원장','owner',true,true),
    ('${U.pending}','미승인','staff',true,false),('${U.inactive}','비활성','staff',false,true),('${U.deputy}','대리','deputy',true,true)`);
  // 서비스 권한으로 시험 자료 심기: 공개 덱 1 · 미공개 덱 1 + 사진 각 1
  await query(`insert into public.manual_decks(id,title,category,deck,published,sort) values
    ('${PUB}','공개 매뉴얼','진료실','{"meta":{"title":"공개"},"slides":[]}',true,1),('${DRAFT}','미공개 매뉴얼',null,'{"meta":{"title":"미공개"},"slides":[]}',false,2)`);
  await query(img(PUB)); await query(img(DRAFT));
  await db.exec('set role authenticated');

  // 미승인·비활성·대리·프로필 없음 → 덱도 사진도 0건, 쓰기 거절
  for (const who of ['pending', 'inactive', 'deputy', 'nobody']) {
    await as(U[who]);
    assert.equal(await count('select 1 from public.manual_decks'), 0, who + ' 덱');
    assert.equal(await count("select 1 from storage.objects where bucket_id='manual-media'"), 0, who + ' 사진');
    await denied(`insert into public.manual_decks(title) values ('x')`);
    await denied(img(NEW));
    checks += 4;
  }
  // 직원: 공개본만, 미공개 사진 못 읽음, 쓰기 전부 거절
  await as(U.staff);
  assert.deepEqual(await query('select id,title from public.manual_decks order by sort'), [{ id: PUB, title: '공개 매뉴얼' }]); checks++;
  assert.deepEqual(await query("select name from storage.objects where bucket_id='manual-media'"), [{ name: PUB + '/a.webp' }]); checks++;
  await denied(`insert into public.manual_decks(title) values ('직원이 만듦')`);
  assert.equal((await query(`update public.manual_decks set title='변조' where id='${PUB}' returning id`)).length, 0);
  assert.equal((await query(`delete from public.manual_decks where id='${PUB}' returning id`)).length, 0);
  assert.equal((await query(`delete from storage.objects where bucket_id='manual-media' returning id`)).length, 0);
  await denied(img(PUB, 'staff.webp'));
  assert.equal((await query(`select title from public.manual_decks where id='${PUB}'`))[0].title, '공개 매뉴얼'); checks += 6;

  // 원장·실장: 전부 읽고 쓰기 됨. 고친 사람·시각은 서버가 정함
  for (const who of ['owner', 'chief']) {
    await as(U[who]);
    assert.equal(await count('select 1 from public.manual_decks'), who === 'owner' ? 2 : 3, who + ' 읽기');
    assert.equal(await count("select 1 from storage.objects where bucket_id='manual-media'"), who === 'owner' ? 2 : 4, who + ' 사진 읽기');
    const id = who === 'owner' ? NEW : CHIEF_DECK;
    const row = (await query(`insert into public.manual_decks(id,title,category,updated_by,updated_at) values ('${id}','${who} 새 덱','상담','${U.staff}','2000-01-01') returning updated_by,updated_at > now() - interval '1 minute' fresh`))[0];
    assert.equal(row.updated_by, U[who]); assert.equal(row.fresh, true);
    await query(`update public.manual_decks set published=true, title='${who} 고침' where id='${id}'`);
    assert.equal((await query(`select updated_by from public.manual_decks where id='${id}'`))[0].updated_by, U[who]);
    await query(img(id, 'p.png', 1000, 'image/png')); await query(img(id, 'q.jpg', 1000, 'image/jpeg'));
    await denied(`insert into public.manual_decks(title,category) values ('x','없는카테고리')`);
    await denied(`insert into public.manual_decks(title,deck) values ('x','[]')`);
    // 사진 규칙: 형식·크기·경로
    await denied(img(id, 'a.gif', 1000, 'image/gif'));
    await denied(img(id, 'a.webp', 5242881));
    await denied(img(id, 'a.exe', 1000, 'image/webp'));
    await denied(img(id + '/sub', 'a.webp'));
    await denied(img('not-a-uuid', 'a.webp'));
    await denied(img(id, 'noext'));
    checks += 13;
  }
  // 직원은 방금 공개된 덱(+사진)을 이제 봄, 미공개는 여전히 못 봄
  await as(U.staff);
  assert.equal(await count('select 1 from public.manual_decks'), 3);
  assert.equal(await count(`select 1 from storage.objects where name like '${DRAFT}/%'`), 0);
  assert.equal(await count(`select 1 from storage.objects where name like '${NEW}/%'`), 2); checks += 3;
  // 원장은 지울 수 있음
  await as(U.owner);
  assert.equal((await query(`delete from public.manual_decks where id='${CHIEF_DECK}' returning id`)).length, 1);
  assert.equal((await query(`delete from storage.objects where bucket_id='manual-media' and name like '${CHIEF_DECK}/%' returning id`)).length, 2); checks += 2;
  await db.exec('reset role');

  // 롤백: 자료가 있으면 멈추고 아무것도 안 지움 → 비우면 깨끗이 되돌아감
  let blocked = '';
  try { await db.exec(rollback); } catch (caught) { blocked = String(caught); }
  assert.match(blocked, /manual decks or media exist; rollback stopped without deleting data/);
  await db.exec('rollback');
  assert.ok(await count('select 1 from public.manual_decks') > 0); checks++;
  await query('delete from public.manual_decks'); await query("delete from storage.objects where bucket_id='manual-media'");
  await db.exec(rollback);
  assert.equal(await count("select 1 from information_schema.tables where table_schema='public' and table_name='manual_decks'"), 0);
  assert.equal(await count("select 1 from storage.buckets where id='manual-media'"), 0);
  assert.equal(await count("select 1 from pg_policies where policyname like 'manual_%'"), 0);
  await db.exec(draft); checks++; // 되돌린 뒤 다시 적용도 됨
  console.log('PGLITE_MANUAL_DECKS_PASS: ' + checks + ' checks (미승인 0건 · 직원 공개본만 · 쓰기 거절 · 원장실장 쓰기 · 롤백 왕복)');
} finally {
  await db.close();
}
