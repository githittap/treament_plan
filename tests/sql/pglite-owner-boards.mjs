import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';

const root=process.cwd(),pkg=process.env.PGLITE_PACKAGE_ROOT;
if(!pkg)throw new Error('PGLITE_PACKAGE_ROOT required');
const {PGlite}=await import(pathToFileURL(path.join(pkg,'dist/index.js')).href),db=new PGlite(),q=s=>db.query(s).then(x=>x.rows);
const owner='11111111-1111-1111-1111-111111111111',staff='33333333-3333-3333-3333-333333333333',blocked='44444444-4444-4444-4444-444444444444';
const setUser=async id=>db.exec(`set role authenticated;select set_config('app.test_uid','${id}',false);`);
try{
  await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create or replace function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('app.test_uid',true),'')::uuid$$;grant usage on schema auth to anon,authenticated,service_role;grant execute on function auth.uid() to anon,authenticated,service_role;
    create table public.profiles(user_id uuid primary key,role text,active boolean default true,approved boolean default true,account_access_status text default '활성');
    create or replace function public.employee_hub_access_allowed() returns boolean language sql stable security definer set search_path='' as $$select exists(select 1 from public.profiles p where p.user_id=auth.uid() and p.active and p.approved and p.account_access_status='활성')$$;
    create or replace function public.my_role() returns text language sql stable security definer set search_path='' as $$select case when public.employee_hub_access_allowed() then coalesce((select p.role from public.profiles p where p.user_id=auth.uid()),'staff') else 'pending' end$$;
    insert into public.profiles values('${owner}','owner',true,true,'활성'),('${staff}','staff',true,true,'활성'),('${blocked}','owner',true,true,'차단');`);
  const migration=fs.readFileSync(path.join(root,'db/owner_boards.sql'),'utf8');
  await db.exec(migration);await db.exec(migration);
  const shape=(await q("select c.relrowsecurity rls,(select count(*)::int from pg_policy p where p.polrelid=c.oid) policies,(select string_agg(p.polcmd::text,',') from pg_policy p where p.polrelid=c.oid) cmds from pg_class c where c.oid='public.owner_boards'::regclass"))[0];
  assert.deepEqual({...shape},{rls:true,policies:1,cmds:'r'});
  const acl=(await q("select has_table_privilege('anon','public.owner_boards','select') anon_select,has_table_privilege('authenticated','public.owner_boards','select') auth_select,has_table_privilege('authenticated','public.owner_boards','insert') auth_insert,has_table_privilege('authenticated','public.owner_boards','update') auth_update,has_table_privilege('authenticated','public.owner_boards','delete') auth_delete,has_function_privilege('anon','public.owner_board_put(text,text,text,timestamp with time zone)','execute') anon_rpc,has_function_privilege('authenticated','public.owner_board_put(text,text,text,timestamp with time zone)','execute') auth_rpc,has_function_privilege('service_role','public.owner_board_put(text,text,text,timestamp with time zone)','execute') svc_rpc,(select prosecdef from pg_proc where oid='public.owner_board_put(text,text,text,timestamp with time zone)'::regprocedure) secdef,(select proconfig::text from pg_proc where oid='public.owner_board_put(text,text,text,timestamp with time zone)'::regprocedure) config"))[0];
  assert.deepEqual({...acl},{anon_select:false,auth_select:true,auth_insert:false,auth_update:false,auth_delete:false,anon_rpc:false,auth_rpc:false,svc_rpc:true,secdef:false,config:'{"search_path=\\"\\""}'});
  await db.exec('set role service_role;');
  const html='<!doctype html><html>ok</html>',hash='a'.repeat(64);
  await q(`select public.owner_board_put('busd_ledger','${html}','${hash}',null)`);
  await q(`select public.owner_board_put('busd_ledger','<html>new</html>','${'b'.repeat(64)}',null)`);
  assert.equal((await q('select count(*)::int n from public.owner_boards'))[0].n,1,'같은 slug는 한 행을 덮어써야 합니다.');
  assert.equal((await q("select html from public.owner_boards where slug='busd_ledger'"))[0].html,'<html>new</html>');
  for(const [label,sql] of [
    ['모르는 slug',`select public.owner_board_put('other','<html>x</html>','${hash}',null)`],
    ['4MB 초과',`select public.owner_board_put('pin_board','<html>${'x'.repeat(4194304)}</html>','${hash}',null)`],
    ['빈 html',`select public.owner_board_put('pin_board','','${hash}',null)`],
    ['잘못된 sha256',"select public.owner_board_put('pin_board','<html>x</html>','BAD',null)"]
  ]){await assert.rejects(q(sql),undefined,label);await db.exec('rollback');}
  await db.exec('reset role;');
  await setUser(owner);assert.equal((await q('select slug from public.owner_boards')).length,1);
  for(const sql of ["insert into public.owner_boards(slug,html,sha256) values('wordbook','<html>x</html>','"+hash+"')",'update public.owner_boards set html=\'<html>x</html>\'','delete from public.owner_boards']){
    await assert.rejects(q(sql),/permission denied/);await db.exec('rollback');await setUser(owner);
  }
  await assert.rejects(q(`select public.owner_board_put('wordbook','<html>x</html>','${hash}',null)`),/permission denied/);await db.exec('rollback');
  await setUser(staff);assert.equal((await q('select * from public.owner_boards')).length,0);
  await setUser(blocked);assert.equal((await q('select * from public.owner_boards')).length,0);
  await db.exec('reset role;set role anon;');await assert.rejects(q('select * from public.owner_boards'),/permission denied/);await db.exec('rollback');
  await db.exec('reset role;');
  await db.exec(fs.readFileSync(path.join(root,'db/owner_boards_rollback.sql'),'utf8'));
  assert.equal((await q("select to_regclass('public.owner_boards') is null gone"))[0].gone,true);
  assert.equal((await q("select count(*)::int n from pg_proc where pronamespace='public'::regnamespace and proname='owner_board_put'"))[0].n,0);
  await db.exec(migration);assert.equal((await q("select to_regclass('public.owner_boards') is not null back"))[0].back,true);
  console.log('PGLITE_OWNER_BOARDS_PASS');
}finally{await db.close();}
