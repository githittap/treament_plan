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
 await db.exec(`insert into public.ai_models(id,provider,model_id,label) values ('da643856-b453-46b3-ac14-ff1dc924f11d','openai','gpt-6-luna-x','GPT Luna'),('cae790c5-580c-4f90-96df-415218f21813','deepseek','deepseek-flash-x','DeepSeek'),('2c64225a-8913-4bc1-a258-96d09a2e1f4e','google','gemini-3.8-flash-x','Gemini')`);
 const seed='Z:/09_claude-output/03_병원운영·전산/직원AI도우미/_자료/도우미10/out/assistants_batch1.sql';
 await db.exec(fs.readFileSync(seed,'utf8'));
 const sql=fs.readFileSync(path.join(root,'db/ai_assistants_v2.sql'),'utf8'); await db.exec(sql); await db.exec(sql);
 assert.equal((await q(`select count(*)::int n from public.ai_providers`))[0].n,7);
 assert.equal((await q(`select count(*)::int n from public.ai_assistants`))[0].n,10);
 assert.equal((await q(`select count(*)::int n from public.ai_models where provider='openai' and supports_images`))[0].n,3);
 assert.equal((await q(`select count(*)::int n from public.ai_assistant_conversations`))[0].n,0);
 await setUser(owner);
 await assert.rejects(q(`insert into public.ai_providers(id,label,kind,base_url,key_env) values('bad','Bad','openai_compat','http://bad','SUPABASE_SERVICE_ROLE_KEY')`),/check constraint|violates/); await db.exec('rollback');
 await setUser(owner);
 await assert.rejects(q(`insert into public.ai_assistants(name,starters) values('bad',array['${'x'.repeat(121)}'])`),/check constraint|violates/); await db.exec('rollback');
 await setUser(owner);
 await assert.rejects(q(`insert into public.ai_providers(id,label,kind,base_url,key_env) values('bad','Bad','openai_compat','https://api.example.com/v1','SUPABASE_SERVICE_ROLE_KEY')`),/check constraint|violates/); await db.exec('rollback');
 for(const uid of [staff,manager,chief,blocked]) { await setUser(uid); assert.equal((await q(`select count(*)::int n from public.ai_assistant_conversations`))[0].n,0,`${uid} transcript select`);assert.equal((await q(`select count(*)::int n from public.ai_assistant_messages`))[0].n,0,`${uid} messages select`); await assert.rejects(q(`insert into public.ai_assistant_conversations(id,user_id,assistant_name) values(gen_random_uuid(),'${uid}','x')`),/permission denied/);await db.exec('rollback'); }
 await setUser(owner); const conv='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'; await q(`insert into public.ai_assistant_conversations(id,user_id,assistant_name) values('${conv}','${staff}','test')`); await reset(); await service(); await q(`insert into public.ai_assistant_messages(conversation_id,role,content) values('${conv}','user','hello')`); await reset(); await setUser(owner); assert.equal((await q(`select count(*)::int n from public.ai_assistant_conversations`))[0].n,1);
 const fk=await q(`select count(*)::int n from public.ai_models m join public.ai_providers p on p.id=m.provider`); assert.equal(fk[0].n,15);
 console.log('PGLITE_AI_ASSISTANTS_V2_PASS');
} finally { await db.close(); }
