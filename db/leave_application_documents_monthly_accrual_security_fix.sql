-- Task 3 보정: 기존 default privilege를 명시적으로 회수하고, 미리보기 함수도 호출자 권한으로 실행한다.

revoke all on table public.leave_application_documents from authenticated;
grant select,insert,delete on table public.leave_application_documents to authenticated;

revoke all on table public.leave_accrual_runs from authenticated;
grant select on table public.leave_accrual_runs to authenticated;

alter function public.preview_monthly_leave_accruals(date) security invoker;
