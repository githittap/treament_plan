-- db/holiday_fix_20261125d.sql 되돌리기: 연차 일수 재확인 트리거를 걷음. 기록 고유번호(record_uid) 칸은 남김(되돌리기·복원이 계속 씀).
begin;
drop trigger if exists leave_requests_days_check on public.leave_requests;
drop function if exists public.leave_requests_days_check();
commit;
