import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';

const root=process.cwd(),pkg=process.env.PGLITE_PACKAGE_ROOT;
if(!pkg)throw new Error('PGLITE_PACKAGE_ROOT required');
const {PGlite}=await import(pathToFileURL(path.join(pkg,'dist/index.js')).href),db=new PGlite(),q=s=>db.query(s).then(x=>x.rows);
const owner='11111111-1111-1111-1111-111111111111',staff='33333333-3333-3333-3333-333333333333',blockedOwner='44444444-4444-4444-4444-444444444444';
const setUser=async id=>db.exec(`set role authenticated;select set_config('app.test_uid','${id}',false);`);
const asService=async()=>db.exec("set role service_role;");
const count=async()=>{await db.exec('reset role;');return (await q('select count(*)::int n from public.ai_model_usage_daily'))[0].n;};
const payload=o=>`'${JSON.stringify(o)}'::jsonb`;
try{
  await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create or replace function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('app.test_uid',true),'')::uuid$$;grant usage on schema auth to anon,authenticated,service_role;grant execute on function auth.uid() to anon,authenticated,service_role;
    create table public.profiles(user_id uuid primary key,role text,active boolean default true,approved boolean default true,account_access_status text default '활성');
    create or replace function public.employee_hub_access_allowed() returns boolean language sql stable security definer set search_path='' as $$select exists(select 1 from public.profiles p where p.user_id=auth.uid() and p.active and p.approved and p.account_access_status='활성')$$;
    create or replace function public.my_role() returns text language sql stable security definer set search_path='' as $$select case when public.employee_hub_access_allowed() then coalesce((select p.role from public.profiles p where p.user_id=auth.uid()),'staff') else 'pending' end$$;
    create table public.webhook_secrets(name text primary key,value text not null,created_at timestamptz not null default now());alter table public.webhook_secrets enable row level security;
    insert into public.webhook_secrets(name,value) values('ai_billing_webhook','keep-me'),('ai_usage_sync_sha256','${'a'.repeat(64)}');
    insert into public.profiles values('${owner}','owner',true,true,'활성'),('${staff}','staff',true,true,'활성'),('${blockedOwner}','owner',true,true,'차단');`);
  const migration=fs.readFileSync(path.join(root,'db/ai_model_usage_daily.sql'),'utf8');
  await db.exec(migration);await db.exec(migration);

  const shape=(await q("select c.relrowsecurity rls,(select count(*)::int from pg_policy p where p.polrelid=c.oid) policies,(select string_agg(p.polcmd::text,',') from pg_policy p where p.polrelid=c.oid) cmds,(select string_agg(r.rolname,',') from pg_policy p cross join lateral unnest(p.polroles) x(oid) join pg_roles r on r.oid=x.oid where p.polrelid=c.oid) roles from pg_class c where c.oid='public.ai_model_usage_daily'::regclass"))[0];
  assert.deepEqual({...shape},{rls:true,policies:1,cmds:'r',roles:'authenticated'});
  const acl=(await q("select has_table_privilege('anon','public.ai_model_usage_daily','select') anon_select,has_table_privilege('anon','public.ai_model_usage_daily','insert') anon_insert,has_table_privilege('authenticated','public.ai_model_usage_daily','select') auth_select,has_table_privilege('authenticated','public.ai_model_usage_daily','insert') auth_insert,has_table_privilege('authenticated','public.ai_model_usage_daily','update') auth_update,has_table_privilege('authenticated','public.ai_model_usage_daily','delete') auth_delete,has_table_privilege('service_role','public.ai_model_usage_daily','select') svc_select,has_table_privilege('service_role','public.ai_model_usage_daily','insert') svc_insert,has_table_privilege('service_role','public.ai_model_usage_daily','delete') svc_delete,has_function_privilege('anon','public.ai_model_usage_replace(jsonb)','execute') anon_rpc,has_function_privilege('authenticated','public.ai_model_usage_replace(jsonb)','execute') auth_rpc,has_function_privilege('service_role','public.ai_model_usage_replace(jsonb)','execute') svc_rpc,(select prosecdef from pg_proc where oid='public.ai_model_usage_replace(jsonb)'::regprocedure) secdef,(select proconfig::text from pg_proc where oid='public.ai_model_usage_replace(jsonb)'::regprocedure) config"))[0];
  assert.deepEqual({...acl},{anon_select:false,anon_insert:false,auth_select:true,auth_insert:false,auth_update:false,auth_delete:false,svc_select:true,svc_insert:true,svc_delete:true,anon_rpc:false,auth_rpc:false,svc_rpc:true,secdef:false,config:'{"search_path=\\"\\""}'});

  await asService();
  const first=await q(`select public.ai_model_usage_replace(${payload({'2026-09-21':{Sol:{tokens:100,turns:1},Astra:{tokens:50,turns:2}},'2026-09-22':{Sol:{tokens:10,turns:1}}})}) n`);
  assert.equal(first[0].n,3);
  const replaced=await q(`select public.ai_model_usage_replace(${payload({'2026-09-22':{Luna:{tokens:7,turns:1}},'2026-09-20':{}})}) n`);
  assert.equal(replaced[0].n,1);
  await db.exec('reset role;');
  assert.deepEqual((await q("select usage_date::text d,model,tokens::text t,turns from public.ai_model_usage_daily order by 1,2")).map(r=>[r.d,r.model,r.t,r.turns]),[['2026-09-21','Astra','50',2],['2026-09-21','Sol','100',1],['2026-09-22','Luna','7',1]]);
  assert.equal((await q('select count(*)::int n from public.ai_model_usage_daily where synced_at is null'))[0].n,0);

  for(const [label,bad] of [
    ['음수 토큰',payload({'2026-09-21':{Sol:{tokens:-1,turns:1}}})],
    ['소수 토큰',payload({'2026-09-21':{Sol:{tokens:1.5,turns:1}}})],
    ['문자 토큰',payload({'2026-09-21':{Sol:{tokens:'1',turns:1}}})],
    ['없는 날짜',payload({'2026-02-30':{Sol:{tokens:1,turns:1}}})],
    ['날짜 형식',payload({'2026-9-21':{Sol:{tokens:1,turns:1}}})],
    ['날짜 값 배열',payload({'2026-09-21':[]})],
    ['추가 키',payload({'2026-09-21':{Sol:{tokens:1,turns:1,cost:2}}})],
    ['turns 누락',payload({'2026-09-21':{Sol:{tokens:1}}})],
    ['빈 객체',"'{}'::jsonb"],
    ['배열',"'[]'::jsonb"],
    ['null',"null::jsonb"],
    ['모델명 제어문자',payload({'2026-09-21':{'So\nl':{tokens:1,turns:1}}})],
    ['모델명 공백',payload({'2026-09-21':{' Sol':{tokens:1,turns:1}}})]
  ]){
    const before=await count();await asService();
    await assert.rejects(q(`select public.ai_model_usage_replace(${bad})`),undefined,label);
    await db.exec('rollback');assert.equal(await count(),before,`${label}: 실패한 교체가 기존 행을 바꿨습니다.`);
    assert.equal((await q("select count(*)::int n from public.ai_model_usage_daily where usage_date='2026-09-21'"))[0].n,2,`${label}: 원자성 위반`);
  }

  // JS(Edge 검사)와 SQL(CHECK·캐스팅)의 모델명 판정이 같아야 한다 — JS가 통과시킨 값을 DB가 거절하면 그날 동기화 전체가 실패한다.
  const {validateUsagePayload}=await import(pathToFileURL(path.join(root,'supabase/functions/ai-usage-sync/payload.mjs')).href);
  const C=String.fromCharCode,names=['Sol','gpt-5.5','K3(Kimi)','(unknown)','codex-auto-review','x y','a'.repeat(64),'','Sol ',' Sol','a'.repeat(65),'모델','A'+C(0xa0)+'B','A'+C(0x85)+'B','A'+C(0xd800)+'B',String.fromCodePoint(0x1f600).repeat(33),'a'+C(9)+'b','a'+C(0x7f)+'b'];
  for(const name of names){
    const one={'2026-09-19':{[name]:{tokens:1,turns:1}}},js=validateUsagePayload(one,'2026-09-22').ok;
    await asService();let sql=true;
    try{await q(`select public.ai_model_usage_replace('${JSON.stringify(one).replace(/'/g,"''")}'::jsonb)`);}catch{sql=false;await db.exec('rollback');}
    assert.equal(sql,js,`모델명 판정 불일치: ${JSON.stringify(name)} js=${js} sql=${sql}`);
  }
  await db.exec("reset role;delete from public.ai_model_usage_daily where usage_date='2026-09-19';");

  await setUser(owner);
  assert.equal((await q('select * from public.ai_model_usage_daily')).length,3);
  await assert.rejects(q("insert into public.ai_model_usage_daily(usage_date,model,tokens,turns) values('2026-09-19','Sol',1,1)"),/permission denied/);await db.exec('rollback');await setUser(owner);
  await assert.rejects(q("update public.ai_model_usage_daily set tokens=0"),/permission denied/);await db.exec('rollback');await setUser(owner);
  await assert.rejects(q("delete from public.ai_model_usage_daily"),/permission denied/);await db.exec('rollback');await setUser(owner);
  await assert.rejects(q(`select public.ai_model_usage_replace(${payload({'2026-09-21':{Sol:{tokens:1,turns:1}}})})`),/permission denied/);await db.exec('rollback');
  await setUser(staff);assert.equal((await q('select * from public.ai_model_usage_daily')).length,0);
  await setUser(blockedOwner);assert.equal((await q('select * from public.ai_model_usage_daily')).length,0);
  await db.exec('reset role;set role anon;');await assert.rejects(q('select * from public.ai_model_usage_daily'),/permission denied/);await db.exec('rollback');
  await db.exec('reset role;');assert.equal(await count(),3);

  const rollback=fs.readFileSync(path.join(root,'db/ai_model_usage_daily_rollback.sql'),'utf8');
  await db.exec(rollback);
  assert.equal((await q("select to_regclass('public.ai_model_usage_daily') is null gone"))[0].gone,true);
  assert.equal((await q("select count(*)::int n from pg_proc where pronamespace='public'::regnamespace and proname='ai_model_usage_replace'"))[0].n,0);
  assert.deepEqual((await q('select name from public.webhook_secrets order by name')).map(r=>r.name),['ai_billing_webhook']);
  await db.exec(migration);assert.equal((await q("select to_regclass('public.ai_model_usage_daily') is not null back"))[0].back,true);
  console.log('PGLITE_AI_MODEL_USAGE_PASS');
}finally{await db.close();}
