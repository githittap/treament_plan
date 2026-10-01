import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
// 차례 4(결재함 + 공지 + 캘린더 + 건의함): 새 SQL 없이 app_settings에 새 키(결재 건수 2개 + list.approval_kinds · list.calendar_kinds)만 더한다.
// 원장은 upsert(넣기+고치기)로 쓸 수 있고, 직원·매니저·실장·차단 계정·anon은 못 쓰며, 로그인 직원은 읽을 수 있음을 기존 정책(db/hr_settings.sql)으로 확인.
// 첨부 10MB·건의 점수·순위처럼 DB가 같은 값을 쥔 것은 설정 키로 만들지 않는다(화면 시험이 확인).
const root=process.cwd(), pkg=process.env.PGLITE_PACKAGE_ROOT;
if(!pkg) throw new Error('PGLITE_PACKAGE_ROOT required');
const {PGlite}=await import(pathToFileURL(path.join(pkg,'dist/index.js')).href), db=new PGlite(), q=s=>db.query(s).then(x=>x.rows);
const owner='11111111-1111-1111-1111-111111111111', staff='22222222-2222-2222-2222-222222222222', manager='33333333-3333-3333-3333-333333333333', chief='44444444-4444-4444-4444-444444444444', blocked='55555555-5555-5555-5555-555555555555';
const setUser=async id=>db.exec(`reset role;set role authenticated;select set_config('app.test_uid','${id}',false);`), reset=async()=>db.exec('reset role;');
const VAL={'appr.my_list_limit':'30','appr.done_list_limit':'120','list.approval_kinds':JSON.stringify([{code:'연차 신청',label:'휴가 신청'},{code:'사직서',label:'사직서'},{code:'재직증명서 발급',label:'재직증명서 발급'},{code:'보고',label:'업무 보고'},{code:'소명',label:'소명'},{code:'기타',label:'기타'}]),'list.calendar_kinds':JSON.stringify([{code:'이벤트',label:'행사'},{code:'단축근무',label:'단축근무'},{code:'면접',label:'면접'}])};
const KEYS=Object.keys(VAL);
try {
 await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('app.test_uid',true),'')::uuid$$;
 grant usage on schema auth to anon,authenticated,service_role;grant execute on function auth.uid() to anon,authenticated,service_role;
 create table public.profiles(user_id uuid primary key,role text,active boolean default true,approved boolean default true,account_access_status text default '활성',created_at timestamptz default now());
 create function public.employee_hub_access_allowed() returns boolean language sql stable security definer set search_path='' as $$select exists(select 1 from public.profiles p where p.user_id=auth.uid() and p.active and p.approved and p.account_access_status='활성')$$;
 create function public.my_role() returns text language sql stable security definer set search_path='' as $$select case when public.employee_hub_access_allowed() then coalesce((select p.role from public.profiles p where p.user_id=auth.uid()),'staff') else 'pending' end$$;
 grant execute on function public.employee_hub_access_allowed(),public.my_role() to authenticated;
 insert into public.profiles(user_id,role,account_access_status) values('${owner}','owner','활성'),('${staff}','staff','활성'),('${manager}','manager','활성'),('${chief}','chief','활성'),('${blocked}','staff','차단');`);
 const settingsSql=fs.readFileSync(path.join(root,'db/hr_settings.sql'),'utf8');
 await db.exec(settingsSql);
 await db.exec('grant all on table public.app_settings to anon,authenticated,service_role;'); // Supabase 기본 권한을 흉내(실제 접근은 정책이 가른다)
 const policyCount=async()=>(await q(`select count(*)::int n from pg_policies where tablename='app_settings'`))[0].n;
 const pol=await policyCount();
 const val=async k=>(await q(`select value from public.app_settings where key='${k}'`))[0]?.value;
 const cnt=async k=>(await q(`select count(*)::int n from public.app_settings where key='${k}'`))[0].n;
 const upsert=(k,v)=>`insert into public.app_settings(key,value) values('${k}','${v.replace(/'/g,"''")}') on conflict(key) do update set value=excluded.value`;

 // 원장: 새 키 넣기 + 두 번째는 고치기(upsert) — 화면이 쓰는 방식 그대로
 await setUser(owner);
 for(const k of KEYS) await q(upsert(k,VAL[k]));
 for(const k of KEYS) assert.equal(await cnt(k),1,`${k} 넣기`);
 await q(upsert('appr.my_list_limit','50'));
 assert.equal(await val('appr.my_list_limit'),'50','원장은 숫자 기준을 고칠 수 있음');
 await q(upsert('appr.my_list_limit',VAL['appr.my_list_limit']));
 assert.deepEqual(JSON.parse(await val('list.approval_kinds')).map(i=>i.code),['연차 신청','사직서','재직증명서 발급','보고','소명','기타']);
 assert.deepEqual(JSON.parse(await val('list.calendar_kinds')).map(i=>i.code),['이벤트','단축근무','면접']);
 await reset();

 // 직원·매니저·실장: 읽기 OK · 넣기/고치기 거절
 for(const uid of [staff,manager,chief]){
  await setUser(uid);
  for(const k of KEYS) assert.equal(await cnt(k),1,`${uid} ${k} 읽기`);
  assert.equal(await val('appr.my_list_limit'),'30');
  await assert.rejects(q(upsert('appr.hack','1')),/row-level security/,`${uid} 넣기 거절`);
  await assert.rejects(q(upsert('appr.my_list_limit','1')),/row-level security/,`${uid} 고치기(upsert) 거절`);
  await q(`update public.app_settings set value='1' where key='appr.my_list_limit'`); // 정책에 안 걸려 0행만 바뀜
  await reset();
  assert.equal(await val('appr.my_list_limit'),'30',`${uid} 고치기 거절`);
 }
 // 허브 접근 막힌 계정은 쓰기 거절
 await setUser(blocked);
 await assert.rejects(q(upsert('appr.hack','1')),/row-level security/);
 await reset();
 // anon은 못 봄·못 씀
 await db.exec('reset role;set role anon;');
 assert.equal((await q(`select count(*)::int n from public.app_settings`))[0].n,0,'anon은 설정 행을 못 봄');
 await assert.rejects(q(upsert('appr.hack','1')),/row-level security/);
 await reset();
 assert.equal(await policyCount(),pol,'정책 수 그대로(이 차례는 표·정책을 고치지 않음)');
 assert.equal(await cnt('appr.hack'),0);
 // 결재 건수는 DB 함수에 박힌 값이 아님(화면의 목록 건수) — 그래서 옮겼고, 첨부 10MB·건의 점수·순위는 DB 제약이라 안 옮김
 const hasLimit=(await q(`select count(*)::int n from pg_proc where prosrc ilike '%approval_docs%' and prosrc ilike '%limit 20%'`))[0].n;
 assert.equal(hasLimit,0);
 console.log('PGLITE_HUB_UI_TEXTS_4_PASS');
} finally { await db.close(); }
