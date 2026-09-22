import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';

const packageRoot=process.env.PGLITE_PACKAGE_ROOT;
if(!packageRoot)throw new Error('PGLITE_PACKAGE_ROOT is required');
const {PGlite}=await import(pathToFileURL(path.join(packageRoot,'dist/index.js')).href);
const db=new PGlite(),q=sql=>db.query(sql).then(x=>x.rows);
const owner='11111111-1111-1111-1111-111111111111',staff='22222222-2222-2222-2222-222222222222';

try{
  await db.exec(`
    create role authenticated;
    create schema auth;
    create or replace function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('app.test_uid',true),'')::uuid$$;
    create table public.profiles(user_id uuid primary key,role text);
    create or replace function public.my_role() returns text language sql stable as $$select coalesce((select role from public.profiles where user_id=auth.uid()),'')$$;
  `+fs.readFileSync('db/hr_settings.sql','utf8'));
  await q("insert into public.app_settings(key,value,label,updated_at) values ('absence_confirm_after_minutes','0','기존 기본값','2001-02-03T04:05:06Z')");
  const preexisting=await q("select value,label,updated_at::text from public.app_settings where key='absence_confirm_after_minutes'");
  await db.exec(fs.readFileSync('db/absence_candidate_settings.sql','utf8'));
  assert.deepEqual(await q("select key,value from public.app_settings where key like 'absence_%' order by key"),[
    {key:'absence_confirm_after_minutes',value:'0'},
    {key:'absence_exclude_pending_manual',value:'true'}
  ]);
  assert.deepEqual(await q("select value,label,updated_at::text from public.app_settings where key='absence_confirm_after_minutes'"),preexisting,'migration must preserve preexisting default row and timestamp');
  assert.deepEqual(await q("select key,existed_before from public.absence_candidate_settings_migration_state order by key"),[
    {key:'absence_confirm_after_minutes',existed_before:true},
    {key:'absence_exclude_pending_manual',existed_before:false}
  ]);
  assert.equal((await q("select count(*)::int n from pg_policies where tablename='app_settings' and policyname='app_settings_update_owner'"))[0].n,1);

  await db.exec(`
    insert into public.profiles values ('${owner}','owner'),('${staff}','staff');
    grant usage on schema public,auth to authenticated;
    grant select on public.profiles to authenticated;
    grant select,insert,update on public.app_settings to authenticated;
    set role authenticated;
    select set_config('app.test_uid','${staff}',false);
  `);
  await q("update public.app_settings set value='12' where key='absence_confirm_after_minutes'");
  await db.exec('reset role;');
  assert.equal((await q("select value from public.app_settings where key='absence_confirm_after_minutes'"))[0].value,'0','staff update must be filtered by existing owner RLS');
  await db.exec(`set role authenticated;select set_config('app.test_uid','${owner}',false);`);
  await q("update public.app_settings set value='12' where key='absence_confirm_after_minutes'");
  await db.exec('reset role;');

  await assert.rejects(db.exec(fs.readFileSync('db/absence_candidate_settings_rollback.sql','utf8')),/changed after migration/);
  await db.exec('rollback');
  assert.equal((await q("select value from public.app_settings where key='absence_confirm_after_minutes'"))[0].value,'12');
  await q("update public.app_settings set value='0' where key='absence_confirm_after_minutes'");
  await db.exec(fs.readFileSync('db/absence_candidate_settings_rollback.sql','utf8'));
  assert.deepEqual(await q("select value,label,updated_at::text from public.app_settings where key='absence_confirm_after_minutes'"),preexisting,'rollback must retain the migration-preexisting row untouched');
  assert.equal((await q("select count(*)::int n from public.app_settings where key='absence_exclude_pending_manual'"))[0].n,0,'rollback must remove only the migration-inserted row');
  assert.equal((await q("select to_regclass('public.absence_candidate_settings_migration_state') state"))[0].state,null,'successful rollback must remove the private marker');

  await q("insert into public.app_settings(key,value,label) values ('absence_exclude_pending_manual','false','기존 사용자값')");
  await db.exec(fs.readFileSync('db/absence_candidate_settings.sql','utf8'));
  await assert.rejects(db.exec(fs.readFileSync('db/absence_candidate_settings_rollback.sql','utf8')),/changed after migration/);
  await db.exec('rollback');
  assert.equal((await q("select value from public.app_settings where key='absence_exclude_pending_manual'"))[0].value,'false','custom preexisting value must survive fail-closed rollback');
  console.log('PGLITE_ABSENCE_CANDIDATE_SETTINGS_PASS: seed, owner-only RLS, preexisting preservation, inserted-only rollback, user-value stop');
}finally{await db.close();}
