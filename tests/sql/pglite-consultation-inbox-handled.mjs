// 문의함 처리자 기록(handled_by·handled_at) 트리거 시험 — 기존 pglite-consultation-inbox-dentweb-stamp.mjs 방식. 가짜 계정·가짜 문의만 쓴다.
// 실행: PGLITE_PACKAGE_ROOT=<...>/node_modules/@electric-sql/pglite node tests/sql/pglite-consultation-inbox-handled.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';

const root=process.cwd(),pkg=process.env.PGLITE_PACKAGE_ROOT;
if(!pkg)throw new Error('PGLITE_PACKAGE_ROOT required');
const {PGlite}=await import(pathToFileURL(path.join(pkg,'dist/index.js')).href),db=new PGlite(),q=s=>db.query(s).then(x=>x.rows);
const manager='22222222-2222-2222-2222-222222222222',other='55555555-5555-5555-5555-555555555555',staff='33333333-3333-3333-3333-333333333333';
const setUser=async id=>db.exec(`set role authenticated;select set_config('app.test_uid','${id}',false);`);
const read=f=>fs.readFileSync(path.join(root,f),'utf8');
try{
  await db.exec(`create role anon;create role authenticated;create role service_role;create schema auth;create or replace function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('app.test_uid',true),'')::uuid$$;grant usage on schema auth to authenticated;grant execute on function auth.uid() to authenticated;create table auth.users(id uuid primary key);create table public.profiles(user_id uuid primary key,role text,active boolean default true,approved boolean default true,account_access_status text default '활성');create or replace function public.my_role() returns text language sql stable security definer as $$select coalesce((select role from public.profiles where user_id=auth.uid()),'')$$;create or replace function public.employee_hub_access_allowed() returns boolean language sql stable security definer as $$select exists(select 1 from public.profiles where user_id=auth.uid() and active and approved and account_access_status='활성')$$;create table public.consultation_journals(id uuid primary key default gen_random_uuid(),patient_name text not null,contact_phone text,source_sheet text not null,consulted_on date not null,status text not null,consultation_note text not null,next_action text,author_id uuid not null default auth.uid(),created_at timestamptz default now(),updated_at timestamptz default now());`);
  const baseline=read('db/consultation_inbox.sql').replace("create extension if not exists pgcrypto with schema extensions;",()=>"create schema if not exists extensions;create or replace function extensions.digest(value text,algorithm text) returns bytea language sql immutable as $$select decode(md5(value)||md5(value),'hex')$$;");
  await db.exec(baseline);
  await db.exec(read('db/consultation_inbox_dentweb_stamp.sql'));
  await db.exec(read('db/consultation_inbox_followup_draft.sql'));
  const migration=read('db/consultation_inbox_handled.sql');
  await db.exec(migration);await db.exec(migration); // 다시 돌려도 안전

  // 구조: 두 칸 · 트리거 · 열 권한 · 함수 실행 권한 · FK 없음
  assert.equal((await q("select count(*)::int n from information_schema.columns where table_schema='public' and table_name='consultation_inbox' and column_name in('handled_by','handled_at')"))[0].n,2);
  const acl=(await q("select has_column_privilege('authenticated','public.consultation_inbox','handled_by','update') by_upd,has_column_privilege('authenticated','public.consultation_inbox','handled_at','update') at_upd,has_column_privilege('authenticated','public.consultation_inbox','handled_by','select') by_sel,has_function_privilege('authenticated','public.consultation_inbox_set_handled()','execute') fn_auth,has_function_privilege('anon','public.consultation_inbox_set_handled()','execute') fn_anon"))[0];
  assert.deepEqual([acl.by_upd,acl.at_upd,acl.by_sel,acl.fn_auth,acl.fn_anon],[false,false,true,false,false],'직원은 이 칸을 못 바꾸고(열 권한 없음) 읽을 수는 있음');
  assert.equal((await q("select count(*)::int n from pg_constraint where conrelid='public.consultation_inbox'::regclass and contype='f' and conkey && (select array_agg(attnum) from pg_attribute where attrelid='public.consultation_inbox'::regclass and attname in('handled_by','handled_at'))"))[0].n,0,'FK 없음');
  assert.equal((await q("select prosecdef from pg_proc where proname='consultation_inbox_set_handled'"))[0].prosecdef,false,'security definer 아님');
  const trig=(await q("select tgname from pg_trigger where tgrelid='public.consultation_inbox'::regclass and not tgisinternal and (tgtype & 2)=2 and (tgtype & 16)=16 order by tgname")).map(r=>r.tgname);
  assert.deepEqual(trig,['consultation_inbox_set_dentweb_stamp','consultation_inbox_set_handled','consultation_inbox_set_updated_at'],'기존 두 트리거와 같이 걸림');

  // 문의 준비(서비스 접수)
  await db.exec("set role service_role;select set_config('app.test_uid','11111111-1111-1111-1111-111111111111',false);select set_config('request.jwt.claim.role','service_role',false);");
  const mk=async(src,ev,subj)=>(await q(`select * from public.consultation_inbox_ingest_service('${src}','${ev}',now(),null,null,'${subj}','합성 문의 내용')`))[0];
  const a=await mk('phone','ev-a','가'),b=await mk('phone','ev-b','나'),c=await mk('phone','ev-c','다'),d=await mk('phone','ev-d','라'),book=await mk('kakao','kbook-x','예약');
  await db.exec('reset role;');
  await q(`insert into auth.users values ('${manager}'),('${other}'),('${staff}')`);
  await q(`insert into public.profiles values ('${manager}','manager',true,true,'활성'),('${other}','owner',true,true,'활성'),('${staff}','staff',true,true,'활성')`);
  const row=async id=>(await q(`select status,assigned_to,handled_by,handled_at,updated_at from public.consultation_inbox where id='${id}'`))[0];
  const nobody=await row(a.id);assert.equal(nobody.handled_by,null);assert.equal(nobody.handled_at,null);

  // 열림 → closed: 호출한 사람과 시각이 서버에서 채워짐
  await setUser(manager);
  const before=await row(a.id);
  await q(`update public.consultation_inbox set status='closed' where id='${a.id}'`);
  const closed=await row(a.id);
  assert.equal(closed.handled_by,manager);assert.ok(closed.handled_at);assert.ok(Math.abs(Date.now()-new Date(closed.handled_at).getTime())<60000);
  assert.ok(new Date(closed.updated_at)>=new Date(before.updated_at),'기존 updated_at 트리거도 같이 동작');

  // 열림끼리는 기록 없음 / 리콜 → 처리됨
  await q(`update public.consultation_inbox set status='recall_2' where id='${b.id}'`);
  assert.equal((await row(b.id)).handled_by,null,'열림끼리 바꾸면 처리 기록 없음');
  await q(`update public.consultation_inbox set status='closed',assigned_to='${manager}' where id='${b.id}'`);
  assert.equal((await row(b.id)).handled_by,manager);

  // 다른 사람이 처리됨 줄의 담당만 바꾸면 처리 기록은 그대로
  const stampB=await row(b.id);
  await db.exec('reset role;');await setUser(other);
  await q(`update public.consultation_inbox set assigned_to='${other}' where id='${b.id}'`);
  const afterAssign=await row(b.id);
  assert.equal(afterAssign.assigned_to,other);assert.equal(afterAssign.handled_by,manager,'담당만 바꿔도 처리한 사람은 그대로');assert.equal(new Date(afterAssign.handled_at).getTime(),new Date(stampB.handled_at).getTime());
  await q(`update public.consultation_inbox set status='closed' where id='${b.id}'`);
  assert.equal((await row(b.id)).handled_by,manager,'같은 상태를 다시 저장해도 그대로');

  // 상담일지 전환(converted): security definer RPC 안에서도 호출자 auth.uid()가 기록됨
  await db.exec('reset role;');await setUser(manager);
  await q(`select * from public.consultation_inbox_convert_to_journal('${c.id}'::uuid)`);
  const conv=await row(c.id);assert.equal(conv.status,'converted');assert.equal(conv.handled_by,manager);assert.ok(conv.handled_at);

  // 되돌리기: 처리됨 → 열림이면 비워짐
  await q(`update public.consultation_inbox set status='new' where id='${a.id}'`);
  const reopened=await row(a.id);assert.equal(reopened.handled_by,null);assert.equal(reopened.handled_at,null);

  // 위조: 열 권한을 일부러 열어 둬도(운영은 안 열려 있음) 호출자가 쓴 값은 버려진다
  await db.exec('reset role;');await db.exec('grant update(handled_by,handled_at) on public.consultation_inbox to authenticated;');
  await setUser(manager);
  await q(`update public.consultation_inbox set status='closed',handled_by='${staff}',handled_at='2001-01-01T00:00:00Z' where id='${a.id}'`);
  const forged=await row(a.id);assert.equal(forged.handled_by,manager,'열림→처리됨에서 위조한 처리자는 무시');assert.ok(new Date(forged.handled_at).getFullYear()>=2026);
  await q(`update public.consultation_inbox set handled_by='${staff}',handled_at='2001-01-01T00:00:00Z' where id='${a.id}'`);
  const forged2=await row(a.id);assert.equal(forged2.handled_by,manager,'처리 칸만 직접 고쳐도 무시');assert.equal(new Date(forged2.handled_at).getTime(),new Date(forged.handled_at).getTime());
  await q(`update public.consultation_inbox set handled_by='${staff}' where id='${d.id}'`);
  assert.equal((await row(d.id)).handled_by,null,'열린 문의에 처리자를 써 넣어도 무시');
  await db.exec('reset role;');await db.exec('revoke update(handled_by,handled_at) on public.consultation_inbox from authenticated;');

  // 덴트웹 도장 트리거와 같이 걸려도 정상(예약 줄) — 처리 칸은 안 건드림
  await setUser(manager);
  const stamp=(await q(`select * from public.consultation_inbox_set_dentweb_entered('${book.id}'::uuid,true)`))[0];assert.equal(stamp.dentweb_entered_by,manager);
  const bk=await row(book.id);assert.equal(bk.handled_by,null);

  // 되돌리기 SQL: 칸·트리거·함수만 사라지고 기존 트리거와 상태 저장은 그대로, 다시 올려도 안전
  await db.exec('reset role;');
  const rollback=read('db/consultation_inbox_handled_rollback.sql');
  await db.exec(rollback);await db.exec(rollback);
  assert.equal((await q("select count(*)::int n from information_schema.columns where table_schema='public' and table_name='consultation_inbox' and column_name in('handled_by','handled_at')"))[0].n,0);
  assert.equal((await q("select count(*)::int n from pg_trigger where tgrelid='public.consultation_inbox'::regclass and tgname='consultation_inbox_set_handled'"))[0].n,0);
  assert.equal((await q("select to_regprocedure('public.consultation_inbox_set_handled()') is null gone"))[0].gone,true);
  assert.equal((await q("select count(*)::int n from pg_trigger where tgrelid='public.consultation_inbox'::regclass and tgname in('consultation_inbox_set_dentweb_stamp','consultation_inbox_set_updated_at')"))[0].n,2);
  await setUser(manager);await q(`update public.consultation_inbox set status='closed' where id='${d.id}'`);assert.equal((await q(`select status from public.consultation_inbox where id='${d.id}'`))[0].status,'closed');
  await db.exec('reset role;');await db.exec(migration);
  assert.equal((await q(`select handled_by from public.consultation_inbox where id='${d.id}'`))[0].handled_by,null,'되돌린 뒤 다시 올리면 기록은 비어 시작(옛 처리됨은 처리자를 모름)');
  console.log('PGLITE_CONSULTATION_INBOX_HANDLED_PASS: server actor+time on open->closed/converted, reopen clears, other edits keep, forged values ignored, coexists with dentweb/updated_at triggers, rollback+rerun safe');
}finally{await db.close();}
