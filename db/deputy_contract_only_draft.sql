-- H-3 로컬 초안: deputy는 본인 근로계약서만 열람한다.
-- 운영 적용 금지. 선행: hr_schema + hr_policies + employment_status_access_block_phase_c.
begin;

alter table if exists public.profiles drop constraint if exists profiles_role_check;
alter table if exists public.profiles add constraint profiles_role_check
  check (role in ('owner','chief','manager','staff','deputy'));

create or replace function public.update_employee_profile_field(p_user_id uuid,p_field text,p_value text)
returns void language plpgsql security definer set search_path='' as $$
declare a uuid:=auth.uid(); t public.profiles%rowtype;
begin
  if not public.employee_hub_access_allowed() or not exists(select 1 from public.profiles p where p.user_id=a and p.role='owner') then raise exception 'active approved owner required'; end if;
  if p_field not in ('role','dept','fp_id') then raise exception 'profile field is not allowed'; end if;
  select * into t from public.profiles where user_id=p_user_id for update;
  if not found then raise exception 'profile not found'; end if;
  if p_field='role' then
    if p_value not in ('owner','chief','manager','staff','deputy') then raise exception 'invalid profile role'; end if;
    if a=p_user_id then raise exception 'cannot change your own role'; end if;
    if t.role='owner' and t.active and t.role is distinct from p_value and (select count(*) from public.profiles where role='owner' and active and approved)<=1 then raise exception 'cannot change last active owner'; end if;
    update public.profiles set role=p_value where user_id=p_user_id;
  elsif p_field='dept' then update public.profiles set dept=nullif(btrim(p_value),'') where user_id=p_user_id;
  else update public.profiles set fp_id=nullif(btrim(p_value),'') where user_id=p_user_id;
  end if;
end $$;

drop policy if exists contracts_select_scoped on public.contracts;
create policy contracts_select_deputy_self on public.contracts for select to authenticated
using (public.my_role() in ('manager','chief','owner') or (public.my_role()='deputy' and user_id=auth.uid()) or (user_id=auth.uid() and (status='대기' or (status='서명완료' and signed_at>now()-interval '5 days'))));

do $$ declare t text; begin
  foreach t in array array['attendance','att_months','attendance_issues','schedule_weeks','schedules','leave_requests','leave_ledger','holidays','calendar_events','notices','notice_reads','approval_docs','approval_steps','payroll_rows','payslips','monthly_reviews','bonus_rules','ledger_files','employee_documents','fingerprint_registration_requests'] loop
    if to_regclass('public.'||t) is not null then
      execute format('drop policy if exists deputy_contract_only_block on public.%I',t);
      execute format('create policy deputy_contract_only_block on public.%I as restrictive for all to authenticated using (public.my_role() <> ''deputy'') with check (public.my_role() <> ''deputy'')',t);
    end if;
  end loop;
end $$;

revoke all on function public.update_employee_profile_field(uuid,text,text) from public,anon;
grant execute on function public.update_employee_profile_field(uuid,text,text) to authenticated;
commit;

-- ROLLBACK (로컬 초안 전용): deputy 정책을 제거하고 기존 4역할 계약으로 복귀한다.
-- begin;
-- do $$ declare t text; begin
--   foreach t in array array['attendance','att_months','attendance_issues','schedule_weeks','schedules','leave_requests','leave_ledger','holidays','calendar_events','notices','notice_reads','approval_docs','approval_steps','payroll_rows','payslips','monthly_reviews','bonus_rules','ledger_files','employee_documents','fingerprint_registration_requests'] loop
--     if to_regclass('public.'||t) is not null then execute format('drop policy if exists deputy_contract_only_block on public.%I',t); end if;
--   end loop;
-- end $$;
-- drop policy if exists contracts_select_deputy_self on public.contracts;
-- alter table if exists public.profiles drop constraint if exists profiles_role_check;
-- alter table if exists public.profiles add constraint profiles_role_check check (role in ('owner','chief','manager','staff'));
-- commit;
