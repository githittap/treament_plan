import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
// 차례 7(급여·AI비용·원장 보기판·진료기록·입금·홈 등): 새 SQL 없이 app_settings에 새 키 15개(화면 표시 숫자 8개 + 이름 목록 7개)만 더한다.
// 원장은 upsert(넣기+고치기)로 쓸 수 있고, 직원·매니저·실장·차단 계정·anon은 못 쓰며, 로그인 직원은 읽을 수 있음을 기존 정책(db/hr_settings.sql)으로 확인.
// 같은 키가 DB 함수·크론·Edge에 있는지도 훑어 없음을 확인한다(있으면 화면만 바꿔서 어긋나므로 안 옮겼어야 함).
const root=process.cwd(), pkg=process.env.PGLITE_PACKAGE_ROOT;
if(!pkg) throw new Error('PGLITE_PACKAGE_ROOT required');
const {PGlite}=await import(pathToFileURL(path.join(pkg,'dist/index.js')).href), db=new PGlite(), q=s=>db.query(s).then(x=>x.rows);
const owner='11111111-1111-1111-1111-111111111111', staff='22222222-2222-2222-2222-222222222222', manager='33333333-3333-3333-3333-333333333333', chief='44444444-4444-4444-4444-444444444444', blocked='55555555-5555-5555-5555-555555555555';
const setUser=async id=>db.exec(`reset role;set role authenticated;select set_config('app.test_uid','${id}',false);`), reset=async()=>db.exec('reset role;');
const L=(...items)=>JSON.stringify(items.map(([code,label])=>({code,label})));
const VAL={
 'home.payslip_limit':'12','dep.list_limit':'300','aic.history_months':'6','aic.auto_limit':'20','aiu.model_days':'7','aiu.cost_months':'6','aiu.external_days':'14','aiu.session_limit':'8',
 'list.approval_status':L(['진행','진행'],['완결','완결'],['반려','반려'],['취소','취소']),
 'list.contract_status':L(['발송요청','발송요청'],['대기','대기'],['서명완료','서명완료'],['취소','취소'],['반려됨','반려됨']),
 'list.pay_wage_types':L(['monthly','월급'],['hourly','시급']),
 'list.marketing_categories':L(['daangn','당근'],['kakao','카카오'],['google','구글'],['naver','네이버'],['meta','메타'],['not_marketing','마케팅 아님']),
 'list.ai_billing_platforms':L(['Claude','Claude'],['Codex(OpenAI)','Codex(OpenAI)'],['Kimi','Kimi'],['DeepSeek','DeepSeek'],['StepFun','StepFun'],['기타','기타']),
 'list.ai_cost_platforms':L(['claude','Claude Code'],['codex','Codex (OpenAI)'],['kimi','Kimi (Moonshot)'],['openclaw','OpenClaw']),
 'list.ai_external_names':L(['deepseek','딥시크'],['step5','스텝5'],['kimi','키미'],['luna','루나'],['?','이름 모름'])
};
const KEYS=Object.keys(VAL);
try {
 await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('app.test_uid',true),'')::uuid$$;
 grant usage on schema auth to anon,authenticated,service_role;grant execute on function auth.uid() to anon,authenticated,service_role;
 create table public.profiles(user_id uuid primary key,role text,active boolean default true,approved boolean default true,account_access_status text default '활성',created_at timestamptz default now());
 create function public.employee_hub_access_allowed() returns boolean language sql stable security definer set search_path='' as $$select exists(select 1 from public.profiles p where p.user_id=auth.uid() and p.active and p.approved and p.account_access_status='활성')$$;
 create function public.my_role() returns text language sql stable security definer set search_path='' as $$select case when public.employee_hub_access_allowed() then coalesce((select p.role from public.profiles p where p.user_id=auth.uid()),'staff') else 'pending' end$$;
 grant execute on function public.employee_hub_access_allowed(),public.my_role() to authenticated;
 insert into public.profiles(user_id,role,account_access_status) values('${owner}','owner','활성'),('${staff}','staff','활성'),('${manager}','manager','활성'),('${chief}','chief','활성'),('${blocked}','staff','차단');`);
 const settingsSql=fs.readFileSync(path.join(root,'db/hr_settings.sql'),'utf8');
 await db.exec(settingsSql);
 await db.exec('grant all on table public.app_settings to anon,authenticated,service_role;'); // Supabase 기본 권한을 흉내(실제 접근은 정책이 가른다)
 const policyCount=async()=>(await q(`select count(*)::int n from pg_policies where tablename='app_settings'`))[0].n;
 const pol=await policyCount();
 const val=async k=>(await q(`select value from public.app_settings where key='${k}'`))[0]?.value;
 const cnt=async k=>(await q(`select count(*)::int n from public.app_settings where key='${k}'`))[0].n;
 const upsert=(k,v)=>`insert into public.app_settings(key,value) values('${k}','${v.replace(/'/g,"''")}') on conflict(key) do update set value=excluded.value`;

 // 원장: 새 키 넣기 + 고치기(upsert) — 화면이 쓰는 방식 그대로
 await setUser(owner);
 for(const k of KEYS) await q(upsert(k,VAL[k]));
 for(const k of KEYS) assert.equal(await cnt(k),1,`${k} 넣기`);
 await q(upsert('aic.history_months','3'));
 assert.equal(await val('aic.history_months'),'3','원장은 개월 수를 고칠 수 있음');
 await q(upsert('list.approval_status',L(['진행','결재 중'],['완결','완결'],['반려','반려'],['취소','취소'])));
 assert.equal(JSON.parse(await val('list.approval_status'))[0].label,'결재 중','원장은 이름 목록을 고칠 수 있음');
 await q(upsert('aic.history_months',VAL['aic.history_months']));await q(upsert('list.approval_status',VAL['list.approval_status']));
 assert.equal(await val('aic.history_months'),'6');
 await reset();

 // 직원·매니저·실장: 읽기 OK · 넣기/고치기 거절
 for(const uid of [staff,manager,chief]){
  await setUser(uid);
  for(const k of KEYS) assert.equal(await cnt(k),1,`${uid} ${k} 읽기`);
  assert.equal(await val('dep.list_limit'),'300');
  await assert.rejects(q(upsert('pay.hack','1')),/row-level security/,`${uid} 넣기 거절`);
  await assert.rejects(q(upsert('aic.history_months','1')),/row-level security/,`${uid} 고치기(upsert) 거절`);
  await q(`update public.app_settings set value='1' where key='aic.history_months'`); // 정책에 안 걸려 0행만 바뀜
  await reset();
  assert.equal(await val('aic.history_months'),'6',`${uid} 고치기 거절`);
 }
 // 허브 접근 막힌 계정은 쓰기 거절
 await setUser(blocked);
 await assert.rejects(q(upsert('pay.hack','1')),/row-level security/);
 await reset();
 // anon은 못 봄·못 씀
 await db.exec('reset role;set role anon;');
 assert.equal((await q(`select count(*)::int n from public.app_settings`))[0].n,0,'anon은 설정 행을 못 봄');
 await assert.rejects(q(upsert('pay.hack','1')),/row-level security/);
 await reset();
 assert.equal(await policyCount(),pol,'정책 수 그대로(이 차례는 표·정책을 고치지 않음)');
 assert.equal(await cnt('pay.hack'),0);
 // 새 키는 화면에만 있던 값이라 옮겼다 — DB 함수·크론·Edge에 같은 키가 있으면 화면 설정과 어긋남
 const walk=p=>{const out=[];for(const e of fs.readdirSync(p,{withFileTypes:true})){const q2=path.join(p,e.name);if(e.isDirectory())out.push(...walk(q2));else if(/\.(ts|sql)$/.test(e.name))out.push(q2);}return out;};
 const files=[...fs.readdirSync(path.join(root,'db')).filter(f=>f.endsWith('.sql')).map(f=>path.join(root,'db',f)),...walk(path.join(root,'supabase/functions'))];
 for(const f of files){
  const t=fs.readFileSync(f,'utf8');
  for(const k of KEYS)assert.ok(!t.includes(k),f+' 에 '+k+' 가 있으면 화면 설정과 어긋남');
 }
 assert.equal(fs.existsSync(path.join(root,'db/hub_ui_texts_7.sql')),false,'새 SQL 없음');
 console.log('PGLITE_HUB_UI_TEXTS_7_PASS');
} finally { await db.close(); }
