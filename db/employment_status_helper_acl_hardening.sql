-- 운영 보정: 정책용 helper/my_role만 authenticated에 노출하고 내부 assert는 외부 실행을 제거한다.
begin;
revoke all on function public.employee_hub_access_allowed(),public.my_role() from public,anon;
grant execute on function public.employee_hub_access_allowed(),public.my_role() to authenticated;
revoke all on function public.assert_employment_owner(uuid),public.assert_employee_approver(uuid) from public,anon,authenticated;
commit;
