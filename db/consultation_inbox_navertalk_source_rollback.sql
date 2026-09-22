-- consultation_inbox_navertalk_source_draft.sql 되돌리기: source CHECK 제약과 ingest 함수의
-- 허용 목록에서 'naver_talktalk'만 뺀다. naver_talktalk 행이 이미 있으면 보존을 위해 멈춘다
-- (명시적으로 먼저 확인하고, 혹시 놓쳐도 CHECK 제약 추가 자체가 위반 행이 있으면 실패하므로 이중으로 막힌다).
begin;

do $$
declare
  v_check text;
  v_fn_md5 text;
  v_new_check constant text := 'CHECK ((source = ANY (ARRAY[''daangn''::text, ''kakao''::text, ''naver_email''::text, ''homepage''::text, ''phone''::text, ''manual''::text, ''other''::text, ''naver_talktalk''::text])))';
  v_old_check constant text := 'CHECK ((source = ANY (ARRAY[''daangn''::text, ''kakao''::text, ''naver_email''::text, ''homepage''::text, ''phone''::text, ''manual''::text, ''other''::text])))';
  v_new_fn_md5 constant text := '2380e00e731e3409b7bba18e8ed382d1';
  v_old_fn_md5 constant text := '8d15b775db46a58fdd476d6d45b347d7';
begin
  if to_regclass('public.consultation_inbox') is null then
    raise exception 'consultation_inbox missing; nothing to roll back';
  end if;
  if exists(select 1 from public.consultation_inbox where source = 'naver_talktalk') then
    raise exception 'consultation_inbox has naver_talktalk rows; rollback stopped to preserve records';
  end if;
  select pg_get_constraintdef(oid) into v_check from pg_constraint
    where conrelid = 'public.consultation_inbox'::regclass and conname = 'consultation_inbox_source_check';
  select md5(prosrc) into v_fn_md5 from pg_proc
    where oid = 'public.consultation_inbox_ingest_service(text,text,timestamptz,text,text,text,text)'::regprocedure;
  if not (
    (v_check = v_new_check and v_fn_md5 = v_new_fn_md5)
    or (v_check = v_old_check and v_fn_md5 = v_old_fn_md5)
  ) then
    raise exception 'consultation_inbox source constraint or ingest function drifted from expected before/after state; preserve state and stop rollback';
  end if;
end $$;

alter table public.consultation_inbox drop constraint if exists consultation_inbox_source_check;
alter table public.consultation_inbox add constraint consultation_inbox_source_check
  check (source in ('daangn','kakao','naver_email','homepage','phone','manual','other'));

create or replace function public.consultation_inbox_ingest_service(p_source text,p_event_id text,p_received_at timestamptz,p_sender_name text,p_contact text,p_subject text,p_message text) returns public.consultation_inbox language plpgsql security definer set search_path='' as $$declare r public.consultation_inbox;v_hash text;begin if coalesce(current_setting('request.jwt.claim.role',true),'')<>'service_role' then raise exception 'service role required';end if;if p_source not in('daangn','kakao','naver_email','homepage','phone','other') or p_event_id is null or char_length(p_event_id) not between 1 and 160 or char_length(trim(coalesce(p_message,''))) not between 1 and 4000 then raise exception 'invalid inbox event';end if;v_hash=encode(extensions.digest(p_source||':'||p_event_id,'sha256'),'hex');insert into public.consultation_inbox(source,external_event_id,received_at,sender_name,contact,subject,message,status,dedupe_hash,created_via) values(p_source,p_event_id,coalesce(p_received_at,now()),nullif(btrim(p_sender_name),''),nullif(btrim(p_contact),''),nullif(btrim(p_subject),''),btrim(p_message),'new',v_hash,'service_ingest') on conflict(source,external_event_id) do update set updated_at=public.consultation_inbox.updated_at returning * into r;return r;end$$;

commit;
