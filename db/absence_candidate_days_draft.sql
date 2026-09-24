-- E장 로컬 적용 초안: 무단결근 후보 기준의 '며칠' 값을 기존 분 기준과 분리한다.
-- 운영 DB·실데이터에는 자동 적용하지 않는다.
begin;
create table if not exists public.absence_candidate_days_migration_state(
  key text primary key check(key='absence_confirm_after_days'),
  existed_before boolean not null, original_value text, original_label text, original_updated_at timestamptz
);
revoke all on table public.absence_candidate_days_migration_state from public,anon,authenticated;
insert into public.absence_candidate_days_migration_state(key,existed_before,original_value,original_label,original_updated_at)
values('absence_confirm_after_days',exists(select 1 from public.app_settings where key='absence_confirm_after_days'),(select value from public.app_settings where key='absence_confirm_after_days'),(select label from public.app_settings where key='absence_confirm_after_days'),(select updated_at from public.app_settings where key='absence_confirm_after_days'))
on conflict(key) do nothing;
insert into public.app_settings(key,value,label) values('absence_confirm_after_days','1','무단결근 후보 기준 일수') on conflict(key) do nothing;
commit;
