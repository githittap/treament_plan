begin;

drop function if exists public.dentweb_inbox_match_upsert(jsonb);
drop function if exists public.dentweb_monthly_first_visits_replace(jsonb);
drop table if exists public.dentweb_inbox_matches;
drop table if exists public.dentweb_monthly_first_visits;
alter table public.consultation_inbox
  drop column if exists kakao_booking_name,
  drop column if exists kakao_booking_contact_digits,
  drop column if exists kakao_booking_schedule,
  drop column if exists kakao_booking_product;
drop function if exists public.dentweb_kakao_booking_value(text,text,text,text);
drop function if exists public.dentweb_kakao_booking_date(text,timestamptz);

commit;
