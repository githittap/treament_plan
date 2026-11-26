// 리뷰 요청 문자 — 병원 PC 중계(db/review_sms_relay_20261127.sql) 시험. 바탕은 pglite-review-sms.mjs와 같음.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
const {PGlite}=await import(pathToFileURL(path.join(process.env.PGLITE_PACKAGE_ROOT,'dist/index.js')).href);
const db=new PGlite(),q=sql=>db.query(sql).then(r=>r.rows);
const ids={owner:'10000000-0000-4000-8000-000000000001',desk:'10000000-0000-4000-8000-000000000004',staff:'10000000-0000-4000-8000-000000000005'};
const as=async who=>{await db.exec('reset role');await db.exec(`select set_config('app.test_uid','${ids[who]||''}',false);set role ${who==='anon'?'anon':who==='service'?'service_role':'authenticated'}`);};
const reject=async(sql,re)=>{await assert.rejects(q(sql),re);};
const setting=async(key,value)=>{await db.exec('reset role');await db.query('update public.app_settings set value=$1 where key=$2',[value,key]);};
const read=file=>fs.readFileSync(file,'utf8');
const prepare=phones=>q(`select * from public.review_sms_prepare(array[${phones.map(p=>`'${p}'`).join(',')}]::text[])`);
const claim=()=>q('select * from public.review_sms_relay_claim(10)');
const outbox=async()=>{await db.exec('reset role');return q('select * from public.review_sms_outbox order by created_at');};
try{
 await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;
 create table auth.users(id uuid primary key);create table public.profiles(user_id uuid primary key,role text,dept text,active boolean default true,approved boolean default true,account_access_status text default '활성');
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('app.test_uid',true),'')::uuid$$;
 grant usage on schema auth to authenticated,service_role;grant execute on function auth.uid() to authenticated,service_role;
 create function public.employee_hub_access_allowed() returns boolean language sql stable security definer set search_path='' as $$select exists(select 1 from public.profiles p where p.user_id=auth.uid() and p.active and p.approved and p.account_access_status='활성')$$;
 create function public.recall_user_allowed(p_user_id uuid) returns boolean language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.profiles p where p.user_id=p_user_id and p.active is true and p.approved is true
   and (p.role in ('manager','chief','owner') or (p.role='staff' and p.dept='데스크')))$$;
 create table public.app_settings(key text primary key,value text not null,label text,updated_at timestamptz default now());
 grant select on public.app_settings to authenticated,service_role;`);
 for(const [who,id] of Object.entries(ids))await db.exec(`insert into auth.users values('${id}');insert into public.profiles(user_id,role,dept) values('${id}','${who==='desk'?'staff':who}','${who==='desk'?'데스크':'진료실'}');`);
 await db.exec(read('db/review_sms_20261127.sql'));
 const relay=read('db/review_sms_relay_20261127.sql');await db.exec(relay);await db.exec(relay);
 assert.equal((await q("select value from public.app_settings where key='review_sms.transport'"))[0].value,'pc','기본 보내는 길은 병원 PC 중계');
 await setting('review_sms.sender','010-3954-1852');await setting('review_sms.hours','00:00-23:59');await setting('review_sms.test_numbers','["01011112222"]');

 // 보낼 줄만 대기함에 들어가고, 막힌 줄은 안 들어간다. 대기함은 직원·화면이 못 읽는다.
 await as('desk');let rows=await prepare(['01011112222','01033334444']);
 assert.deepEqual(rows.map(r=>r.status),['pending','blocked_test_only']);
 let box=await outbox();assert.equal(box.length,1);assert.equal(box[0].log_id,rows[0].log_id);assert.equal(box[0].to_number,'01011112222');assert.equal(box[0].sender,'01039541852');assert.equal(box[0].claimed_at,null);
 for(const who of ['desk','owner']){await as(who);await reject('select * from public.review_sms_outbox',/permission denied/);}
 for(const fn of ['select * from public.review_sms_relay_claim(10)',"select public.review_sms_relay_done('[]'::jsonb)","select public.review_sms_relay_heartbeat('{}'::jsonb)"]){
  await as('owner');await reject(fn,/permission denied/);await as('anon');await reject(fn,/permission denied/);
 }

 // 중계가 꺼내면 다시는 안 꺼낸다(두 번 나가는 것 막기). 결과를 적으면 대기함에서 번호가 지워진다.
 await as('service');let got=await claim();assert.equal(got.length,1);assert.equal(got[0].to_number,'01011112222');assert.match(got[0].message_text,/고객님/);
 await as('service');assert.equal((await claim()).length,0,'claimed row is not handed out twice');
 await as('service');assert.equal((await q(`select public.review_sms_relay_done('[{"log_id":"${got[0].log_id}","status":"sent","provider_id":"M1","error":null}]'::jsonb) n`))[0].n,1);
 assert.equal((await outbox()).length,0,'number removed after result');
 await db.exec('reset role');assert.equal((await q(`select status,provider_id from public.review_sms_log where id='${got[0].log_id}'`))[0].status,'sent');

 // 시간 밖이면 안 꺼낸다(대기함에는 남음).
 await as('desk');rows=await prepare(['01011112222']);
 const hour=Number((await q(`select extract(hour from now() at time zone 'Asia/Seoul')::int h`))[0].h);
 await setting('review_sms.hours',hour<12?'13:00-14:00':'01:00-02:00');
 await as('service');assert.equal((await claim()).length,0,'outside hours nothing is claimed');
 assert.equal((await outbox()).length,1);
 await setting('review_sms.hours','00:00-23:59');

 // 2시간 넘게 대기한 줄 · 꺼낸 뒤 10분 넘게 결과가 없는 줄은 보내지 않고 실패로 닫고 번호를 지운다.
 await db.exec('reset role');await db.exec(`update public.review_sms_outbox set created_at=now()-interval '3 hours'`);
 await as('desk');const fresh=(await prepare(['01011112222']))[0];
 await as('service');got=await claim();assert.deepEqual(got.map(r=>r.log_id),[fresh.log_id],'old row expired, fresh row claimed');
 await db.exec('reset role');assert.match((await q(`select status,error from public.review_sms_log where id='${rows[0].log_id}'`))[0].error,/2시간/);
 await db.exec('reset role');await db.exec(`update public.review_sms_outbox set claimed_at=now()-interval '11 minutes'`);
 await as('service');assert.equal((await claim()).length,0);
 await db.exec('reset role');const lost=(await q(`select status,error from public.review_sms_log where id='${fresh.log_id}'`))[0];assert.equal(lost.status,'failed');assert.match(lost.error,/솔라피 발송 내역/);
 assert.equal((await outbox()).length,0);

 // 상태 적기: 허브 설정에 JSON + seen_at.
 await as('service');await q(`select public.review_sms_relay_heartbeat('{"balance":0,"point":300,"error":null}'::jsonb)`);
 const st=JSON.parse((await q("select value from public.app_settings where key='review_sms.relay_status'"))[0].value);assert.equal(st.point,300);assert.ok(st.seen_at);
 await as('service');await reject(`select public.review_sms_relay_heartbeat('[1]'::jsonb)`,/must be object/);

 // 보내는 길을 edge로 돌리면(되돌리기) 대기함에 안 넣는다.
 await db.exec('reset role');await db.exec(read('db/review_sms_relay_20261127_rollback.sql'));
 await as('desk');rows=await prepare(['01011112222']);assert.equal(rows[0].status,'pending');assert.equal(rows[0].to_number,'01011112222');
 assert.equal((await outbox()).length,0,'edge transport does not queue');
 console.log('PGLITE_REVIEW_SMS_RELAY_PASS: idempotent relay migration, pc default, queue only pending rows, outbox hidden from staff/owner/anon, service-only claim/done/heartbeat, single claim, number wiped after result, hours gate, 2h expiry, 10m lost-claim close, heartbeat json, edge rollback');
}catch(error){console.error('PGLITE_REVIEW_SMS_RELAY_FAIL',error.message,error.detail||'',error.position||'',error.stack);process.exitCode=1;}finally{await db.close();}
