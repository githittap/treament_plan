import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';

const pkg=process.env.PGLITE_PACKAGE_ROOT;
if(!pkg)throw new Error('PGLITE_PACKAGE_ROOT required');
const {PGlite}=await import(pathToFileURL(path.join(pkg,'dist/index.js')).href);
const db=new PGlite(),root=process.cwd(),q=sql=>db.query(sql).then(result=>result.rows);
const ids={manager:'10000000-0000-4000-8000-000000000001',chief:'10000000-0000-4000-8000-000000000002',owner:'10000000-0000-4000-8000-000000000003',staff:'10000000-0000-4000-8000-000000000004',deputy:'10000000-0000-4000-8000-000000000005'};
const as=async role=>{await db.exec('reset role');await db.exec(`select set_config('app.test_uid','${ids[role]||''}',false);`);await db.exec(`set role ${role==='anon'?'anon':'authenticated'}`);};
const reset=async()=>db.exec('reset role');
const reject=async(sql,pattern)=>{await assert.rejects(q(sql),pattern);await db.exec('rollback');};
try{
  await db.exec(`create role anon;create role authenticated;create schema auth;
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('app.test_uid',true),'')::uuid$$;
    grant usage on schema auth to authenticated;grant execute on function auth.uid() to authenticated;
    create table auth.users(id uuid primary key);
    create table public.profiles(user_id uuid primary key,role text,active boolean not null default true,approved boolean not null default true,account_access_status text not null default '활성');
    create function public.my_role() returns text language sql stable security definer set search_path='' as $$select p.role from public.profiles p where p.user_id=auth.uid()$$;
    grant select on public.profiles to authenticated;grant execute on function public.my_role() to authenticated;`);
  for(const [role,id] of Object.entries(ids))await db.exec(`insert into auth.users values ('${id}');insert into public.profiles(user_id,role) values ('${id}','${role}');`);
  await db.exec(fs.readFileSync(path.join(root,'db/consultation_journal_draft.sql'),'utf8'));
  const access=fs.readFileSync(path.join(root,'db/consultation_access_widen.sql'),'utf8');
  await db.exec(access.slice(access.indexOf('drop policy if exists consultation_journals_select'),access.indexOf('-- ── 4) 담당자 지정 대상')));
  await db.exec(`insert into public.consultation_journals(patient_name,source_sheet,consultation_note,author_id) values ('기존 상담','원본','보존','${ids.owner}');`);
  await db.exec(fs.readFileSync(path.join(root,'db/consultation_action_followup_draft.sql'),'utf8'));
  const old=(await q("select patient_name,action_assignee_id,action_due_on,action_done from public.consultation_journals where patient_name='기존 상담'"))[0];
  assert.equal(old.action_assignee_id,null);assert.equal(old.action_due_on,null);assert.equal(old.action_done,false);

  for(const role of ['manager','chief','owner']){
    await as(role);
    await q(`insert into public.consultation_journals(patient_name,source_sheet,consultation_note,next_action,action_assignee_id,action_due_on) values ('${role} 상담','원본','기록','전화','${ids.chief}','2026-09-25')`);
    assert.equal((await q(`select count(*)::int n from public.consultation_journals where patient_name='${role} 상담'`))[0].n,1);
  }
  await reset();
  for(const role of ['staff','deputy']){
    await as(role);
    assert.equal((await q('select count(*)::int n from public.consultation_journals'))[0].n,0,`${role} cannot read PHI queue`);
    await reject(`insert into public.consultation_journals(patient_name,source_sheet,consultation_note,next_action) values ('거부','원본','기록','전화')`,/row-level security policy/);
    await as(role);
    assert.equal((await q("update public.consultation_journals set next_action='변조' where patient_name='owner 상담' returning id")).length,0);
  }
  await as('anon');
  await reject('select * from public.consultation_journals',/permission denied/);
  await reset();

  await as('owner');
  await reject(`insert into public.consultation_journals(patient_name,source_sheet,consultation_note,next_action,action_assignee_id) values ('가짜 담당','원본','기록','전화','${ids.staff}')`,/active administrator/);
  await as('owner');
  await reject(`insert into public.consultation_journals(patient_name,source_sheet,consultation_note,action_due_on) values ('조치 누락','원본','기록','2026-09-25')`,/consultation_action_requires_text/);
  await as('owner');
  assert.equal((await q("select count(*)::int n from public.consultation_journals where action_done=false and action_due_on<='2026-09-25'"))[0].n,3);
  await q("update public.consultation_journals set action_done=true where patient_name='chief 상담'");
  assert.equal((await q("select count(*)::int n from public.consultation_journals where action_done=false and action_due_on<='2026-09-25'"))[0].n,2);
  await reset();

  await assert.rejects(db.exec(fs.readFileSync(path.join(root,'db/consultation_action_followup_rollback.sql'),'utf8')),/follow-up data exists/);
  await db.exec('rollback');
  assert.equal((await q("select count(*)::int n from information_schema.columns where table_name='consultation_journals' and column_name='action_due_on'"))[0].n,1);
  await db.exec('update public.consultation_journals set action_assignee_id=null,action_due_on=null,action_done=false');
  await db.exec(fs.readFileSync(path.join(root,'db/consultation_action_followup_rollback.sql'),'utf8'));
  assert.equal((await q("select count(*)::int n from information_schema.columns where table_name='consultation_journals' and column_name='action_due_on'"))[0].n,0);
  assert.equal((await q('select count(*)::int n from public.consultation_journals'))[0].n,4);
  console.log('PGLITE_CONSULTATION_ACTION_FOLLOWUP_PASS');
}finally{await db.close();}
