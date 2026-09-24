-- H-3 로컬 초안 롤백. 운영 적용 금지.
begin;
do $$ declare t text; begin
  foreach t in array array['attendance','att_months','attendance_issues','attendance_manual_entries','schedule_weeks','schedules','schedule_people','leave_requests','leave_ledger','leave_application_documents','holidays','calendar_events','notices','notice_reads','approval_docs','approval_steps','payroll_rows','payslips','monthly_reviews','bonus_rules','ledger_files','employee_documents','fingerprint_registration_requests','deposits'] loop
    if to_regclass('public.'||t) is not null then execute format('drop policy if exists deputy_contract_only_block on public.%I',t); end if;
  end loop;
end $$;
drop policy if exists deputy_contract_only_storage_block on storage.objects;
drop policy if exists contracts_select_deputy_self on public.contracts;
create policy contracts_select_scoped on public.contracts for select to authenticated
using (public.my_role() in ('manager','chief','owner') or (user_id=auth.uid() and (status='대기' or (status='서명완료' and signed_at>now()-interval '5 days'))));
alter table if exists public.profiles drop constraint if exists profiles_role_check;
alter table if exists public.profiles add constraint profiles_role_check check (role in ('owner','chief','manager','staff'));
create or replace function public.update_employee_profile_field(p_user_id uuid,p_field text,p_value text) returns void language plpgsql security definer set search_path='' as $$declare a uuid:=auth.uid();t public.profiles%rowtype;begin if not public.employee_hub_access_allowed() or not exists(select 1 from public.profiles p where p.user_id=a and p.role='owner') then raise exception 'active approved owner required';end if;if p_field not in('role','dept','fp_id') then raise exception 'profile field is not allowed';end if;select * into t from public.profiles where user_id=p_user_id for update;if not found then raise exception 'profile not found';end if;if p_field='role' then if p_value not in('owner','chief','manager','staff') then raise exception 'invalid profile role';end if;if a=p_user_id then raise exception 'cannot change your own role';end if;if t.role='owner' and t.active and t.role is distinct from p_value and(select count(*) from public.profiles where role='owner' and active and approved)<=1 then raise exception 'cannot change last active owner';end if;update public.profiles set role=p_value where user_id=p_user_id;elsif p_field='dept' then update public.profiles set dept=nullif(btrim(p_value),'') where user_id=p_user_id;else update public.profiles set fp_id=nullif(btrim(p_value),'') where user_id=p_user_id;end if;end$$;
commit;
