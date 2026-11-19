import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';

const {PGlite}=await import(pathToFileURL(path.join(process.env.PGLITE_PACKAGE_ROOT,'dist/index.js')).href);
const db=new PGlite(),q=sql=>db.query(sql).then(r=>r.rows);
const id=n=>`00000000-0000-0000-0000-${String(n).padStart(12,'0')}`;
const actor=async n=>{await q('reset role');await q('set role authenticated');await q(`select set_config('app.test_uid','${n==null?'':id(n)}',false)`);};
const table='leave_year_earned_override';
const set=(n,days=2.5,year=2026,note='NULL')=>q(`select * from set_leave_year_earned('${id(n)}',${year},${days},${note})`);
const clear=(n,year=2026)=>q(`select clear_leave_year_earned('${id(n)}',${year})`);
const rows=()=>q(`select user_id,year,earned_days::text,updated_by,updated_by_name,note from ${table} order by user_id,year`);
try{
  await db.exec(`create role anon;create role authenticated;create role service_role;
    alter default privileges grant all on tables to anon,authenticated,service_role;
    alter default privileges grant execute on functions to anon,authenticated,service_role;
    create schema auth;
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('app.test_uid',true),'')::uuid$$;
    grant usage on schema auth to authenticated;
    create table profiles(user_id uuid primary key,name text,role text,active boolean default true,approved boolean default true,account_access_status text default '활성');
    create table app_settings(key text primary key,value text,label text);
    create table leave_ledger(user_id uuid,kind text,days numeric);
    create view v_leave_balance as select user_id,sum(case when kind='사용' then -days else days end) balance from leave_ledger group by user_id;
    insert into profiles(user_id,name,role,active,approved,account_access_status) values
      ('${id(1)}','원장','owner',true,true,'활성'),('${id(2)}','매니저','manager',true,true,'활성'),
      ('${id(3)}','직원','staff',true,true,'활성'),('${id(4)}','실장','chief',true,true,'활성'),
      ('${id(5)}','부원장','deputy',true,true,'활성'),('${id(6)}','비활성 원장','owner',false,true,'활성'),
      ('${id(7)}','미승인 매니저','manager',true,false,'활성'),('${id(8)}','차단 원장','owner',true,true,'차단');
    insert into leave_ledger values ('${id(3)}','부여',10),('${id(3)}','사용',2),('${id(3)}','조정',3);`);
  const gate=fs.readFileSync('db/employment_status_access_block.sql','utf8');
  await db.exec(gate.slice(gate.indexOf('create or replace function public.employee_hub_access_allowed()'),gate.indexOf('-- 명시한 직원 허브')));
  const manager=fs.readFileSync('db/leave_manager_access.sql','utf8');
  await db.exec(manager.slice(manager.indexOf('insert into public.app_settings'),manager.indexOf('create or replace function public.leave_manager_can_approve()')));
  await db.exec(fs.readFileSync('db/leave_year_earned_override.sql','utf8'));

  const ledger=await q('select * from leave_ledger order by kind');
  const balance=await q('select balance::text from v_leave_balance');
  await actor(1);
  assert.deepEqual(await set(3,0,2026,"' 원장 메모 '"),[{earned_days:'0',updated_by_name:'원장'}]);
  await set(3,4.5,2025);await set(2,1.5);await set(5,1);
  assert.deepEqual((await rows()).map(r=>[r.user_id,r.year,r.earned_days,r.updated_by,r.note]),
    [[id(2),2026,'1.5',id(1),null],[id(3),2025,'4.5',id(1),null],[id(3),2026,'0',id(1),'원장 메모'],[id(5),2026,'1',id(1),null]]);
  for(const days of ['null','-0.5','0.25',"'NaN'","'Infinity'","'-Infinity'"]){
    await assert.rejects(set(3,days),/invalid earned days/);
  }
  for(const year of ['null',0,10000]){
    await assert.rejects(set(3,2,year),/invalid year/);
    await assert.rejects(clear(3,year),/invalid year/);
  }
  await assert.rejects(set(99),/profile not found/);
  await assert.rejects(clear(99),/profile not found/);

  await actor(2);
  assert.equal((await rows()).length,4);
  assert.deepEqual(await set(3,12.5,2026,"'매니저 메모'"),[{earned_days:'12.5',updated_by_name:'매니저'}]);
  assert.equal((await rows()).find(r=>r.user_id===id(3)&&r.year===2026).updated_by,id(2));
  await assert.rejects(set(2),/own leave/);
  await assert.rejects(clear(2),/own leave/);
  await clear(3);await clear(3);
  assert.deepEqual((await rows()).filter(r=>r.user_id===id(3)).map(r=>r.year),[2025]);
  const automatic=await q(`select coalesce((select earned_days from ${table} where user_id='${id(3)}' and year=2026),
    (select sum(days) from leave_ledger where user_id='${id(3)}' and kind='부여'))::text as days`);
  assert.equal(automatic[0].days,'10');

  for(const [n,visible] of [[3,1],[4,3],[5,0],[6,0],[7,0],[8,0],[null,0]]){
    await actor(n);
    assert.equal((await rows()).length,visible);
    await assert.rejects(set(3),/not allowed/);
    await assert.rejects(clear(3),/not allowed/);
  }
  await q('reset role');
  await q("update app_settings set value='false' where key='leave.manager_access_enabled'");
  await actor(2);
  assert.deepEqual((await rows()).map(r=>r.user_id),[id(2)]);
  await assert.rejects(set(3),/not allowed/);
  await assert.rejects(clear(3),/not allowed/);
  for(const role of ['authenticated','anon','service_role']){
    await q('reset role');await q(`set role ${role}`);
    for(const sql of [`insert into ${table}(user_id,year,earned_days) values ('${id(3)}',2026,8)`,
      `update ${table} set earned_days=8`,`delete from ${table}`,`truncate ${table}`]){
      await assert.rejects(q(sql),/permission denied/);
    }
    if(role!=='authenticated'){
      await assert.rejects(set(3),/permission denied/);await assert.rejects(clear(3),/permission denied/);
    }
  }

  await q('reset role');
  assert.deepEqual(await q('select * from leave_ledger order by kind'),ledger);
  assert.deepEqual(await q('select balance::text from v_leave_balance'),balance);
  await q(`delete from profiles where user_id='${id(5)}'`);
  assert.equal((await rows()).some(r=>r.user_id===id(5)),false);
  await db.exec(fs.readFileSync('db/leave_year_earned_override_rollback.sql','utf8'));
  assert.deepEqual(await q(`select to_regclass('public.${table}') as tbl,to_regprocedure('public.set_leave_year_earned(uuid,integer,numeric,text)') as setter,
    to_regprocedure('public.clear_leave_year_earned(uuid,integer)') as clearer`),[{tbl:null,setter:null,clearer:null}]);
  assert.deepEqual(await q('select * from leave_ledger order by kind'),ledger);
  assert.deepEqual(await q('select balance::text from v_leave_balance'),balance);
  console.log('LEAVE_YEAR_EARNED_OVERRIDE_PASS');
}finally{await db.close();}
