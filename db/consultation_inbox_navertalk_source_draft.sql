-- 네이버 톡톡 웹훅(navertalk-webhook, 미배포)이 쓸 신규 source 값 하나만 추가하는 최소 확장 초안.
-- consultation_inbox 표 자체·RLS 정책·상담일지 전환 로직은 건드리지 않는다: source CHECK 제약과
-- service-role ingest 함수의 허용 목록만 'naver_talktalk' 한 값을 더한다. 로컬 PGlite 합성시험만
-- 마쳤고 운영 DB에는 아직 반영하지 않았다(tests/sql/pglite-consultation-inbox-navertalk.mjs).
begin;

-- fail-closed preflight: 현재 제약·함수가 마이그레이션이 예상하는 두 상태(적용 전/적용 후) 중
-- 하나와 정확히 같을 때만 진행한다. 둘 다 아니면(운영에서 다른 변경이 있었다면) 멈추고 보존한다.
-- 두 번째 실행(이미 적용된 뒤 재실행)도 안전하게 통과해야 하므로 "적용 후" 상태도 허용한다.
do $$
declare
  v_check text;
  v_fn_md5 text;
  v_old_check constant text := 'CHECK ((source = ANY (ARRAY[''daangn''::text, ''kakao''::text, ''naver_email''::text, ''homepage''::text, ''phone''::text, ''manual''::text, ''other''::text])))';
  v_new_check constant text := 'CHECK ((source = ANY (ARRAY[''daangn''::text, ''kakao''::text, ''naver_email''::text, ''homepage''::text, ''phone''::text, ''manual''::text, ''other''::text, ''naver_talktalk''::text])))';
  v_old_fn_md5 constant text := '8d15b775db46a58fdd476d6d45b347d7';
  v_new_fn_md5 constant text := '2380e00e731e3409b7bba18e8ed382d1';
begin
  if to_regclass('public.consultation_inbox') is null then
    raise exception 'consultation_inbox missing; apply db/consultation_inbox.sql first';
  end if;
  select pg_get_constraintdef(oid) into v_check from pg_constraint
    where conrelid = 'public.consultation_inbox'::regclass and conname = 'consultation_inbox_source_check';
  select md5(prosrc) into v_fn_md5 from pg_proc
    where oid = 'public.consultation_inbox_ingest_service(text,text,timestamptz,text,text,text,text)'::regprocedure;
  if not (
    (v_check = v_old_check and v_fn_md5 = v_old_fn_md5)
    or (v_check = v_new_check and v_fn_md5 = v_new_fn_md5)
  ) then
    raise exception 'consultation_inbox source constraint or ingest function drifted from expected before/after state; preserve state and stop apply';
  end if;
end $$;

alter table public.consultation_inbox drop constraint if exists consultation_inbox_source_check;
alter table public.consultation_inbox add constraint consultation_inbox_source_check
  check (source in ('daangn','kakao','naver_email','homepage','phone','manual','other','naver_talktalk'));

create or replace function public.consultation_inbox_ingest_service(p_source text,p_event_id text,p_received_at timestamptz,p_sender_name text,p_contact text,p_subject text,p_message text) returns public.consultation_inbox language plpgsql security definer set search_path='' as $$declare r public.consultation_inbox;v_hash text;begin if coalesce(current_setting('request.jwt.claim.role',true),'')<>'service_role' then raise exception 'service role required';end if;if p_source not in('daangn','kakao','naver_email','homepage','phone','other','naver_talktalk') or p_event_id is null or char_length(p_event_id) not between 1 and 160 or char_length(trim(coalesce(p_message,''))) not between 1 and 4000 then raise exception 'invalid inbox event';end if;v_hash=encode(extensions.digest(p_source||':'||p_event_id,'sha256'),'hex');insert into public.consultation_inbox(source,external_event_id,received_at,sender_name,contact,subject,message,status,dedupe_hash,created_via) values(p_source,p_event_id,coalesce(p_received_at,now()),nullif(btrim(p_sender_name),''),nullif(btrim(p_contact),''),nullif(btrim(p_subject),''),btrim(p_message),'new',v_hash,'service_ingest') on conflict(source,external_event_id) do update set updated_at=public.consultation_inbox.updated_at returning * into r;return r;end$$;

commit;
