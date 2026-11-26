import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';

const root=process.env.PGLITE_PACKAGE_ROOT;if(!root)process.exit(0);
const {PGlite}=await import(pathToFileURL(path.join(root,'dist/index.js')).href);
const db=new PGlite(),q=s=>db.query(s).then(r=>r.rows);
const staff='22222222-2222-2222-2222-222222222222',clinic='33333333-3333-3333-3333-333333333333',chief='44444444-4444-4444-4444-444444444444',labByDept='55555555-5555-5555-5555-555555555555';
const fail=async sql=>{try{await q(sql);return '';}catch(e){return String(e);}};
try{
  await db.exec(`create role anon;create role authenticated;create schema auth;
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('app.test_uid',true),'')::uuid$$;
    create table public.profiles(user_id uuid primary key,name text,active boolean default true,approved boolean default true,role text,dept text,job_group text);
    create table public.app_settings(key text primary key,value text not null,label text,updated_at timestamptz default now());
    create function public.my_role() returns text language sql stable as $$select coalesce((select role from public.profiles where user_id=auth.uid()),'')$$;
    create table public.attendance_issues(id bigint generated always as identity primary key,user_id uuid,work_date date,type text,reason text,rule_label text,status text default '대기',chief_by text,chief_at timestamptz,owner_by text,owner_at timestamptz,created_at timestamptz default now());
    grant usage on schema auth to authenticated;grant execute on function auth.uid() to authenticated;grant select on public.profiles to authenticated;
    grant select,insert,update on public.attendance_issues to authenticated;
    insert into public.profiles values('${staff}','시험 기공',true,true,'staff','기공팀','lab'),('${clinic}','시험 진료',true,true,'staff','진료실','clinical_consult'),('${chief}','시험 실장',true,true,'chief',null,null),('${labByDept}','시험 기공 부서만',true,true,'staff','기공실',null);`+
    ['attendance_issue_resolution_release.sql','attendance_manual_v2.sql','attendance_manual_evening_overtime_draft.sql','attendance_manual_overtime_reason.sql','attendance_ot_reason_by_group_20261126.sql'].map(f=>fs.readFileSync('db/'+f,'utf8')).join('\n'));
  await q('set role authenticated');await q(`select set_config('app.test_uid','${staff}',false)`);
  // 연장 있음 + 사유 없음 → 거부(옛 15칸 호출 · 한 칸만 · 공백만 · 5자 미만)
  assert.match(await fail(`select * from public.submit_manual_attendance_d('2026-11-02','09:00','19:00',0,0,'',0,'30',30,'',0,null,false,null,'없음')`),/overtime reason and actual work required/);
  assert.match(await fail(`select * from public.submit_manual_attendance_d('2026-11-02','09:00','19:00',0,0,'',0,'',0,'20',20,null,false,null,'없음','환자 진료 지연',null)`),/overtime reason and actual work required/);
  assert.match(await fail(`select * from public.submit_manual_attendance_d('2026-11-02','09:00','19:00',0,0,'10',10,'',0,'',0,null,false,null,'없음','    ','  수술 정리 함  ')`),/overtime reason and actual work required/);
  assert.match(await fail(`select * from public.submit_manual_attendance_d('2026-11-02','09:00','19:00',0,0,'10',10,'',0,'',0,null,false,null,'없음','늦음','정 리')`),/overtime reason and actual work required/);
  // 옛 함수 직접 호출로 우회 불가
  assert.match(await fail(`select * from public.submit_manual_attendance_v2('2026-11-02','09:00','19:00',0,0,'',0,'30',30,null,false)`),/permission denied/);
  // 연장 있음 + 두 칸 → 저장
  const ok=await q(`select * from public.submit_manual_attendance_d('2026-11-03','09:00','19:00',0,0,'',0,'35',30,'',0,null,false,null,'없음','  마지막 수술 환자 진료 지연 ','수술 어시스트 후 기구 소독')`);
  assert.equal(ok[0].overtime_min,30);assert.equal(ok[0].overtime_plan_reason,'마지막 수술 환자 진료 지연');assert.equal(ok[0].overtime_actual_work,'수술 어시스트 후 기구 소독');
  // 연장 없음(9분은 0분) → 사유 없이 저장, 사유칸은 비움
  const none=await q(`select * from public.submit_manual_attendance_d('2026-11-04','09:00','18:00',0,0,'9',0,'',0,'',0,null,false,null,'없음','아무거나 적음','아무거나 적음')`);
  assert.equal(none[0].overtime_min,0);assert.equal(none[0].overtime_plan_reason,null);assert.equal(none[0].overtime_actual_work,null);
  // 2026-11-26 직무별: 진료실·직무 미지정은 사유 없이 저장, 기공실(부서만 적힌 사람 포함)은 거부, 원장 설정으로 바뀜
  const as=async(uid,sql)=>{await q(`select set_config('app.test_uid','${uid}',false)`);return sql.startsWith('!')?fail(sql.slice(1)):q(sql);};
  const free=await as(clinic,`select * from public.submit_manual_attendance_d('2026-11-05','09:00','19:00',0,0,'',0,'30',30,'',0,null,false,null,'없음',null,null)`);
  assert.equal(free[0].overtime_min,30);assert.equal(free[0].overtime_plan_reason,null);assert.equal(free[0].overtime_actual_work,null);
  const kept=await as(clinic,`select * from public.submit_manual_attendance_d('2026-11-06','09:00','19:00',0,0,'',0,'30',30,'',0,null,false,null,'없음','짧음','정리')`);
  assert.equal(kept[0].overtime_plan_reason,'짧음','선택이어도 적은 사유는 남김');
  assert.equal((await as(chief,`select * from public.submit_manual_attendance_d('2026-11-05','09:00','19:00',0,0,'',0,'',0,'20',20,null,false,null,'없음',null,null)`))[0].evening_overtime_min,20);
  assert.match(await as(labByDept,`!select * from public.submit_manual_attendance_d('2026-11-05','09:00','19:00',0,0,'',0,'30',30,'',0,null,false,null,'없음',null,null)`),/overtime reason and actual work required/);
  assert.match(await as(staff,`!select public.attendance_ot_reason_required('${staff}')`),/permission denied/);
  await q('reset role');await q(`update public.app_settings set value=case key when 'att.ot_reason_required.lab' then 'false' when 'att.ot_reason_required.clinical_consult' then 'true' else value end`);await q('set role authenticated');
  assert.match(await as(clinic,`!select * from public.submit_manual_attendance_d('2026-11-07','09:00','19:00',0,0,'',0,'30',30,'',0,null,false,null,'없음',null,null)`),/overtime reason and actual work required/);
  assert.equal((await as(staff,`select * from public.submit_manual_attendance_d('2026-11-07','09:00','19:00',0,0,'',0,'30',30,'',0,null,false,null,'없음',null,null)`))[0].overtime_min,30);
  await q('reset role');await q(`delete from public.app_settings where key like 'att.ot_reason_required.%'`);await q('set role authenticated');
  assert.match(await as(staff,`!select * from public.submit_manual_attendance_d('2026-11-08','09:00','19:00',0,0,'',0,'30',30,'',0,null,false,null,'없음',null,null)`),/overtime reason and actual work required/,'설정 줄이 없으면 기공실만 필수');
  assert.equal((await as(clinic,`select * from public.submit_manual_attendance_d('2026-11-08','09:00','19:00',0,0,'',0,'30',30,'',0,null,false,null,'없음',null,null)`))[0].overtime_min,30);
  console.log('PGLITE_ATTENDANCE_OVERTIME_REASON_PASS: lab-required-when-overtime/clinic-optional/setting-flip/legacy-call-blocked/v2-revoked/9-minute-free');
}finally{await db.close();}
