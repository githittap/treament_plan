import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
const pkg=process.env.PGLITE_PACKAGE_ROOT;
if(!pkg)throw new Error('PGLITE_PACKAGE_ROOT required');
const {PGlite}=await import(pathToFileURL(path.join(pkg,'dist/index.js')).href);
const draft=fs.readFileSync('db/ai_billing_alerts_draft.sql','utf8');
const rollback=fs.readFileSync('db/ai_billing_alerts_rollback.sql','utf8');
const ids={owner:'11111111-1111-1111-1111-111111111111',manager:'22222222-2222-2222-2222-222222222222',off:'33333333-3333-3333-3333-333333333333',staff:'44444444-4444-4444-4444-444444444444',chief:'55555555-5555-5555-5555-555555555555',deputy:'66666666-6666-6666-6666-666666666666',blocked:'77777777-7777-7777-7777-777777777777'};
async function makeDb(){
 const db=new PGlite(); const q=s=>db.query(s).then(r=>r.rows);
 await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;
 create schema auth;create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('app.test_uid',true),'')::uuid$$;
 grant usage on schema auth to authenticated;grant execute on function auth.uid() to authenticated;
 create table public.profiles(user_id uuid primary key,role text not null,active boolean not null default true,approved boolean not null default true,account_access_status text not null default '활성');
 create function public.my_role() returns text language sql stable security definer set search_path=public,pg_temp as $$select role from public.profiles where user_id=auth.uid()$$;
 grant execute on function public.my_role() to authenticated;
 create table public.ai_billing_events(id bigint generated always as identity primary key,platform text not null,amount_krw integer not null,source text,note text,raw_text text,received_at timestamptz not null default now(),charged_at timestamptz,charged_by uuid references public.profiles(user_id));
 alter table public.ai_billing_events enable row level security;
 create policy ai_billing_events_owner_manager_select on public.ai_billing_events for select using (public.my_role() in ('owner','manager'));
 create function public.mark_ai_billing_event_charged(p_event_id bigint) returns timestamptz language plpgsql security definer set search_path=public,pg_temp as $$ declare v_at timestamptz; begin if public.my_role() not in ('owner','manager') then raise exception 'denied'; end if; update public.ai_billing_events set charged_at=now(),charged_by=auth.uid() where id=p_event_id and note='NAVER_AD_STOP' and charged_at is null returning charged_at into v_at; return v_at; end $$;
 grant execute on function public.mark_ai_billing_event_charged(bigint) to authenticated;
 grant select on public.ai_billing_events to authenticated;
 create table public.push_events(id bigint generated always as identity primary key,event_key text unique not null,recipient_id uuid not null,event_type text not null check(event_type = any(array['leave_submitted','leave_status_changed','consultation_received','payment_pending','approval_submitted','notice_published','document_approved']::text[])),payload jsonb not null,status text not null default 'queued',claim_token uuid,claimed_at timestamptz);
 create function public.enqueue_push_event(p_event_key text,p_recipient_id uuid,p_event_type text,p_payload jsonb) returns void language plpgsql security definer set search_path=public,pg_temp as $$begin insert into public.push_events(event_key,recipient_id,event_type,payload) values(p_event_key,p_recipient_id,p_event_type,p_payload) on conflict(event_key) do nothing;end$$;
 revoke all on function public.enqueue_push_event(text,uuid,text,jsonb) from public,anon,authenticated;
 insert into public.profiles(user_id,role,active,approved,account_access_status) values
 ('${ids.owner}','owner',true,true,'활성'),('${ids.manager}','manager',true,true,'활성'),('${ids.off}','manager',true,true,'활성'),('${ids.staff}','staff',true,true,'활성'),('${ids.chief}','chief',true,true,'활성'),('${ids.deputy}','deputy',true,true,'활성'),('${ids.blocked}','manager',true,true,'차단');`);
 return {db,q};
}
async function asUser(db,id){await db.exec(`reset role;select set_config('app.test_uid','${id}',false);set role authenticated;`)}
async function rowsAs(db,q,id,query){await asUser(db,id);return q(query)}
async function mustFail(db,sql){let failed=false;try{await db.exec(sql)}catch{failed=true;await db.exec('rollback')}assert.ok(failed,'expected SQL to be denied');}
{
 const {db,q}=await makeDb();
 try{
  await db.exec(draft);
  const added=await q(`select column_name from information_schema.columns where table_name='ai_billing_events' and column_name in ('account_id','account_name','threshold_krw') order by column_name`);
  assert.deepEqual(added.map(r=>r.column_name),['account_id','account_name','threshold_krw']);
  await q(`insert into public.ai_billing_alert_recipients(user_id,enabled) values ('${ids.off}',false),('${ids.owner}',false)`);
  const ev=await q(`insert into public.ai_billing_events(platform,amount_krw,note,raw_text,account_id,account_name,threshold_krw) values
   ('naver_ads',0,'NAVER_AD_STOP','중단 문자', '2410390','계정A',null),
   ('naver_ads',0,'NAVER_AD_LOW_BALANCE','잔액 문자', '2410390','계정A',100000),
   ('naver_ads',500000,'NAVER_AD_CHARGE','충전 문자', '1970043','계정B',null),
   ('naver_ads',0,'NAVER_AD_UNKNOWN','미지원 문자',null,null,null),
   ('Claude',1800,'USD 1.2',null,null,null,null) returning id,note`);
  assert.equal((await q('select count(*)::int n from public.push_events'))[0].n,6,'3 alert events × owner + default manager');
  assert.ok(!(await q(`select 1 from public.push_events where event_type not in ('ai_billing_stop','ai_billing_low_balance','ai_billing_charge')`)).length);
  assert.equal((await q(`select count(*)::int n from public.push_events where recipient_id='${ids.off}'`))[0].n,0,'disabled manager is excluded');
  assert.equal((await q(`select count(*)::int n from public.push_events where recipient_id='${ids.owner}'`))[0].n,9/3,'owner always receives despite a false config row');
  const stopId=ev.find(r=>r.note==='NAVER_AD_STOP').id,lowId=ev.find(r=>r.note==='NAVER_AD_LOW_BALANCE').id,chargeId=ev.find(r=>r.note==='NAVER_AD_CHARGE').id;
  assert.deepEqual((await rowsAs(db,q,ids.owner,'select note from public.ai_billing_events order by id')).map(r=>r.note),['NAVER_AD_STOP','NAVER_AD_LOW_BALANCE','NAVER_AD_CHARGE','NAVER_AD_UNKNOWN','USD 1.2']);
  assert.equal((await rowsAs(db,q,ids.manager,'select count(*)::int n from public.ai_billing_events'))[0].n,3,'active manager with no opt-out config defaults to selected');
  assert.equal((await rowsAs(db,q,ids.off,'select count(*)::int n from public.ai_billing_events'))[0].n,0,'opted-out manager sees no alert');
  for(const id of [ids.staff,ids.chief,ids.deputy,ids.blocked])assert.equal((await rowsAs(db,q,id,'select count(*)::int n from public.ai_billing_events'))[0].n,0,`non-recipient ${id} sees no alert`);
  assert.equal((await rowsAs(db,q,ids.manager,'select count(*)::int n from public.ai_billing_alert_recipients'))[0].n,0,'manager cannot read recipient settings table');
  await db.exec('reset role');
  const claim='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  const queuedManager=await q(`select id from public.push_events where recipient_id='${ids.manager}' and event_type='ai_billing_low_balance' limit 1`);
  await q(`update public.push_events set claim_token='${claim}',claimed_at=now() where id=${queuedManager[0].id}`);
  assert.equal((await q(`select public.can_dispatch_ai_billing_push(${queuedManager[0].id},'${claim}') as allowed`))[0].allowed,true,'selected manager may dispatch queued notice');
  await q(`insert into public.ai_billing_alert_recipients(user_id,enabled) values ('${ids.manager}',false)`);
  assert.equal((await q(`select public.can_dispatch_ai_billing_push(${queuedManager[0].id},'${claim}') as allowed`))[0].allowed,false,'changed opt-out blocks already queued notice');
  await q(`update public.profiles set role='staff' where user_id='${ids.manager}'`);
  assert.equal((await q(`select public.can_dispatch_ai_billing_push(${queuedManager[0].id},'${claim}') as allowed`))[0].allowed,false,'role change blocks already queued notice');
  await asUser(db,ids.manager);await mustFail(db,`select public.can_dispatch_ai_billing_push(${queuedManager[0].id},'${claim}')`);
  await db.exec('reset role');
  await q(`update public.profiles set role='manager' where user_id='${ids.manager}'`);
  await q(`delete from public.ai_billing_alert_recipients where user_id='${ids.manager}'`);
  await asUser(db,ids.manager);await q(`select public.mark_ai_billing_event_charged(${stopId})`);
  await asUser(db,ids.off);await mustFail(db,`select public.mark_ai_billing_event_charged(${lowId})`);
  await asUser(db,ids.manager);await mustFail(db,`select public.mark_ai_billing_event_charged(${chargeId})`);
  for(const id of [ids.staff,ids.chief,ids.deputy,ids.blocked]){await asUser(db,id);await mustFail(db,`select public.mark_ai_billing_event_charged(${lowId})`)}
  await db.exec('reset role');
  assert.equal((await q(`select count(*)::int n from public.ai_billing_events where charged_at is not null`))[0].n,1,'selected manager may mark stop charged');
  const settingsBefore=(await q('select user_id,enabled from public.ai_billing_alert_recipients order by user_id')).map(r=>`${r.user_id}:${r.enabled}`);
  await db.exec(rollback);
  assert.deepEqual((await q('select user_id,enabled from public.ai_billing_alert_recipients order by user_id')).map(r=>`${r.user_id}:${r.enabled}`),settingsBefore,'rollback preserves owner choices');
  assert.equal((await q(`select count(*)::int n from information_schema.columns where table_name='ai_billing_events' and column_name='threshold_krw'`))[0].n,1,'rollback preserves event data columns');
  const oldFn=(await q(`select pg_get_functiondef('public.mark_ai_billing_event_charged(bigint)'::regprocedure) as def`))[0].def;
  assert.match(oldFn,/my_role\(\) not in \('owner','manager'\)/);assert.match(oldFn,/note='NAVER_AD_STOP'/);
  assert.equal((await q(`select count(*)::int n from pg_trigger where tgname='ai_billing_alert_push_after_insert' and not tgisinternal`))[0].n,0,'rollback removes only this trigger');
  await db.exec(draft);
  assert.equal((await q(`select count(*)::int n from pg_trigger where tgname='ai_billing_alert_push_after_insert' and not tgisinternal`))[0].n,1,'draft reapplies after rollback');
 }finally{await db.close()}
}
{
 const {db,q}=await makeDb();
 try{
  await q('alter table public.ai_billing_events drop column raw_text');
  let failed=false;try{await db.exec(draft)}catch{failed=true;await db.exec('rollback')}
  assert.ok(failed,'drifted schema must fail closed');
  assert.equal((await q(`select count(*)::int n from information_schema.columns where table_name='ai_billing_events' and column_name='account_id'`))[0].n,0,'preflight failure rolls back all DDL');
 }finally{await db.close()}
}
{
 const {db,q}=await makeDb();
 try{
  await db.exec(draft);
  await db.exec(`create or replace function public.enqueue_push_event(p_event_key text,p_recipient_id uuid,p_event_type text,p_payload jsonb) returns void language plpgsql security definer set search_path=public,pg_temp as $$begin raise exception 'injected push outage';end$$;`);
  const rows=await q(`insert into public.ai_billing_events(platform,amount_krw,note) values('naver_ads',0,'NAVER_AD_STOP') returning id`);
  assert.equal(rows.length,1,'push failure does not roll back SMS event storage');
 }finally{await db.close()}
}
console.log('AI_BILLING_ALERTS_PGLITE_PASS');
