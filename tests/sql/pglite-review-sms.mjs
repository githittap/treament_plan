import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
const {PGlite}=await import(pathToFileURL(path.join(process.env.PGLITE_PACKAGE_ROOT,'dist/index.js')).href);
const db=new PGlite(),q=sql=>db.query(sql).then(r=>r.rows);
const ids={owner:'10000000-0000-4000-8000-000000000001',manager:'10000000-0000-4000-8000-000000000002',chief:'10000000-0000-4000-8000-000000000003',desk:'10000000-0000-4000-8000-000000000004',staff:'10000000-0000-4000-8000-000000000005',blocked:'10000000-0000-4000-8000-000000000006'};
const as=async who=>{await db.exec('reset role');await db.exec(`select set_config('app.test_uid','${ids[who]||''}',false);set role ${who==='anon'?'anon':who==='service'?'service_role':'authenticated'}`);};
const reject=async(sql,re)=>{await assert.rejects(q(sql),re);};
const setting=async(key,value)=>{await db.exec('reset role');await db.query('update public.app_settings set value=$1 where key=$2',[value,key]);};
const read=file=>fs.readFileSync(file,'utf8');
const prepare=(phones,name)=>q(`select * from public.review_sms_prepare(array[${phones.map(p=>`'${p}'`).join(',')}]::text[]${name===undefined?'':`,'${name}'`})`);
try{
 await db.exec(`create role anon;create role authenticated;create role service_role;create schema auth;
 create table auth.users(id uuid primary key);create table public.profiles(user_id uuid primary key,role text,dept text,active boolean default true,approved boolean default true,account_access_status text default '활성');
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('app.test_uid',true),'')::uuid$$;
 grant usage on schema auth to authenticated,service_role;grant execute on function auth.uid() to authenticated,service_role;
 create function public.employee_hub_access_allowed() returns boolean language sql stable security definer set search_path='' as $$select exists(select 1 from public.profiles p where p.user_id=auth.uid() and p.active and p.approved and p.account_access_status='활성')$$;
 create function public.recall_user_allowed(p_user_id uuid) returns boolean language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.profiles p where p.user_id=p_user_id
   and p.active is true and p.approved is true and p.account_access_status is distinct from '차단'
   and (p.role in ('manager','chief','owner') or (p.role='staff' and
     (p.dept='데스크' or p.user_id='212cef7e-8aab-4f72-b78d-4dfca59581e0'::uuid))))$$;
 create table public.app_settings(key text primary key,value text not null,label text);
 grant select on public.app_settings to authenticated;`);
 for(const [who,id] of Object.entries(ids))await db.exec(`insert into auth.users values('${id}');insert into public.profiles(user_id,role,dept,account_access_status) values('${id}','${['desk','blocked'].includes(who)?'staff':who}','${['desk','blocked'].includes(who)?'데스크':'진료실'}','${who==='blocked'?'차단':'활성'}');`);
 const migration=read('db/review_sms_20261127.sql');await db.exec(migration);await db.exec(migration);
 const settings=Object.fromEntries((await q("select key,value from public.app_settings where key like 'review_sms.%'")).map(r=>[r.key,r.value]));
 assert.equal(settings['review_sms.live_enabled'],'false','starts in test mode');
 assert.equal(settings['review_sms.test_numbers'],'[]');
 assert.equal(settings['review_sms.sender'],'');
 assert.match(settings['review_sms.review_url'],/^https:\/\/g\.page\/r\//);
 assert.match(settings['review_sms.template'],/\{name\}/);assert.match(settings['review_sms.template'],/\{link\}/);
 // 문구 원문에는 대가·별점 낱말이 없다.
 assert.equal((await q(`select public.review_sms_wording_blocked(value) b from public.app_settings where key='review_sms.template'`))[0].b,false);

 // 발신번호가 없으면 보낼 줄이 생기지 않는다.
 await as('desk');let rows=await prepare(['010-1111-2222']);
 assert.equal(rows.length,1);assert.equal(rows[0].status,'not_configured');assert.equal(rows[0].to_number,null);assert.equal(rows[0].mode,'test');

 await setting('review_sms.sender','041-555-1234');await setting('review_sms.hours','00:00-23:59');await setting('review_sms.test_numbers','["010-1111-2222"]');
 await as('desk');rows=await prepare(['010-1111-2222','01033334444','010 1111 2222']);
 assert.equal(rows.length,2,'same number in one batch is sent once');
 assert.equal(rows[0].status,'pending');assert.equal(rows[0].to_number,'01011112222');assert.equal(rows[0].sender,'0415551234');assert.equal(rows[0].phone_tail,'2222');
 assert.match(rows[0].message_text,/^\[아산정플란트치과\] 고객님,/);assert.match(rows[0].message_text,/https:\/\/g\.page\/r\/CUlwa4ajcDI0EBM\/review$/);
 assert.equal(rows[1].status,'blocked_test_only','test mode sends only to internal numbers');assert.equal(rows[1].to_number,null);assert.equal(rows[1].message_text,null);
 const named=await prepare(['01011112222'],'홍길동');assert.match(named[0].message_text,/홍길동님,/);

 await as('desk');await reject(`select * from public.review_sms_prepare(array['02-123-4567']::text[])`,/invalid phone/);
 await as('desk');await reject(`select * from public.review_sms_prepare(array['01011112222']::text[],'이름이너무길어서스무자를훌쩍넘어가는환자이름입니다')`,/name invalid/);
 await as('desk');await reject(`select * from public.review_sms_prepare(array[${Array.from({length:21},(_,i)=>`'0101111${String(1000+i)}'`).join(',')}]::text[])`,/1-20/);
 await as('desk');await reject(`select * from public.review_sms_prepare('{}'::text[])`,/1-20/);

 for(const who of ['owner','manager','chief']){await as(who);assert.equal((await prepare(['01011112222']))[0].status,'pending',`${who} permitted`);}
 for(const who of ['staff','blocked']){await as(who);await reject(`select * from public.review_sms_prepare(array['01011112222']::text[])`,/access required/);await as(who);await reject('select * from public.review_sms_recent()',/access required/);}
 await as('anon');await reject(`select * from public.review_sms_prepare(array['01011112222']::text[])`,/permission denied/);
 await as('desk');await reject('select * from public.review_sms_log',/permission denied/);
 await as('desk');await reject(`select public.review_sms_finish('[]'::jsonb)`,/permission denied/);

 // 결과 적기: 서버 함수만, pending 줄만, 처음 결과 유지.
 await as('desk');const first=(await prepare(['01011112222']))[0];
 await as('service');assert.equal((await q(`select public.review_sms_finish('[{"log_id":"${first.log_id}","status":"sent","provider_id":"M4V1","error":null}]'::jsonb) n`))[0].n,1);
 assert.equal((await q(`select public.review_sms_finish('[{"log_id":"${first.log_id}","status":"failed","provider_id":null,"error":"늦은 결과"}]'::jsonb) n`))[0].n,0,'finished row is not overwritten');
 assert.equal((await q(`select public.review_sms_finish('[{"log_id":"${rows[1].log_id}","status":"sent","provider_id":"X","error":null}]'::jsonb) n`))[0].n,0,'blocked row cannot be marked sent');
 await db.exec('reset role');assert.equal((await q(`select status,provider_id from public.review_sms_log where id='${first.log_id}'`))[0].status,'sent');

 // 실제 발송 켬: 아무 번호나 보낼 줄이 되고, 같은 번호는 기간 안에 다시 안 보냄. 시험 모드 기록은 막지 않는다.
 await setting('review_sms.live_enabled','true');
 await as('desk');const live=(await prepare(['010-5555-6666']))[0];assert.equal(live.status,'pending');assert.equal(live.mode,'live');
 await as('service');await q(`select public.review_sms_finish('[{"log_id":"${live.log_id}","status":"sent","provider_id":"L1","error":null}]'::jsonb)`);
 await as('desk');assert.equal((await prepare(['01055556666']))[0].status,'blocked_recent');
 await as('desk');assert.equal((await prepare(['01011112222']))[0].status,'pending','test-mode history does not block live');
 await db.exec('reset role');await db.exec(`update public.review_sms_log set created_at=now()-interval '181 days' where id='${live.log_id}'`);
 await as('desk');assert.equal((await prepare(['01055556666']))[0].status,'pending','cooldown ends after configured days');
 await db.exec('reset role');await db.exec("update public.review_sms_log set status='failed' where status='pending'");
 await as('service');
 await setting('review_sms.cooldown_days','abc');await as('desk');assert.ok(['pending','blocked_recent'].includes((await prepare(['01077778888']))[0].status),'bad cooldown falls back');

 // 대가·별점 문구, 주소 없음, 시간 밖은 아무에게도 안 보냄.
 await setting('review_sms.template','{name}님 리뷰 남기시면 다음 진료 할인 쿠폰 드립니다 {link}');
 await as('desk');assert.equal((await prepare(['01099990000']))[0].status,'blocked_wording');
 await setting('review_sms.template','{name}님 별점 5점 부탁드립니다 {link}');await as('desk');assert.equal((await prepare(['01099990000']))[0].status,'blocked_wording');
 await setting('review_sms.template',settings['review_sms.template']);await setting('review_sms.review_url','javascript:alert(1)');
 await as('desk');assert.equal((await prepare(['01099990000']))[0].status,'blocked_wording','bad url blocks');
 await setting('review_sms.review_url',settings['review_sms.review_url']);
 const hour=Number((await q(`select extract(hour from now() at time zone 'Asia/Seoul')::int h`))[0].h);
 await setting('review_sms.hours',hour<12?'13:00-14:00':'01:00-02:00');
 await as('desk');assert.equal((await prepare(['01099990000']))[0].status,'blocked_hours');
 await setting('review_sms.hours','25:00-26:00');await as('desk');assert.ok(['pending','blocked_hours'].includes((await prepare(['01099990001']))[0].status),'bad hours fall back to 09-20');
 await setting('review_sms.test_numbers','not json');await setting('review_sms.live_enabled','false');await setting('review_sms.hours','00:00-23:59');
 await as('desk');assert.equal((await prepare(['01011112222']))[0].status,'blocked_test_only','broken test list blocks everyone');

 // 최근 기록: 끝 4자리만, 문구·지문 없음.
 await as('manager');const recent=await q('select * from public.review_sms_recent(5)');assert.equal(recent.length,5);
 assert.ok(recent.every(r=>!('phone_hash' in r)&&!('message_text' in r)&&/^[0-9]{4}$/.test(r.phone_tail)));
 await db.exec('reset role');assert.equal((await q("select count(*)::int n from public.review_sms_log where phone_hash !~ '^[0-9a-f]{32}$' or message_text ~ '010[0-9]{8}'"))[0].n,0,'no raw phone stored');
 const before=(await q('select count(*)::int n from public.review_sms_log'))[0].n;

 await db.exec(read('db/review_sms_20261127_rollback.sql'));
 await as('owner');await reject(`select * from public.review_sms_prepare(array['01011112222']::text[])`,/access required/);
 await db.exec('reset role');assert.equal((await q('select count(*)::int n from public.review_sms_log'))[0].n,before,'rollback preserves log');
 console.log('PGLITE_REVIEW_SMS_PASS: idempotent migration, test-mode default, sender gate, internal-number allowlist, dedupe, name/phone validation, desk/admin ACL, staff/anon denial, service-only finish, live cooldown, wording/url/hours gates, masked recent log, rollback preservation');
}catch(error){console.error('PGLITE_REVIEW_SMS_FAIL',error.message,error.detail||'',error.position||'',error.stack);process.exitCode=1;}finally{await db.close();}
