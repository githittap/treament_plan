import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {createDentwebHandler} from '../../supabase/functions/dentweb-sync/payload.mjs';

const pkg=process.env.PGLITE_PACKAGE_ROOT;
if(!pkg)throw new Error('PGLITE_PACKAGE_ROOT required');
const {PGlite}=await import(pathToFileURL(path.join(pkg,'dist/index.js')).href);
const db=new PGlite();
const sql=file=>fs.readFileSync('db/'+file+'.sql','utf8');
const rows=(query,params)=>db.query(query,params).then(result=>result.rows);
const id=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0');
const user={owner:id(1),manager:id(2),chief:id(3),staff:id(4),deputy:id(5),inactive:id(6),pending:id(7),blocked:id(8)};
const booking=id(11),missing=id(12),generic=id(13),fresh=id(14);
const asUser=async role=>{
  await db.exec('reset role');
  await rows("select set_config('app.test_uid',$1,false)",[user[role]]);
  await db.exec('set role authenticated');
};
const service=()=>db.exec('reset role;set role service_role');
const matchRows=()=>rows('select inbox_id,appointment_found,visited,match_basis from public.dentweb_inbox_matches order by inbox_id');
const monthRows=()=>rows('select month::text,path,first_visit_count from public.dentweb_monthly_first_visits order by month,path');
const matchBatch=batch=>rows('select public.dentweb_inbox_match_upsert($1::jsonb)',[JSON.stringify(batch)]);
const monthBatch=batch=>rows('select public.dentweb_monthly_first_visits_replace($1::jsonb)',[JSON.stringify(batch)]);
const match=(inbox_id,more={})=>({inbox_id,appointment_found:true,appointment_at:'2026-11-03T14:30:00+09:00',visited:true,visited_at:'2026-11-03T14:30:00+09:00',match_basis:'phone8_date',checked_at:'2026-11-21T14:00:00.1234567Z',...more});
const matchOn=(inbox_id,day,more={})=>match(inbox_id,{appointment_at:day+'T14:30:00+09:00',visited_at:day+'T14:30:00+09:00',...more});
const month=(month,path,first_visit_count,checked_at='2026-11-17T04:30:00Z')=>({month,path,first_visit_count,checked_at});
const syncKey='synthetic-pglite-integration';
const sync=createDentwebHandler({
  getSecret:()=>syncKey,
  save:async(rpc,{p_rows})=>{
    if(rpc==='dentweb_inbox_match_upsert')await matchBatch(p_rows);
    else if(rpc==='dentweb_monthly_first_visits_replace')await monthBatch(p_rows);
    else throw new Error('unexpected RPC');
  }
});
const send=(kind,publishedRows)=>sync(new Request('https://test.invalid/dentweb-sync',{
  method:'POST',headers:{'x-dentweb-sync-key':syncKey},body:JSON.stringify({kind,rows:publishedRows})
}));
const noFacts={appointment_found:false,appointment_at:null,visited:false,visited_at:null};
const snapshotInbox=()=>rows('select id,status,updated_at::text,assigned_to,handled_at,dentweb_entered_at from public.consultation_inbox order by id');
const normalized=key=>rows('select kakao_booking_name name,kakao_booking_contact_digits contact,kakao_booking_schedule schedule,kakao_booking_product product from public.consultation_inbox where id=$1',[key]).then(result=>result[0]);
const noNormalized={name:null,contact:null,schedule:null,product:null};

