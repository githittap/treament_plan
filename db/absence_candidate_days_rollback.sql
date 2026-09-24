-- E장 로컬 적용 초안 롤백: 변경된 값이면 보존을 위해 중단한다.
do $$ begin
  if not exists(select 1 from public.absence_candidate_days_migration_state where key='absence_confirm_after_days') then raise exception 'absence days snapshot missing; rollback stopped'; end if;
  if exists(select 1 from public.absence_candidate_days_migration_state s join public.app_settings a using(key) where a.value<>'1' and not s.existed_before) then raise exception 'absence days changed after migration; rollback stopped'; end if;
end $$;
delete from public.app_settings where key='absence_confirm_after_days' and not exists(select 1 from public.absence_candidate_days_migration_state where key='absence_confirm_after_days' and existed_before);
drop table public.absence_candidate_days_migration_state;
