-- consultation_inbox_ingest_role_check_patch.sql 되돌리기: 권한 확인 식만 원래(request.jwt.claim.role 전용)로
-- 복원한다. source 제약·나머지 함수 본문은 손대지 않는다. 운영에서 이 패치보다 먼저 걷어내야 한다.
begin;

-- fail-closed preflight: 현재 본문이 적용 후(v_after_md5) 또는 이미 원본(v_before_md5) 중 하나와 같을 때만
-- 진행한다(재실행 안전). source 제약은 이 되돌리기로 바뀌지 않으므로 그대로여야 한다.
do $$
declare
  v_check text;
  v_fn_md5 text;
  v_expected_check constant text := 'CHECK ((source = ANY (ARRAY[''daangn''::text, ''kakao''::text, ''naver_email''::text, ''homepage''::text, ''phone''::text, ''manual''::text, ''other''::text, ''naver_talktalk''::text])))';
  v_after_md5 constant text := '32f25aa8fcbca2456d1130b22e18d217';
  v_before_md5 constant text := '2380e00e731e3409b7bba18e8ed382d1';
begin
  if to_regclass('public.consultation_inbox') is null then
    raise exception 'consultation_inbox missing; nothing to roll back';
  end if;
  select pg_get_constraintdef(oid) into v_check from pg_constraint
    where conrelid = 'public.consultation_inbox'::regclass and conname = 'consultation_inbox_source_check';
  select md5(prosrc) into v_fn_md5 from pg_proc
    where oid = 'public.consultation_inbox_ingest_service(text,text,timestamptz,text,text,text,text)'::regprocedure;
  if not (
    v_check = v_expected_check and (v_fn_md5 = v_after_md5 or v_fn_md5 = v_before_md5)
  ) then
    raise exception 'consultation_inbox source constraint or consultation_inbox_ingest_service function drifted from expected before/after state; preserve state and stop rollback';
  end if;
end $$;

create or replace function public.consultation_inbox_ingest_service(p_source text,p_event_id text,p_received_at timestamptz,p_sender_name text,p_contact text,p_subject text,p_message text) returns public.consultation_inbox language plpgsql security definer set search_path='' as $$declare r public.consultation_inbox;v_hash text;begin if coalesce(current_setting('request.jwt.claim.role',true),'')<>'service_role' then raise exception 'service role required';end if;if p_source not in('daangn','kakao','naver_email','homepage','phone','other','naver_talktalk') or p_event_id is null or char_length(p_event_id) not between 1 and 160 or char_length(trim(coalesce(p_message,''))) not between 1 and 4000 then raise exception 'invalid inbox event';end if;v_hash=encode(extensions.digest(p_source||':'||p_event_id,'sha256'),'hex');insert into public.consultation_inbox(source,external_event_id,received_at,sender_name,contact,subject,message,status,dedupe_hash,created_via) values(p_source,p_event_id,coalesce(p_received_at,now()),nullif(btrim(p_sender_name),''),nullif(btrim(p_contact),''),nullif(btrim(p_subject),''),btrim(p_message),'new',v_hash,'service_ingest') on conflict(source,external_event_id) do update set updated_at=public.consultation_inbox.updated_at returning * into r;return r;end$$;

commit;
