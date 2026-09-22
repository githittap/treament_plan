-- 상담문의함 service-role 수신 함수(consultation_inbox_ingest_service)의 권한 확인이 최신 PostgREST(v10+)에서
-- 항상 실패하는 버그 패치. PostgREST가 이제 request.jwt.claims(JSON 문자열)만 설정하고 옛 request.jwt.claim.role은
-- 더는 설정하지 않는데, 함수는 옛 값만 읽어 service_role 호출까지 거부했다. 두 설정값을 모두 허용해 하위호환한다.
-- 운영 적용 순서: db/consultation_inbox_navertalk_source_draft.sql 다음. 로컬 PGlite 시험만 마쳤고 운영 DB에는
-- 아직 반영하지 않았다(tests/sql/pglite-consultation-inbox-role-check.mjs).
begin;

-- fail-closed preflight: source 제약은 이 패치로 바뀌지 않으므로 적용 전/후 모두 같은 값이어야 하고,
-- 함수 본문만 적용 전(v_before_md5) 또는 적용 후(v_after_md5) 중 하나와 바이트 단위로 같아야 진행한다.
-- 둘 다 아니면(운영에서 다른 변경이 있었다면) 멈추고 보존한다. 이미 적용된 뒤 재실행도 안전하게 통과한다.
do $$
declare
  v_check text;
  v_fn_md5 text;
  v_expected_check constant text := 'CHECK ((source = ANY (ARRAY[''daangn''::text, ''kakao''::text, ''naver_email''::text, ''homepage''::text, ''phone''::text, ''manual''::text, ''other''::text, ''naver_talktalk''::text])))';
  v_before_md5 constant text := '2380e00e731e3409b7bba18e8ed382d1';
  v_after_md5 constant text := '32f25aa8fcbca2456d1130b22e18d217';
begin
  if to_regclass('public.consultation_inbox') is null then
    raise exception 'consultation_inbox missing; apply db/consultation_inbox.sql and db/consultation_inbox_navertalk_source_draft.sql first';
  end if;
  select pg_get_constraintdef(oid) into v_check from pg_constraint
    where conrelid = 'public.consultation_inbox'::regclass and conname = 'consultation_inbox_source_check';
  select md5(prosrc) into v_fn_md5 from pg_proc
    where oid = 'public.consultation_inbox_ingest_service(text,text,timestamptz,text,text,text,text)'::regprocedure;
  if not (
    v_check = v_expected_check and (v_fn_md5 = v_before_md5 or v_fn_md5 = v_after_md5)
  ) then
    raise exception 'consultation_inbox source constraint or consultation_inbox_ingest_service function drifted from expected before/after state; preserve state and stop apply';
  end if;
end $$;

-- create or replace는 기존 권한(ACL)을 보존하므로 grant/revoke 문은 넣지 않는다.
create or replace function public.consultation_inbox_ingest_service(p_source text,p_event_id text,p_received_at timestamptz,p_sender_name text,p_contact text,p_subject text,p_message text) returns public.consultation_inbox language plpgsql security definer set search_path='' as $$declare r public.consultation_inbox;v_hash text;begin if coalesce(nullif(current_setting('request.jwt.claim.role',true),''),nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'role','')<>'service_role' then raise exception 'service role required';end if;if p_source not in('daangn','kakao','naver_email','homepage','phone','other','naver_talktalk') or p_event_id is null or char_length(p_event_id) not between 1 and 160 or char_length(trim(coalesce(p_message,''))) not between 1 and 4000 then raise exception 'invalid inbox event';end if;v_hash=encode(extensions.digest(p_source||':'||p_event_id,'sha256'),'hex');insert into public.consultation_inbox(source,external_event_id,received_at,sender_name,contact,subject,message,status,dedupe_hash,created_via) values(p_source,p_event_id,coalesce(p_received_at,now()),nullif(btrim(p_sender_name),''),nullif(btrim(p_contact),''),nullif(btrim(p_subject),''),btrim(p_message),'new',v_hash,'service_ingest') on conflict(source,external_event_id) do update set updated_at=public.consultation_inbox.updated_at returning * into r;return r;end$$;

commit;
