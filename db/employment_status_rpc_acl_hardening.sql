-- 운영 보정: Supabase의 명시 anon EXECUTE grant를 제거한다. authenticated 관리 RPC만 유지한다.
begin;
revoke all on function public.set_employment_status(uuid,text,date,text),public.disable_employee_account_preserve_records(uuid,text,text,date),public.approve_employee_profile(uuid),public.revoke_employee_profile_approval(uuid),public.update_employee_profile_field(uuid,text,text) from public,anon;
grant execute on function public.set_employment_status(uuid,text,date,text),public.disable_employee_account_preserve_records(uuid,text,text,date),public.approve_employee_profile(uuid),public.revoke_employee_profile_approval(uuid),public.update_employee_profile_field(uuid,text,text) to authenticated;
commit;
