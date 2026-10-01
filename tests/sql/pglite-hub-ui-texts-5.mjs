import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
// 차례 5(문의함 + 상담일지): 새 SQL 없이 app_settings에 새 키(숫자 4개 + list.inquiry_sources · list.inquiry_status · list.consult_kinds · list.consult_status)만 더한다.
// 원장은 upsert(넣기+고치기)로 쓸 수 있고, 직원·매니저·실장·차단 계정·anon은 못 쓰며, 로그인 직원은 읽을 수 있음을 기존 정책(db/hr_settings.sql)으로 확인.
// 문의 출처·상태·상담 구분·상태의 코드는 DB 제약이 쥐고 있어 이름만 옮긴다(화면 시험이 확인). 광고 알림 기준 금액 100,000원은 DB 함수에도 있어 안 옮긴다.
const root=process.cwd(), pkg=process.env.PGLITE_PACKAGE_ROOT;
if(!pkg) throw new Error('PGLITE_PACKAGE_ROOT required');
const {PGlite}=await import(pathToFileURL(path.join(pkg,'dist/index.js')).href), db=new PGlite(), q=s=>db.query(s).then(x=>x.rows);
const owner='11111111-1111-1111-1111-111111111111', staff='22222222-2222-2222-2222-222222222222', manager='33333333-3333-3333-3333-333333333333', chief='44444444-4444-4444-4444-444444444444', blocked='55555555-5555-5555-5555-555555555555';
const setUser=async id=>db.exec(`reset role;set role authenticated;select set_config('app.test_uid','${id}',false);`), reset=async()=>db.exec('reset role;');
const VAL={
 'inbox.group_window_min':'45','inbox.alert_limit':'30','consult.page_size':'40','consult.action_limit':'150',
 'list.inquiry_sources':JSON.stringify([{code:'daangn',label:'당근마켓'},{code:'kakao',label:'카카오'},{code:'naver_email',label:'네이버메일'},{code:'naver_talktalk',label:'네이버 톡톡'},{code:'homepage',label:'홈페이지'},{code:'phone',label:'전화'},{code:'manual',label:'수기'},{code:'other',label:'기타'}]),
 'list.inquiry_status':JSON.stringify([{code:'new',label:'새 문의'},{code:'in_progress',label:'진행중'},{code:'recall_1',label:'리콜 1차'},{code:'recall_2',label:'리콜 2차'},{code:'recall_3',label:'리콜 3차'},{code:'closed',label:'종결'},{code:'converted',label:'상담일지 전환'}]),
 'list.consult_kinds':JSON.stringify([{code:'교정',label:'교정 상담'},{code:'확정',label:'확정'},{code:'미확정 및 부분확정',label:'미확정 및 부분확정'},{code:'홈페이지',label:'홈페이지'},{code:'카카오,네이버예약,당근',label:'카카오,네이버예약,당근'},{code:'원본',label:'원본'}]),
 'list.consult_status':JSON.stringify([{code:'대기',label:'접수'},{code:'미확정',label:'미확정'},{code:'부분확정',label:'부분확정'},{code:'확정',label:'확정'},{code:'종결',label:'종결'}])
};
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
 await q(upsert('consult.page_size','50'));
 assert.equal(await val('consult.page_size'),'50','원장은 숫자 기준을 고칠 수 있음');
 await q(upsert('consult.page_size',VAL['consult.page_size']));
 assert.deepEqual(JSON.parse(await val('list.inquiry_sources')).map(i=>i.code),['daangn','kakao','naver_email','naver_talktalk','homepage','phone','manual','other']);
 assert.deepEqual(JSON.parse(await val('list.inquiry_status')).map(i=>i.code),['new','in_progress','recall_1','recall_2','recall_3','closed','converted']);
 assert.deepEqual(JSON.parse(await val('list.consult_kinds')).map(i=>i.code),['교정','확정','미확정 및 부분확정','홈페이지','카카오,네이버예약,당근','원본']);
 assert.deepEqual(JSON.parse(await val('list.consult_status')).map(i=>i.code),['대기','미확정','부분확정','확정','종결']);
 await reset();

 // 직원·매니저·실장: 읽기 OK · 넣기/고치기 거절
 for(const uid of [staff,manager,chief]){
  await setUser(uid);
  for(const k of KEYS) assert.equal(await cnt(k),1,`${uid} ${k} 읽기`);
  assert.equal(await val('consult.page_size'),'40');
  await assert.rejects(q(upsert('inbox.hack','1')),/row-level security/,`${uid} 넣기 거절`);
  await assert.rejects(q(upsert('consult.page_size','1')),/row-level security/,`${uid} 고치기(upsert) 거절`);
  await q(`update public.app_settings set value='1' where key='consult.page_size'`); // 정책에 안 걸려 0행만 바뀜
  await reset();
  assert.equal(await val('consult.page_size'),'40',`${uid} 고치기 거절`);
 }
 // 허브 접근 막힌 계정은 쓰기 거절
 await setUser(blocked);
 await assert.rejects(q(upsert('inbox.hack','1')),/row-level security/);
 await reset();
 // anon은 못 봄·못 씀
 await db.exec('reset role;set role anon;');
 assert.equal((await q(`select count(*)::int n from public.app_settings`))[0].n,0,'anon은 설정 행을 못 봄');
 await assert.rejects(q(upsert('inbox.hack','1')),/row-level security/);
 await reset();
 assert.equal(await policyCount(),pol,'정책 수 그대로(이 차례는 표·정책을 고치지 않음)');
 assert.equal(await cnt('inbox.hack'),0);
 // 문의 출처·상태·상담 구분·상태는 DB 제약(이 차례 SQL을 안 고침)이 쥐고 있다 — 그래서 코드는 고정, 이름만 옮김
 const sql=name=>fs.readFileSync(path.join(root,'db',name),'utf8');
 assert.match(sql('consultation_inbox_navertalk_source_draft.sql'),/'naver_talktalk'/);
 assert.match(sql('consultation_inbox_followup_draft.sql'),/status in \('new','in_progress','recall_1','recall_2','recall_3','closed','converted'\)/);
 assert.match(sql('consultation_journal_draft.sql'),/source_sheet in \('교정', '확정', '미확정 및 부분확정', '홈페이지', '카카오,네이버예약,당근', '원본'\)/);
 assert.match(sql('consultation_journal_draft.sql'),/status in \('대기', '미확정', '부분확정', '확정', '종결'\)/);
 console.log('PGLITE_HUB_UI_TEXTS_5_PASS');
} finally { await db.close(); }
