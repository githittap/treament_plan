// att_rules_20261127.sql 동작 시험(PGlite): 결재 순서·역할·되돌리기·기록 · 관리자 표시 · 근무조 · 시간제 명단 · 읽기 권한 · 재실행 안전 · 되돌리기 파일
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';

const root=process.env.PGLITE_PACKAGE_ROOT;if(!root)process.exit(0);
const {PGlite}=await import(pathToFileURL(path.join(root,'dist/index.js')).href);
const db=new PGlite(),q=s=>db.query(s).then(r=>r.rows);
const U={owner:'11111111-1111-1111-1111-111111111111',chief:'22222222-2222-2222-2222-222222222222',manager:'33333333-3333-3333-3333-333333333333',staff:'44444444-4444-4444-4444-444444444444',target:'55555555-5555-5555-5555-555555555555',hourly:'66666666-6666-6666-6666-666666666666'};
const fail=async sql=>{try{await q(sql);return '';}catch(e){return String(e.message||e);}};
const as=async(who,sql)=>{await q(`select set_config('app.test_uid','${U[who]}',false)`);return sql.startsWith('!')?fail(sql.slice(1)):q(sql);};
const sqlFile=fs.readFileSync('db/att_rules_20261127.sql','utf8'),rollback=fs.readFileSync('db/att_rules_20261127_rollback.sql','utf8');
try{
  await db.exec(`create role anon;create role authenticated;create schema auth;
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('app.test_uid',true),'')::uuid$$;
    create table public.profiles(user_id uuid primary key,name text,active boolean default true,approved boolean default true,role text,dept text,job_group text);
    create table public.app_settings(key text primary key,value text not null,label text,updated_at timestamptz default now());
    create function public.my_role() returns text language sql stable as $$select coalesce((select role from public.profiles where user_id=auth.uid()),'')$$;
    create table public.att_months(month text primary key,status text not null default '집계중' check (status in ('집계중','확정')),closed_by text,closed_at timestamptz);
    alter table public.att_months enable row level security;
    create policy att_months_select_authenticated on public.att_months for select to authenticated using (true);
    create policy att_months_insert_owner on public.att_months for insert to authenticated with check (public.my_role()='owner');
    create policy att_months_update_owner on public.att_months for update to authenticated using (public.my_role()='owner') with check (public.my_role()='owner');
    create table public.attendance_manual_entries(id bigint generated always as identity primary key,user_id uuid,work_date date);
    create table public.attendance_issue_resolutions(id bigint generated always as identity primary key,user_id uuid,work_date date);
    alter table public.attendance_manual_entries enable row level security;alter table public.attendance_issue_resolutions enable row level security;
    create policy attendance_manual_release_select on public.attendance_manual_entries for select to authenticated using (exists(select 1 from public.profiles p where p.user_id=auth.uid() and p.active=true and p.approved=true) and (user_id=auth.uid() or public.my_role() in ('chief','owner')));
    create policy attendance_issue_resolution_release_select on public.attendance_issue_resolutions for select to authenticated using (exists(select 1 from public.profiles p where p.user_id=auth.uid() and p.active=true and p.approved=true) and (user_id=auth.uid() or public.my_role() in ('chief','owner')));
    create table public.wage_info(id bigint generated always as identity primary key,user_id uuid,effective_from date,hourly_enabled boolean not null default false);
    grant usage on schema auth to authenticated;grant execute on function auth.uid() to authenticated;
    grant select on public.profiles,public.app_settings to authenticated;grant select,insert,update,delete on public.att_months,public.attendance_manual_entries,public.attendance_issue_resolutions to authenticated;
    insert into public.profiles values('${U.owner}','원장',true,true,'owner',null,null),('${U.chief}','박실장',true,true,'chief',null,null),('${U.manager}','이매니저',true,true,'manager','데스크','desk'),('${U.staff}','김직원',true,true,'staff','진료실','clinical_consult'),('${U.target}','최대상',true,true,'staff','기공팀','lab'),('${U.hourly}','시간제',true,true,'staff','데스크','desk');
    insert into public.app_settings(key,value) values('late_cut','09:50');
    insert into public.attendance_manual_entries(user_id,work_date) values('${U.target}','2026-11-03'),('${U.staff}','2026-11-03');
    insert into public.attendance_issue_resolutions(user_id,work_date) values('${U.target}','2026-11-03');
    insert into public.wage_info(user_id,effective_from,hourly_enabled) values('${U.hourly}','2026-01-01',true),('${U.target}','2026-01-01',true),('${U.target}','2026-10-01',false);`);
  await db.exec(sqlFile);await db.exec(sqlFile); // 재실행 안전
  await q('grant select,insert,update,delete on all tables in schema public to authenticated');await q('grant execute on all functions in schema public to authenticated');await q('revoke insert,update,delete on public.profiles from authenticated'); // 운영에서 profiles 직접 수정은 막혀 있음(함수로만)
  // 내부 함수는 직접 못 부르게 다시 걷음(운영과 같게)
  await q('revoke execute on function public.att_edit_log_write(text,uuid,date,text,jsonb),public.att_month_is_final(text) from authenticated');
  // 설정: A는 옛 late_cut 값을 이어받고, 이미 있던 줄은 덮지 않음
  const s=await q(`select key,value from public.app_settings where key like 'att.shift_group.%' order by key`);
  assert.deepEqual(s.map(r=>[r.key,r.value]),[['att.shift_group.A.late_cut','09:50'],['att.shift_group.B.late_cut','10:00'],['att.shift_group.C.late_cut','09:30']]);
  await q('set role authenticated');
  // ── 월 마감 결재: 매니저 → 실장 → 원장 ──
  assert.match(await as('staff',`!select * from public.att_month_step('2026-10','manager_check')`),/manager, chief or owner required/);
  assert.match(await as('chief',`!select * from public.att_month_step('2026-10','chief_check')`),/step out of order/,'매니저 확인 전에는 실장 확인 거절');
  assert.equal((await q(`select count(*)::int n from public.att_months where month='2026-10'`))[0].n,0,'거절된 단계는 달 줄도 안 남김');
  assert.match(await as('owner',`!select * from public.att_month_step('2026-10','owner_confirm')`),/step out of order/,'실장 확인 전에는 원장 확정 거절');
  assert.match(await as('chief',`!select * from public.att_month_step('2026-10','manager_check')`),/manager role required/);
  assert.match(await as('manager',`!select * from public.att_month_step('2026-10','owner_confirm')`),/owner role required/);
  assert.match(await as('manager',`!select * from public.att_month_step('2026-13','manager_check')`),/invalid month/);
  assert.match(await as('manager',`!select * from public.att_month_step('2026-10','boom')`),/invalid action/);
  let r=(await as('manager',`select * from public.att_month_step('2026-10','manager_check')`))[0];assert.equal(r.status,'매니저확인');assert.equal(r.manager_checked_by,'이매니저');assert.ok(r.manager_checked_at);
  assert.match(await as('manager',`!select * from public.att_month_step('2026-10','manager_check')`),/step out of order/,'같은 단계를 두 번 못 누름');
  r=(await as('chief',`select * from public.att_month_step('2026-10','chief_check')`))[0];assert.equal(r.status,'실장확인');assert.equal(r.chief_checked_by,'박실장');
  assert.match(await as('manager',`!select * from public.att_month_step('2026-10','chief_check')`),/chief role required/);
  r=(await as('owner',`select * from public.att_month_step('2026-10','owner_confirm')`))[0];assert.equal(r.status,'확정');assert.equal(r.closed_by,'원장');assert.ok(r.closed_at,'지난달(2026-10)도 확정됨');
  // 되돌리기: 원장만, 한 단계씩
  assert.match(await as('chief',`!select * from public.att_month_step('2026-10','revert')`),/owner role required/);
  assert.match(await as('manager',`!select * from public.att_month_step('2026-10','revert')`),/owner role required/);
  r=(await as('owner',`select * from public.att_month_step('2026-10','revert')`))[0];assert.equal(r.status,'실장확인');assert.equal(r.closed_by,null);assert.equal(r.closed_at,null);assert.ok(r.chief_checked_by,'실장 확인은 남음');
  r=(await as('owner',`select * from public.att_month_step('2026-10','revert')`))[0];assert.equal(r.status,'매니저확인');assert.equal(r.chief_checked_by,null);
  r=(await as('owner',`select * from public.att_month_step('2026-10','revert')`))[0];assert.equal(r.status,'집계중');assert.equal(r.manager_checked_by,null);
  assert.match(await as('owner',`!select * from public.att_month_step('2026-10','revert')`),/nothing to revert/);
  // 원장도 단계를 건너뛰는 직접 쓰기는 못 함(정책 제거)
  assert.match(await as('owner',`!insert into public.att_months(month,status) values('2026-09','확정')`),/row-level security|permission denied/);
  assert.equal((await as('owner',`update public.att_months set status='확정' where month='2026-10' returning month`)).length,0,'직접 update는 0줄');
  // ── 근무조 ──
  assert.match(await as('staff',`!select public.att_set_shift_group('${U.target}','B')`),/manager, chief or owner required/);
  assert.match(await as('manager',`!select public.att_set_shift_group('${U.target}','Z')`),/invalid shift group/);
  assert.equal((await as('manager',`select public.att_set_shift_group('${U.target}','C') g`))[0].g,'C');
  assert.equal((await q(`select att_shift_group g from public.profiles where user_id='${U.target}'`))[0].g,'C');
  await as('manager',`select public.att_set_shift_group('${U.target}','C')`); // 같은 값은 기록 안 늘림
  assert.equal((await as('chief',`select public.att_set_shift_group('${U.target}','')`))[0].att_set_shift_group,null,'빈 값 = 자동');
  assert.match(await as('manager',`!update public.profiles set att_shift_group='A'`),/permission denied/);
  // ── 관리자 표시 ──
  assert.match(await as('staff',`!select * from public.att_mark_add('${U.target}','2026-11-03','late_ok')`),/manager, chief or owner required/);
  assert.match(await as('manager',`!select * from public.att_mark_add('${U.target}','2026-11-03','boom')`),/invalid mark/);
  assert.match(await as('manager',`!select * from public.att_mark_add('${U.target}',null,'late_ok')`),/invalid user or date/);
  const m1=(await as('manager',`select * from public.att_mark_add('${U.target}','2026-11-03','late_ok','병원 사정')`))[0];assert.equal(m1.mark,'late_ok');assert.equal(m1.note,'병원 사정');assert.equal(m1.created_by,U.manager);assert.equal(m1.removed_at,null);
  assert.equal((await as('chief',`select * from public.att_mark_add('${U.target}','2026-11-03','late_ok')`))[0].id,m1.id,'같은 표시를 또 넣으면 그대로');
  for(const k of ['annual','am_half','pm_half','early_ok','official'])assert.equal((await as('manager',`select * from public.att_mark_add('${U.target}','2026-11-04','${k}')`))[0].mark,k);
  assert.equal((await as('manager',`select count(*)::int n from public.attendance_day_marks`))[0].n,6);
  assert.equal((await as('staff',`select count(*)::int n from public.attendance_day_marks`))[0].n,0,'직원은 표시를 못 읽음');
  assert.equal((await as('manager',`update public.attendance_day_marks set mark='annual' returning id`)).length,0,'직접 수정 불가');
  assert.equal((await as('manager',`delete from public.attendance_day_marks returning id`)).length,0,'직접 삭제 불가');
  const rm=(await as('manager',`select * from public.att_mark_remove(${m1.id})`))[0];assert.equal(rm.removed_by,U.manager);assert.ok(rm.removed_at);
  assert.equal((await as('manager',`select count(*)::int n from public.attendance_day_marks where id=${m1.id}`))[0].n,1,'지운 표시도 행은 남음');
  assert.equal((await as('manager',`select * from public.att_mark_add('${U.target}','2026-11-03','late_ok')`))[0].id>m1.id,true,'지운 뒤에는 새 행으로 다시 넣을 수 있음');
  assert.match(await as('staff',`!select * from public.att_mark_remove(${m1.id})`),/manager, chief or owner required/);
  assert.match(await as('manager',`!select * from public.att_mark_remove(999)`),/mark not found/);
  // 확정된 달: 표시 넣기·지우기 거절 → 되돌린 뒤에는 가능
  await as('manager',`select * from public.att_month_step('2026-11','manager_check')`);await as('chief',`select * from public.att_month_step('2026-11','chief_check')`);await as('owner',`select * from public.att_month_step('2026-11','owner_confirm')`);
  assert.match(await as('manager',`!select * from public.att_mark_add('${U.target}','2026-11-09','annual')`),/month is final/);
  const open=(await q(`select id from public.attendance_day_marks where removed_at is null limit 1`))[0].id;
  assert.match(await as('manager',`!select * from public.att_mark_remove(${open})`),/month is final/);
  await as('owner',`select * from public.att_month_step('2026-11','revert')`);
  assert.equal((await as('manager',`select * from public.att_mark_add('${U.target}','2026-11-09','annual')`))[0].mark,'annual');
  // ── 다시 계산 기록 ──
  await as('manager',`select public.att_log_recalc('2026-11',200,31,'{"sample":[1]}'::jsonb)`);
  assert.match(await as('manager',`!select public.att_log_recalc('2026-1',1,1)`),/invalid month/);
  assert.match(await as('staff',`!select public.att_log_recalc('2026-11',1,1)`),/manager, chief or owner required/);
  // ── 수정 기록은 원장만 읽음 · 직접 쓰기 불가 ──
  const log=await as('owner',`select * from public.attendance_edit_log order by id`);
  const count=a=>log.filter(x=>x.action===a).length;
  assert.equal(count('month_step'),3+3+3+1,'2026-10 확정까지 3 + 되돌리기 3 + 2026-11 3 + 되돌리기 1');
  assert.equal(count('mark_add'),6+1+1);assert.equal(count('mark_remove'),1);assert.equal(count('group_change'),2);assert.equal(count('recalc'),1);
  const step=log.find(x=>x.action==='month_step');assert.equal(step.actor_name,'이매니저');assert.equal(step.actor_role,'manager');assert.equal(step.month,'2026-10');assert.deepEqual(step.detail,{action:'manager_check',from:'집계중',to:'매니저확인'});
  assert.deepEqual(log.find(x=>x.action==='group_change').detail,{from:null,to:'C'});assert.equal(log.find(x=>x.action==='recalc').detail.changed,31);
  for(const who of ['manager','chief','staff'])assert.equal((await as(who,`select count(*)::int n from public.attendance_edit_log`))[0].n,0,who+'은 수정 기록을 못 읽음');
  assert.match(await as('owner',`!insert into public.attendance_edit_log(action) values('recalc')`),/row-level security|permission denied/);
  assert.match(await as('owner',`!select public.att_edit_log_write('recalc',null,null,'2026-11','{}')`),/permission denied/);
  // ── 시간제 명단: 금액 없이 번호만, 역할 검사, 날짜 기준 ──
  assert.deepEqual((await as('manager',`select * from public.att_hourly_user_ids('2026-11-30')`)).map(x=>x.att_hourly_user_ids).sort(),[U.hourly]);
  assert.deepEqual((await as('manager',`select * from public.att_hourly_user_ids('2026-09-30')`)).map(x=>x.att_hourly_user_ids).sort(),[U.hourly,U.target].sort(),'10월 전에는 최대상도 시간제였음');
  assert.equal((await as('staff',`select * from public.att_hourly_user_ids()`)).length,0,'직원에게는 빈 목록');
  // ── 매니저 읽기 권한(수기·승인 보정) ──
  assert.equal((await as('manager',`select count(*)::int n from public.attendance_manual_entries`))[0].n,2);assert.equal((await as('manager',`select count(*)::int n from public.attendance_issue_resolutions`))[0].n,1);
  assert.equal((await as('staff',`select count(*)::int n from public.attendance_manual_entries`))[0].n,1,'직원은 본인 줄만');assert.equal((await as('staff',`select count(*)::int n from public.attendance_issue_resolutions`))[0].n,0);
  // ── 되돌리기 파일 ──
  await q('reset role');await db.exec(rollback);
  assert.equal((await q(`select count(*)::int n from pg_proc where proname like 'att\\_%' and proname in ('att_month_step','att_mark_add','att_mark_remove','att_set_shift_group','att_log_recalc','att_hourly_user_ids')`))[0].n,0);
  assert.equal((await q(`select count(*)::int n from information_schema.tables where table_name in ('attendance_day_marks','attendance_edit_log')`))[0].n,0);
  assert.equal((await q(`select count(*)::int n from information_schema.columns where table_name='profiles' and column_name='att_shift_group'`))[0].n,0);
  assert.equal((await q(`select count(*)::int n from public.app_settings where key like 'att.shift_group.%'`))[0].n,0);
  assert.equal((await q(`select status from public.att_months where month='2026-11'`))[0].status,'집계중');
  assert.match(await fail(`update public.att_months set status='매니저확인' where month='2026-11'`),/violates check constraint/,'옛 상태값만 허용으로 복구');
  await q('set role authenticated');assert.equal((await as('manager',`select count(*)::int n from public.attendance_manual_entries`))[0].n,0,'되돌린 뒤 매니저는 다시 못 읽음(본인 줄 없음)');
  console.log('PGLITE_ATT_RULES_PASS: month-step-order/roles/revert/log · marks-via-rpc-only · group-change · hourly-ids · manager-read · idempotent-rerun · rollback');
}finally{await db.close();}
