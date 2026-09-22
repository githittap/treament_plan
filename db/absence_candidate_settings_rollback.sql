-- Fail-safe rollback: 기본값에서 바뀐 운영값은 삭제하지 않고 즉시 중단한다.
-- 두 기본값만 남아 있을 때에만 이 migration이 추가한 키를 제거한다.
do $$
begin
  if exists (
    select 1 from public.app_settings
    where (key = 'absence_confirm_after_minutes' and value <> '0')
       or (key = 'absence_exclude_pending_manual' and value <> 'true')
  ) then
    raise exception 'absence candidate settings have user values; rollback stopped to preserve them';
  end if;

  delete from public.app_settings
  where (key = 'absence_confirm_after_minutes' and value = '0')
     or (key = 'absence_exclude_pending_manual' and value = 'true');
end $$;
