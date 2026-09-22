-- Fail-safe rollback: migration 전에 있던 값·label·updated_at은 건드리지 않는다.
-- migration이 실제 추가한 기본값만 삭제하며, 사용자 변경이나 snapshot 불일치면 전체 rollback을 중단한다.
begin;

do $$
begin
  if to_regclass('public.absence_candidate_settings_migration_state') is null
     or (select count(*) from public.absence_candidate_settings_migration_state) <> 2 then
    raise exception 'absence candidate settings migration snapshot is missing; rollback stopped';
  end if;

  if exists (
    select 1
    from public.absence_candidate_settings_migration_state state
    left join public.app_settings current on current.key=state.key
    where (not state.existed_before and (
             current.key is null
          or (state.key='absence_confirm_after_minutes' and current.value <> '0')
          or (state.key='absence_exclude_pending_manual' and current.value <> 'true')
       ))
       or (state.existed_before and (
             (state.key='absence_confirm_after_minutes' and state.original_value <> '0')
          or (state.key='absence_exclude_pending_manual' and state.original_value <> 'true')
          or
             current.key is null
          or current.value is distinct from state.original_value
          or current.label is distinct from state.original_label
          or current.updated_at is distinct from state.original_updated_at
        ))
  ) then
    raise exception 'absence candidate settings changed after migration; rollback stopped to preserve them';
  end if;
end $$;

delete from public.app_settings current
using public.absence_candidate_settings_migration_state state
where current.key=state.key and not state.existed_before;

drop table public.absence_candidate_settings_migration_state;

commit;
