import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const root=process.env.PGLITE_PACKAGE_ROOT;
if(!root)throw Error('PGLITE_PACKAGE_ROOT is required');
const {PGlite}=await import(pathToFileURL(path.join(root,'dist/index.js')).href);
const db=new PGlite();
const q=async sql=>(await db.query(sql)).rows;
try {
  await db.exec(`create role anon;create role authenticated;create role service_role;create schema auth;
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('app.test_uid',true),'')::uuid$$;
    create table public.profiles(user_id uuid primary key,active boolean,approved boolean,account_access_status text);
    create function gen_random_uuid() returns uuid language sql as $$select 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid$$;`);
  await db.exec(fs.readFileSync('db/push_subscriptions_draft.sql','utf8'));
  await db.exec(`create table public.app_settings(key text primary key,value text);
    alter table public.app_settings enable row level security;
    create policy app_settings_select_all on public.app_settings for select to authenticated using(true);
    grant select on public.app_settings to authenticated;
    create function public.employee_hub_access_allowed() returns boolean language sql stable security definer set search_path='' as $$select exists(select 1 from public.profiles p where p.user_id=auth.uid() and p.active and p.approved and p.account_access_status='활성')$$;
    grant execute on function public.employee_hub_access_allowed() to authenticated;
    insert into public.profiles values ('11111111-1111-1111-1111-111111111111',true,true,'활성'),('22222222-2222-2222-2222-222222222222',false,false,'차단');
    insert into public.app_settings values ('late_cut','09:40');`);
  await db.exec(fs.readFileSync('db/employee_hub_security_j2_draft.sql','utf8'));
  assert.equal((await q("select count(*)::int n from pg_policies where schemaname='public' and tablename='app_settings' and policyname='employee_hub_access_gate' and permissive='RESTRICTIVE'"))[0].n,1);
  for(const table of ['push_subscriptions_migration_marker','push_subscriptions_semantic_fixture']){
    assert.equal((await q(`select relrowsecurity from pg_class where oid='employee_hub_private.${table}'::regclass`))[0].relrowsecurity,true);
    assert.equal((await q(`select has_table_privilege('authenticated','employee_hub_private.${table}','select') allowed`))[0].allowed,false);
  }
  await q('set role authenticated');
  await q("select set_config('app.test_uid','11111111-1111-1111-1111-111111111111',false)");
  assert.equal((await q('select count(*)::int n from public.app_settings'))[0].n,1);
  await q("select set_config('app.test_uid','22222222-2222-2222-2222-222222222222',false)");
  assert.equal((await q('select count(*)::int n from public.app_settings'))[0].n,0);
  await q('reset role');
  const snapshot=(await q("select md5((s->'canonical')::text) md5 from (select employee_hub_private.push_subscription_schema_snapshot() s) x"))[0];
  assert.equal(snapshot.md5,'4cf7a7a6b9350437dc46335126d1bce9');
  assert.equal((await q("select semantic_md5=md5(canonical::text) valid from employee_hub_private.push_subscriptions_semantic_fixture"))[0].valid,true);
  await db.exec(fs.readFileSync('db/employee_hub_security_j2_s4_rollback.sql','utf8'));
  assert.equal((await q("select md5((s->'canonical')::text) md5 from (select employee_hub_private.push_subscription_schema_snapshot() s) x"))[0].md5,'4f7a3ffc459b04e0a3c87ea8dfda8c28');
  console.log('PGLITE_EMPLOYEE_HUB_SECURITY_J2_PASS: gate, markers, catalog, S4 rollback');
} finally { await db.close(); }
