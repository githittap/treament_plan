import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
const root=process.cwd(), pkg=process.env.PGLITE_PACKAGE_ROOT;
if(!pkg) throw new Error('PGLITE_PACKAGE_ROOT required');
const {PGlite}=await import(pathToFileURL(path.join(pkg,'dist/index.js')).href), db=new PGlite(), q=s=>db.query(s).then(x=>x.rows);
const owner='11111111-1111-1111-1111-111111111111', staff='22222222-2222-2222-2222-222222222222', manager='33333333-3333-3333-3333-333333333333', chief='44444444-4444-4444-4444-444444444444', blocked='55555555-5555-5555-5555-555555555555';
const setUser=async id=>db.exec(`reset role;set role authenticated;select set_config('app.test_uid','${id}',false);`), reset=async()=>db.exec('reset role;'), service=async()=>db.exec('reset role;set role service_role;');
try {
 await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('app.test_uid',true),'')::uuid$$;
 grant usage on schema auth to anon,authenticated,service_role;grant execute on function auth.uid() to anon,authenticated,service_role;
 create table public.profiles(user_id uuid primary key,role text,active boolean default true,approved boolean default true,account_access_status text default '활성',created_at timestamptz default now());
 create function public.employee_hub_access_allowed() returns boolean language sql stable security definer set search_path='' as $$select exists(select 1 from public.profiles p where p.user_id=auth.uid() and p.active and p.approved and p.account_access_status='활성')$$;
 create function public.my_role() returns text language sql stable security definer set search_path='' as $$select case when public.employee_hub_access_allowed() then coalesce((select p.role from public.profiles p where p.user_id=auth.uid()),'staff') else 'pending' end$$;
 grant execute on function public.employee_hub_access_allowed(),public.my_role() to authenticated;
 insert into public.profiles(user_id,role,account_access_status) values('${owner}','owner','활성'),('${staff}','staff','활성'),('${manager}','manager','활성'),('${chief}','chief','활성'),('${blocked}','staff','차단');`);
 await db.exec(fs.readFileSync(path.join(root,'db/ai_assistants.sql'),'utf8'));
 await db.exec(`insert into public.ai_models(id,provider,model_id,label) values ('da643856-b453-46b3-ac14-ff1dc924f11d','openai','gpt-6-luna-x','GPT Luna'),('cae790c5-580c-4f13-90ee-96df41521813','deepseek','deepseek-flash-x','DeepSeek'),('2c64225a-8913-4bc1-a258-96d09a2e1f4e','google','gemini-3.8-flash-x','Gemini')`);
 const seed='Z:/09_claude-output/03_병원운영·전산/직원AI도우미/_자료/도우미10/out/assistants_batch1.sql';
 await db.exec(fs.readFileSync(seed,'utf8'));
 const stage1FnDef=(await q(`select pg_get_functiondef('public.ai_assistants_for_me'::regproc) d`))[0].d;
 const sql=fs.readFileSync(path.join(root,'db/ai_assistants_v2.sql'),'utf8'); await db.exec(sql); await db.exec(sql);
 assert.equal((await q(`select count(*)::int n from public.ai_providers`))[0].n,7);
 assert.equal((await q(`select count(*)::int n from public.ai_assistants`))[0].n,10);
 // 사진 읽기 씨앗: 모델별로 확인된 13개만 true. DeepSeek 2개와 시험용 행(-x 붙은 것)은 false.
 const imageOkIds=['claude-fable-5-1','claude-haiku-4-5','claude-opus-5-5','claude-sonnet-5-5','gemini-3.1-pro-preview','gemini-3.8-flash','gpt-6-astra','gpt-6-luna','gpt-6-sol','kimi-k2.6','kimi-k3','step-3.7-flash','step-5-preview'];
 assert.deepEqual((await q(`select model_id from public.ai_models where supports_images`)).map(r=>r.model_id).sort(),[...imageOkIds].sort());
 assert.deepEqual((await q(`select model_id from public.ai_models where not supports_images`)).map(r=>r.model_id).sort(),['deepseek-flash','deepseek-flash-x','deepseek-v4-pro','gemini-3.8-flash-x','gpt-6-luna-x']);
 assert.equal((await q(`select count(*)::int n from public.ai_assistant_conversations`))[0].n,0);
 await setUser(owner);
 await assert.rejects(q(`insert into public.ai_providers(id,label,kind,base_url,key_env) values('bad','Bad','openai_compat','http://bad','SUPABASE_SERVICE_ROLE_KEY')`),/check constraint|violates/); await db.exec('rollback');
 await setUser(owner);
 await assert.rejects(q(`insert into public.ai_providers(id,label,kind,base_url,key_env) values('bad-url','Bad URL','openai_compat','http://api.example.com/v1','EXAMPLE_API_KEY')`),/check constraint|violates/); await db.exec('rollback');
 await setUser(owner);
 await assert.rejects(q(`insert into public.ai_assistants(name,starters) values('bad',array['${'x'.repeat(121)}'])`),/check constraint|violates/); await db.exec('rollback');
 await setUser(owner);
 await assert.rejects(q(`insert into public.ai_providers(id,label,kind,base_url,key_env) values('bad','Bad','openai_compat','https://api.example.com/v1','SUPABASE_SERVICE_ROLE_KEY')`),/check constraint|violates/); await db.exec('rollback');
 for(const uid of [staff,manager,chief,blocked]) { await setUser(uid); assert.equal((await q(`select count(*)::int n from public.ai_assistant_conversations`))[0].n,0,`${uid} transcript select`);assert.equal((await q(`select count(*)::int n from public.ai_assistant_messages`))[0].n,0,`${uid} messages select`); await assert.rejects(q(`insert into public.ai_assistant_conversations(id,user_id,assistant_name) values(gen_random_uuid(),'${uid}','x')`),/permission denied/);await db.exec('rollback'); }
 const conv='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'; await reset(); await service(); await q(`insert into public.ai_assistant_conversations(id,user_id,assistant_name) values('${conv}','${staff}','test')`); await q(`insert into public.ai_assistant_messages(conversation_id,role,content) values('${conv}','user','hello')`); await reset(); await setUser(owner); assert.equal((await q(`select count(*)::int n from public.ai_assistant_conversations`))[0].n,1);
 // 직원 카드 목록(ai_assistants_for_me): 시작 문장·웹검색·사진 읽기 여부를 받고, 지침서·참고자료는 못 받는다.
 await reset();
 const modelId=async mid=>(await q(`select id from public.ai_models where model_id='${mid}'`))[0].id;
 const luna=await modelId('gpt-6-luna'), deepseek=await modelId('deepseek-flash'), sol=await modelId('gpt-6-sol');
 await q(`insert into public.ai_assistants(id,name,model_ref,fallback_model_ref,starters,web_search,instructions,knowledge,visible_roles,sort_order) values
  ('00000000-0000-0000-0000-00000000b001','카드A','${luna}','${deepseek}',array['첫 문장','둘째 문장'],true,'비밀지침','비밀참고',array['staff','owner'],-3),
  ('00000000-0000-0000-0000-00000000b002','카드B','${deepseek}',null,'{}',false,'비밀지침','비밀참고',array['staff','owner'],-2),
  ('00000000-0000-0000-0000-00000000b003','카드C','${luna}','${sol}','{}',false,'','',array['staff','owner'],-1)`);
 await setUser(staff);
 const cards=await q(`select * from public.ai_assistants_for_me() where name like '카드%' order by name`);
 assert.deepEqual(Object.keys(cards[0]),['id','name','icon','description','ready','sort_order','starters','web_search','images_ok','fallback_images_ok']);
 assert.ok(!('instructions' in cards[0]) && !('knowledge' in cards[0]) && !('model_ref' in cards[0]),'지침서·참고자료·모델 배정은 돌려주지 않음');
 assert.deepEqual(cards.map(c=>[c.name,c.starters,c.web_search,c.images_ok,c.fallback_images_ok]),[
  ['카드A',['첫 문장','둘째 문장'],true,true,false],
  ['카드B',[],false,false,null],
  ['카드C',[],false,true,true]]);
 assert.equal((await q(`select count(*)::int n from public.ai_assistants`))[0].n,0,'직원은 도우미 표를 직접 못 읽음(지침서·참고자료 보호)');
 await reset();
 const fk=await q(`select count(*)::int n from public.ai_models m join public.ai_providers p on p.id=m.provider`); assert.equal(fk[0].n,18);
 // 2단계 롤백: 1단계 밖 회사(xai) 모델·도우미가 남아 있으면 날것 제약 오류 대신 분명한 한국어 안내로 멈춘다.
 await reset();
 const rollback=fs.readFileSync(path.join(root,'db/ai_assistants_v2_rollback.sql'),'utf8');
 await q(`insert into public.ai_models(provider,model_id,label) values('xai','grok-x','Grok')`);
 await q(`update public.ai_assistants set model_ref=(select id from public.ai_models where model_id='grok-x') where id='00000000-0000-0000-0000-00000000b002'`);
 await assert.rejects(db.exec(rollback),/롤백을 멈췄어요[\s\S]*xai[\s\S]*모델이 1개[\s\S]*도우미가 1개/);
 await db.exec('rollback');
 assert.equal((await q(`select count(*)::int n from public.ai_providers`))[0].n,7,'멈춘 뒤에도 2단계는 그대로');
 await q(`update public.ai_assistants set model_ref=null where id='00000000-0000-0000-0000-00000000b002'`);
 await q(`delete from public.ai_models where model_id='grok-x'`);
 await db.exec(rollback);
 assert.equal((await q(`select to_regclass('public.ai_providers') t`))[0].t,null);
 assert.equal((await q(`select to_regclass('public.ai_assistant_messages') t`))[0].t,null);
 assert.equal((await q(`select count(*)::int n from information_schema.columns where table_name='ai_assistants' and column_name in ('starters','web_search')`))[0].n,0);
 assert.equal((await q(`select pg_get_functiondef('public.ai_assistants_for_me'::regproc) d`))[0].d,stage1FnDef,'직원 카드 함수가 1단계 정의와 똑같이 돌아옴');
 assert.equal((await q(`select to_regprocedure('public.ai_assistant_starters_valid(text[])') t`))[0].t,null);
 await setUser(staff); assert.deepEqual(Object.keys((await q(`select * from public.ai_assistants_for_me() limit 1`))[0]),['id','name','icon','description','ready','sort_order']); await reset();
 await db.exec(sql); // 롤백 뒤 다시 적용해도 된다
 assert.equal((await q(`select count(*)::int n from public.ai_providers`))[0].n,7);
 console.log('PGLITE_AI_ASSISTANTS_V2_PASS');
} finally { await db.close(); }
