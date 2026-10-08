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
  // 2026-10-02 넷째 판 inbox: 새로 만든 표는 바로 받고, 운영처럼 세 판 검사만 있는 표에는 owner_boards_inbox.sql을 돌려야 받는다.
  const slugCheck=async()=>(await q("select pg_get_constraintdef(oid) d from pg_constraint where conrelid='public.owner_boards'::regclass and conname='owner_boards_slug_check'")).map(r=>r.d);
  await db.exec('set role service_role;');
  await q(`select public.owner_board_put('inbox','<!doctype html><html>인박스</html>','${hash}',now())`);
  await db.exec('reset role;');
  await db.exec("delete from public.owner_boards;alter table public.owner_boards drop constraint owner_boards_slug_check;alter table public.owner_boards add constraint owner_boards_slug_check check(slug in('busd_ledger','pin_board','wordbook'));");
  for(const s of ['busd_ledger','pin_board','wordbook'])await q(`insert into public.owner_boards(slug,html,sha256) values('${s}','<html>${s}</html>','${hash}')`);
  await db.exec('set role service_role;');
  await assert.rejects(q(`select public.owner_board_put('inbox','<html>x</html>','${hash}',null)`),/owner_boards_slug_check/,'운영과 같은 세 판 표는 inbox를 거절');await db.exec('rollback');
  await db.exec('reset role;');
  const inboxMigration=fs.readFileSync(path.join(root,'db/owner_boards_inbox.sql'),'utf8');
  assert.doesNotMatch(inboxMigration,/\b(begin|commit|delete|drop table|truncate)\b/i,'제약 바꾸기만 — 트랜잭션 묶음·자료 지우기 없음');
  await db.exec(inboxMigration);await db.exec(inboxMigration);
  assert.deepEqual(await slugCheck(),["CHECK ((slug = ANY (ARRAY['busd_ledger'::text, 'pin_board'::text, 'wordbook'::text, 'inbox'::text])))"]);
  assert.equal((await q('select count(*)::int n from public.owner_boards'))[0].n,3,'기존 세 판 자료는 그대로');
  await db.exec('set role service_role;');
  await q(`select public.owner_board_put('inbox','<!doctype html><html>인박스</html>','${hash}',now())`);
  await assert.rejects(q(`select public.owner_board_put('other','<html>x</html>','${hash}',null)`),/owner_boards_slug_check/);await db.exec('rollback');
  await db.exec('reset role;');
  await setUser(owner);assert.deepEqual((await q('select slug from public.owner_boards order by slug')).map(r=>r.slug),['busd_ledger','inbox','pin_board','wordbook']);
  await setUser(staff);assert.equal((await q("select * from public.owner_boards where slug='inbox'")).length,0,'직원은 인박스 판도 못 봄');
  await db.exec('reset role;');
  const inboxRollback=fs.readFileSync(path.join(root,'db/owner_boards_inbox_rollback.sql'),'utf8');
  await db.exec(inboxRollback);
  assert.deepEqual(await slugCheck(),["CHECK ((slug = ANY (ARRAY['busd_ledger'::text, 'pin_board'::text, 'wordbook'::text])))"]);
  assert.deepEqual((await q('select slug from public.owner_boards order by slug')).map(r=>r.slug),['busd_ledger','pin_board','wordbook'],'되돌리기는 인박스 행만 지움');
  await db.exec(inboxMigration);assert.equal((await slugCheck())[0].includes("'inbox'::text"),true,'되돌린 뒤 다시 적용 가능');
  // 2026-10-08 다섯째·여섯째 판 rules_map·codex_flow: 넷째 판까지만 허용하는 운영 표에는 owner_boards_rules.sql을 돌려야 받는다.
  const rulesMigration=fs.readFileSync(path.join(root,'db/owner_boards_rules.sql'),'utf8');
  const rulesRollback=fs.readFileSync(path.join(root,'db/owner_boards_rules_rollback.sql'),'utf8');
  assert.doesNotMatch(rulesMigration,/\b(delete|drop table|truncate)\b/i,'제약 바꾸기만 — 자료 지우기 없음');
  assert.doesNotMatch(rulesRollback,/\b(delete|drop table|truncate)\b/i,'되돌리기도 행을 지우지 않음(새 판 행이 있으면 중단)');
  assert.deepEqual(await slugCheck(),["CHECK ((slug = ANY (ARRAY['busd_ledger'::text, 'pin_board'::text, 'wordbook'::text, 'inbox'::text])))"],'바꾸기 전: 넷째 판까지');
  await db.exec('set role service_role;');
  await assert.rejects(q(`select public.owner_board_put('rules_map','<html>x</html>','${hash}',null)`),/owner_boards_slug_check/,'넷째 판까지만 허용한 표는 rules_map을 거절');await db.exec('rollback');
  await assert.rejects(q(`select public.owner_board_put('codex_flow','<html>x</html>','${hash}',null)`),/owner_boards_slug_check/,'codex_flow도 거절');await db.exec('rollback');
  await db.exec('reset role;');
  await db.exec(rulesMigration);await db.exec(rulesMigration);
  assert.deepEqual(await slugCheck(),["CHECK ((slug = ANY (ARRAY['busd_ledger'::text, 'pin_board'::text, 'wordbook'::text, 'inbox'::text, 'rules_map'::text, 'codex_flow'::text])))"]);
  assert.equal((await q('select count(*)::int n from public.owner_boards'))[0].n,3,'기존 판 자료는 그대로');
  await db.exec('set role service_role;');
  await q(`select public.owner_board_put('rules_map','<!doctype html><html>규칙 관계도</html>','${hash}',now())`);
  await q(`select public.owner_board_put('codex_flow','<!doctype html><html>코덱스 흐름</html>','${hash}',now())`);
  await assert.rejects(q(`select public.owner_board_put('other','<html>x</html>','${hash}',null)`),/owner_boards_slug_check/);await db.exec('rollback');
  await db.exec('reset role;');
  await setUser(owner);assert.deepEqual((await q('select slug from public.owner_boards order by slug')).map(r=>r.slug),['busd_ledger','codex_flow','pin_board','rules_map','wordbook'],'원장은 새 두 판도 봄');
  await setUser(staff);assert.equal((await q("select * from public.owner_boards where slug in('rules_map','codex_flow')")).length,0,'직원은 새 두 판을 못 봄');
  await db.exec('reset role;');
  // 되돌리기 안전장치: 새 판 행이 남아 있으면 중단하고 아무것도 바꾸지 않는다(행도 안 지움).
  await assert.rejects(db.exec(rulesRollback),/남아 있어 되돌리기를 중단/);await db.exec('rollback');
  assert.deepEqual(await slugCheck(),["CHECK ((slug = ANY (ARRAY['busd_ledger'::text, 'pin_board'::text, 'wordbook'::text, 'inbox'::text, 'rules_map'::text, 'codex_flow'::text])))"],'중단되면 검사는 여섯 판 그대로');
  assert.equal((await q("select count(*)::int n from public.owner_boards where slug in('rules_map','codex_flow')"))[0].n,2,'새 판 행은 그대로(되돌리기가 지우지 않음)');
  await db.exec("delete from public.owner_boards where slug in('rules_map','codex_flow');"); // 원장이 따로 지웠다고 가정한 시험 준비
  await db.exec(rulesRollback);
  assert.deepEqual(await slugCheck(),["CHECK ((slug = ANY (ARRAY['busd_ledger'::text, 'pin_board'::text, 'wordbook'::text, 'inbox'::text])))"],'새 판 행이 없으면 넷째 판까지로 되돌림');
  assert.equal((await q('select count(*)::int n from public.owner_boards'))[0].n,3,'기존 판 자료는 그대로');
  await db.exec(rulesMigration);assert.equal((await slugCheck())[0].includes("'codex_flow'::text"),true,'되돌린 뒤 다시 적용 가능');
  console.log('PGLITE_OWNER_BOARDS_PASS');
}finally{await db.close();}
