import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';

// consultation_inbox_ingest_service의 서비스 권한 확인이 최신 PostgREST(request.jwt.claims만 설정)에서
// 항상 실패하던 버그의 패치·되돌리기를 검증한다. db/consultation_inbox_ingest_role_check_patch.sql,
// db/consultation_inbox_ingest_role_check_rollback.sql과 짝을 이룬다.
const root=process.cwd(),pkg=process.env.PGLITE_PACKAGE_ROOT;
if(!pkg)throw new Error('PGLITE_PACKAGE_ROOT required');
const {PGlite}=await import(pathToFileURL(path.join(pkg,'dist/index.js')).href),db=new PGlite(),q=s=>db.query(s).then(x=>x.rows);

// 매번 두 설정값을 모두 비운 뒤 필요한 것만 채운다 — 이전 단계의 잔여값에 기대지 않는다.
// 항목 1~4는 모두 실제 Postgres 역할은 service_role로 고정한다(anon·authenticated는 항목 6처럼
// EXECUTE 권한 자체가 없어 함수 본문에 들어가기 전에 "permission denied"로 막히므로, claims 내용만
// 바꿔가며 함수 자신의 권한 확인 로직(내부 방어선)을 검증하려면 외부 ACL 게이트는 항상 통과해야 한다).
const setGucs=async(claimRole,claims)=>db.exec(`select set_config('request.jwt.claim.role','${claimRole??''}',false);select set_config('request.jwt.claims','${claims??''}',false);`);
const asServiceRoleWithGucs=async(claimRole,claims)=>{await db.exec('set role service_role;');await setGucs(claimRole,claims);};
const asServiceClaims=async()=>asServiceRoleWithGucs('','{"role":"service_role"}');
const asServiceRoleButAuthenticatedClaims=async()=>asServiceRoleWithGucs('','{"role":"authenticated"}');
const asServiceLegacy=async()=>asServiceRoleWithGucs('service_role','');
const asServiceNoGucs=async()=>asServiceRoleWithGucs('','');

// patch/rollback 파일 안의 "create or replace function ...;" 문장만 정확히 뽑아내는 헬퍼.
// 드리프트 복구 단계에서 수동으로 다시 타이핑하지 않고 파일 원문에서 그대로 재사용하기 위함.
const fnMarker="create or replace function public.consultation_inbox_ingest_service(p_source text,p_event_id text,p_received_at timestamptz,p_sender_name text,p_contact text,p_subject text,p_message text) returns public.consultation_inbox language plpgsql security definer set search_path='' as $$";
const extractFnStatement=sqlText=>{
  const i=sqlText.indexOf(fnMarker);
  if(i===-1)throw new Error('function statement marker not found in sql text');
  const e=sqlText.indexOf('$$;',i+fnMarker.length);
  if(e===-1)throw new Error('function statement end marker not found in sql text');
  return sqlText.slice(i,e+3);
};

