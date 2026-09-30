import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const packageRoot=process.env.PGLITE_PACKAGE_ROOT;
if(!packageRoot)throw new Error('PGLITE_PACKAGE_ROOT is required');
const {PGlite}=await import(pathToFileURL(path.join(packageRoot,'dist/index.js')).href);
const db=new PGlite();
const q=(sql,params)=>db.query(sql,params).then(result=>result.rows);
const staff='11111111-1111-1111-1111-111111111111',manager='22222222-2222-2222-2222-222222222222',chief='33333333-3333-3333-3333-333333333333';
const draft=fs.readFileSync('db/onboarding_g_hardening_draft.sql','utf8');
const rollback=fs.readFileSync('db/onboarding_g_hardening_rollback.sql','utf8');
const as=async id=>q('select set_config($1,$2,false)',['app.test_uid',id]);
try{
  await db.exec(`
    create role anon; create role authenticated; create schema auth;
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('app.test_uid',true),'')::uuid $$;
    create table public.profiles(user_id uuid primary key,role text);
    create function public.my_role() returns text language sql stable security definer set search_path=public
      as $$ select coalesce((select role from public.profiles where user_id=auth.uid()),'staff') $$;
    create table public.onboarding_items(id bigint generated always as identity primary key,label text,required boolean,order_no int,active boolean);
    create table public.onboarding_checks(user_id uuid,item_id bigint references public.onboarding_items(id));
    grant usage on schema auth to authenticated;
    grant execute on function auth.uid(),public.my_role() to authenticated;
  `);
  await q(`insert into public.profiles values ('${staff}','staff'),('${manager}','manager'),('${chief}','chief')`);
  await db.exec(draft);
  assert.equal((await q('select count(*)::int n from public.onboarding_items'))[0].n,16);
  await db.exec(draft);
  assert.equal((await q('select count(*)::int n from public.onboarding_items'))[0].n,16);
  await db.exec('set role authenticated');
  await as(staff);
  await q('insert into public.fingerprint_registration_requests(user_id) values ($1)',[staff]);
  assert.equal((await q('select status from public.fingerprint_registration_requests where user_id=$1',[staff]))[0].status,'요청');
  assert.equal((await q("update public.fingerprint_registration_requests set status='완료',manager_id=$1 where user_id=$2 returning status",[staff,staff])).length,0);
  await as(chief);
  assert.equal((await q("update public.fingerprint_registration_requests set status='완료',manager_id=$1 where user_id=$2 returning status",[chief,staff])).length,0);
  await as(manager);
  assert.equal((await q("update public.fingerprint_registration_requests set status='완료',manager_id=$1,approved_at=now() where user_id=$2 and status='요청' returning status",[manager,staff]))[0].status,'완료');
  await db.exec('reset role');
  await assert.rejects(db.exec(rollback),/rollback blocked: fingerprint registration request data exists/);
  await q('delete from public.fingerprint_registration_requests');
  await q('insert into public.onboarding_checks(user_id,item_id) select $1,id from public.onboarding_items where label=$2',[staff,'기본 도구와 오픈·마감 절차를 확인한다.']);
  await assert.rejects(db.exec(rollback),/rollback blocked: onboarding seed rows exist/);
  await q('delete from public.onboarding_checks');
  await db.exec(rollback);
  assert.equal((await q('select count(*)::int n from public.onboarding_items'))[0].n,0);
  console.log('PGLITE_ONBOARDING_G_PASS: 체크리스트 16항, 역할별 승인, 데이터 보존 rollback');
}finally{await db.close();}
