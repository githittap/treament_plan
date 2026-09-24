import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';

const root=process.env.PGLITE_PACKAGE_ROOT;if(!root)process.exit(0);
const {PGlite}=await import(pathToFileURL(path.join(root,'dist/index.js')).href);
const db=new PGlite(),q=s=>db.query(s).then(r=>r.rows);
const staff='22222222-2222-2222-2222-222222222222';
try{
  await db.exec(`create role anon;create role authenticated;create schema auth;
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('app.test_uid',true),'')::uuid$$;
    create table public.profiles(user_id uuid primary key,name text,active boolean default true,approved boolean default true,role text);
    create function public.my_role() returns text language sql stable as $$select coalesce((select role from public.profiles where user_id=auth.uid()),'')$$;
    create table public.attendance_issues(id bigint generated always as identity primary key,user_id uuid,work_date date,type text,reason text,rule_label text,status text default '대기',chief_by text,chief_at timestamptz,owner_by text,owner_at timestamptz,created_at timestamptz default now());
    grant usage on schema auth to authenticated;grant execute on function auth.uid() to authenticated;grant select on public.profiles to authenticated;
    grant select,insert,update on public.attendance_issues to authenticated;
    insert into public.profiles values('${staff}','시험 직원',true,true,'staff');`+
    fs.readFileSync('db/attendance_issue_resolution_release.sql','utf8')+fs.readFileSync('db/attendance_manual_v2.sql','utf8')+fs.readFileSync('db/attendance_manual_evening_overtime_draft.sql','utf8'));
  await q('set role authenticated');await q(`select set_config('app.test_uid','${staff}',false)`);
  const rows=await q(`select * from public.submit_manual_attendance_d('2026-09-24','09:00','18:00',0,0,'9',0,'10',10,'19',10,'메모',false,'저녁 확인','오전 반차')`);
  assert.equal(rows[0].overtime_min,10);assert.equal(rows[0].evening_overtime_min,10);assert.equal(rows[0].evening_overtime_raw_text,'19');assert.equal(rows[0].manual_note,'저녁 확인');assert.equal(rows[0].half_day,'오전 반차');
  const rev=await q('select payload from public.attendance_manual_revisions where entry_id=1');assert.equal(rev[0].payload.overtime_min,10);
  for(const [day,raw,expected] of [['26','9',0],['27','10',10],['28','19',10]]){
    const boundary=await q(`select * from public.submit_manual_attendance_d('2026-09-${day}','09:00','18:00',0,0,'${raw}',${expected},'${raw}',${expected},'${raw}',${expected},null,false,null,'없음')`);
    assert.equal(boundary[0].overtime_min,expected*2,`${raw}분 점심·퇴근 계산`);
    assert.equal(boundary[0].evening_overtime_min,expected,`${raw}분 저녁 계산`);
  }
  let mismatch='';try{await q(`select * from public.submit_manual_attendance_d('2026-09-25','09:00','18:00',0,0,'',0,'',0,'19',19,null,false,null,'없음')`)}catch(e){mismatch=String(e)}assert.match(mismatch,/evening overtime value mismatch/);
  let blocked='';try{await db.exec(fs.readFileSync('db/attendance_manual_evening_overtime_rollback.sql','utf8'))}catch(e){blocked=String(e)}assert.match(blocked,/rollback stopped/);assert.equal((await q("select count(*)::int n from information_schema.columns where table_name='attendance_manual_entries' and column_name='evening_overtime_min'"))[0].n,1);
  await q('reset role');await q('delete from public.manual_attendance_status_history');await q('delete from public.attendance_manual_revisions');await q('delete from public.attendance_manual_entries');
  await db.exec(fs.readFileSync('db/attendance_manual_evening_overtime_rollback.sql','utf8'));
  assert.equal((await q("select count(*)::int n from information_schema.columns where table_name='attendance_manual_entries' and column_name='evening_overtime_min'"))[0].n,0);
  console.log('PGLITE_ATTENDANCE_D_PHASE2_PASS: evening-minutes/total/note/half-day/9-10-19-minute-server-check');
}finally{await db.close();}