try{
  // ===== 공통 스키마(navertalk 시험과 동일한 최소 구성) =====
  await db.exec(`create role anon;create role authenticated;create role service_role;create schema auth;create or replace function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('app.test_uid',true),'')::uuid$$;grant usage on schema auth to authenticated;grant execute on function auth.uid() to authenticated;create table auth.users(id uuid primary key);create table public.profiles(user_id uuid primary key,role text,active boolean default true,approved boolean default true,account_access_status text default '활성');create or replace function public.my_role() returns text language sql stable security definer as $$select coalesce((select role from public.profiles where user_id=auth.uid()),'')$$;create or replace function public.employee_hub_access_allowed() returns boolean language sql stable security definer as $$select exists(select 1 from public.profiles where user_id=auth.uid() and active and approved and account_access_status='활성')$$;create table public.consultation_journals(id uuid primary key default gen_random_uuid(),patient_name text not null,contact_phone text,source_sheet text not null,consulted_on date not null,status text not null,consultation_note text not null,next_action text,author_id uuid not null default auth.uid(),created_at timestamptz default now(),updated_at timestamptz default now());`);

  const base=fs.readFileSync(path.join(root,'db/consultation_inbox.sql'),'utf8').replace("create extension if not exists pgcrypto with schema extensions;",()=>"create schema if not exists extensions;create or replace function extensions.digest(value text,algorithm text) returns bytea language sql immutable as $$select decode(md5(value)||md5(value),'hex')$$;");
  await db.exec(base);

  const navertalkDraft=fs.readFileSync(path.join(root,'db/consultation_inbox_navertalk_source_draft.sql'),'utf8');
  await db.exec(navertalkDraft);

  // 지금이 운영과 같은 상태(네이버톡톡 초안 적용 직후)인지 확인.
  const baselineMd5=(await q("select md5(prosrc) md5 from pg_proc where oid='public.consultation_inbox_ingest_service(text,text,timestamptz,text,text,text,text)'::regprocedure"))[0].md5;
  assert.equal(baselineMd5,'2380e00e731e3409b7bba18e8ed382d1','네이버톡톡 초안 적용 직후는 운영 정본과 같은 본문이어야 합니다.');

  // ===== RED: 패치 전에는 claims만 설정한 service_role 호출도 거부된다(버그 재현) =====
  await asServiceClaims();
  await assert.rejects(
    q("select * from public.consultation_inbox_ingest_service('kakao','evt-role-red-1',null,null,'01000000000',null,'red probe')"),
    /service role required/,
    '[RED] 패치 전에는 request.jwt.claims만 설정된 service_role 호출도 service role required로 거부되어야 합니다.'
  );
  console.log('RED_CONFIRMED: pre-patch claims-only service_role call rejected with "service role required" (bug reproduced)');
  await db.exec('rollback');await db.exec('reset role;');

  // ===== 패치 적용 =====
  const patch=fs.readFileSync(path.join(root,'db/consultation_inbox_ingest_role_check_patch.sql'),'utf8');
  await db.exec('reset role;');
  await db.exec(patch);

  // 항목 8: 시험이 새 본문의 md5를 직접 계산하고, 패치 SQL 안의 "적용 후" 상수와 같은지 확인한다.
  const expectedAfterMd5Match=patch.match(/v_after_md5\s+constant\s+text\s*:=\s*'([0-9a-fA-F]{32})'/);
  if(!expectedAfterMd5Match)throw new Error('patch sql에서 v_after_md5 상수를 찾지 못했습니다.');
  const expectedAfterMd5=expectedAfterMd5Match[1];
  const patchedMd5=(await q("select md5(prosrc) md5 from pg_proc where oid='public.consultation_inbox_ingest_service(text,text,timestamptz,text,text,text,text)'::regprocedure"))[0].md5;
  console.log('PATCHED_FN_MD5='+patchedMd5);
  assert.equal(patchedMd5,expectedAfterMd5,'패치 적용 후 실제 함수 본문 md5가 패치 SQL의 v_after_md5 상수와 같아야 합니다.');

  // ===== 항목 1: claims만 설정(옛 설정값 없음) → naver_talktalk 저장 성공, 같은 event_id 재호출은 같은 행(멱등) =====
  await asServiceClaims();
  const first=await q("select * from public.consultation_inbox_ingest_service('naver_talktalk','evt-role-1',null,null,'u-role-1',null,'hello role check')");
  assert.equal(first[0].source,'naver_talktalk');
  assert.equal(first[0].contact,'u-role-1');
  const again=await q("select * from public.consultation_inbox_ingest_service('naver_talktalk','evt-role-1',null,null,'u-role-1',null,'hello role check')");
  assert.equal(first[0].id,again[0].id,'같은 event_id 재호출은 같은 행이어야 합니다(멱등).');
  console.log('ITEM1_OK: claims-only service_role call succeeds and is idempotent');
  await db.exec('rollback');await db.exec('reset role;');

  // ===== 항목 2: claims role이 authenticated → 거부 (실제 역할은 service_role로 고정, claims만 바꿈) =====
  await asServiceRoleButAuthenticatedClaims();
  await assert.rejects(
    q("select * from public.consultation_inbox_ingest_service('kakao','evt-role-2',null,null,'u-role-2',null,'authenticated probe')"),
    /service role required/,
    'claims의 role이 authenticated이면 여전히 거부되어야 합니다.'
  );
  console.log('ITEM2_OK: authenticated claims rejected');
  await db.exec('rollback');await db.exec('reset role;');

  // ===== 항목 3: 옛 설정값(request.jwt.claim.role)만 있어도 성공(하위 호환) =====
  await asServiceLegacy();
  const legacy=await q("select * from public.consultation_inbox_ingest_service('kakao','evt-role-3',null,null,'u-role-3',null,'legacy probe')");
  assert.equal(legacy[0].source,'kakao');
  console.log('ITEM3_OK: legacy request.jwt.claim.role-only call still succeeds');
  await db.exec('rollback');await db.exec('reset role;');

  // ===== 항목 4: 두 설정값 모두 없음 → 거부 =====
  await asServiceNoGucs();
  await assert.rejects(
    q("select * from public.consultation_inbox_ingest_service('kakao','evt-role-4',null,null,'u-role-4',null,'no guc probe')"),
    /service role required/,
    '두 설정값이 모두 없으면 service_role 이어도 거부되어야 합니다.'
  );
  console.log('ITEM4_OK: neither guc set rejected');
  await db.exec('rollback');await db.exec('reset role;');

  // ===== 항목 5: 패치 재적용은 안전(멱등), 본문이 드리프트되면 패치가 멈춘다 =====
  await db.exec('reset role;');
  await db.exec(patch); // 이미 적용된 상태 — 다시 적용해도 조용히 성공해야 함
  console.log('PATCH_TWICE_OK');

  await db.exec('reset role;');
  await db.exec(`create or replace function public.consultation_inbox_ingest_service(p_source text,p_event_id text,p_received_at timestamptz,p_sender_name text,p_contact text,p_subject text,p_message text) returns public.consultation_inbox language plpgsql security definer set search_path='' as $$declare r public.consultation_inbox;begin raise exception 'drifted stand-in';end$$;`);
  await assert.rejects(db.exec(patch),/drifted from expected before\/after state/,'드리프트된 상태에서는 패치가 멈춰야 합니다.');
  await db.exec('rollback');

  // 드리프트 주입은 patch의 트랜잭션 밖에서 한 별도 문장이라 위 rollback으로 되돌아가지 않는다 —
  // patch 파일 원문에서 뽑은 "적용 후" 함수 문장을 직접 재적용해 정상 상태로 복구한다.
  await db.exec('reset role;');
  const patchFnStatement=extractFnStatement(patch);
  await db.exec(patchFnStatement);
  const repairedMd5=(await q("select md5(prosrc) md5 from pg_proc where oid='public.consultation_inbox_ingest_service(text,text,timestamptz,text,text,text,text)'::regprocedure"))[0].md5;
  assert.equal(repairedMd5,expectedAfterMd5,'드리프트 복구 문구 자체가 패치 정본과 바이트 단위로 같아야 합니다.');
  console.log('ITEM5_OK: patch re-apply idempotent, drift detected and stopped, repaired back to patched body');

  // ===== 항목 6: 패치 후에도 anon·authenticated는 EXECUTE 권한이 없고 service_role만 있다 =====
  await db.exec('reset role;');
  const execAcl=(await q("select has_function_privilege('anon','public.consultation_inbox_ingest_service(text,text,timestamptz,text,text,text,text)','execute') anon_exec,has_function_privilege('authenticated','public.consultation_inbox_ingest_service(text,text,timestamptz,text,text,text,text)','execute') auth_exec,has_function_privilege('service_role','public.consultation_inbox_ingest_service(text,text,timestamptz,text,text,text,text)','execute') svc_exec"))[0];
  assert.deepEqual({...execAcl},{anon_exec:false,auth_exec:false,svc_exec:true});
  console.log('ITEM6_OK: execute ACL unchanged (anon/authenticated no, service_role yes)');

  // ===== 항목 7: 되돌리기 후 md5가 정확히 운영 정본으로 돌아오고, claims만 설정한 호출이 다시 거부된다 =====
  const rollbackSql=fs.readFileSync(path.join(root,'db/consultation_inbox_ingest_role_check_rollback.sql'),'utf8');
  await db.exec('reset role;');
  await db.exec(rollbackSql);
  const afterMd5=(await q("select md5(prosrc) md5 from pg_proc where oid='public.consultation_inbox_ingest_service(text,text,timestamptz,text,text,text,text)'::regprocedure"))[0].md5;
  assert.equal(afterMd5,'2380e00e731e3409b7bba18e8ed382d1','되돌리기 후 함수 본문이 운영 정본과 바이트 단위로 같아야 합니다.');
  await asServiceClaims();
  await assert.rejects(
    q("select * from public.consultation_inbox_ingest_service('kakao','evt-role-after-rollback',null,null,'u-role-after',null,'after rollback probe')"),
    /service role required/,
    '되돌리기 후에는 claims만 설정한 호출이 다시 거부되어야 합니다.'
  );
  console.log('ITEM7_OK: rollback restores exact original body and re-introduces the bug behavior');
  await db.exec('rollback');await db.exec('reset role;');

  console.log('PGLITE_CONSULTATION_INBOX_ROLE_CHECK_PASS');
}finally{await db.close();}
