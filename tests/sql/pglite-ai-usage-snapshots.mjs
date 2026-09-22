import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';

const root=process.cwd(),pkg=process.env.PGLITE_PACKAGE_ROOT;
if(!pkg)throw new Error('PGLITE_PACKAGE_ROOT required');
const {PGlite}=await import(pathToFileURL(path.join(pkg,'dist/index.js')).href),db=new PGlite(),q=s=>db.query(s).then(x=>x.rows);
const owner='11111111-1111-1111-1111-111111111111',staff='33333333-3333-3333-3333-333333333333',blockedOwner='44444444-4444-4444-4444-444444444444';
const setUser=async id=>db.exec(`set role authenticated;select set_config('app.test_uid','${id}',false);`);
const lit=o=>`'${JSON.stringify(o)}'::jsonb`;
const snapshot=async kind=>{await db.exec('reset role;');return (await q(`select payload,synced_at from public.ai_usage_snapshots where kind='${kind}'`))[0];};
try{
  await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create or replace function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('app.test_uid',true),'')::uuid$$;grant usage on schema auth to anon,authenticated,service_role;grant execute on function auth.uid() to anon,authenticated,service_role;
    create table public.profiles(user_id uuid primary key,role text,active boolean default true,approved boolean default true,account_access_status text default '활성');
    create or replace function public.employee_hub_access_allowed() returns boolean language sql stable security definer set search_path='' as $$select exists(select 1 from public.profiles p where p.user_id=auth.uid() and p.active and p.approved and p.account_access_status='활성')$$;
    create or replace function public.my_role() returns text language sql stable security definer set search_path='' as $$select case when public.employee_hub_access_allowed() then coalesce((select p.role from public.profiles p where p.user_id=auth.uid()),'staff') else 'pending' end$$;
    insert into public.profiles values('${owner}','owner',true,true,'활성'),('${staff}','staff',true,true,'활성'),('${blockedOwner}','owner',true,true,'차단');`);
  const migration=fs.readFileSync(path.join(root,'db/ai_usage_snapshots.sql'),'utf8');
  await db.exec(migration);await db.exec(migration);

  const shape=(await q("select c.relrowsecurity rls,(select count(*)::int from pg_policy p where p.polrelid=c.oid) policies,(select string_agg(p.polcmd::text,',') from pg_policy p where p.polrelid=c.oid) cmds from pg_class c where c.oid='public.ai_usage_snapshots'::regclass"))[0];
  assert.deepEqual({...shape},{rls:true,policies:1,cmds:'r'});
  const acl=(await q("select has_table_privilege('anon','public.ai_usage_snapshots','select') anon_select,has_table_privilege('authenticated','public.ai_usage_snapshots','select') auth_select,has_table_privilege('authenticated','public.ai_usage_snapshots','insert') auth_insert,has_table_privilege('authenticated','public.ai_usage_snapshots','update') auth_update,has_table_privilege('authenticated','public.ai_usage_snapshots','delete') auth_delete,has_function_privilege('anon','public.ai_usage_snapshot_put(text,jsonb)','execute') anon_rpc,has_function_privilege('authenticated','public.ai_usage_snapshot_put(text,jsonb)','execute') auth_rpc,has_function_privilege('service_role','public.ai_usage_snapshot_put(text,jsonb)','execute') svc_rpc,(select prosecdef from pg_proc where oid='public.ai_usage_snapshot_put(text,jsonb)'::regprocedure) secdef,(select proconfig::text from pg_proc where oid='public.ai_usage_snapshot_put(text,jsonb)'::regprocedure) config"))[0];
  assert.deepEqual({...acl},{anon_select:false,auth_select:true,auth_insert:false,auth_update:false,auth_delete:false,anon_rpc:false,auth_rpc:false,svc_rpc:true,secdef:false,config:'{"search_path=\\"\\""}'});

  await db.exec('set role service_role;');
  await q(`select public.ai_usage_snapshot_put('platform_cost',${lit({fx:1375,generated:'2026-09-22 17:35',agents:{}})})`);
  await q(`select public.ai_usage_snapshot_put('codex_sessions',${lit({generated:'2026-09-22 17:33',won_today_total:1,flagged:[]})})`);
  const first=await snapshot('platform_cost');assert.equal(first.payload.fx,1375);
  await db.exec('set role service_role;');
  await q(`select public.ai_usage_snapshot_put('platform_cost',${lit({fx:1400,generated:'2026-09-22 23:35',agents:{}})})`);
  const second=await snapshot('platform_cost');assert.equal(second.payload.fx,1400,'같은 kind는 덮어써야 합니다.');
  assert.equal((await q('select count(*)::int n from public.ai_usage_snapshots'))[0].n,2);

  for(const [label,sql] of [
    ['모르는 kind',`select public.ai_usage_snapshot_put('other',${lit({a:1})})`],
    ['배열 payload',`select public.ai_usage_snapshot_put('platform_cost','[]'::jsonb)`],
    ['null payload',`select public.ai_usage_snapshot_put('platform_cost',null::jsonb)`],
    ['128KB 초과',`select public.ai_usage_snapshot_put('platform_cost',${lit({big:'x'.repeat(140000)})})`]
  ]){
    await db.exec('set role service_role;');
    await assert.rejects(q(sql),undefined,label);await db.exec('rollback');
    assert.equal((await snapshot('platform_cost')).payload.fx,1400,`${label}: 실패가 기존 스냅샷을 바꿨습니다.`);
  }

  // Edge 검사를 통과한 스냅샷은 DB도 반드시 저장해야 한다(Astra I1: 작은 지수 숫자·NUL·짝 없는 서로게이트·큰 본문).
  const {validatePlatformCost,validateSessionHealth}=await import(pathToFileURL(path.join(root,'supabase/functions/ai-usage-sync/payload.mjs')).href);
  const C=String.fromCharCode,month=j=>`${2021+Math.floor(j/12)}-${String(j%12+1).padStart(2,'0')}`;
  const costCases=[
    {fx:1375.642214,generated:'2026-09-22 17:35',agents:Object.fromEntries(Array.from({length:10},(_,i)=>['a'+i,{cumUSD:5e-324,months:Array.from({length:60},(_,j)=>({m:month(j),usd:5e-324})),inTok:1,outTok:1}])),month_usd:Object.fromEntries(Array.from({length:120},(_,j)=>[j<60?month(j):`2030-${String(j%12+1).padStart(2,'0')}-${String(j%28+1).padStart(2,'0')}`,1e-300]))},
    {fx:1,fx_src:'a'+C(0)+'b'+C(0xd800)+'c',generated:'g'+C(0xdfff),agents:{claude:{cumUSD:1,months:[{m:'2026-09',usd:0.1+0.2}],inTok:1,outTok:1}}},
    JSON.parse('{"fx":1,"generated":"g","agents":{"__proto__":{"cumUSD":1,"months":[],"inTok":0,"outTok":0}}}')
  ];
  const sessCases=[
    JSON.parse('{"generated":"g","won_today_total":1,"flagged":[{"name":{"toString":null},"thread":{"toString":null},"sev":{"a":1},"reasons":[{"toString":null},"ok"]},{"name":"정상 항목","sev":"red","active":true,"won_today":1,"reasons":[]}]}'),
    {generated:'g',won_today_total:1,flagged:[{name:'a'+C(0)+'b',thread:C(0xdc00),sev:'red',active:true,won_today:1,reasons:['x'+C(0)+'y',C(0xd83d)]}]},
    {generated:'g',won_today_total:1,flagged:Array.from({length:30},()=>({name:'가'.repeat(120),thread:'t'.repeat(64),sev:'orange',active:false,won_today:5e-324,share:1e-300,reasons:Array(6).fill('나'.repeat(55))}))}
  ];
  for(const [kind,validate,cases] of [['platform_cost',validatePlatformCost,costCases],['codex_sessions',validateSessionHealth,sessCases]]){
    for(const [i,raw] of cases.entries()){
      const r=validate(raw);assert.equal(r.ok,true,`${kind}#${i}: Edge 검사에서 거절됨(${r.error})`);
      await db.exec('set role service_role;');
      try{await q(`select public.ai_usage_snapshot_put('${kind}','${JSON.stringify(r.value).replace(/'/g,"''")}'::jsonb)`);}
      catch(e){await db.exec('rollback');assert.fail(`${kind}#${i}: Edge는 통과했는데 DB가 거절함 — ${e.message}`);}
    }
  }
  await db.exec('reset role;');
  await q(`select public.ai_usage_snapshot_put('platform_cost',${lit({fx:1400,generated:'2026-09-22 23:35',agents:{}})})`);

  await setUser(owner);assert.equal((await q('select kind from public.ai_usage_snapshots order by kind')).length,2);
  await assert.rejects(q(`insert into public.ai_usage_snapshots(kind,payload) values('codex_sessions','{}')`),/permission denied/);await db.exec('rollback');await setUser(owner);
  await assert.rejects(q(`update public.ai_usage_snapshots set payload='{}'`),/permission denied/);await db.exec('rollback');await setUser(owner);
  await assert.rejects(q(`delete from public.ai_usage_snapshots`),/permission denied/);await db.exec('rollback');await setUser(owner);
  await assert.rejects(q(`select public.ai_usage_snapshot_put('platform_cost',${lit({fx:1})})`),/permission denied/);await db.exec('rollback');
  await setUser(staff);assert.equal((await q('select * from public.ai_usage_snapshots')).length,0);
  await setUser(blockedOwner);assert.equal((await q('select * from public.ai_usage_snapshots')).length,0);
  await db.exec('reset role;set role anon;');await assert.rejects(q('select * from public.ai_usage_snapshots'),/permission denied/);await db.exec('rollback');

  await db.exec('reset role;');
  await db.exec(fs.readFileSync(path.join(root,'db/ai_usage_snapshots_rollback.sql'),'utf8'));
  assert.equal((await q("select to_regclass('public.ai_usage_snapshots') is null gone"))[0].gone,true);
  assert.equal((await q("select count(*)::int n from pg_proc where pronamespace='public'::regnamespace and proname='ai_usage_snapshot_put'"))[0].n,0);
  await db.exec(migration);assert.equal((await q("select to_regclass('public.ai_usage_snapshots') is not null back"))[0].back,true);
  console.log('PGLITE_AI_USAGE_SNAPSHOTS_PASS');
}finally{await db.close();}
