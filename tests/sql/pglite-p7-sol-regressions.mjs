import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
const {PGlite}=await import(pathToFileURL(path.join(process.env.PGLITE_PACKAGE_ROOT,'dist/index.js')).href);
const read=n=>fs.readFileSync('db/'+n,'utf8');
const uid='11111111-1111-1111-1111-111111111111';
async function fixture(fn){const db=new PGlite();try{await fn(db);}finally{await db.close();}}
const rosterSetup=`create role anon;create role authenticated;
  alter default privileges in schema public grant all on tables to authenticated;
  create table profiles(user_id uuid primary key,name text,dept text,job_group text,active boolean,employment_status text);
  create table schedule_people(id uuid primary key,profile_user_id uuid,name text,department text,job_group text,active boolean);
  insert into profiles values('${uid}','김지윤','진료실',null,true,'재직');
  insert into schedule_people values('${uid}',null,'김지윤','진료실',null,false),
  ('22222222-2222-2222-2222-222222222222','${uid}','김지윤','진료실',null,false);`;
test('RED1 inactive linked and fallback roster stays blank and absent from report',()=>fixture(async db=>{
  await db.exec(rosterSetup);await db.exec(read('p7_job_group_backfill_20261003.sql'));
  assert.deepEqual((await db.query('select job_group from schedule_people')).rows,[{job_group:null},{job_group:null}]);
  const report=await db.query(read('p7_job_group_backfill_20261003.sql').split('-- 아래 두 조회')[1].split('WITH confirmed')[1].split('COMMIT;')[0].replace(/^/,'WITH confirmed'));
  assert.ok(report.rows.every(r=>!r.id),'inactive rows omitted from final missing-group report');
}));
test('RED2 backup cannot be read or tampered with despite default API grants',()=>fixture(async db=>{
  await db.exec(rosterSetup);await db.exec(read('p7_job_group_backfill_20261003.sql'));
  assert.equal((await db.query("select relrowsecurity from pg_class where oid='p7_job_group_backup_20261003'::regclass")).rows[0].relrowsecurity,true);
  await db.exec('set role authenticated');
  await assert.rejects(db.query('select * from p7_job_group_backup_20261003'),/permission denied/);
  await assert.rejects(db.query("update p7_job_group_backup_20261003 set old_job_group='desk'"),/permission denied/);
}));
test('RED3 pending fields do not fill profile; employee cannot forge frozen job; signing uses sent job',()=>fixture(async db=>{
  await db.exec(`create role anon;create role authenticated;create schema auth;
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('test.uid',true),'')::uuid$$;
    create function my_role() returns text language sql stable as $$select current_setting('test.actor',true)$$;
    create table profiles(user_id uuid primary key,name text,dept text,job_group text);
    create table schedule_people(profile_user_id uuid,department text);
    create table hub_ui_texts(key text,value text);
    create table contracts(id bigint primary key,user_id uuid,status text,fields jsonb);
    insert into profiles values('${uid}','서명직원','진료실',null);
    alter table contracts enable row level security;
    create policy contracts_select on contracts for select to authenticated using(user_id=auth.uid() or my_role()='owner');
    grant usage on schema auth to authenticated;grant select,insert,update on contracts to authenticated;grant select on profiles to authenticated;`);
  const policy=read('hr_policies.sql');
  await db.exec(policy.slice(policy.indexOf('drop policy if exists contracts_insert_owner'),policy.indexOf('-- approval_docs',policy.indexOf('drop policy if exists contracts_insert_owner'))));
  await db.exec(read('p7_contract_job_group_20261003.sql'));
  await db.exec(`set role authenticated;select set_config('test.uid','${uid}',false);select set_config('test.actor','owner',false);
    insert into contracts(id,user_id,status,fields) values(1,'${uid}','대기','{"job_group":"desk"}');
    select set_config('test.actor','staff',false);update contracts set fields='{"job_group":"lab"}' where id=1;`);
  assert.equal((await db.query('select job_group from profiles')).rows[0].job_group,null,'pending employee fields never propagate');
  await assert.rejects(db.query("update contracts set sent_job_group='lab' where id=1"),/frozen contract job group/);
  await db.exec("update contracts set status='서명완료' where id=1");
  assert.equal((await db.query('select job_group from profiles')).rows[0].job_group,'desk','signed value is original trusted send value');
}));
test('RED5 approval migration and rollback rerun; foreign definition preserved',()=>fixture(async db=>{
  const up=read('p7_approval_atomic_20261003.sql'),down=read('p7_approval_atomic_20261003_rollback.sql');
  await db.exec(up);await db.exec(up);await db.exec(down);await db.exec(down);
  await db.exec('create function submit_approval_document(text,text,text) returns bigint language sql as $$select 42::bigint$$');
  await assert.rejects(db.exec(up),/P7 approval function conflict/);await db.exec('rollback');
  assert.equal((await db.query("select submit_approval_document('a','b','c') v")).rows[0].v,42);
}));
test('RED6 onboarding migration and rollback rerun; foreign function and trigger preserved',()=>fixture(async db=>{
  const up=read('p7_onboarding_evidence_gate_20261003.sql'),down=read('p7_onboarding_evidence_gate_20261003_rollback.sql');
  await db.exec('create table onboarding_checks(status text,item_id bigint,user_id uuid)');
  await db.exec(up);await db.exec(up);await db.exec(down);await db.exec(down);
  await db.exec('create function p7_require_onboarding_evidence() returns trigger language plpgsql as $$begin return new;end$$');
  await assert.rejects(db.exec(up),/P7 onboarding function conflict/);await db.exec('rollback');
  await db.exec('drop function p7_require_onboarding_evidence()');await db.exec(up);
  await db.exec('create function foreign_gate() returns trigger language plpgsql as $$begin return new;end$$;drop trigger p7_onboarding_evidence_gate on onboarding_checks;create trigger p7_onboarding_evidence_gate before insert on onboarding_checks for each row execute function foreign_gate()');
  await assert.rejects(db.exec(up),/P7 onboarding trigger conflict/);await db.exec('rollback');
  assert.equal((await db.query("select tgfoid='foreign_gate()'::regprocedure same from pg_trigger where tgname='p7_onboarding_evidence_gate'")).rows[0].same,true);
}));
