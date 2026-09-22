-- fail-safe rollback: anon/PUBLIC helper 실행은 복원하지 않고 authenticated 정책 경로만 유지한다.
begin;
revoke all on function public.employee_hub_access_allowed(),public.my_role() from public,anon;
grant execute on function public.employee_hub_access_allowed(),public.my_role() to authenticated;
revoke all on function public.assert_employment_owner(uuid),public.assert_employee_approver(uuid) from public,anon,authenticated;
commit;
