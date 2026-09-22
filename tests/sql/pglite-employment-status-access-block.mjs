import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';

const root=process.env.PGLITE_PACKAGE_ROOT;
if(!root)throw new Error('PGLITE_PACKAGE_ROOT is required');
const {PGlite}=await import(pathToFileURL(path.join(root,'dist/index.js')).href);
const migration=fs.readFileSync('db/employment_status_access_block.sql','utf8');
const rollback=fs.readFileSync('db/employment_status_access_block_rollback.sql','utf8');
const db=new PGlite(),q=sql=>db.query(sql).then(r=>r.rows);
const owner='11111111-1111-1111-1111-111111111111',staff='22222222-2222-2222-2222-222222222222',chief='33333333-3333-3333-3333-333333333333';
try{
  await db.exec(`create role anon;create role authenticated;create schema auth;
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('app.test_uid',true),'')::uuid$$;
    create table public.profiles(user_id uuid primary key,name text,role text,active boolean not null default true,approved boolean not null default true);
    create table public.schedule_people(profile_user_id uuid primary key,active boolean not null default true,included_in_schedule boolean not null default true);
    create table public.contracts(user_id uuid);create table public.signatures(user_id uuid);create table public.documents(user_id uuid);create table public.attendance(user_id uuid);create table public.leave_requests(user_id uuid);create table public.payroll_rows(user_id uuid);
    grant usage on schema auth to authenticated;grant execute on function auth.uid() to authenticated;grant select on public.profiles,public.schedule_people to authenticated;
    insert into public.profiles values('${owner}','원장','owner',true,true),('${chief}','실장','chief',true,true),('${staff}','직원','staff',true,true);
    insert into public.schedule_people values('${staff}',true,true);
    insert into public.contracts values('${staff}');insert into public.signatures values('${staff}');insert into public.documents values('${staff}');insert into public.attendance values('${staff}');insert into public.leave_requests values('${staff}');insert into public.payroll_rows values('${staff}');`+migration);
  await q('set role authenticated');await q(`select set_config('app.test_uid','${owner}',false)`);
  await q(`select public.disable_employee_account_preserve_records('${staff}','계약만료','계약 종료','2026-09-22')`);
  await q('reset role');
  assert.deepEqual((await q(`select employment_status,account_access_status,active,approved from public.profiles where user_id='${staff}'`))[0],{employment_status:'계약만료',account_access_status:'차단',active:false,approved:false});
  assert.deepEqual((await q(`select active,included_in_schedule from public.schedule_people where profile_user_id='${staff}'`))[0],{active:false,included_in_schedule:false});
  assert.equal((await q(`select count(*)::int n from public.profile_employment_history where user_id='${staff}'`))[0].n,1);
  for(const name of ['contracts','signatures','documents','attendance','leave_requests','payroll_rows'])assert.equal((await q(`select count(*)::int n from public.${name} where user_id='${staff}'`))[0].n,1);
  await q('set role authenticated');
  let restore='',approve='';try{await q(`select public.set_employment_status('${staff}','재직','2026-09-23','복귀')`)}catch(e){restore=String(e);await q('rollback')}try{await q(`select public.approve_employee_profile('${staff}')`)}catch(e){approve=String(e);await q('rollback')}assert.match(restore,/blocked account cannot return to employed status/);assert.match(approve,/blocked account cannot be approved/);
  let self='',directDelete='';try{await q(`select public.set_employment_status('${owner}','자진퇴사','2026-09-23','self')`)}catch(e){self=String(e);await q('rollback')}try{await q(`delete from public.profiles where user_id='${staff}'`)}catch(e){directDelete=String(e);await q('rollback')}assert.match(self,/cannot change your own employment status/);assert.match(directDelete,/permission denied|row-level security/);
  await q('reset role');let blockedRollback='';try{await db.exec(rollback)}catch(e){blockedRollback=String(e);await q('rollback')}assert.match(blockedRollback,/employment rollback blocked/);assert.equal((await q(`select count(*)::int n from public.profile_employment_history where user_id='${staff}'`))[0].n,1);
  const empty=new PGlite();try{await empty.exec(`create role anon;create role authenticated;create schema auth;create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('app.test_uid',true),'')::uuid$$;create table public.profiles(user_id uuid primary key,name text,role text,active boolean not null default true,approved boolean not null default true);create function public.my_role() returns text language sql stable as $$select coalesce((select role from public.profiles where user_id=auth.uid()),'')$$;create table public.schedule_people(profile_user_id uuid primary key,active boolean not null default true,included_in_schedule boolean not null default true);insert into public.profiles values('${owner}','원장','owner',true,true);`+migration+rollback);assert.equal((await empty.query(`select to_regclass('public.profile_employment_history') n`)).rows[0].n,null);}finally{await empty.close();}
  console.log('PGLITE_EMPLOYMENT_STATUS_ACCESS_BLOCK_PASS: apply/block/blocked-restore-and-approve/self-last-owner-safety/related-records/direct-delete/rollback-stop-empty-rollback');
}finally{await db.close();}
