import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
const {PGlite}=await import(pathToFileURL(path.join(process.env.PGLITE_PACKAGE_ROOT,'dist/index.js')).href);
const db=new PGlite(),q=sql=>db.query(sql).then(r=>r.rows);
const owner='33333333-3333-3333-3333-333333333333',staff='11111111-1111-1111-1111-111111111111',absent='22222222-2222-2222-2222-222222222222',covered='44444444-4444-4444-4444-444444444444';
try{
  await db.exec(`create role anon;create role authenticated;create schema auth;
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('app.uid',true),'')::uuid$$;
    create table profiles(user_id uuid primary key,name text,hire_date date,role text,active boolean default true,approved boolean default true,employment_status text default '재직',employment_effective_date date);
    create function my_role() returns text language sql stable as $$select role from profiles where user_id=auth.uid()$$;
    create table leave_ledger(id bigint generated always as identity primary key,user_id uuid,kind text,days numeric,note text);
    create table schedule_weeks(week_start date primary key,status text);
    create table schedules(user_id uuid,week_start date,day int,shift text);
    create table holidays(date date primary key);
    create table attendance(user_id uuid,work_date date,clock_in time,clock_out time);
    create table attendance_manual_entries(user_id uuid,work_date date,status text);
    create table attendance_issue_resolutions(user_id uuid,work_date date);
    create table leave_requests(user_id uuid,date_from date,date_to date,status text,type text);
    create table app_settings(key text primary key,value text,label text,updated_at timestamptz default now());
    insert into profiles(user_id,name,hire_date,role) values('${owner}','원장',null,'owner'),('${staff}','이채연','2026-09-18','staff'),('${absent}','미기록','2026-09-18','staff'),('${covered}','수기상계','2026-09-18','staff');`);
  await db.exec(fs.readFileSync('db/monthly_leave_accrual_draft.sql','utf8'));
  if(process.env.P7_REPRO==='1'){
    await q("select * from public.run_under_year_monthly_leave_accrual('2026-10-18')");
    throw new Error('재현 시험이 뜻밖에 통과함');
  }
  const migration=fs.readFileSync('db/under_year_monthly_leave_20261003.sql','utf8');
  await db.exec(migration);
  await q("update app_settings set value='published_schedule' where key='monthly_leave_attendance_mode'");
  // pg_cron이 없는 환경에서도 함수는 준비되고, cron 호출은 건너뜀.
  assert.equal((await q("select to_regnamespace('cron') is null absent"))[0].absent,true);
  // 매일 공표 근무표가 있고, 이채연·수기상계 직원은 출근 이력이 있음.
  await db.exec(`insert into schedule_weeks select distinct (d::date-(extract(isodow from d)::int-1)),'공표' from generate_series('2026-09-18'::date,'2027-09-17'::date,'1 day') d;
    insert into schedules select p.user_id,d::date-(extract(isodow from d)::int-1),extract(dow from d)::int,case when extract(isodow from d)=7 then 'off' else 'work' end from profiles p cross join generate_series('2026-09-18'::date,'2027-09-17'::date,'1 day') d where p.hire_date is not null;
    insert into attendance select p.user_id,d::date,'09:40','18:30' from profiles p cross join generate_series('2026-09-18'::date,'2027-09-17'::date,'1 day') d where p.user_id in('${staff}','${covered}');
    insert into leave_ledger(user_id,kind,days,note) values('${covered}','부여',2,'기존 수기');`);
  // PGlite 실제 시계에 미래일을 넣지 않고, 고정된 가짜 오늘을 DB 함수에 주입함.
  const functionStart=migration.indexOf('create or replace function public.run_under_year_monthly_leave_accrual');
  const functionEnd=migration.indexOf('-- 매일 한 번',functionStart);
  const runner=migration.slice(functionStart,functionEnd).replaceAll("(now() at time zone 'Asia/Seoul')::date","'2027-10-01'::date");
  await db.exec(runner);
  let result=await q("select * from run_under_year_monthly_leave_accrual('2026-10-17')");assert.equal(result.length,0);
  result=await q("select * from run_under_year_monthly_leave_accrual('2026-10-18')");assert.equal(Number(result.find(r=>r.user_id===staff).granted_days),1);assert.equal(Number(result.find(r=>r.user_id===covered).granted_days),0);assert.equal(result.some(r=>r.user_id===absent),false);
  assert.equal((await q("select * from run_under_year_monthly_leave_accrual('2026-10-18')")).length,0);
  assert.equal((await q("select * from run_under_year_monthly_leave_accrual('2026-10-19')")).length,0);
  assert.equal((await q("select * from run_under_year_monthly_leave_accrual('2026-11-17')")).length,0);
  result=await q("select * from run_under_year_monthly_leave_accrual('2026-11-18')");assert.equal(Number(result.find(r=>r.user_id===staff).granted_days),1);assert.equal(Number(result.find(r=>r.user_id===covered).granted_days),0);
  assert.equal(Number((await q(`select sum(days) n from leave_ledger where user_id='${staff}'`))[0].n),2);
  // 미확인 기간을 뛰어넘어 뒤 월차를 몰아서 넣지 않음. 근태를 확인하면 재실행으로 따라잡음.
  assert.equal((await q(`select count(*)::int n from leave_accrual_runs where user_id='${absent}'`))[0].n,0);
  await db.exec(`insert into attendance select '${absent}',d::date,'09:40','18:30' from generate_series('2026-09-18'::date,'2026-11-17'::date,'1 day') d`);
  result=await q("select * from run_under_year_monthly_leave_accrual('2026-11-18')");assert.equal(Number(result.find(r=>r.user_id===absent).granted_days),2);
  // 원장이 잔액을 줄여도 이전 달을 다시 채우지 않음.
  await q(`insert into leave_ledger(user_id,kind,days,note) values('${staff}','조정',-2,'잔액 설정')`);
  assert.equal((await q("select * from run_under_year_monthly_leave_accrual('2026-11-19')")).length,0);
  result=await q("select * from run_under_year_monthly_leave_accrual('2027-08-18')");assert.equal(Number(result.find(r=>r.user_id===staff).granted_days),9);
  assert.equal((await q(`select count(*)::int n from leave_accrual_runs where user_id='${staff}'`))[0].n,11);
  assert.equal((await q("select * from run_under_year_monthly_leave_accrual('2027-09-18')")).length,0);
  assert.equal((await q("select count(*)::int n from leave_accrual_runs where accrual_kind='annual'"))[0].n,0);
  await assert.rejects(q("select * from run_under_year_monthly_leave_accrual('2099-01-01')"),/future as-of/);
  // 새 기본 auto는 근무표가 없어도 적립됨. 같은 후보 함수를 조회·자동 경로에서 재사용함.
  const automatic='55555555-5555-5555-5555-555555555555',manager='66666666-6666-6666-6666-666666666666';
  await db.exec(`insert into profiles(user_id,name,hire_date,role) values('${automatic}','자동월차','2026-09-18','staff'),('${manager}','매니저',null,'manager');
    update app_settings set value='auto' where key='monthly_leave_attendance_mode';`);
  result=await q("select * from run_under_year_monthly_leave_accrual('2026-10-18')");
  assert.equal(Number(result.find(r=>r.user_id===automatic).granted_days),1);
  const candidates=()=>q(`select work_date::text ds from monthly_leave_absence_candidates('${automatic}','2026-09-18','2026-10-18','auto')`);
  assert.equal((await candidates()).length,21);
  assert.equal((await candidates()).some(r=>['2026-09-19','2026-09-20'].includes(r.ds)),false);
  await q("insert into holidays values('2026-09-21')");assert.equal((await candidates()).length,20);
  await q(`insert into attendance values('${automatic}','2026-09-22','09:40','18:30')`);assert.equal((await candidates()).length,19);
  await q(`insert into attendance_issue_resolutions values('${automatic}','2026-09-23')`);assert.equal((await candidates()).length,18);
  await q(`insert into leave_requests values('${automatic}','2026-09-24','2026-09-24','승인','연차')`);assert.equal((await candidates()).length,17);
  await q(`insert into attendance_manual_entries values('${automatic}','2026-09-25','대기')`);assert.equal((await candidates()).length,16);
  await q(`insert into schedules values('${automatic}','2026-09-28',1,'off')`);assert.equal((await candidates()).length,15);
  await db.exec(`insert into schedules values('${automatic}','2026-10-05',1,'off');update schedule_weeks set status='초안' where week_start='2026-10-05';`);
  assert.equal((await candidates()).some(r=>r.ds==='2026-10-05'),true,'draft off is not an exclusion');
  await q("insert into app_settings(key,value) values('absence_exclude_pending_manual','false') on conflict(key) do update set value=excluded.value");assert.equal((await candidates()).length,16);
  await q("update app_settings set value='true' where key='absence_exclude_pending_manual'");
  const run=(await q(`select id from leave_accrual_runs where user_id='${automatic}'`))[0].id;
  await q(`select set_config('app.uid','${owner}',false)`);
  const list=await q('select * from get_monthly_leave_accrual_candidates()');assert.equal(list.find(r=>r.user_id===automatic).candidate_dates.length,15);
  await assert.rejects(q(`select * from revoke_monthly_leave_accrual(${run},' ')`),/reason required/);
  result=await q(`select * from revoke_monthly_leave_accrual(${run},'결근 후보 확인')`);assert.equal(Number(result[0].revoked_days),1);
  assert.equal(Number((await q(`select sum(days) balance from leave_ledger where user_id='${automatic}'`))[0].balance),0);
  result=await q(`select * from revoke_monthly_leave_accrual(${run},'다시 클릭')`);assert.equal(result[0].already_revoked,true);
  assert.equal((await q(`select count(*)::int n from leave_ledger where user_id='${automatic}' and kind='조정'`))[0].n,1);
  const audit=(await q(`select revoked_at,revoked_by,revoke_reason,revoke_ledger_id from leave_accrual_runs where id=${run}`))[0];
  assert.ok(audit.revoked_at&&audit.revoke_ledger_id);assert.equal(audit.revoked_by,owner);assert.equal(audit.revoke_reason,'결근 후보 확인');
  await q("select set_config('app.uid','',false)");
  assert.equal((await q("select * from run_under_year_monthly_leave_accrual('2026-10-19')")).some(r=>r.user_id===automatic),false);
  result=await q("select * from run_under_year_monthly_leave_accrual('2026-11-18')");assert.equal(Number(result.find(r=>r.user_id===automatic).granted_days),1);
  assert.equal(Number((await q(`select sum(days) balance from leave_ledger where user_id='${automatic}'`))[0].balance),1);
  await q("update app_settings set value='published_schedule' where key='monthly_leave_attendance_mode'");
  assert.equal((await q("select * from run_under_year_monthly_leave_accrual('2026-12-18')")).some(r=>r.user_id===automatic),false,'old mode requires published schedule');
  // Migration reruns preserve the owner-selected setting and revoke audit.
  await db.exec(migration);assert.equal((await q("select value from app_settings where key='monthly_leave_attendance_mode'"))[0].value,'published_schedule');
  await db.exec(`grant usage on schema auth to authenticated;grant execute on function auth.uid() to authenticated;grant select on profiles to authenticated;set role authenticated;select set_config('app.uid','${owner}',false);`);
  await assert.rejects(q("select * from run_under_year_monthly_leave_accrual('2026-10-18')"),/permission denied/);
  for(const actor of [manager,staff]){
    await q(`select set_config('app.uid','${actor}',false)`);
    await assert.rejects(q(`select * from revoke_monthly_leave_accrual(${run},'권한 시험')`),/owner execution required/);
    await assert.rejects(q('select * from get_monthly_leave_accrual_candidates()'),/owner execution required/);
  }
  await q(`select set_config('app.uid','${staff}',false)`);
  await assert.rejects(q("select * from preview_monthly_leave_accruals('2026-10-18')"),/owner execution required/);
  await q("select set_config('app.uid','',false)");
  await assert.rejects(q("select * from preview_monthly_leave_accruals('2026-10-18')"),/owner execution required/);
  await db.exec('reset role');
  // pg_cron은 PGlite에 없으므로 스케줄 API만 합성함. SQL의 예약/해제 본문을 그대로 실행함.
  await db.exec(`create schema cron;create table cron.job(jobid bigint generated always as identity,jobname text unique,schedule text,command text);
    create function cron.schedule(text,text,text) returns bigint language plpgsql as $$declare i bigint;begin insert into cron.job(jobname,schedule,command) values($1,$2,$3) on conflict(jobname) do update set schedule=excluded.schedule,command=excluded.command returning jobid into i;return i;end;$$;
    create function cron.unschedule(bigint) returns boolean language plpgsql as $$begin update cron.job set schedule='paused' where jobid=$1;return found;end;$$;`);
  const cronBlock=migration.slice(migration.indexOf('-- 매일 한 번')).replace("exists(select 1 from pg_extension where extname='pg_cron')","to_regnamespace('cron') is not null");
  await db.exec(cronBlock);await db.exec(cronBlock);
  let jobs=await q('select * from cron.job');assert.equal(jobs.length,1);assert.equal(jobs[0].schedule,'10 15 * * *');assert.match(jobs[0].command,/run_under_year_monthly_leave_accrual/);
  const before=(await q('select count(*)::int n from leave_accrual_runs'))[0].n;
  const ledgerBefore=await q('select * from leave_ledger order by id');
  await db.exec(fs.readFileSync('db/under_year_monthly_leave_20261003_rollback.sql','utf8').replace("exists(select 1 from pg_extension where extname='pg_cron')","to_regnamespace('cron') is not null"));
  await assert.rejects(q("select * from run_under_year_monthly_leave_accrual('2026-10-18')"),/does not exist/);
  assert.equal((await q('select schedule from cron.job'))[0].schedule,'paused');
  await assert.rejects(q("select * from preview_monthly_leave_accruals('2026-10-18')"),/owner execution required/);
  assert.equal((await q('select count(*)::int n from leave_accrual_runs'))[0].n,before);
  assert.deepEqual(await q('select * from leave_ledger order by id'),ledgerBefore);
  assert.equal((await q("select value from app_settings where key='monthly_leave_attendance_mode'"))[0]?.value,'published_schedule','RED4 rollback preserves owner attendance mode');
  assert.deepEqual((await q(`select revoked_at,revoked_by,revoke_reason,revoke_ledger_id from leave_accrual_runs where id=${run}`))[0],audit,'RED4 rollback preserves cancellation audit');
  await db.exec(migration);
  await q(`select set_config('app.uid','${owner}',false)`);
  result=await q(`select * from revoke_monthly_leave_accrual(${run},'재적용 후 클릭')`);
  assert.equal(result[0].already_revoked,true,'RED4 cancellation remains idempotent after rollback/reapply');
  assert.deepEqual(await q('select * from leave_ledger order by id'),ledgerBefore,'RED4 no second deduction');
  console.log('P7_MONTHLY_AUTO_PASS: auto 근무표 없음·평일/공휴일/출근/소명/승인휴가/수기/공표휴무·원장취소/중복/다음달·직원/매니저거절·published_schedule·기록보존 롤백 +  10/17·10/18·11/17·11/18 경계, 중복·수기상계·미기록·재확인·최대11·연차제외·호출권한·되돌리기·cron 합성 예약/해제');
}finally{await db.close();}
