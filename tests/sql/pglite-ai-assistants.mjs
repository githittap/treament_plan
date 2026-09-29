import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';

const root=process.cwd(),pkg=process.env.PGLITE_PACKAGE_ROOT;
if(!pkg)throw new Error('PGLITE_PACKAGE_ROOT required');
const {PGlite}=await import(pathToFileURL(path.join(pkg,'dist/index.js')).href),db=new PGlite(),q=s=>db.query(s).then(x=>x.rows);
const owner='11111111-1111-1111-1111-111111111111',staff='22222222-2222-2222-2222-222222222222',manager='33333333-3333-3333-3333-333333333333',chief='55555555-5555-5555-5555-555555555555',blockedStaff='44444444-4444-4444-4444-444444444444';
const setUser=async id=>db.exec(`set role authenticated;select set_config('app.test_uid','${id}',false);`);
const asService=async()=>db.exec('set role service_role;');
const reset=async()=>db.exec('reset role;');

try{
  await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;
    create or replace function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('app.test_uid',true),'')::uuid$$;
    grant usage on schema auth to anon,authenticated,service_role;grant execute on function auth.uid() to anon,authenticated,service_role;
    create table public.profiles(user_id uuid primary key,role text,active boolean default true,approved boolean default true,account_access_status text default '활성');
    create or replace function public.employee_hub_access_allowed() returns boolean language sql stable security definer set search_path='' as $$select exists(select 1 from public.profiles p where p.user_id=auth.uid() and p.active and p.approved and p.account_access_status='활성')$$;
    create or replace function public.my_role() returns text language sql stable security definer set search_path='' as $$select case when public.employee_hub_access_allowed() then coalesce((select p.role from public.profiles p where p.user_id=auth.uid()),'staff') else 'pending' end$$;
    revoke all on function public.employee_hub_access_allowed() from public,anon;revoke all on function public.my_role() from public,anon;
    grant execute on function public.employee_hub_access_allowed(),public.my_role() to authenticated;
    insert into public.profiles values('${owner}','owner',true,true,'활성'),('${staff}','staff',true,true,'활성'),('${manager}','manager',true,true,'활성'),('${chief}','chief',true,true,'활성'),('${blockedStaff}','staff',true,true,'차단');`);

  const migration=fs.readFileSync(path.join(root,'db/ai_assistants.sql'),'utf8');
  const rollback=fs.readFileSync(path.join(root,'db/ai_assistants_rollback.sql'),'utf8');
  await db.exec(migration);await db.exec(migration); // 재실행 안전(idempotent)

  // --- 씨앗 자료 확인 ---
  await reset();
  assert.equal((await q('select count(*)::int n from public.ai_models'))[0].n,15,'모델 15개가 들어와야 함');
  const seedAssistant=(await q(`select name,model_ref,enabled from public.ai_assistants where id='00000000-0000-0000-0000-0000000000a1'`))[0];
  assert.deepEqual(seedAssistant,{name:'리뷰 답글',model_ref:null,enabled:true});
  assert.equal((await q('select count(*)::int n from public.ai_assistants'))[0].n,1,'재실행해도 견본 도우미가 중복되면 안 됨');
  assert.equal((await q(`select count(*)::int n from public.ai_models where provider='anthropic' and model_id='claude-opus-5-5' and price_in_usd_per_mtok=4 and price_out_usd_per_mtok=20`))[0].n,1);

  // --- RLS 모양: 세 테이블 모두 select·insert·update·delete가 owner 1개 정책(ai_assistant_usage는 select만) ---
  for(const [table,expectCmds] of [['ai_models','*'],['ai_assistants','*'],['ai_assistant_usage','r']]){
    const shape=(await q(`select c.relrowsecurity rls,(select count(*)::int from pg_policy p where p.polrelid=c.oid) policies,(select string_agg(distinct p.polcmd::text,',') from pg_policy p where p.polrelid=c.oid) cmds from pg_class c where c.oid='public.${table}'::regclass`))[0];
    assert.equal(shape.rls,true,table);assert.equal(shape.policies,1,table);assert.equal(shape.cmds,expectCmds,table);
  }
  const acl=(await q(`select
    has_table_privilege('anon','public.ai_models','select') anon_models,
    has_table_privilege('authenticated','public.ai_models','insert') auth_models_insert,
    has_table_privilege('service_role','public.ai_models','select') svc_models_select,
    has_table_privilege('service_role','public.ai_assistants','select') svc_assistants_select,
    has_table_privilege('authenticated','public.ai_assistant_usage','insert') auth_usage_insert,
    has_table_privilege('authenticated','public.ai_assistant_usage','select') auth_usage_select,
    has_table_privilege('service_role','public.ai_assistant_usage','insert') svc_usage_insert,
    has_function_privilege('anon','public.ai_assistants_for_me()','execute') anon_rpc,
    has_function_privilege('authenticated','public.ai_assistants_for_me()','execute') auth_rpc,
    (select prosecdef from pg_proc where oid='public.ai_assistants_for_me()'::regprocedure) secdef
  `))[0];
  assert.deepEqual({...acl},{anon_models:false,auth_models_insert:true,svc_models_select:true,svc_assistants_select:true,auth_usage_insert:false,auth_usage_select:true,svc_usage_insert:true,anon_rpc:false,auth_rpc:true,secdef:true});

  // --- owner CRUD 됨 ---
  await setUser(owner);
  const newModel=(await q(`insert into public.ai_models(provider,model_id,label) values('openai','gpt-test','테스트') returning id`))[0];
  await q(`update public.ai_models set enabled=false where id='${newModel.id}'`);
  await q(`delete from public.ai_models where id='${newModel.id}'`);
  const newAssistant=(await q(`insert into public.ai_assistants(name) values('owner도우미') returning id`))[0];
  await q(`update public.ai_assistants set enabled=false where id='${newAssistant.id}'`);
  await q(`delete from public.ai_assistants where id='${newAssistant.id}'`);
  await reset();

  // --- staff/manager/chief는 세 테이블 직접 select/insert/update/delete 안 됨 ---
  for(const uid of [staff,manager,chief]){
    await setUser(uid);
    for(const table of ['ai_models','ai_assistants','ai_assistant_usage']){
      assert.equal((await q(`select count(*)::int n from public.${table}`))[0].n,0,`${uid}/${table} select는 0행(RLS로 막힘)`);
    }
    await assert.rejects(q(`insert into public.ai_models(provider,model_id,label) values('openai','x','x')`),/row-level security|permission denied/,`${uid} ai_models insert`);await db.exec('rollback');await setUser(uid);
    await assert.rejects(q(`insert into public.ai_assistants(name) values('x')`),/row-level security|permission denied/,`${uid} ai_assistants insert`);await db.exec('rollback');await setUser(uid);
    // update/delete: RLS의 USING이 대상 행을 안 보여줘 「0행 처리」로 조용히 끝난다(오류가 아니라 영향 0행인지로 검증).
    const upd=await db.query(`update public.ai_models set enabled=false where provider='anthropic' and model_id='claude-opus-5-5' returning id`);
    assert.equal(upd.rows.length,0,`${uid} ai_models update이 실제로는 0행에만 적용돼야 함`);
    const del=await db.query(`delete from public.ai_assistants where id='00000000-0000-0000-0000-0000000000a1' returning id`);
    assert.equal(del.rows.length,0,`${uid} ai_assistants delete가 실제로는 0행에만 적용돼야 함`);
    await reset();
  }

  // --- ai_assistants_for_me(): 역할·enabled 반영, ready 계산 ---
  await setUser(owner); // owner가 시험용 도우미 자료를 준비(ai_assistants는 service_role에 select만 부여했으므로 owner로 씀)
  const claudeOpus=(await q(`select id from public.ai_models where provider='anthropic' and model_id='claude-opus-5-5'`))[0].id;
  await q(`update public.ai_assistants set model_ref='${claudeOpus}' where id='00000000-0000-0000-0000-0000000000a1'`); // 리뷰 답글: 모델 있음+켜짐 -> ready
  const managerOnly=(await q(`insert into public.ai_assistants(name,visible_roles,enabled) values('실장전용',array['chief','owner'],true) returning id`))[0];
  const disabledOff=(await q(`insert into public.ai_assistants(name,enabled) values('꺼진도우미',false) returning id`))[0];
  const staffVisibleNoModel=(await q(`insert into public.ai_assistants(name) values('모델없음') returning id`))[0]; // model_ref null -> not ready
  await reset();

  await setUser(staff);
  let rows=await q('select name,ready from public.ai_assistants_for_me() order by name');
  assert.deepEqual(rows,[{name:'리뷰 답글',ready:true},{name:'모델없음',ready:false}],'staff는 실장전용·꺼진도우미를 못 봄');
  await reset();

  await setUser(chief);
  rows=await q('select name,ready from public.ai_assistants_for_me() order by name');
  assert.deepEqual(rows,[{name:'리뷰 답글',ready:true},{name:'모델없음',ready:false},{name:'실장전용',ready:false}],'chief는 실장전용을 봄(모델 없어 ready=false)');
  await reset();

  await setUser(owner);
  rows=await q('select name from public.ai_assistants_for_me() order by name');
  assert.deepEqual(rows.map(r=>r.name),['리뷰 답글','모델없음','실장전용'],'owner는 enabled 전부(꺼진도우미 제외)를 봄, visible_roles 무관');
  await reset();

  // --- 허브 접근 차단된 사용자는 빈 결과 ---
  await setUser(blockedStaff);
  assert.deepEqual(await q('select * from public.ai_assistants_for_me()'),[]);
  await reset();

  // --- anon은 RPC 실행 불가 ---
  await db.exec('set role anon;');
  await assert.rejects(q('select * from public.ai_assistants_for_me()'),/permission denied/);
  await db.exec('rollback');
  await reset();

  // --- service_role만 usage에 쓸 수 있음, owner만 읽음 ---
  await asService();
  await q(`insert into public.ai_assistant_usage(user_id,assistant_id,assistant_name,provider,model_id,status,input_tokens,output_tokens,est_cost_usd) values('${staff}','00000000-0000-0000-0000-0000000000a1','리뷰 답글','anthropic','claude-opus-5-5','ok',100,200,0.0044)`);
  await reset();
  await setUser(owner);
  assert.equal((await q('select count(*)::int n from public.ai_assistant_usage'))[0].n,1);
  await reset();
  await setUser(staff);
  assert.equal((await q('select count(*)::int n from public.ai_assistant_usage'))[0].n,0,'staff는 사용 기록을 못 읽음');
  await reset();

  // --- ai_usage_reserve: service_role만, 한도 경계, pending 행, 잠금 함수 사용 ---
  const reserveAcl=(await q(`select
    has_function_privilege('anon','public.ai_usage_reserve(uuid,uuid,text,text,text,int)','execute') anon_x,
    has_function_privilege('authenticated','public.ai_usage_reserve(uuid,uuid,text,text,text,int)','execute') auth_x,
    has_function_privilege('service_role','public.ai_usage_reserve(uuid,uuid,text,text,text,int)','execute') svc_x,
    (select prosecdef from pg_proc where oid='public.ai_usage_reserve(uuid,uuid,text,text,text,int)'::regprocedure) secdef,
    (select proconfig::text like '%search_path%' from pg_proc where oid='public.ai_usage_reserve(uuid,uuid,text,text,text,int)'::regprocedure) cfg,
    (select prosrc like '%pg_advisory_xact_lock(hashtextextended(p_user::text%' from pg_proc where oid='public.ai_usage_reserve(uuid,uuid,text,text,text,int)'::regprocedure) locks,
    has_table_privilege('service_role','public.ai_assistant_usage','update') svc_update,
    has_table_privilege('authenticated','public.ai_assistant_usage','update') auth_update`))[0];
  assert.deepEqual({...reserveAcl},{anon_x:false,auth_x:false,svc_x:true,secdef:true,cfg:true,locks:true,svc_update:true,auth_update:false});
  await setUser(staff);
  await assert.rejects(q(`select public.ai_usage_reserve('${staff}',null,'x','anthropic','m',120)`),/permission denied/,'직원은 예약 RPC를 직접 못 부름');await db.exec('rollback');
  await reset();

  const rUser='66666666-6666-6666-6666-666666666666',rSeed='00000000-0000-0000-0000-0000000000a1';
  await asService();
  await q(`insert into public.ai_assistant_usage(created_at,user_id,assistant_name,provider,model_id,status) values(now()-interval '2 hours','${rUser}','옛기록','anthropic','m','ok')`); // 1시간 밖 → 세지 않음
  const ids=[];
  for(let i=0;i<3;i++)ids.push((await q(`select public.ai_usage_reserve('${rUser}','${rSeed}','리뷰 답글','anthropic','claude-opus-5-5',3) id`))[0].id);
  assert.equal(new Set(ids.map(String)).size,3,'예약마다 새 id');
  assert.deepEqual(await q(`select status,count(*)::int n from public.ai_assistant_usage where user_id='${rUser}' and created_at>now()-interval '1 hour' group by status`),[{status:'pending',n:3}]);
  await assert.rejects(q(`select public.ai_usage_reserve('${rUser}','${rSeed}','리뷰 답글','anthropic','claude-opus-5-5',3)`),e=>/rate_limited/.test(e.message)&&e.code==='P0001','한도(3) 다음은 rate_limited');
  await reset();await asService();
  assert.equal((await q(`select count(*)::int n from public.ai_assistant_usage where user_id='${rUser}' and created_at>now()-interval '1 hour'`))[0].n,3,'거절된 예약은 행을 만들지 않음');
  // 다른 사용자는 영향 없음
  assert.ok((await q(`select public.ai_usage_reserve('${manager}',null,'x','openai','m',3) id`))[0].id>0);
  // 결과 update(service_role) + pending 포함 status check
  await q(`update public.ai_assistant_usage set status='ok',input_tokens=5,output_tokens=6,est_cost_usd=0.001,latency_ms=12,fallback_used=true where id=${ids[0]}`);
  assert.deepEqual(await q(`select status,fallback_used from public.ai_assistant_usage where id=${ids[0]}`),[{status:'ok',fallback_used:true}]);
  await assert.rejects(q(`update public.ai_assistant_usage set status='bogus' where id=${ids[1]}`),/check constraint|violates/);await db.exec('rollback');
  await reset();

  // --- 되돌리기 SQL이 깔끔히 되돌림 ---
  await db.exec(rollback);
  for(const name of ['ai_models','ai_assistants','ai_assistant_usage']){
    assert.equal((await q(`select to_regclass('public.${name}') n`))[0].n,null,`${name}이 롤백 뒤 남아있음`);
  }
  assert.equal((await q(`select to_regproc('public.ai_assistants_for_me') n`))[0].n,null);
  assert.equal((await q(`select to_regproc('public.ai_usage_reserve') n`))[0].n,null,'예약 함수가 롤백 뒤 남아있음');

  console.log('PGLITE_AI_ASSISTANTS_PASS');
}finally{
  await db.close();
}
