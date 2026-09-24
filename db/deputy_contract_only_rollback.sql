-- H-3 로컬 초안 롤백. 운영 적용 금지.
begin;
do $$ declare t text; begin
  foreach t in array array['attendance','att_months','attendance_issues','schedule_weeks','schedules','leave_requests','leave_ledger','holidays','calendar_events','notices','notice_reads','approval_docs','approval_steps','payroll_rows','payslips','monthly_reviews','bonus_rules','ledger_files','employee_documents','fingerprint_registration_requests'] loop
    if to_regclass('public.'||t) is not null then execute format('drop policy if exists deputy_contract_only_block on public.%I',t); end if;
  end loop;
end $$;
drop policy if exists contracts_select_deputy_self on public.contracts;
alter table if exists public.profiles drop constraint if exists profiles_role_check;
alter table if exists public.profiles add constraint profiles_role_check check (role in ('owner','chief','manager','staff'));
commit;
