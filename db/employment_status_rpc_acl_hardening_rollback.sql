-- 보안상 anon EXECUTE를 복원하지 않는다. authenticated 최소권한을 유지하는 fail-safe no-op rollback이다.
begin;
revoke all on function public.set_employment_status(uuid,text,date,text),public.disable_employee_account_preserve_records(uuid,text,text,date),public.approve_employee_profile(uuid),public.revoke_employee_profile_approval(uuid),public.update_employee_profile_field(uuid,text,text) from public,anon;
grant execute on function public.set_employment_status(uuid,text,date,text),public.disable_employee_account_preserve_records(uuid,text,text,date),public.approve_employee_profile(uuid),public.revoke_employee_profile_approval(uuid),public.update_employee_profile_field(uuid,text,text) to authenticated;
commit;
