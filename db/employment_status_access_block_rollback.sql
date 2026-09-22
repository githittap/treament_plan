-- 보존 데이터가 생긴 뒤에는 rollback으로 이력이나 차단 사실을 지우지 않는다.
begin;

do $$
begin
  if exists (select 1 from public.profile_employment_history)
     or exists (select 1 from public.profiles where employment_status <> '재직' or account_access_status <> '활성' or account_disabled_at is not null) then
    raise exception 'employment rollback blocked: preserved history, non-employed, or account-blocked data exists';
  end if;
end;
$$;

revoke execute on function public.set_employment_status(uuid,text,date,text) from authenticated;
revoke execute on function public.disable_employee_account_preserve_records(uuid,text,text,date) from authenticated;
drop function if exists public.disable_employee_account_preserve_records(uuid,text,text,date);
drop function if exists public.set_employment_status(uuid,text,date,text);
drop function if exists public.assert_employment_owner(uuid);
drop policy if exists profile_employment_history_select_lead on public.profile_employment_history;
drop table public.profile_employment_history;
alter table public.profiles
  drop column account_disabled_reason,
  drop column account_disabled_by,
  drop column account_disabled_at,
  drop column account_access_status,
  drop column employment_reason,
  drop column employment_effective_date,
  drop column employment_status;
grant delete on table public.profiles to authenticated;
create policy profiles_delete_owner on public.profiles for delete to authenticated using (public.my_role() = 'owner');

commit;
