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
revoke execute on function public.approve_employee_profile(uuid) from authenticated;
revoke execute on function public.update_employee_profile_field(uuid,text,text) from authenticated;
revoke execute on function public.revoke_employee_profile_approval(uuid) from authenticated;
drop function if exists public.revoke_employee_profile_approval(uuid);
drop function if exists public.update_employee_profile_field(uuid,text,text);
drop function if exists public.approve_employee_profile(uuid);
drop function if exists public.assert_employee_approver(uuid);
drop function if exists public.disable_employee_account_preserve_records(uuid,text,text,date);
drop function if exists public.set_employment_status(uuid,text,date,text);
drop function if exists public.assert_employment_owner(uuid);
create or replace function public._remove_employee_hub_access_gate(p_table regclass)
returns void language plpgsql set search_path = '' as $$
begin
  if p_table is not null then
    if p_table::text='storage.objects' then execute format('drop policy if exists employee_hub_storage_access_gate on %s', p_table);
    else execute format('drop policy if exists employee_hub_access_gate on %s', p_table); end if;
  end if;
end;
$$;
select public._remove_employee_hub_access_gate(to_regclass('storage.objects'));
select public._remove_employee_hub_access_gate(to_regclass('public.profiles'));
select public._remove_employee_hub_access_gate(to_regclass('public.attendance'));
select public._remove_employee_hub_access_gate(to_regclass('public.att_months'));
select public._remove_employee_hub_access_gate(to_regclass('public.attendance_issues'));
select public._remove_employee_hub_access_gate(to_regclass('public.schedule_weeks'));
select public._remove_employee_hub_access_gate(to_regclass('public.schedules'));
select public._remove_employee_hub_access_gate(to_regclass('public.schedule_people'));
select public._remove_employee_hub_access_gate(to_regclass('public.leave_requests'));
select public._remove_employee_hub_access_gate(to_regclass('public.leave_ledger'));
select public._remove_employee_hub_access_gate(to_regclass('public.holidays'));
select public._remove_employee_hub_access_gate(to_regclass('public.calendar_events'));
select public._remove_employee_hub_access_gate(to_regclass('public.notices'));
select public._remove_employee_hub_access_gate(to_regclass('public.notice_reads'));
select public._remove_employee_hub_access_gate(to_regclass('public.contract_templates'));
select public._remove_employee_hub_access_gate(to_regclass('public.contracts'));
select public._remove_employee_hub_access_gate(to_regclass('public.approval_docs'));
select public._remove_employee_hub_access_gate(to_regclass('public.approval_steps'));
select public._remove_employee_hub_access_gate(to_regclass('public.payroll_rows'));
select public._remove_employee_hub_access_gate(to_regclass('public.payslips'));
select public._remove_employee_hub_access_gate(to_regclass('public.monthly_reviews'));
select public._remove_employee_hub_access_gate(to_regclass('public.bonus_rules'));
select public._remove_employee_hub_access_gate(to_regclass('public.applicants'));
select public._remove_employee_hub_access_gate(to_regclass('public.ledger_files'));
select public._remove_employee_hub_access_gate(to_regclass('public.onboarding_items'));
select public._remove_employee_hub_access_gate(to_regclass('public.onboarding_checks'));
select public._remove_employee_hub_access_gate(to_regclass('public.confidential_access'));
select public._remove_employee_hub_access_gate(to_regclass('public.confidential_records'));
select public._remove_employee_hub_access_gate(to_regclass('public.profile_employment_history'));
select public._remove_employee_hub_access_gate(to_regclass('public.employee_contract_terms'));
select public._remove_employee_hub_access_gate(to_regclass('public.employee_documents'));
select public._remove_employee_hub_access_gate(to_regclass('public.employee_signature_vault'));
select public._remove_employee_hub_access_gate(to_regclass('public.employee_signature_uses'));
select public._remove_employee_hub_access_gate(to_regclass('public.employee_signature_audit'));
select public._remove_employee_hub_access_gate(to_regclass('public.leave_application_documents'));
select public._remove_employee_hub_access_gate(to_regclass('public.leave_application_document_events'));
select public._remove_employee_hub_access_gate(to_regclass('public.push_subscriptions'));
drop function public._remove_employee_hub_access_gate(regclass);
-- apply가 push helper를 차단-aware 정의로 바꿨으므로, gate helper를 지우기 전에
-- push migration의 원래 active+approved 의미와 권한을 복원한다.
do $$
begin
  if to_regnamespace('employee_hub_private') is not null then
    execute $sql$
      create or replace function employee_hub_private.push_subscription_access_allowed(p_user uuid)
      returns boolean language sql stable security definer set search_path=''
      as $fn$ select p_user=auth.uid() and exists(select 1 from public.profiles p where p.user_id=p_user and p.active and p.approved) $fn$
    $sql$;
    revoke all on function employee_hub_private.push_subscription_access_allowed(uuid) from public,anon,authenticated,service_role;
    grant execute on function employee_hub_private.push_subscription_access_allowed(uuid) to authenticated;
  end if;
end;
$$;
drop function if exists public.employee_hub_access_allowed();
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
create or replace function public.my_role()
returns text language sql stable security definer set search_path = public, pg_temp
as $$ select coalesce((select p.role from public.profiles p where p.user_id=auth.uid()), 'staff'); $$;
revoke all on function public.my_role() from public;
grant execute on function public.my_role() to authenticated;
grant update on table public.profiles to authenticated;
create policy profiles_update_owner on public.profiles for update to authenticated
using (public.my_role()='owner') with check (public.my_role()='owner');
grant delete on table public.profiles to authenticated;
create policy profiles_delete_owner on public.profiles for delete to authenticated using (public.my_role() = 'owner');

commit;
