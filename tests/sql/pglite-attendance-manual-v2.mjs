import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';

const root=process.env.PGLITE_PACKAGE_ROOT;if(!root)process.exit(0);
const {PGlite}=await import(pathToFileURL(path.join(root,'dist/index.js')).href);
const db=new PGlite(),q=s=>db.query(s).then(r=>r.rows);
const staff='22222222-2222-2222-2222-222222222222',chief='11111111-1111-1111-1111-111111111111';
try{
  await db.exec(`create role anon;create role authenticated;create schema auth;
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('app.test_uid',true),'')::uuid$$;
    create table public.profiles(user_id uuid primary key,name text,active boolean default true,approved boolean default true,role text);
    create function public.my_role() returns text language sql stable as $$select coalesce((select role from public.profiles where user_id=auth.uid()),'')$$;
    create table public.attendance(user_id uuid,work_date date,clock_in time,clock_out time,source text,late_min int default 0,early_min int default 0,overtime_min int default 0,memo text,primary key(user_id,work_date));
    create table public.attendance_issues(id bigint generated always as identity primary key,user_id uuid,work_date date,type text,reason text,rule_label text,status text default '대기',chief_by text,chief_at timestamptz,owner_by text,owner_at timestamptz,created_at timestamptz default now());
    grant usage on schema auth to authenticated;grant execute on function auth.uid() to authenticated;grant select on public.profiles to authenticated;
    grant select,insert,update on public.attendance,public.attendance_issues to authenticated;
    insert into public.profiles values('${chief}','합성실장',true,true,'chief'),('${staff}','합성직원',true,true,'staff');`+
    fs.readFileSync('db/attendance_issue_resolution_release.sql','utf8')+fs.readFileSync('db/attendance_manual_v2.sql','utf8'));
  await q('set role authenticated');await q(`select set_config('app.test_uid','${staff}',false)`);
  const rpc=(name,args)=>q(`select * from public.${name}(${args})`);
  const v2=await rpc('submit_manual_attendance_v2',`'2026-09-23','09:05','18:00',5,0,'13',10,'01:09',60,'합성 사유',true`);
  assert.deepEqual({status:v2[0].status,overtime_min:v2[0].overtime_min,lunch_overtime_min:v2[0].lunch_overtime_min,clockout_overtime_min:v2[0].clockout_overtime_min},{status:'대기',overtime_min:70,lunch_overtime_min:10,clockout_overtime_min:60});
  const revision=(await q('select payload from public.attendance_manual_revisions where entry_id=1'))[0].payload;
  assert.deepEqual({lunch:revision.lunch_overtime_raw_text,clockout:revision.clockout_overtime_raw_text,lunchMin:revision.lunch_overtime_min,clockoutMin:revision.clockout_overtime_min,total:revision.overtime_min},{lunch:'13',clockout:'01:09',lunchMin:10,clockoutMin:60,total:70});
  const legacy=await rpc('submit_manual_attendance',`'2026-09-24','09:00','18:00',0,0,'20',20,null,false`);assert.equal(legacy[0].overtime_min,20);
  assert.deepEqual((await q('select lunch_overtime_raw_text,clockout_overtime_raw_text,lunch_overtime_min,clockout_overtime_min from public.attendance_manual_entries where id=2'))[0],{lunch_overtime_raw_text:'',clockout_overtime_raw_text:'',lunch_overtime_min:0,clockout_overtime_min:0});
  let direct='';try{await q(`insert into public.attendance_manual_entries(user_id,work_date) values('${staff}','2026-09-25')`)}catch(e){direct=String(e)}assert.match(direct,/permission denied|row-level security/);
  let rollback='';try{await db.exec(fs.readFileSync('db/attendance_manual_v2_rollback.sql','utf8'))}catch(e){rollback=String(e)}assert.match(rollback,/rollback stopped/);assert.equal((await q('select count(*)::int n from public.attendance_manual_entries'))[0].n,2);
  console.log('PGLITE_ATTENDANCE_MANUAL_V2_PASS: split-raw-minutes/total-compat/revision/legacy-rpc/direct-dml-block/rollback-stop');
}finally{await db.close();}
