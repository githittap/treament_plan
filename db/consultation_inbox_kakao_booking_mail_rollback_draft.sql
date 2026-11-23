-- LOCAL SYNTHETIC ROLLBACK CANDIDATE ONLY. Never run against production without independent review and backup.
-- Requires the sender to be stopped and the private gate to have been paused and confirmed.
-- Two top-level statements: the second obtains a fresh READ COMMITTED snapshot after the lock wait.
begin isolation level read committed;
set local lock_timeout = '5s';
do $$
declare gate_enabled boolean; pilot_hash bytea;
begin
  if current_setting('transaction_isolation') <> 'read committed' then
    raise exception 'rollback refused: READ COMMITTED required';
  end if;
  select c.enabled,c.pilot_booking_hash into gate_enabled,pilot_hash
    from dentweb_private.kakao_mail_control c
    where c.singleton=true for update;
  if not found or gate_enabled is distinct from false or pilot_hash is not null then
    raise exception 'rollback refused: mail gate is missing or not paused';
  end if;
end $$;
-- Gate -> inbox -> events: block all ordinary writers before taking the next snapshot.
lock table public.consultation_inbox in share row exclusive mode;
lock table dentweb_private.kakao_booking_events in share row exclusive mode;
do $$ begin
  if exists(select 1 from public.consultation_inbox where
       kakao_booking_number is not null or kakao_booking_state is not null
       or kakao_event_at is not null or kakao_requested_at is not null
       or kakao_mail_schedule is not null or kakao_mail_name is not null
       or kakao_mail_contact is not null or kakao_mail_schedule_text is not null
       or kakao_mail_product is not null or dentweb_claimed_by is not null
       or dentweb_claimed_at is not null or dentweb_claim_version is not null
       or kakao_booking_version is distinct from 0 or dentweb_cancel_ack is distinct from false)
     or exists(select 1 from dentweb_private.kakao_booking_events) then
    raise exception 'rollback refused: booking rows, event history, or mail data exist';
  end if;
end $$;
drop policy dentweb_inbox_matches_select on public.dentweb_inbox_matches;
create policy dentweb_inbox_matches_select on public.dentweb_inbox_matches
  for select to authenticated using (
    exists(select 1 from public.consultation_inbox i where i.id=dentweb_inbox_matches.inbox_id)
  );
alter table public.dentweb_inbox_matches drop column booking_version;
drop trigger consultation_inbox_guard_kakao_registration on public.consultation_inbox;
drop function public.consultation_inbox_claim_kakao_booking(uuid,boolean);
drop function public.consultation_inbox_enter_kakao_booking(uuid,bigint,text,boolean);
drop function public.consultation_inbox_guard_kakao_registration();
drop function public.consultation_inbox_ingest_kakao_bookings(jsonb);
drop function dentweb_private.kakao_mail_take_authorization(jsonb);
drop table dentweb_private.kakao_booking_events;
drop table dentweb_private.kakao_mail_control;
drop index public.consultation_inbox_kakao_booking_number_key;
alter table public.consultation_inbox
  drop column kakao_booking_number, drop column kakao_booking_version, drop column kakao_booking_state, drop column kakao_list_at, drop column kakao_event_at,
  drop column kakao_requested_at, drop column kakao_mail_schedule, drop column dentweb_claimed_by, drop column dentweb_claimed_at, drop column dentweb_claim_version, drop column dentweb_cancel_ack,
  drop column kakao_booking_name, drop column kakao_booking_contact_digits,
  drop column kakao_booking_schedule, drop column kakao_booking_product,
  drop column kakao_mail_name, drop column kakao_mail_contact,
  drop column kakao_mail_schedule_text, drop column kakao_mail_product;
alter table public.consultation_inbox
  add column kakao_booking_name text generated always as (public.dentweb_kakao_booking_value(source,external_event_id,message,'name')) stored,
  add column kakao_booking_contact_digits text generated always as (public.dentweb_kakao_booking_value(source,external_event_id,message,'contact')) stored,
  add column kakao_booking_schedule text generated always as (public.dentweb_kakao_booking_value(source,external_event_id,message,'schedule')) stored,
  add column kakao_booking_product text generated always as (public.dentweb_kakao_booking_value(source,external_event_id,message,'product')) stored;
do $$
declare saved_definition text;
begin
  select match_upsert_definition into strict saved_definition from dentweb_private.kakao_mail_restore_definition where singleton=true;
  execute saved_definition;
end $$;
drop table dentweb_private.kakao_mail_restore_definition;
-- Leave dentweb_private schema and its grants untouched: prior ownership is not known.
commit;
