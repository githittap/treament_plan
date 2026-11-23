// Synthetic, public checkout test. No NAS files, real mail, patient data, or network.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {createDentwebHandler} from '../../supabase/functions/dentweb-sync/payload.mjs';
const pkg=process.env.PGLITE_PACKAGE_ROOT;
if(!pkg)throw new Error('PGLITE_PACKAGE_ROOT required');
const {PGlite}=await import(pathToFileURL(path.join(pkg,'dist/index.js')).href);
const db=new PGlite();
const sql=name=>fs.readFileSync('db/'+name+'.sql','utf8');
const rows=(query,args)=>db.query(query,args).then(result=>result.rows);
const service=()=>db.exec('reset role;set role service_role');
const event={booking_number:'123456789',state:'confirmed',event_at:'2026-11-02T01:00:00Z',visit_at:'2026-11-03T05:00:00Z',name:'합성',contact_digits:'01000001234',product:'합성'};
const ingest=batch=>rows('select public.consultation_inbox_ingest_kakao_bookings($1::jsonb) accepted',[JSON.stringify(batch)]);
try {
  await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;
    alter default privileges in schema public grant all on tables to service_role;
    create schema auth;create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('app.test_uid',true),'')::uuid$$;
    grant usage on schema auth to authenticated;
    create table public.profiles(user_id uuid primary key,role text not null,active boolean,approved boolean,account_access_status text);
    create function public.my_role() returns text language sql stable security definer set search_path='' as $$select role from public.profiles where user_id=auth.uid()$$;
    create function public.employee_hub_access_allowed() returns boolean language sql stable security definer set search_path='' as $$select exists(select 1 from public.profiles where user_id=auth.uid() and active and approved and account_access_status='활성')$$;
    create function public.marketing_manager_view_enabled() returns boolean language sql stable as $$select false$$;
    create table public.consultation_journals(id uuid primary key default gen_random_uuid(),patient_name text not null,contact_phone text,source_sheet text not null,consulted_on date not null,status text not null,consultation_note text not null,next_action text,author_id uuid not null default auth.uid(),created_at timestamptz default now(),updated_at timestamptz default now());`);
  await db.exec(sql('consultation_inbox').replace('create extension if not exists pgcrypto with schema extensions;',()=>
    `create schema extensions;create function extensions.digest(text,text) returns bytea language sql immutable as $$select decode(md5($1)||md5($1),'hex')$$;`));
  for(const name of ['consultation_inbox_handled','consultation_inbox_dentweb_stamp','hr_settings','hub_ui_texts','dentweb_sync_20261121'])await db.exec(sql(name));
  await db.exec(`insert into consultation_inbox(source,external_event_id,received_at,sender_name,message,status)
    select 'kakao','kbook-legacy-'||i,'2026-11-01T00:00:00Z','합성','합성 원문','new' from generate_series(1,26)i`);
  const original=await rows('select to_jsonb(i) row from consultation_inbox i order by id');
  const definition=(await rows("select pg_get_functiondef('public.dentweb_inbox_match_upsert(jsonb)'::regprocedure) value"))[0].value;
  await db.exec(sql('consultation_inbox_kakao_booking_mail_draft'));
  assert.equal((await rows('select enabled from dentweb_private.kakao_mail_control'))[0].enabled,false);
  await db.exec(sql('consultation_inbox_kakao_booking_mail_rollback_draft'));
  assert.deepEqual(await rows('select to_jsonb(i) row from consultation_inbox i order by id'),original);
  assert.equal((await rows("select pg_get_functiondef('public.dentweb_inbox_match_upsert(jsonb)'::regprocedure) value"))[0].value,definition);
  await db.exec(sql('consultation_inbox_kakao_booking_mail_draft'));
  const hash=(await rows("select encode(extensions.digest($1,'sha256'),'hex') value",[event.booking_number]))[0].value;
  const arm=()=>rows(sql('consultation_inbox_kakao_booking_mail_pilot_arm_draft'),[hash,event.event_at]);
  await service();await assert.rejects(()=>ingest([event]),/paused or unavailable/);
  await db.exec('reset role');assert.equal((await arm()).length,1);
  await service();
  for(const batch of [[{...event,booking_number:'987654321'}],[{...event,state:'requested'}],
      [{...event,event_at:'2026-11-02T02:00:00Z'}],[event,event]])await assert.rejects(()=>ingest(batch),/paused or unavailable/);
  assert.equal((await ingest([event]))[0].accepted,1);
  await assert.rejects(()=>ingest([event]),/paused or unavailable/);
  await db.exec('reset role');assert.equal((await arm()).length,0);
  const canonical=(await rows('select id,kakao_booking_version from consultation_inbox where kakao_booking_number=$1',[event.booking_number]))[0];
  const legacy=(await rows("select id from consultation_inbox where external_event_id='kbook-legacy-1'"))[0];
  await db.exec(sql('consultation_inbox_kakao_booking_mail_resume_draft'));
  await service();await ingest([{...event,booking_number:'987654321'}]);
  await db.exec('reset role');
  const next=(await rows("select id,kakao_booking_version from consultation_inbox where kakao_booking_number='987654321'"))[0];
  const other=(await rows("insert into consultation_inbox(source,received_at,message,created_via) values('phone',now(),'합성','manual') returning id"))[0];
  const checked=new Date().toISOString();
  const fact=(id,extra={})=>({inbox_id:id,appointment_found:false,appointment_at:null,visited:false,visited_at:null,match_basis:'no_match',checked_at:checked,...extra});
  const oldPositive=id=>fact(id,{appointment_found:true,appointment_at:'2026-11-03T05:00:00Z',visited:true,
    visited_at:'2026-11-03T05:01:00Z',match_basis:'phone8_date'});
  await service();
  const upsert=items=>rows('select public.dentweb_inbox_match_upsert($1::jsonb)',[JSON.stringify(items)]);
  await upsert([oldPositive(canonical.id)]);
  await upsert([oldPositive(legacy.id)]);
  await upsert([oldPositive(legacy.id),oldPositive(canonical.id),fact(next.id,{booking_version:next.kakao_booking_version})]);
  await assert.rejects(()=>upsert([fact(next.id,{booking_version:-1})]),/stale booking/);
  await assert.rejects(()=>upsert([fact(next.id,{booking_version:'1'})]),/invalid booking match version/);
  await assert.rejects(()=>upsert([fact(legacy.id,{booking_version:0})]),/stale booking/);
  await assert.rejects(()=>upsert([fact(canonical.id),fact(canonical.id)]),/duplicate inbox match/);
  await assert.rejects(()=>upsert([fact(other.id)]),/match requires an existing Kakao booking/);
  const sync=createDentwebHandler({getSecret:()=> 'synthetic-key',save:async(_rpc,args)=>upsert(args.p_rows)});
  const send=batch=>sync(new Request('https://test.invalid/dentweb-sync',{method:'POST',
    headers:{'x-dentweb-sync-key':'synthetic-key'},body:JSON.stringify({kind:'inbox_match',rows:batch})}));
  assert.equal((await send([oldPositive(canonical.id),fact(next.id,{booking_version:next.kakao_booking_version})])).status,200);
  assert.equal((await send([fact(next.id,{booking_version:'1'})])).status,400);
  await db.exec('reset role');
  assert.equal((await rows('select count(*)::int n from dentweb_inbox_matches where inbox_id=$1',[legacy.id]))[0].n,0);
  assert.equal((await rows('select count(*)::int n from dentweb_inbox_matches where inbox_id=$1',[canonical.id]))[0].n,0);
  assert.equal((await rows('select count(*)::int n from dentweb_inbox_matches where inbox_id=$1',[next.id]))[0].n,1);
  await db.exec(sql('consultation_inbox_kakao_booking_mail_pause_draft'));
  await assert.rejects(()=>db.exec(sql('consultation_inbox_kakao_booking_mail_rollback_draft')),/rollback refused/);
  await db.exec('rollback');
  assert.equal((await rows('select count(*)::int n from consultation_inbox where kakao_booking_number=$1',[event.booking_number]))[0].n,1);
  console.log('PUBLIC_PILOT_SQL_PASS legacy_26_pre_rollback default_paused one_use mixed_legacy_skip post_pilot_retained');
} finally {await db.close();}
