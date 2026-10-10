-- side 또는 계정 없는 보관 인원이 있으면 중단하고 원자료를 남긴다.
begin;
do $$begin
 if exists(select 1 from public.payroll_rows where side<>'{}'::jsonb) or exists(select 1 from public.payroll_row_archive where side<>'{}'::jsonb) or exists(select 1 from public.payroll_extra_rows) then
 raise exception 'payroll side/extra data exists; rollback stopped without deleting data';end if;
end;$$;
create or replace function public.payroll_move_month(p_from text,p_to text)
returns integer language plpgsql security definer set search_path='' as $$
declare n integer;
begin
  if auth.uid() is null or not public.employee_hub_access_allowed() or public.my_role()<>'owner' then raise exception 'owner required'; end if;
  if p_from !~ '^[0-9]{4}-(0[1-9]|1[0-2])$' or p_to !~ '^[0-9]{4}-(0[1-9]|1[0-2])$' or p_from=p_to then raise exception 'invalid month'; end if;
  perform pg_advisory_xact_lock(hashtext('payroll:'||least(p_from,p_to)));
  perform pg_advisory_xact_lock(hashtext('payroll:'||greatest(p_from,p_to)));
  if exists(select 1 from public.payslips where month in (p_from,p_to)) then raise exception 'payslip already exists'; end if;
  if exists(select 1 from public.payroll_rows where month=p_to) or exists(select 1 from public.payroll_uploads where month=p_to) then raise exception 'destination month is not empty'; end if;
  update public.payroll_rows set month=p_to where month=p_from;get diagnostics n=row_count;
  if n=0 then raise exception 'source month has no payroll rows'; end if;
  update public.payroll_uploads set month=p_to where month=p_from;
  return n;
end$$;
revoke all on function public.payroll_move_month(text,text) from public,anon,authenticated;
grant execute on function public.payroll_move_month(text,text) to authenticated;

create or replace function public.payroll_archive_month(p_month text)
returns integer language plpgsql security definer set search_path='' as $$
declare n integer;
begin
  if auth.uid() is null or not public.employee_hub_access_allowed() or public.my_role()<>'owner' then raise exception 'owner required'; end if;
  if p_month !~ '^[0-9]{4}-(0[1-9]|1[0-2])$' then raise exception 'invalid month'; end if;
  perform pg_advisory_xact_lock(hashtext('payroll:'||p_month));
  if exists(select 1 from public.payslips where month=p_month) then raise exception 'payslip already exists'; end if;
  insert into public.payroll_row_archive(original_id,month,user_id,items,net,imported_at,imported_by,archived_by)
  select id,month,user_id,items,net,imported_at,imported_by,auth.uid() from public.payroll_rows where month=p_month;
  get diagnostics n=row_count;
  if n=0 then raise exception 'month has no payroll rows'; end if;
  delete from public.payroll_rows where month=p_month;
  return n;
end$$;
revoke all on function public.payroll_archive_month(text) from public,anon,authenticated;
grant execute on function public.payroll_archive_month(text) to authenticated;

create or replace function public.payroll_restore_month(p_month text)
returns integer language plpgsql security definer set search_path='' as $$
declare n integer;
begin
  if auth.uid() is null or not public.employee_hub_access_allowed() or public.my_role()<>'owner' then raise exception 'owner required'; end if;
  if p_month !~ '^[0-9]{4}-(0[1-9]|1[0-2])$' then raise exception 'invalid month'; end if;
  perform pg_advisory_xact_lock(hashtext('payroll:'||p_month));
  if exists(select 1 from public.payroll_rows where month=p_month) then raise exception 'destination month is not empty'; end if;
  insert into public.payroll_rows(month,user_id,items,net,imported_at,imported_by)
  select month,user_id,items,net,imported_at,imported_by from public.payroll_row_archive where month=p_month;
  get diagnostics n=row_count;
  if n=0 then raise exception 'archive not found'; end if;
  delete from public.payroll_row_archive where month=p_month;
  return n;
end$$;
revoke all on function public.payroll_restore_month(text) from public,anon,authenticated;
grant execute on function public.payroll_restore_month(text) to authenticated;

drop function if exists public.payroll_save_month(text,jsonb,jsonb,boolean);
drop function if exists public.payroll_save_month(text,jsonb);
drop function if exists public.payroll_extra_replace_month(text,jsonb);
drop function if exists public.payroll_extra_replace_month(text,jsonb,boolean);
drop table public.payroll_extra_rows;
alter table public.payroll_rows drop column side;
alter table public.payroll_row_archive drop column side;
commit;
