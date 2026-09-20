import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const packageRoot=process.env.PGLITE_PACKAGE_ROOT;if(!packageRoot)process.exit(0);
const {PGlite}=await import(pathToFileURL(path.join(packageRoot,'dist/index.js')).href);const db=new PGlite();const q=s=>db.query(s).then(r=>r.rows);
const chief='11111111-1111-1111-1111-111111111111',staff='22222222-2222-2222-2222-222222222222',owner='33333333-3333-3333-3333-333333333333',other='44444444-4444-4444-4444-444444444444';
try{
  await db.exec(`create role anon; create role authenticated; create schema auth;
  create or replace function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('app.test_uid',true),'')::uuid $$;
  create table public.profiles(user_id uuid primary key,name text,active boolean default true,approved boolean default true,role text);
  create or replace function public.my_role() returns text language sql stable as $$ select coalesce((select role from public.profiles where user_id=auth.uid()),'') $$;
  create table public.attendance(user_id uuid,work_date date,clock_in time,clock_out time,source text,late_min int default 0,early_min int default 0,overtime_min int default 0,memo text,primary key(user_id,work_date));
  create table public.attendance_issues(id bigint generated always as identity primary key,user_id uuid,work_date date,type text check(type in ('시업누락','종업누락','정정')),reason text,rule_label text,status text default '대기' check(status in ('대기','실장승인','원장확정','반려')),chief_by text,chief_at timestamptz,owner_by text,owner_at timestamptz,created_at timestamptz default now());
  grant usage on schema auth to authenticated; grant execute on function auth.uid() to authenticated; grant select on public.profiles to authenticated;
  grant select,insert,update on public.attendance,public.attendance_issues to authenticated;
  create policy attendance_issues_select_test on public.attendance_issues for select to authenticated using (user_id=auth.uid() or public.my_role() in ('chief','owner'));
  insert into public.profiles values('${chief}','합성실장',true,true,'chief'),('${staff}','합성직원',true,true,'staff'),('${owner}','합성원장',true,true,'owner'),('${other}','합성다른직원',true,true,'staff');
  insert into public.attendance values('${staff}','2026-09-22','09:00','18:00','fp',0,0,0,'원본');
  insert into public.attendance_issues(user_id,work_date,type,reason,rule_label) values('${staff}','2026-09-22','정정','지문 누락','지문인식오류');`+fs.readFileSync('db/attendance_issue_resolution_release.sql','utf8'));
  const issue=(await db.query("select id from public.attendance_issues where user_id='"+staff+"'")).rows[0].id;
  await q('set role authenticated');
  const rpc=async(name,p)=>{const args=Object.values(p).map(v=>v===null?'null':typeof v==='boolean'?v?'true':'false':`'${String(v).replaceAll("'","''")}'`).join(',');return q(`select * from public.${name}(${args})`)};
  await q(`select set_config('app.test_uid','${staff}',false)`);
  let invalid='';try{await rpc('submit_manual_attendance',{p_work_date:null,p_clock_in:null,p_clock_out:null,p_late_min:0,p_early_min:0,p_overtime_raw_text:'',p_overtime_min:0,p_reason:null,p_reason_required:false})}catch(e){invalid=String(e)}assert.match(invalid,/invalid manual attendance submission/);
  const submitted=await rpc('submit_manual_attendance',{p_work_date:'2026-09-22',p_clock_in:'09:12',p_clock_out:'18:00',p_late_min:12,p_early_min:0,p_overtime_raw_text:'19',p_overtime_min:10,p_reason:'지문 누락 보정',p_reason_required:true});assert.equal(submitted[0].status,'대기');assert.equal(submitted[0].id,1);
  await q(`select set_config('app.test_uid','${chief}',false)`);assert.equal((await q(`select status from public.review_attendance_issue(${issue},'approve')`))[0].status,'실장승인');assert.equal((await q('select status from public.review_manual_attendance(1,\'approve\')'))[0].status,'실장승인');
  await q(`select set_config('app.test_uid','${staff}',false)`);const newer=await rpc('submit_manual_attendance',{p_work_date:'2026-09-22',p_clock_in:'09:15',p_clock_out:'18:00',p_late_min:15,p_early_min:0,p_overtime_raw_text:'19',p_overtime_min:10,p_reason:'재제출',p_reason_required:true});assert.equal(newer[0].id,2);assert.equal((await q('select status from public.attendance_manual_entries where id=1'))[0].status,'대체');
  await q(`select set_config('app.test_uid','${owner}',false)`);let obsolete='';try{await q('select status from public.review_manual_attendance(1,\'approve\')')}catch(e){obsolete=String(e)}assert.match(obsolete,/obsolete manual attendance version/);assert.equal((await q(`select status from public.review_attendance_issue(${issue},'approve')`))[0].status,'원장확정');assert.equal((await q('select status from public.review_manual_attendance(2,\'approve\')'))[0].status,'원장확정');
  assert.deepEqual((await q(`select source,clock_in::text from public.attendance where user_id='${staff}' and work_date='2026-09-22'`))[0],{source:'fp',clock_in:'09:00:00'});
  await q(`select set_config('app.test_uid','${staff}',false)`);assert.equal((await q(`select count(*)::int n from public.attendance_issue_resolutions where user_id='${staff}'`))[0].n,1);
  let direct='';try{await q(`insert into public.attendance_issue_resolutions(issue_id,user_id,work_date,approved_by) values(${issue},'${staff}','2026-09-22','${staff}')`)}catch(e){direct=String(e)}assert.match(direct,/permission denied|row-level security/);
  let forged='';try{await q(`update public.attendance_issues set status='원장확정' where id=${issue}`)}catch(e){forged=String(e)}assert.match(forged,/permission denied/);
  let changed='';try{await q(`select status from public.review_attendance_issue(${issue},'approve')`)}catch(e){changed=String(e)}assert.match(changed,/immutable|not allowed/);
  assert.equal((await q('select auth.uid()::text uid'))[0].uid,staff);
  for (const [date,label] of [['2026-09-23','지문인식오류'],['2026-09-24','입력오류'],['2026-09-25','기타']]) { const uiIssue=await rpc('submit_attendance_issue',{p_work_date:date,p_type:'정정',p_rule_label:label,p_reason:'직원 소명'});assert.deepEqual({type:uiIssue[0].type,rule_label:uiIssue[0].rule_label,status:uiIssue[0].status},{type:'정정',rule_label:label,status:'대기'}); }
  let forgedInsert='';try{await q(`insert into public.attendance_issues(user_id,work_date,type,rule_label,status,owner_by) values('${staff}','2026-09-24','정정','지문인식오류','원장확정','위조')`)}catch(e){forgedInsert=String(e)}assert.match(forgedInsert,/row-level security|permission denied/);
  await q(`select set_config('app.test_uid','${owner}',false)`);const autoFinal=await rpc('record_auto_attendance_issue',{p_user_id:staff,p_work_date:'2026-09-22',p_type:'시업누락',p_reason:'재업로드'});assert.equal(autoFinal[0].status,'원장확정');const autoNew=await rpc('record_auto_attendance_issue',{p_user_id:staff,p_work_date:'2026-09-26',p_type:'시업누락',p_reason:'자동 누락'});const autoAgain=await rpc('record_auto_attendance_issue',{p_user_id:staff,p_work_date:'2026-09-26',p_type:'종업누락',p_reason:'다른 재업로드'});assert.equal(autoAgain[0].id,autoNew[0].id);assert.equal(autoAgain[0].type,'시업누락');
  await q(`select set_config('app.test_uid','${other}',false)`);assert.equal((await q('select count(*)::int n from public.attendance_issue_resolutions'))[0].n,0);
  console.log('PGLITE_ATTENDANCE_RELEASE_PASS: ui-payload-submit/chief-owner-approvals/version-guard/resolution/original-fp-preserved/direct-update-blocked/scoped-RLS');
}finally{await db.close()}