try{
  await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;
    alter default privileges in schema public grant all on tables to anon,authenticated,service_role;
    alter default privileges in schema public grant all on functions to anon,authenticated,service_role;
    create schema auth;create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('app.test_uid',true),'')::uuid$$;
    grant usage on schema auth to authenticated;
    create table public.profiles(user_id uuid primary key,role text not null,active boolean,approved boolean,account_access_status text);
    create function public.my_role() returns text language sql stable security definer set search_path='' as $$select role from public.profiles where user_id=auth.uid()$$;
    create function public.employee_hub_access_allowed() returns boolean language sql stable security definer set search_path='' as $$
      select exists(select 1 from public.profiles where user_id=auth.uid() and active and approved and account_access_status='활성')$$;
    create table public.consultation_journals(id uuid primary key default gen_random_uuid(),patient_name text not null,contact_phone text,
      source_sheet text not null,consulted_on date not null,status text not null,consultation_note text not null,next_action text,
      author_id uuid not null default auth.uid(),created_at timestamptz default now(),updated_at timestamptz default now());`);
  for(const [role,uid] of Object.entries(user)){
    await rows('insert into auth.users values ($1)',[uid]);
    await rows('insert into public.profiles values ($1,$2,$3,$4,$5)',
      [uid,['inactive','pending','blocked'].includes(role)?'manager':role,role!=='inactive',role!=='pending',role==='blocked'?'차단':'활성']);
  }
  await db.exec(sql('consultation_inbox').replace('create extension if not exists pgcrypto with schema extensions;',()=>
    `create schema extensions;create function extensions.digest(text,text) returns bytea language sql immutable as $$select decode(md5($1)||md5($1),'hex')$$;`));
  await db.exec(`drop policy consultation_inbox_select on public.consultation_inbox;
    create policy consultation_inbox_select on public.consultation_inbox for select to authenticated using (public.employee_hub_access_allowed());
    create policy deputy_block on public.consultation_inbox as restrictive for all to authenticated
      using (public.my_role()<>'deputy') with check (public.my_role()<>'deputy');`);
  await db.exec(sql('consultation_inbox_handled'));
  await db.exec(sql('consultation_inbox_dentweb_stamp'));
  await db.exec(sql('hr_settings'));
  await db.exec(sql('marketing_expenses_draft'));
  await db.exec(sql('marketing_manager_view_20261003'));
  const insertInbox=(key,eventId,message,receivedAt='2026-11-21T05:00:00Z')=>rows(`insert into public.consultation_inbox
    (id,source,external_event_id,sender_name,contact,message,received_at,updated_at)
    values ($1,'kakao',$2,'합성 발신자','01000000000',$3,$4,'2026-10-01T00:00:00Z')`,[key,eventId,message,receivedAt]);
  await insertInbox(booking,'kbook-with-details','예약 알림\r\n예약자 연락처：\r\n(010) 0000-1234\r\n예약자명: 합성 예약\r\n상품명\r\n\r\n합성 상품\r\n예약일시: 2026.11.03(화) 14:30');
  await insertInbox(missing,'kbook-no-contact','예약 알림\n예약자 연락처:\n상품명: 합성 상품 2');
  await insertInbox(generic,'kakao-chat','예약자명: 합성\n연락처: 01000001234');
  const prefixFixtures=[
    ['▸ 예약자명 : 합성 이름\n▸ 예약자연락처 : 010-0000-1234\n▸ 예약일시 : 2026.11.03(화) 14:30\n▸ 상품명 : 합성 상품', {name:'합성 이름',contact:'01000001234',schedule:'2026.11.03(화) 14:30',product:'합성 상품'}],
    ['▸ 예약자명 : 합성 마스크\n▸ 예약자연락처 : 010-****-1234\n▸ 예약일시 : 2026.11.03(화) 14:30\n▸ 상품명 : 합성 상품', {name:'합성 마스크',contact:null,schedule:'2026.11.03(화) 14:30',product:'합성 상품'}],
    ['▸ 예약자연락처 : 010-0000-1111\n▸ 예약자 연락처 : 010-0000-2222',{...noNormalized}],
    ['▸ 예약자연락처 : 010-0000-1234\n▸ 예약자 연락처 : +82 (10) 0000-1234',{...noNormalized,contact:'01000001234'}],
    ['▸ 예약자연락처 : 010-****-1234\n연락처: 010-0000-1234',{...noNormalized}],
    ['연락처: 010-0000-1234\n▸ 예약자연락처 : 010-****-1234',{...noNormalized}],
    ['▸ 예약자 연락처: 010-0000-1111\n▸ 예약자연락처: 010-0000-2222',{...noNormalized}],
    ['▸ 예약자연락처 :\n▸ 예약자명 : 합성',{...noNormalized,name:'합성'}],
    ['예약자연락처: 010-0000-1234',{...noNormalized}],
    ['▸ 지원하지 않는 내용 : 합성',{...noNormalized}],
    ['메모 ▸ 예약자명 : 합성',{...noNormalized}]
  ];
  for(let n=0;n<6;n++)prefixFixtures.push([`▸ 알 수 없는 항목 ${n} : 합성`,{...noNormalized}]);
  for(let n=0;n<prefixFixtures.length;n++)await insertInbox(id(200+n),'kbook-prefix-'+n,prefixFixtures[n][0]);
  const before=await snapshotInbox();
  const migration=sql('dentweb_sync_20261121');
  await db.exec(migration);
  await db.exec(migration);
  assert.deepEqual(await snapshotInbox(),before,'generated backfill preserves audit and handling fields');
  assert.deepEqual(await normalized(id(200)),noNormalized,'existing prefixed values were missed by the deployed parser');
  const unchanged=()=>rows(`select id,to_jsonb(i)-'kakao_booking_name'-'kakao_booking_contact_digits'-'kakao_booking_schedule'-'kakao_booking_product' as source from public.consultation_inbox i order by id`);
  const originalRows=await unchanged();
  const schemaSecurity=()=>rows(`select c.relrowsecurity,c.relforcerowsecurity,c.relacl::text as acl,p.proacl::text as function_acl,
    (select json_agg(json_build_array(t.tgname,t.tgenabled) order by t.tgname) from pg_trigger t where t.tgrelid=c.oid and not t.tgisinternal) as triggers,
    (select json_agg(json_build_array(a.attname,a.attacl::text) order by a.attname) from pg_attribute a where a.attrelid=c.oid and a.attnum>0 and not a.attisdropped) as columns,
    (select json_agg(json_build_array(q.policyname,q.roles,q.cmd,q.qual,q.with_check) order by q.policyname) from pg_policies q where q.schemaname='public' and q.tablename='consultation_inbox') as policies
    from pg_class c join pg_proc p on p.oid='public.dentweb_kakao_booking_value(text,text,text,text)'::regprocedure where c.oid='public.consultation_inbox'::regclass`);
  const securityBefore=await schemaSecurity();
  await db.exec(`create temp table update_audit(n integer); create function public.test_inbox_update_audit() returns trigger language plpgsql as $$begin insert into update_audit values(1);return new;end$$; create trigger test_inbox_update_audit after update on public.consultation_inbox for each row execute function public.test_inbox_update_audit();`);
  const prefixFix=sql('dentweb_kakao_prefix_20261122'), prefixRollback=sql('dentweb_kakao_prefix_20261122_rollback');
  await db.exec(prefixFix);
  for(let n=0;n<prefixFixtures.length;n++)assert.deepEqual(await normalized(id(200+n)),prefixFixtures[n][1],`prefix fixture ${n}`);
  assert.deepEqual(await unchanged(),originalRows,'every original column, status and audit value is preserved');
  assert.equal((await rows('select count(*)::int n from update_audit'))[0].n,0,'ALTER never fires UPDATE triggers');
  await db.exec(prefixFix);
  assert.deepEqual(await unchanged(),originalRows,'reapply preserves all source and audit columns');
  await db.exec(prefixRollback.replace(/commit;\s*$/,'rollback;'));
  assert.deepEqual(await normalized(id(200)),prefixFixtures[0][1],'transaction rollback preserves the previously committed derived values');
  await db.exec(prefixRollback);
  assert.deepEqual(await normalized(id(200)),noNormalized,'rollback restores old parser and old generated values');
  assert.deepEqual(await unchanged(),originalRows,'rollback preserves all source and audit columns');
  await db.exec(prefixFix);
  for(let n=0;n<prefixFixtures.length;n++)assert.deepEqual(await normalized(id(200+n)),prefixFixtures[n][1],`reapply prefix fixture ${n}`);
  assert.equal((await rows('select count(*)::int n from update_audit'))[0].n,0,'apply/reapply/rollback never fires UPDATE triggers');
  await db.exec('drop trigger test_inbox_update_audit on public.consultation_inbox;drop function public.test_inbox_update_audit();');
  assert.deepEqual(await schemaSecurity(),securityBefore,'RLS, grants and trigger states remain unchanged');
  for(let n=0;n<prefixFixtures.length;n++)await rows('delete from public.consultation_inbox where id=$1',[id(200+n)]);
  assert.deepEqual(await snapshotInbox(),before.filter(row=>!prefixFixtures.some((_,n)=>row.id===id(200+n))));
  assert.deepEqual(await normalized(booking),{name:'합성 예약',contact:'01000001234',schedule:'2026.11.03(화) 14:30',product:'합성 상품'});
  assert.deepEqual(await normalized(missing),{...noNormalized,product:'합성 상품 2'},'never use routing number or digits on next labelled line');
  assert.deepEqual(await normalized(generic),noNormalized);
  const sameContact=id(80),conflictingContact=id(81);
  await insertInbox(sameContact,'kbook-same-contact-formats',
    '예약자명: 합성\n연락처: 010-0000-1234\n예약자 연락처: +82 (10) 0000-1234\n일정: 2026.11.25 14:30');
  await insertInbox(conflictingContact,'kbook-conflicting-contacts',
    '예약자명: 합성\n연락처: 010-0000-1111\n예약자 연락처: 010-0000-2222\n일정: 2026.11.25 14:30');
  assert.equal((await normalized(sameContact)).contact,'01000001234','format-only variants of one Korean number normalize to one contact');
  assert.equal((await normalized(conflictingContact)).contact,null,'distinct normalized contacts stay unknown for automatic matching');
  await insertInbox(fresh,'kbook-new','예약일시:\n11월 25일 (수) 오후 2:00\n예약자: 합성 신규\n전화번호: +82 (10) 0000-1234\n예약상품: 합성 진료');
  const scheduleCases=[
    ['알림 발송 시각: 2026.11.03 09:00',null],
    ['일정:\n알림 발송 시각: 2026.11.03 09:00',null],
    ['일정:\n\n2026.11.03 09:00',null],
    ['예약일시: 2026.11.03 09:00\n방문일시: 2026.11.04 09:00',null],
    ['예약일시: 2026.11.03 09:00\n방문일시: 미정',null],
    ['예약일시: 2026.11.03 09:00\n일정: 2026.11.03 09:00',null],
    ['예약일시: 2026.11.03 09:00 / 2026.11.04 09:00',null],
    ['일정: 2026.02.29 09:00',null],
    ['일정: 2026.11.03 25:00',null],
    ['일정: 2026.11.03 오후 13:00',null],
    ['일정: 2026.11.03 09:60',null],
    ['일정: 3주 뒤 토요일 오전 9:00',null],
    ['예약 일시: 2026년 11월 3일 (화) 오후 2:30','2026년 11월 3일 (화) 오후 2:30'],
    ['방문일시: 2026-11-03T05:30:00Z','2026-11-03T05:30:00Z'],
    ['방문일시: 2026-11-03T25:30:00Z',null],
    ['방문일시: 2026-11-03T05:30:00+14:01',null]
  ];
  const scheduleCasesActual=[];
  for(const [index,[message]] of scheduleCases.entries()){
    const key=id(20+index);
    await insertInbox(key,'kbook-schedule-fixture-'+index,'예약자명: 합성\n연락처: 01000001234\n'+message);
    scheduleCasesActual.push((await normalized(key)).schedule);
  }
  await service();
  const positiveWithoutSchedule=await send('inbox_match',[match(id(20))]);
  await db.exec('reset role');
  const positiveRows=await matchRows();
  // Clean up before the other match and rollback assertions run.
  await rows('delete from public.consultation_inbox where id=$1',[id(20)]);
  assert.deepEqual({schedules:scheduleCasesActual,positiveAccepted:positiveWithoutSchedule.status===200,positiveWritten:positiveRows.length!==0},
    {schedules:scheduleCases.map(([,expected])=>expected),positiveAccepted:false,positiveWritten:false},
    'only an explicit, valid reservation schedule can create positive DentWeb evidence');
  assert.deepEqual(await normalized(fresh),{name:'합성 신규',contact:'821000001234',schedule:'11월 25일 (수) 오후 2:00',product:'합성 진료'});

  const matchColumns=await rows(`select column_name from information_schema.columns
    where table_schema='public' and table_name='dentweb_inbox_matches' order by ordinal_position`);
  assert.deepEqual(matchColumns.map(row=>row.column_name).sort(),
    ['appointment_at','appointment_found','checked_at','inbox_id','match_basis','visited','visited_at']);
  await service();
  await matchBatch([match(booking),match(missing,{...noFacts,match_basis:'insufficient'})]);
  await db.exec('reset role');
  const beforeDateMismatch=await matchRows();
  await service();
  await assert.rejects(matchBatch([matchOn(booking,'2026-11-04')]),/date|schedule/i);
  await assert.rejects(matchBatch([match(booking,{visited_at:'2026-11-04T14:30:00+09:00'})]),/date|schedule/i);
  const dateMismatchHttp=await send('inbox_match',[matchOn(booking,'2026-11-04')]);
  assert.notEqual(dateMismatchHttp.status,200,'HTTP path rejects positive appointment dates outside the stored schedule');
  await db.exec('reset role');
  assert.deepEqual(await matchRows(),beforeDateMismatch,'date mismatch leaves existing facts unchanged');
  await service();
  await assert.rejects(matchBatch([matchOn(booking,'2026-11-03'),matchOn(fresh,'2026-11-04')]),/date|schedule/i);
  await db.exec('reset role');
  assert.deepEqual(await matchRows(),beforeDateMismatch,'one bad row rejects the whole batch without replacing earlier facts');
  await service();
  await assert.rejects(matchBatch([match(missing)]),/canonical|booking contact/i);
  await assert.rejects(matchBatch([match(booking,{checked_at:'2099-11-21T02:00:00Z'})]),/checked_at|observation|timestamp/i);
  const earlyReception=match(booking,{appointment_at:'2026-11-03T15:00:00+09:00',visited_at:'2026-11-03T09:00:00+09:00',checked_at:'2026-11-03T10:00:00+09:00'});
  await assert.rejects(matchBatch([earlyReception]),/observation|schedule/i,'DB rejects an earlier unrelated reception');
  assert.equal((await send('inbox_match',[earlyReception])).status,400,'HTTP rejects an earlier unrelated reception');
  await service();
  const justEarly=match(booking,{appointment_at:'2026-11-03T14:30:00.123456+09:00',visited_at:'2026-11-03T05:30:00.123455Z'});
  await assert.rejects(matchBatch([justEarly]),/observation|schedule/i,'DB preserves subsecond ordering');
  const futureVisit=matchOn(booking,'2026-11-03',{checked_at:'2026-11-03T04:00:00Z'});
  await assert.rejects(matchBatch([futureVisit]),/observation|schedule/i,
    'a same-day reception later than its source observation is rejected');
  const futureVisitHttp=await send('inbox_match',[futureVisit]);
  assert.equal(futureVisitHttp.status,400,'the HTTP edge also rejects reception facts later than checked_at');
  await service();
  const futureAppointment=matchOn(fresh,'2026-11-25',{
    visited:false,visited_at:null,checked_at:'2026-11-20T04:00:00Z'
  });
  await matchBatch([futureAppointment]);
  await db.exec('reset role');
  const savedFutureAppointment=(await rows('select appointment_found,visited,appointment_at from public.dentweb_inbox_matches where inbox_id=$1',[fresh]))[0];
  assert.equal(savedFutureAppointment.appointment_found,true);
  assert.equal(savedFutureAppointment.visited,false);
  assert.equal(new Date(savedFutureAppointment.appointment_at).toISOString(),'2026-11-25T05:30:00.000Z');
  await db.exec('reset role');await rows('delete from public.dentweb_inbox_matches where inbox_id=$1',[fresh]);
  await assert.rejects(matchBatch([matchOn(fresh,'2026-11-25'),match(generic)]),/kakao|booking|inbox/i);
  await assert.rejects(matchBatch([matchOn(fresh,'2026-11-25'),match(id(100))]),/kakao|booking|inbox|foreign key/i);
  await assert.rejects(matchBatch([futureAppointment,futureAppointment]),/duplicate|same row/i);
  await assert.rejects(matchBatch([match(fresh,{...noFacts,visited:true})]),/match|constraint|appointment/i);
  await matchBatch([match(booking,{...noFacts,match_basis:'no_match',checked_at:'2026-11-20T14:00:00Z'})]);
  await matchBatch([match(booking,{...noFacts,match_basis:'no_match'})]);

  const initial='2026-11-17T04:30:00Z', newer='2026-11-18T04:30:00Z';
  await monthBatch([month('2026-09-01','all',8),month('2026-10-01','all',10),month('2026-10-01','naver',3)]);
  const oldWire=[{month:'2026-10',source:'all',count:10,checked_at:initial},
    {month:'2026-10',source:'naver',count:3,checked_at:initial}];
  const newWire=[{month:'2026-10',source:'all',count:12,checked_at:newer},
    {month:'2026-11',source:'all',count:0,checked_at:initial}];
  for(const request of [newWire,newWire,oldWire,[{...newWire[0],count:99}]]){
    assert.equal((await send('monthly_first_visits',request)).status,200);
  }
  await asUser('owner');
  assert.deepEqual(await rows(`select path,first_visit_count,checked_at=$1::timestamptz as kept_time
    from public.dentweb_monthly_first_visits where month='2026-10-01'`,[newer]),
  [{path:'all',first_visit_count:12,kept_time:true}],'delayed or equal snapshots leave the whole newer month intact');
  await service();
  const yearlessAppointment=matchOn(fresh,'2026-11-25',{visited:false,visited_at:null});
  assert.equal((await send('inbox_match',[yearlessAppointment])).status,200,'yearless canonical schedule uses received_at nearest year while a future reservation stays allowed');
  const insufficient={...noFacts,match_basis:'insufficient',checked_at:'2026-11-21T14:05:00Z'};
  assert.equal((await send('inbox_match',[match(fresh,insufficient)])).status,200);
  assert.equal((await send('inbox_match',[yearlessAppointment])).status,200);
  await asUser('owner');
  assert.deepEqual(await rows(`select appointment_found,visited,match_basis,checked_at=$2::timestamptz as kept_time
    from public.dentweb_inbox_matches where inbox_id=$1`,[fresh,insufficient.checked_at]),
  [{appointment_found:false,visited:false,match_basis:'insufficient',kept_time:true}],'newer unknown status removes earlier positive facts through the actual HTTP validator and RPC');
  await service();
  await assert.rejects(monthBatch([]),/rows|batch/i);
  await assert.rejects(monthBatch([month('2026-10-01','all',99),month('2026-11-02','all',2)]),/month|constraint/i);
  await assert.rejects(monthBatch([month('2026-10-01','all',99),month('2026-10-01','all',3)]),/duplicate|unique/i);
  await assert.rejects(monthBatch([month('2026-11-01','all',-1)]),/count|constraint/i);
  await assert.rejects(monthBatch([{month:'2026-10-01',path:'all',first_visit_count:99}]),/checked_at|observation|timestamp/i);
  await assert.rejects(monthBatch([month('2026-10-01','all',99,'2099-11-21T02:00:00Z')]),/checked_at|observation|timestamp/i);
  await assert.rejects(monthBatch([month('2026-10-01','all',99),month('2026-10-01','naver',3,newer)]),/snapshot|checked_at|observation|timestamp/i);
  await assert.rejects(db.exec('update public.dentweb_inbox_matches set visited=false'),/permission denied/i);

  const expectedMatches=[
    {inbox_id:booking,appointment_found:true,visited:true,match_basis:'phone8_date'},
    {inbox_id:missing,appointment_found:false,visited:false,match_basis:'insufficient'},
    {inbox_id:fresh,appointment_found:false,visited:false,match_basis:'insufficient'}
  ];
  const expectedMonths=[
    {month:'2026-09-01',path:'all',first_visit_count:8},
    {month:'2026-10-01',path:'all',first_visit_count:12},
    {month:'2026-11-01',path:'all',first_visit_count:0}
  ];
  for(const role of Object.keys(user)){
    await asUser(role);
    assert.deepEqual(await matchRows(),['owner','manager','chief','staff'].includes(role)?expectedMatches:[],role+' inbox RLS');
    assert.deepEqual(await monthRows(),['owner','manager'].includes(role)?expectedMonths:[],role+' marketing RLS');
    await assert.rejects(matchBatch([]),/permission denied/i);
    await assert.rejects(monthBatch([]),/permission denied/i);
    await assert.rejects(db.exec('delete from public.dentweb_inbox_matches'),/permission denied/i);
    await assert.rejects(db.exec('update public.dentweb_monthly_first_visits set first_visit_count=0'),/permission denied/i);
  }
  await db.exec("reset role;update public.app_settings set value='false' where key='marketing.manager_view_enabled'");
  await asUser('manager');assert.deepEqual(await monthRows(),[]);
  await asUser('owner');assert.deepEqual(await monthRows(),expectedMonths);
  await asUser('manager');
  const [manual]=await rows("insert into public.consultation_inbox(source,message,created_by) values ('phone','합성 수동 접수',$1) returning id,kakao_booking_contact_digits",[user.manager]);
  assert.equal(manual.kakao_booking_contact_digits,null,'existing manager manual inbox insert can generate an empty field');
  assert.deepEqual(await rows("update public.consultation_inbox set status='in_progress' where id=$1 returning status",[manual.id]),[{status:'in_progress'}]);
  await assert.rejects(rows("update public.consultation_inbox set kakao_booking_name='변경' where id=$1",[manual.id]),/permission denied|only be updated to DEFAULT/i);
  await db.exec('reset role;set role anon');
  for(const read of [matchRows,monthRows])await assert.rejects(read(),/permission denied/i);
  await assert.rejects(matchBatch([]),/permission denied/i);
  await assert.rejects(monthBatch([]),/permission denied/i);

  await db.exec('reset role');
  await rows('delete from public.consultation_inbox where id=$1',[missing]);
  assert.deepEqual(await matchRows(),expectedMatches.filter(row=>row.inbox_id!==missing),'deleted inbox row also deletes derived facts');
  const beforeRollback=await snapshotInbox();
  const rollback=sql('dentweb_sync_20261121_rollback');
  await db.exec(rollback);
  await db.exec(rollback);
  assert.deepEqual(await snapshotInbox(),beforeRollback);
  await assert.rejects(normalized(booking),/kakao_booking_name.*does not exist/i);
  await assert.rejects(matchRows(),/dentweb_inbox_matches.*does not exist/i);
  await assert.rejects(monthRows(),/dentweb_monthly_first_visits.*does not exist/i);
  await assert.rejects(matchBatch([]),/dentweb_inbox_match_upsert.*does not exist/i);
  await assert.rejects(monthBatch([]),/dentweb_monthly_first_visits_replace.*does not exist/i);
  console.log('PGLITE_DENTWEB_SYNC_PASS');
}finally{
  await db.close();
}
