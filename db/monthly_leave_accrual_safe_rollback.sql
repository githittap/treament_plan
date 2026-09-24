-- Z②-15 안전 중단 초안: 자동 적립 적용만 차단한다.
-- 기존 leave_ledger, leave_accrual_runs 및 지급된 일수는 삭제·수정하지 않는다.
-- 전체 스키마 역삭제는 기존 수기·자동 지급 이력 보호를 위해 제공하지 않는다.
begin;
create or replace function public.apply_monthly_leave_accruals(
  p_as_of date,
  p_attendance_confirmations jsonb,
  p_apply_confirmed boolean
)
returns table(user_id uuid,granted_days numeric,created_runs integer)
language plpgsql security invoker set search_path=public as $$
begin
  raise exception 'automatic leave accrual paused; preview only';
end;
$$;
revoke all on function public.apply_monthly_leave_accruals(date,jsonb,boolean) from public,anon;
grant execute on function public.apply_monthly_leave_accruals(date,jsonb,boolean) to authenticated;
commit;
