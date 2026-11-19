import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';

const {PGlite}=await import(pathToFileURL(path.join(process.env.PGLITE_PACKAGE_ROOT,'dist/index.js')).href);
const db=new PGlite(),q=sql=>db.query(sql).then(r=>r.rows);
const ids={owner:'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',manager:'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',staff:'cccccccc-cccc-cccc-cccc-cccccccccccc',chief:'dddddddd-dddd-dddd-dddd-dddddddddddd',deputy:'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee'};
const as=async id=>{await q('set role authenticated');await q(`select set_config('app.test_uid','${id}',false)`);};
const deny=async(sql,reason=/owner execution required|row-level security|permission denied/)=>assert.rejects(q(sql),reason);
const confirm=rows=>`'${JSON.stringify(rows.map(r=>({user_id:r.user_id,due_date:new Date(r.due_date).toISOString().slice(0,10),full_attendance:true})))}'::jsonb`;
try{
  await db.exec(`create role anon;create role authenticated;create schema auth;
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('app.test_uid',true),'')::uuid $$;
    create table profiles(user_id uuid primary key,name text,hire_date date,role text,active boolean default true,approved boolean default true,account_access_status text default '활성',employment_status text default '재직',employment_effective_date date);
    create function my_role() returns text language sql stable security definer set search_path=public as $$ select role from profiles where user_id=auth.uid() $$;
    create function employee_hub_access_allowed() returns boolean language sql stable security definer set search_path=public as $$ select auth.uid() is not null and exists(select 1 from profiles p where p.user_id=auth.uid() and p.active and p.approved and p.account_access_status='활성' and p.role<>'deputy') $$;
    create table app_settings(key text primary key,value text,label text);
    alter table app_settings enable row level security;
    create policy app_settings_select_all on app_settings for select to authenticated using(true);
    create policy app_settings_insert_owner on app_settings for insert to authenticated with check(my_role()='owner');
    create policy app_settings_update_owner on app_settings for update to authenticated using(my_role()='owner') with check(my_role()='owner');
    create table leave_ledger(id bigint generated always as identity primary key,user_id uuid,kind text,days numeric,note text);
    alter table leave_ledger enable row level security;
    create policy leave_ledger_select_owner on leave_ledger for select to authenticated using(my_role()='owner');
    create policy leave_ledger_insert_owner on leave_ledger for insert to authenticated with check(my_role()='owner');
    grant usage on schema auth to authenticated;
    grant execute on function auth.uid(),my_role(),employee_hub_access_allowed() to authenticated;
    grant select on profiles to authenticated;
    grant select,insert,update on app_settings to authenticated;
    grant select,insert on leave_ledger to authenticated;
    grant usage,select on sequence leave_ledger_id_seq to authenticated;
    insert into profiles(user_id,name,hire_date,role) values
      ('${ids.owner}','합성원장',null,'owner'),
      ('${ids.manager}','합성매니저','2026-09-18','manager'),
      ('${ids.staff}','합성직원','2026-09-18','staff'),
      ('${ids.chief}','합성실장',null,'chief'),
      ('${ids.deputy}','합성부원장',null,'deputy');`);
  await db.exec(fs.readFileSync('db/monthly_leave_accrual_draft.sql','utf8'));
  await db.exec(`alter table leave_accrual_runs add column attendance_mode text, add column revoked_at timestamptz,
    add column revoked_by uuid, add column revoke_reason text, add column revoke_ledger_id bigint;`);
  await db.exec(`insert into app_settings(key,value,label) values('leave.manager_access_enabled','true','매니저 연차 보기·편집');
    create function leave_manager_allowed() returns boolean language sql stable security definer set search_path='' as $fn$
      select auth.uid() is not null and public.employee_hub_access_allowed() and exists(select 1 from public.profiles p where p.user_id=auth.uid() and p.role='manager' and p.active and p.approved)
        and coalesce((select value='true' from public.app_settings where key='leave.manager_access_enabled'),false)
    $fn$;
    grant execute on function leave_manager_allowed() to authenticated;
    drop policy leave_ledger_select_owner on leave_ledger;
    create policy leave_ledger_select_scoped on leave_ledger for select to authenticated using(user_id=auth.uid() or my_role() in ('chief','owner') or leave_manager_allowed());`);
  const migration=fs.readFileSync('db/leave_manager_accrual.sql','utf8');
  await db.exec(migration);
  assert.equal((await q("select value from app_settings where key='leave.manager_can_accrue'"))[0].value,'true');
  assert.equal((await q("select prosecdef from pg_proc where oid='public.apply_monthly_leave_accruals(date,jsonb,boolean)'::regprocedure"))[0].prosecdef,true);
  await as(ids.manager);
  const preview=await q("select * from preview_monthly_leave_accruals('2026-10-18')");
  const self=preview.find(r=>r.user_id===ids.manager&&r.accrual_kind==='monthly');
  const staff=preview.find(r=>r.user_id===ids.staff&&r.accrual_kind==='monthly');
  assert.ok(self&&staff,'manager sees own and staff accrual');
  await deny(`insert into leave_ledger(user_id,kind,days,note) values('${ids.manager}','조정',1,'direct self change')`,/row-level security/);
  await deny(`insert into leave_accrual_runs(user_id,due_date,accrual_kind,months_completed,target_days,days,attendance_confirmed_by,attendance_confirmed_at) values('${ids.manager}','2026-11-18','monthly',2,2,0,'${ids.manager}',now())`,/row-level security/);
  await deny("insert into app_settings(key,value,label) values('leave.manager_can_accrue','false','x') on conflict(key) do update set value=excluded.value",/row-level security/);
  const applied=await q(`select * from apply_monthly_leave_accruals('2026-10-18',${confirm([self,staff])},true)`);
  assert.equal(applied.length,2);
  assert.equal((await q('select count(*)::int n from leave_accrual_runs'))[0].n,2);
  assert.equal((await q("select distinct executed_by_name,executed_by_role from leave_accrual_runs"))[0].executed_by_role,'manager');
  assert.equal((await q(`select * from apply_monthly_leave_accruals('2026-10-18',${confirm([self,staff])},true)`)).length,0,'same month is idempotent');
  const run=(await q(`select id from leave_accrual_runs where user_id='${ids.manager}'`))[0].id;
  assert.equal((await q(`select * from revoke_monthly_leave_accrual(${run},'합성 취소')`))[0].already_revoked,false);
  assert.equal((await q(`select * from revoke_monthly_leave_accrual(${run},'재시도')`))[0].already_revoked,true);
  await q('reset role');
  await q("update app_settings set value='false' where key='leave.manager_can_accrue'");
  await as(ids.manager);
  await deny("select * from preview_monthly_leave_accruals('2026-10-18')");
  await deny('select * from get_monthly_leave_accrual_candidates()');
  await deny(`select * from revoke_monthly_leave_accrual(${run},'차단')`);
  await deny(`select * from apply_monthly_leave_accruals('2026-10-18',${confirm([self])},true)`);
  assert.equal((await q('select count(*)::int n from leave_accrual_runs'))[0].n,0,'disabled manager cannot read run rows through RLS');
  await q('reset role');
  await q("update app_settings set value='true' where key='leave.manager_can_accrue'");
  await q("update app_settings set value='false' where key='leave.manager_access_enabled'");
  await as(ids.manager);
  await deny("select * from preview_monthly_leave_accruals('2026-10-18')");
  await deny('select * from get_monthly_leave_accrual_candidates()');
  await deny(`select * from apply_monthly_leave_accruals('2026-10-18',${confirm([self])},true)`);
  await deny(`select * from revoke_monthly_leave_accrual(${run},'차단')`);
  await q('reset role');
  await q("update app_settings set value='true' where key='leave.manager_access_enabled'");
  await q(`update profiles set approved=false where user_id='${ids.manager}'`);
  await as(ids.manager);
  await deny("select * from preview_monthly_leave_accruals('2026-10-18')");
  await deny('select * from get_monthly_leave_accrual_candidates()');
  await deny(`select * from apply_monthly_leave_accruals('2026-10-18',${confirm([self])},true)`);
  await deny(`select * from revoke_monthly_leave_accrual(${run},'차단')`);
  await q('reset role');
  await q(`update profiles set approved=true where user_id='${ids.manager}'`);
  await q(`update profiles set account_access_status='차단' where user_id='${ids.manager}'`);
  await as(ids.manager);
  await deny("select * from preview_monthly_leave_accruals('2026-10-18')");
  await deny('select * from get_monthly_leave_accrual_candidates()');
  await deny(`select * from apply_monthly_leave_accruals('2026-10-18',${confirm([self])},true)`);
  await deny(`select * from revoke_monthly_leave_accrual(${run},'차단')`);
  await q('reset role');
  await q(`update profiles set account_access_status='활성' where user_id='${ids.manager}'`);
  for(const id of [ids.staff,ids.chief,ids.deputy]){
    await as(id);
    await deny("select * from preview_monthly_leave_accruals('2026-10-18')");
    await deny('select * from get_monthly_leave_accrual_candidates()');
    await deny(`select * from apply_monthly_leave_accruals('2026-10-18',${confirm([self])},true)`);
    await deny(`select * from revoke_monthly_leave_accrual(${run},'차단')`);
  }
  await as(ids.owner);
  assert.ok((await q("select * from preview_monthly_leave_accruals('2026-10-18')")).length>0);
  await q('reset role');
  await q(`update profiles set approved=false where user_id='${ids.owner}'`);
  await as(ids.owner);
  await deny("select * from preview_monthly_leave_accruals('2026-10-18')");
  await q('reset role');
  await q(`update profiles set approved=true,active=false where user_id='${ids.owner}'`);
  await as(ids.owner);
  await deny("select * from get_monthly_leave_accrual_candidates()");
  await q('reset role');
  await q(`update profiles set active=true where user_id='${ids.owner}'`);
  await q(`update profiles set account_access_status='차단' where user_id='${ids.owner}'`);
  await as(ids.owner);
  await deny("select * from preview_monthly_leave_accruals('2026-10-18')");
  await deny('select * from get_monthly_leave_accrual_candidates()');
  await deny(`select * from apply_monthly_leave_accruals('2026-10-18',${confirm([self])},true)`);
  await deny(`select * from revoke_monthly_leave_accrual(${run},'차단')`);
  await q('reset role');
  await q(`update profiles set account_access_status='활성' where user_id='${ids.owner}'`);
  await q("select set_config('app.test_uid','',false)");
  assert.ok((await q("select * from preview_monthly_leave_accruals('2026-10-18')")).length>0,'scheduler preview remains available');
  await db.exec(fs.readFileSync('db/leave_manager_accrual_rollback.sql','utf8'));
  assert.equal((await q("select prosecdef from pg_proc where oid='public.apply_monthly_leave_accruals(date,jsonb,boolean)'::regprocedure"))[0].prosecdef,false);
  assert.equal((await q("select count(*)::int n from app_settings where key='leave.manager_can_accrue'"))[0].n,0);
  assert.equal((await q("select count(*)::int n from pg_proc where proname='leave_monthly_accrual_actor_allowed'"))[0].n,0);
  await as(ids.manager);
  await deny("select * from preview_monthly_leave_accruals('2026-10-18')");
  await as(ids.owner);
  assert.ok((await q("select * from preview_monthly_leave_accruals('2026-10-18')")).length>0);
  console.log('PGLITE_LEAVE_MANAGER_ACCRUAL_PASS');
}finally{await db.close();}
