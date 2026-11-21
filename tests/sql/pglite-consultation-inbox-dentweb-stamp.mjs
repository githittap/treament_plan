import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';

const root=process.cwd(),pkg=process.env.PGLITE_PACKAGE_ROOT;
if(!pkg)throw new Error('PGLITE_PACKAGE_ROOT required');
const {PGlite}=await import(pathToFileURL(path.join(pkg,'dist/index.js')).href),db=new PGlite(),q=s=>db.query(s).then(x=>x.rows);
const owner='11111111-1111-1111-1111-111111111111',manager='22222222-2222-2222-2222-222222222222',staff='33333333-3333-3333-3333-333333333333',blocked='44444444-4444-4444-4444-444444444444',chief='55555555-5555-5555-5555-555555555555';
const setUser=async id=>db.exec(`set role authenticated;select set_config('app.test_uid','${id}',false);`);
try{
  await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create or replace function auth.uid() returns uuid language sql stable as $$select coalesce(nullif(current_setting('request.jwt.claim.sub',true),''),nullif(current_setting('app.test_uid',true),''))::uuid$$;grant usage on schema auth to authenticated;grant execute on function auth.uid() to authenticated;create table auth.users(id uuid primary key);create table public.profiles(user_id uuid primary key,role text,active boolean default true,approved boolean default true,account_access_status text default '활성');create or replace function public.my_role() returns text language sql stable security definer as $$select coalesce((select role from public.profiles where user_id=auth.uid()),'')$$;create or replace function public.employee_hub_access_allowed() returns boolean language sql stable security definer as $$select exists(select 1 from public.profiles where user_id=auth.uid() and active and approved and account_access_status='활성')$$;create table public.consultation_journals(id uuid primary key default gen_random_uuid(),patient_name text not null,contact_phone text,source_sheet text not null,consulted_on date not null,status text not null,consultation_note text not null,next_action text,author_id uuid not null default auth.uid(),created_at timestamptz default now(),updated_at timestamptz default now());`);
  const baseline=fs.readFileSync(path.join(root,'db/consultation_inbox.sql'),'utf8').replace("create extension if not exists pgcrypto with schema extensions;",()=>"create schema if not exists extensions;create or replace function extensions.digest(value text,algorithm text) returns bytea language sql immutable as $$select decode(md5(value)||md5(value),'hex')$$;");
  await db.exec(baseline);
  const migration=fs.readFileSync(path.join(root,'db/consultation_inbox_dentweb_stamp.sql'),'utf8');await db.exec(migration);await db.exec(migration);
  const firstWrite=fs.readFileSync(path.join(root,'db/consultation_inbox_dentweb_stamp_first_write_20261122.sql'),'utf8');await db.exec(firstWrite);await db.exec(firstWrite);
  await db.exec(`create or replace function public.consultation_inbox_assignee_allowed(p_user_id uuid) returns boolean language sql stable security definer as $$select false$$;
    drop policy consultation_inbox_select on public.consultation_inbox;
    create policy consultation_inbox_select on public.consultation_inbox for select to authenticated using(public.employee_hub_access_allowed());
    drop policy consultation_inbox_update on public.consultation_inbox;
    create policy consultation_inbox_update on public.consultation_inbox for update to authenticated
      using(public.employee_hub_access_allowed() and public.my_role() in ('manager','chief','owner'))
      with check(public.employee_hub_access_allowed() and public.my_role() in ('manager','chief','owner')
        and status in ('new','in_progress','recall_1','recall_2','recall_3','closed') and journal_id is null
        and (assigned_to is null or public.consultation_inbox_assignee_allowed(assigned_to)));
    grant execute on function public.consultation_inbox_assignee_allowed(uuid) to authenticated,service_role;
    create table public.app_settings(key text primary key,value text);
    insert into public.app_settings values('marketing.manager_view_enabled','true');
    create table public.dentweb_inbox_matches(inbox_id uuid primary key references public.consultation_inbox(id),appointment_found boolean not null,
      appointment_at timestamptz,visited boolean not null,visited_at timestamptz,match_basis text not null,checked_at timestamptz not null);
    create table public.dentweb_monthly_first_visits(month date not null,path text not null,first_visit_count integer not null,
      checked_at timestamptz not null,primary key(month,path));
    alter table public.dentweb_inbox_matches enable row level security;
    alter table public.dentweb_monthly_first_visits enable row level security;
    grant select on public.app_settings,public.dentweb_inbox_matches,public.dentweb_monthly_first_visits to authenticated;
    grant all on public.app_settings,public.dentweb_inbox_matches,public.dentweb_monthly_first_visits to service_role;
    create policy dentweb_matches_employee_select on public.dentweb_inbox_matches for select to authenticated using(public.employee_hub_access_allowed());
    create policy dentweb_monthly_manager_select on public.dentweb_monthly_first_visits for select to authenticated using(
      public.employee_hub_access_allowed() and (public.my_role()='owner' or (public.my_role()='manager' and
        coalesce((select value='true' from public.app_settings where key='marketing.manager_view_enabled'),true))));
    create function public.dentweb_inbox_match_upsert(p_rows jsonb) returns void language sql as $$
      insert into public.dentweb_inbox_matches(inbox_id,appointment_found,appointment_at,visited,visited_at,match_basis,checked_at)
      select inbox_id,appointment_found,appointment_at,visited,visited_at,match_basis,checked_at
      from jsonb_to_recordset(p_rows) as x(inbox_id uuid,appointment_found boolean,appointment_at timestamptz,visited boolean,
        visited_at timestamptz,match_basis text,checked_at timestamptz)
      on conflict(inbox_id) do update set appointment_found=excluded.appointment_found,appointment_at=excluded.appointment_at,
        visited=excluded.visited,visited_at=excluded.visited_at,match_basis=excluded.match_basis,checked_at=excluded.checked_at$$;
    create function public.dentweb_monthly_first_visits_replace(p_rows jsonb) returns void language sql as $$
      insert into public.dentweb_monthly_first_visits(month,path,first_visit_count,checked_at)
      select month::date,path,first_visit_count,checked_at from jsonb_to_recordset(p_rows) as x(month text,path text,first_visit_count integer,checked_at timestamptz)
      on conflict(month,path) do update set first_visit_count=excluded.first_visit_count,checked_at=excluded.checked_at$$;
    grant execute on function public.dentweb_inbox_match_upsert(jsonb),public.dentweb_monthly_first_visits_replace(jsonb) to service_role;`);
  assert.equal((await q("select count(*)::int n from pg_policies where tablename='consultation_inbox'"))[0].n,3);
  const acl=(await q("select has_column_privilege('authenticated','public.consultation_inbox','dentweb_entered_at','update') stamp_at,has_column_privilege('authenticated','public.consultation_inbox','dentweb_entered_by','update') stamp_by,has_column_privilege('authenticated','public.consultation_inbox','message','update') message_update,has_column_privilege('authenticated','public.consultation_inbox','external_event_id','update') event_update,has_column_privilege('anon','public.consultation_inbox','dentweb_entered_at','update') anon_update,has_function_privilege('anon','public.consultation_inbox_set_dentweb_entered(uuid,boolean)','execute') anon_rpc"))[0];
  assert.equal(acl.stamp_at,true);assert.equal(acl.stamp_by,true);assert.equal(acl.message_update,false);assert.equal(acl.event_update,false);assert.equal(acl.anon_update,false);assert.equal(acl.anon_rpc,false);
  await db.exec("set role service_role;select set_config('app.test_uid','11111111-1111-1111-1111-111111111111',false);select set_config('request.jwt.claim.role','service_role',false);");
  const booking=(await q("select * from public.consultation_inbox_ingest_service('kakao','kbook-synthetic',now(),null,null,'합성예약','신규예약 신청')"))[0];const generic=(await q("select * from public.consultation_inbox_ingest_service('kakao','kakao-synthetic',now(),null,null,'일반문의','안녕하세요')"))[0];
  await db.exec('reset role;');await q(`insert into auth.users values ('${owner}'),('${manager}'),('${staff}'),('${blocked}'),('${chief}')`);await q(`insert into public.profiles values ('${owner}','owner',true,true,'활성'),('${manager}','manager',true,true,'활성'),('${staff}','staff',true,true,'활성'),('${blocked}','manager',true,true,'차단'),('${chief}','chief',true,true,'활성')`);
  await setUser(staff);assert.equal((await q('select * from public.consultation_inbox')).length,2);await assert.rejects(q(`select * from public.consultation_inbox_set_dentweb_entered('${booking.id}'::uuid,true)`),/not editable|row-level security/);await db.exec('rollback');
  await setUser(blocked);assert.equal((await q('select * from public.consultation_inbox')).length,0);await assert.rejects(q(`select * from public.consultation_inbox_set_dentweb_entered('${booking.id}'::uuid,true)`),/active employee hub access required|not editable|row-level security/);await db.exec('rollback');
  await setUser(chief);assert.equal((await q('select * from public.consultation_inbox')).length,2);const chiefStamp=(await q(`select * from public.consultation_inbox_set_dentweb_entered('${booking.id}'::uuid,true)`))[0];assert.equal(chiefStamp.dentweb_entered_by,chief,'chief can write the same editable reservation as a manager');assert.ok(chiefStamp.dentweb_entered_at);await db.exec('reset role;');await q(`update public.consultation_inbox set dentweb_entered_at=null,dentweb_entered_by=null where id='${booking.id}'`);
  await setUser(manager);const stamp=(await q(`select * from public.consultation_inbox_set_dentweb_entered('${booking.id}'::uuid,true)`))[0];assert.equal(stamp.dentweb_entered_by,manager);assert.ok(stamp.dentweb_entered_at);
  await setUser(owner);const repeated=(await q(`select * from public.consultation_inbox_set_dentweb_entered('${booking.id}'::uuid,true)`))[0];assert.equal(repeated.dentweb_entered_by,manager);assert.equal(new Date(repeated.dentweb_entered_at).getTime(),new Date(stamp.dentweb_entered_at).getTime(),'repeat set preserves first actor and timestamp');
  const observedTime=new Date(stamp.dentweb_entered_at).toISOString(),staleTime=new Date(new Date(stamp.dentweb_entered_at).getTime()+1000).toISOString();assert.deepEqual(await q(`update public.consultation_inbox set dentweb_entered_at=null,dentweb_entered_by=null where id='${booking.id}' and dentweb_entered_at='${staleTime}'::timestamptz and dentweb_entered_by='${manager}' returning id`),[],'stale timestamp cannot undo');
  assert.deepEqual(await q(`update public.consultation_inbox set dentweb_entered_at=null,dentweb_entered_by=null where id='${booking.id}' and dentweb_entered_at='${observedTime}'::timestamptz and dentweb_entered_by='${owner}' returning id`),[],'stale actor cannot undo');
  assert.deepEqual(await q(`update public.consultation_inbox set dentweb_entered_at=null,dentweb_entered_by=null where id='${booking.id}' and dentweb_entered_at='${observedTime}'::timestamptz and dentweb_entered_by='${manager}' returning id`),[{id:booking.id}],'matching observed values retain direct clear permission');
  await setUser(manager);const restamped=(await q(`select * from public.consultation_inbox_set_dentweb_entered('${booking.id}'::uuid,true)`))[0];assert.equal(restamped.dentweb_entered_by,manager);
  const privateResumePath=path.join(root,'server-merge-staging/ops-resume.json');
  if(fs.existsSync(privateResumePath)){
    const resume=JSON.parse(fs.readFileSync(privateResumePath,'utf8'));
    assert.equal(typeof resume.roleSmokeSql,'string','private roleSmoke SQL exists when the resume fixture is present');
    await db.exec(resume.roleSmokeSql);
    const restoredBySmoke=(await q(`select dentweb_entered_at,dentweb_entered_by from public.consultation_inbox where id='${booking.id}'`))[0];
    assert.equal(restoredBySmoke.dentweb_entered_by,manager,'transaction-only roleSmoke runs and rolls back against the synthetic roles/schema');
    console.log('PGLITE_PRIVATE_ROLESMOKE_PASS');
  }else{
    console.log('PGLITE_PRIVATE_ROLESMOKE_SKIP: private ops-resume.json absent from public checkout');
  }
  const firstWriteRollback=fs.readFileSync(path.join(root,'db/consultation_inbox_dentweb_stamp_first_write_20261122_rollback.sql'),'utf8');await db.exec('reset role;');await db.exec(firstWriteRollback);
  const afterEnhancementRollback=(await q(`select dentweb_entered_at,dentweb_entered_by from public.consultation_inbox where id='${booking.id}'`))[0];assert.equal(afterEnhancementRollback.dentweb_entered_by,restamped.dentweb_entered_by);assert.equal(new Date(afterEnhancementRollback.dentweb_entered_at).getTime(),new Date(restamped.dentweb_entered_at).getTime(),'function rollback preserves existing stamp data');
  await db.exec(firstWrite);
  const finalAcl=(await q("select prosecdef from pg_proc where oid='public.consultation_inbox_set_dentweb_entered(uuid,boolean)'::regprocedure"))[0];assert.equal(finalAcl.prosecdef,false,'function remains SECURITY INVOKER');
  const persisted=(await q(`select dentweb_entered_at,dentweb_entered_by from public.consultation_inbox where id='${booking.id}'`))[0];assert.equal(persisted.dentweb_entered_by,manager);assert.equal(new Date(persisted.dentweb_entered_at).getTime(),new Date(restamped.dentweb_entered_at).getTime());
  await setUser(manager);
  await assert.rejects(q(`update public.consultation_inbox set message='변조' where id='${booking.id}'`),/permission denied/);await db.exec('rollback');await setUser(manager);
  await assert.rejects(q(`update public.consultation_inbox set dentweb_entered_at=now(),dentweb_entered_by='${manager}' where id='${generic.id}'`),/kakao booking only/);await db.exec('rollback');await setUser(manager);
  const genericStatus=(await q(`update public.consultation_inbox set status='in_progress' where id='${generic.id}' returning status`))[0];assert.equal(genericStatus.status,'in_progress');await db.exec('rollback');await setUser(manager);
  await assert.rejects(q(`select * from public.consultation_inbox_set_dentweb_entered('${generic.id}'::uuid,true)`),/not found or not editable/);await db.exec('rollback');await setUser(manager);
  const rollback=fs.readFileSync(path.join(root,'db/consultation_inbox_dentweb_stamp_rollback.sql'),'utf8');await db.exec('reset role;');await assert.rejects(db.exec(rollback),/contains data/);await db.exec('rollback');
  await setUser(manager);await q(`select * from public.consultation_inbox_set_dentweb_entered('${booking.id}'::uuid,false)`);await db.exec('reset role;');await db.exec(rollback);
  assert.equal((await q("select count(*)::int n from information_schema.columns where table_schema='public' and table_name='consultation_inbox' and column_name in('dentweb_entered_at','dentweb_entered_by')"))[0].n,0);assert.equal((await q("select to_regprocedure('public.consultation_inbox_set_dentweb_entered(uuid,boolean)') is null gone"))[0].gone,true);
  console.log('PGLITE_CONSULTATION_INBOX_DENTWEB_STAMP_PASS: roles/column grants/RLS/server actor+time/rollback protects recorded data');
}finally{await db.close();}
