import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
// 안내 문구 표(db/ai_ui_texts.sql) — 직원 읽기 OK · 직원 쓰기 거절 · 원장 쓰기 OK · anon 거절 · 두 번 적용 OK · 롤백.
const root=process.cwd(), pkg=process.env.PGLITE_PACKAGE_ROOT;
if(!pkg) throw new Error('PGLITE_PACKAGE_ROOT required');
const {PGlite}=await import(pathToFileURL(path.join(pkg,'dist/index.js')).href), db=new PGlite(), q=s=>db.query(s).then(x=>x.rows);
const owner='11111111-1111-1111-1111-111111111111', staff='22222222-2222-2222-2222-222222222222', manager='33333333-3333-3333-3333-333333333333', chief='44444444-4444-4444-4444-444444444444', blocked='55555555-5555-5555-5555-555555555555';
const setUser=async id=>db.exec(`reset role;set role authenticated;select set_config('app.test_uid','${id}',false);`), reset=async()=>db.exec('reset role;');
const n=async(where='true')=>(await q(`select count(*)::int n from public.ai_ui_texts where ${where}`))[0].n;
try {
 await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('app.test_uid',true),'')::uuid$$;
 grant usage on schema auth to anon,authenticated,service_role;grant execute on function auth.uid() to anon,authenticated,service_role;
 create table public.profiles(user_id uuid primary key,role text,active boolean default true,approved boolean default true,account_access_status text default '활성',created_at timestamptz default now());
 create function public.employee_hub_access_allowed() returns boolean language sql stable security definer set search_path='' as $$select exists(select 1 from public.profiles p where p.user_id=auth.uid() and p.active and p.approved and p.account_access_status='활성')$$;
 create function public.my_role() returns text language sql stable security definer set search_path='' as $$select case when public.employee_hub_access_allowed() then coalesce((select p.role from public.profiles p where p.user_id=auth.uid()),'staff') else 'pending' end$$;
 grant execute on function public.employee_hub_access_allowed(),public.my_role() to authenticated;
 insert into public.profiles(user_id,role,account_access_status) values('${owner}','owner','활성'),('${staff}','staff','활성'),('${manager}','manager','활성'),('${chief}','chief','활성'),('${blocked}','staff','차단');`);
 const sql=fs.readFileSync(path.join(root,'db/ai_ui_texts.sql'),'utf8');
 await db.exec(sql);

 // 원장 쓰기 OK — 고친 사람은 DB가 채운다(화면이 다른 사람 번호를 보내도 원장 본인으로 기록).
 await setUser(owner);
 await q(`insert into public.ai_ui_texts(key,value,updated_by) values('err.usage_unavailable','잠시 뒤 다시 시도해 주세요.','${staff}'),('help.staff.notes',E'첫째 줄\n둘째 줄',null)`);
 assert.equal(await n(),2);
 let row=(await q(`select * from public.ai_ui_texts where key='err.usage_unavailable'`))[0];
 assert.equal(row.updated_by,owner,'updated_by는 DB가 auth.uid()로 채움');
 assert.ok(row.updated_at);
 await q(`update public.ai_ui_texts set value='바뀐 문구',updated_by='${staff}' where key='err.usage_unavailable'`);
 row=(await q(`select * from public.ai_ui_texts where key='err.usage_unavailable'`))[0];
 assert.equal(row.value,'바뀐 문구');assert.equal(row.updated_by,owner);
 assert.equal((await q(`select value from public.ai_ui_texts where key='help.staff.notes'`))[0].value,'첫째 줄\n둘째 줄','여러 줄이 그대로 저장됨');
 await q(`insert into public.ai_ui_texts(key,value) values('tmp.del','x')`);
 await q(`delete from public.ai_ui_texts where key='tmp.del'`);
 assert.equal(await n(`key='tmp.del'`),0,'원장 삭제 OK(기본으로 되돌리기)');
 // 키·값 제약
 await assert.rejects(q(`insert into public.ai_ui_texts(key,value) values('Bad Key','x')`),/check constraint|violates/);
 await assert.rejects(q(`insert into public.ai_ui_texts(key,value) values('ok.key','   ')`),/check constraint|violates/);
 await assert.rejects(q(`insert into public.ai_ui_texts(key,value) values('ok.key','${'가'.repeat(20001)}')`),/check constraint|violates/);
 await reset();

 // 직원 읽기 OK · 직원 쓰기 거절(매니저·실장 포함)
 for(const uid of [staff,manager,chief]){
  await setUser(uid);
  assert.equal(await n(),2,`${uid} 읽기`);
  await assert.rejects(q(`insert into public.ai_ui_texts(key,value) values('hack.key','x')`),/row-level security|permission denied/,`${uid} insert`);
  await q(`update public.ai_ui_texts set value='바꿔치기'`); // 정책에 안 걸려 0행만 바뀜
  await q(`delete from public.ai_ui_texts`);
  await reset();
  assert.equal(await n(`value='바꿔치기'`),0,`${uid} update 거절`);
  assert.equal(await n(),2,`${uid} delete 거절`);
 }
 // 허브 접근이 막힌 계정은 읽기도 못 한다
 await setUser(blocked); assert.equal(await n(),0,'차단 계정은 읽기 0행');
 await assert.rejects(q(`insert into public.ai_ui_texts(key,value) values('hack.key','x')`),/row-level security|permission denied/);
 await reset();
 // anon 권한 없음
 await db.exec(`reset role;set role anon;`);
 await assert.rejects(q(`select 1 from public.ai_ui_texts`),/permission denied/);
 await assert.rejects(q(`insert into public.ai_ui_texts(key,value) values('hack.key','x')`),/permission denied/);
 await reset();
 // 로그인 없음(authenticated인데 uid 없음)도 못 읽음
 await db.exec(`set role authenticated;select set_config('app.test_uid','',false);`);
 assert.equal(await n(),0,'uid 없으면 0행');
 await reset();

 // 두 번 적용해도 안전 + 고친 문구가 남아 있음 + 기존 객체는 그대로
 await db.exec(sql);
 assert.equal(await n(),2,'두 번째 적용이 데이터를 지우지 않음');
 assert.equal((await q(`select count(*)::int n from pg_policies where tablename='ai_ui_texts'`))[0].n,4,'정책이 중복 없이 4개');
 assert.equal((await q(`select count(*)::int n from pg_trigger where tgrelid='public.ai_ui_texts'::regclass and not tgisinternal`))[0].n,1);
 assert.equal((await q(`select public.my_role() r`)).length,1,'기존 함수는 그대로');
 assert.equal((await q(`select count(*)::int n from public.profiles`))[0].n,5,'기존 표는 그대로');

 // 롤백
 const rollback=fs.readFileSync(path.join(root,'db/ai_ui_texts_rollback.sql'),'utf8');
 await db.exec(rollback);
 assert.equal((await q(`select to_regclass('public.ai_ui_texts') t`))[0].t,null);
 assert.equal((await q(`select to_regprocedure('public.set_ai_ui_texts_audit()') t`))[0].t,null);
 assert.equal((await q(`select count(*)::int n from public.profiles`))[0].n,5,'롤백이 기존 표를 건드리지 않음');
 await db.exec(rollback); // 롤백도 두 번 돌려도 안전
 await db.exec(sql); // 롤백 뒤 다시 적용 가능
 assert.equal(await n(),0);
 console.log('PGLITE_AI_UI_TEXTS_PASS');
} finally { await db.close(); }
