-- 이미 적용된 결근 후보 migration marker의 최소 ACL 보완.
-- marker 행·구조·RLS·app_settings 값은 변경하지 않고 공개 역할의 table privilege만 회수한다.
do $$
begin
  if to_regclass('public.absence_candidate_settings_migration_state') is not null then
    revoke all on table public.absence_candidate_settings_migration_state from public, anon, authenticated;
  end if;
end $$;

-- rollback은 기존 absence_candidate_settings_rollback.sql이 marker table을 안전하게 제거한다.
-- marker가 이미 제거된 환경에서는 이 보완 SQL도 아무 변경 없이 종료한다.
