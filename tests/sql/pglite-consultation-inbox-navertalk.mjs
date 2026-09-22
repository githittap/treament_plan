import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';

const root=process.cwd(),pkg=process.env.PGLITE_PACKAGE_ROOT;
if(!pkg)throw new Error('PGLITE_PACKAGE_ROOT required');
const {PGlite}=await import(pathToFileURL(path.join(pkg,'dist/index.js')).href),db=new PGlite(),q=s=>db.query(s).then(x=>x.rows);
const asService=async()=>db.exec("set role service_role;select set_config('request.jwt.claim.role','service_role',false);");
try{
  await db.exec(`create role anon;create role authenticated;create role service_role;create schema auth;create or replace function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('app.test_uid',true),'')::uuid$$;grant usage on schema auth to authenticated;grant execute on function auth.uid() to authenticated;create table auth.users(id uuid primary key);create table public.profiles(user_id uuid primary key,role text,active boolean default true,approved boolean default true,account_access_status text default '활성');create or replace function public.my_role() returns text language sql stable security definer as $$select coalesce((select role from public.profiles where user_id=auth.uid()),'')$$;create or replace function public.employee_hub_access_allowed() returns boolean language sql stable security definer as $$select exists(select 1 from public.profiles where user_id=auth.uid() and active and approved and account_access_status='활성')$$;create table public.consultation_journals(id uuid primary key default gen_random_uuid(),patient_name text not null,contact_phone text,source_sheet text not null,consulted_on date not null,status text not null,consultation_note text not null,next_action text,author_id uuid not null default auth.uid(),created_at timestamptz default now(),updated_at timestamptz default now());`);

  const base=fs.readFileSync(path.join(root,'db/consultation_inbox.sql'),'utf8').replace("create extension if not exists pgcrypto with schema extensions;",()=>"create schema if not exists extensions;create or replace function extensions.digest(value text,algorithm text) returns bytea language sql immutable as $$select decode(md5(value)||md5(value),'hex')$$;");
  await db.exec(base);

  // 확장 전: naver_talktalk는 아직 거부된다.
  await asService();
  await assert.rejects(q("select * from public.consultation_inbox_ingest_service('naver_talktalk','evt-before',null,null,'u1',null,'hi')"),/invalid inbox event/,'초안 적용 전에는 naver_talktalk가 거부되어야 합니다.');
  await db.exec('rollback');await asService();

  const draft=fs.readFileSync(path.join(root,'db/consultation_inbox_navertalk_source_draft.sql'),'utf8');
  await db.exec('reset role;');
  await db.exec(draft);
  await db.exec(draft); // 재실행도 안전해야 한다(멱등) — preflight가 "적용 후" 상태도 통과시켜야 함
  console.log('DRAFT_APPLIED_TWICE_OK');

  // RLS 정책 개수·이름은 원본 그대로(문의함 표 자체는 건드리지 않았어야 함)
  assert.equal((await q("select count(*)::int n from pg_policies where tablename='consultation_inbox'"))[0].n,3);
  const policyNames=(await q("select policyname from pg_policies where tablename='consultation_inbox' order by policyname")).map(r=>r.policyname);
  assert.deepEqual(policyNames,['consultation_inbox_insert','consultation_inbox_select','consultation_inbox_update']);

  // 이제 naver_talktalk가 저장되고, 재전송(같은 event_id)은 같은 행으로 합쳐진다(멱등).
  await asService();
  const first=await q("select * from public.consultation_inbox_ingest_service('naver_talktalk','evt-nv-1',null,null,'al-2eGuGr5WQOnco1_V-FQ',null,'hello world')");
  assert.equal(first[0].source,'naver_talktalk');
  assert.equal(first[0].contact,'al-2eGuGr5WQOnco1_V-FQ');
  assert.equal(first[0].message,'hello world');
  assert.equal(first[0].created_via,'service_ingest');
  const again=await q("select * from public.consultation_inbox_ingest_service('naver_talktalk','evt-nv-1',null,null,'al-2eGuGr5WQOnco1_V-FQ',null,'hello world')");
  assert.equal(first[0].id,again[0].id,'같은 event_id 재전송은 같은 행이어야 합니다(멱등).');

  // received_at을 생략하면(null) DB가 now()를 채운다.
  assert.ok(first[0].received_at,'received_at이 채워져야 합니다.');

  // 기존 다른 source는 계속 동작하고, 잘못된 source는 여전히 거부된다.
  const kakao=await q("select * from public.consultation_inbox_ingest_service('kakao','evt-k-1',null,'홍길동','01011112222','문의','내용')");
  assert.equal(kakao[0].source,'kakao');
  await assert.rejects(q("select * from public.consultation_inbox_ingest_service('bogus','evt-x',null,null,null,null,'x')"),/invalid inbox event/);
  await db.exec('rollback');await asService();

  // 초안 적용 후에도 anon·authenticated는 여전히 ingest 함수를 실행할 권한이 없다(권한 확대 없음 확인).
  await db.exec('reset role;');
  const execAcl=(await q("select has_function_privilege('anon','public.consultation_inbox_ingest_service(text,text,timestamptz,text,text,text,text)','execute') anon_exec,has_function_privilege('authenticated','public.consultation_inbox_ingest_service(text,text,timestamptz,text,text,text,text)','execute') auth_exec,has_function_privilege('service_role','public.consultation_inbox_ingest_service(text,text,timestamptz,text,text,text,text)','execute') svc_exec"))[0];
  assert.deepEqual({...execAcl},{anon_exec:false,auth_exec:false,svc_exec:true});

  // fail-closed preflight: 함수 본문이 예상과 다르게 드리프트했으면 초안이 멈춰야 한다.
  await db.exec('reset role;');
  await db.exec(`create or replace function public.consultation_inbox_ingest_service(p_source text,p_event_id text,p_received_at timestamptz,p_sender_name text,p_contact text,p_subject text,p_message text) returns public.consultation_inbox language plpgsql security definer set search_path='' as $$declare r public.consultation_inbox;begin raise exception 'drifted stand-in';end$$;`);
  await assert.rejects(db.exec(draft),/drifted from expected before\/after state/,'드리프트된 상태에서는 초안이 멈춰야 합니다.');
  await db.exec('rollback');

  // 드리프트 주입은 draft의 트랜잭션 밖에서 한 별도 문장이라 위 rollback으로 되돌아가지 않는다 — 직접 정상(적용 후) 상태로 복구한다.
  await db.exec('reset role;');
  await db.exec(`create or replace function public.consultation_inbox_ingest_service(p_source text,p_event_id text,p_received_at timestamptz,p_sender_name text,p_contact text,p_subject text,p_message text) returns public.consultation_inbox language plpgsql security definer set search_path='' as $$declare r public.consultation_inbox;v_hash text;begin if coalesce(current_setting('request.jwt.claim.role',true),'')<>'service_role' then raise exception 'service role required';end if;if p_source not in('daangn','kakao','naver_email','homepage','phone','other','naver_talktalk') or p_event_id is null or char_length(p_event_id) not between 1 and 160 or char_length(trim(coalesce(p_message,''))) not between 1 and 4000 then raise exception 'invalid inbox event';end if;v_hash=encode(extensions.digest(p_source||':'||p_event_id,'sha256'),'hex');insert into public.consultation_inbox(source,external_event_id,received_at,sender_name,contact,subject,message,status,dedupe_hash,created_via) values(p_source,p_event_id,coalesce(p_received_at,now()),nullif(btrim(p_sender_name),''),nullif(btrim(p_contact),''),nullif(btrim(p_subject),''),btrim(p_message),'new',v_hash,'service_ingest') on conflict(source,external_event_id) do update set updated_at=public.consultation_inbox.updated_at returning * into r;return r;end$$;`);
  const repairedMd5=(await q("select md5(prosrc) md5 from pg_proc where oid='public.consultation_inbox_ingest_service(text,text,timestamptz,text,text,text,text)'::regprocedure"))[0].md5;
  assert.equal(repairedMd5,'2380e00e731e3409b7bba18e8ed382d1','드리프트 복구 문구 자체가 새 정본과 바이트 단위로 같아야 합니다.');

  // 롤백 SQL: naver_talktalk 행이 있으면 보존을 위해 멈춘다.
  const rollbackSql=fs.readFileSync(path.join(root,'db/consultation_inbox_navertalk_source_rollback.sql'),'utf8');
  await assert.rejects(db.exec(rollbackSql),/naver_talktalk rows; rollback stopped to preserve records/);
  await db.exec('rollback');await db.exec('reset role;');

  // naver_talktalk 행을 지우면 롤백이 원래 상태(7개 source, 원본 함수 md5)로 정확히 되돌린다.
  await q("delete from public.consultation_inbox where source='naver_talktalk'");
  await db.exec(rollbackSql);
  const afterCheck=(await q("select pg_get_constraintdef(oid) def from pg_constraint where conrelid='public.consultation_inbox'::regclass and conname='consultation_inbox_source_check'"))[0].def;
  assert.doesNotMatch(afterCheck,/naver_talktalk/);
  const afterMd5=(await q("select md5(prosrc) md5 from pg_proc where oid='public.consultation_inbox_ingest_service(text,text,timestamptz,text,text,text,text)'::regprocedure"))[0].md5;
  assert.equal(afterMd5,'8d15b775db46a58fdd476d6d45b347d7','롤백 후 함수 본문이 원본과 바이트 단위로 같아야 합니다.');
  await asService();
  await assert.rejects(q("select * from public.consultation_inbox_ingest_service('naver_talktalk','evt-after-rollback',null,null,'u1',null,'hi')"),/invalid inbox event/);
  await db.exec('rollback');await db.exec('reset role;');

  // 롤백도 재실행에 안전해야 한다(이미 원래 상태 → 재적용해도 조용히 성공).
  await db.exec(rollbackSql);
  console.log('ROLLBACK_TWICE_OK');

  console.log('PGLITE_CONSULTATION_INBOX_NAVERTALK_PASS');
}finally{await db.close();}
