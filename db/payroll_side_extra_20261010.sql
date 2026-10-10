-- 급여대장 보조 값·연결 안 된 인원. 선행 payroll_month_tools_draft.sql.
begin;
alter table public.payroll_rows add column if not exists side jsonb not null default '{}';
alter table public.payroll_row_archive add column if not exists side jsonb not null default '{}';
create table if not exists public.payroll_extra_rows (
 id uuid primary key default gen_random_uuid(),month text not null check(month ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
 source_sheet text not null check(source_sheet in('급여대장','일용대장','사업소득대장')),
 source_name text not null,user_id uuid,items jsonb not null default '{}',side jsonb not null default '{}',
 archived boolean not null default false,archived_at timestamptz,imported_at timestamptz not null default now(),imported_by uuid
);
alter table public.payroll_extra_rows add column if not exists archived_at timestamptz;
alter table public.payroll_extra_rows drop constraint if exists payroll_extra_rows_month_source_sheet_source_name_archived_key;
create unique index if not exists payroll_extra_rows_live_unique on public.payroll_extra_rows(month,source_sheet,source_name) where not archived;
update public.payroll_extra_rows set archived_at=imported_at where archived and archived_at is null;
alter table public.payroll_extra_rows enable row level security;
revoke all on public.payroll_extra_rows from public,anon,authenticated;
grant select,insert,update on public.payroll_extra_rows to authenticated;
drop policy if exists payroll_extra_owner on public.payroll_extra_rows;
create policy payroll_extra_owner on public.payroll_extra_rows for all to authenticated
 using(public.employee_hub_access_allowed() and public.my_role()='owner')
 with check(public.employee_hub_access_allowed() and public.my_role()='owner');
drop policy if exists payroll_extra_owner_gate on public.payroll_extra_rows;
create policy payroll_extra_owner_gate on public.payroll_extra_rows as restrictive for all to authenticated
 using(public.employee_hub_access_allowed() and public.my_role()='owner')
 with check(public.employee_hub_access_allowed() and public.my_role()='owner');
drop policy if exists deputy_contract_only_v4_block on public.payroll_extra_rows;
create policy deputy_contract_only_v4_block on public.payroll_extra_rows as restrictive for all to authenticated
 using(public.my_role()<>'deputy') with check(public.my_role()<>'deputy');
do $$begin if to_regprocedure('public._install_employee_hub_access_gate(regclass)') is not null then perform public._install_employee_hub_access_gate('public.payroll_extra_rows'::regclass);end if;end;$$;
-- 새 엑셀은 그 달 살아 있는 별도 인원을 교체, 수기는 같은 키만 갱신·추가한다. 보관분·상여 기록은 보존한다.
create or replace function public.payroll_extra_replace_month(p_month text,p_rows jsonb,p_replace boolean)
returns integer language plpgsql security definer set search_path='' as $$
declare n integer;
begin
  if auth.uid() is null or not coalesce(public.employee_hub_access_allowed(),false) or public.my_role() is distinct from 'owner' then raise exception 'owner required'; end if;
  if p_month is null or p_month !~ '^[0-9]{4}-(0[1-9]|1[0-2])$' then raise exception 'invalid month'; end if;
  if coalesce(jsonb_typeof(p_rows),'null')<>'array' then raise exception 'rows array required'; end if;
  if p_replace is null then raise exception 'replace mode required'; end if;
  perform pg_advisory_xact_lock(hashtext('payroll:'||p_month));
  if p_replace then
    delete from public.payroll_extra_rows where month=p_month and not archived;
    insert into public.payroll_extra_rows(month,source_sheet,source_name,user_id,items,side,imported_at,imported_by)
    select p_month,r.source_sheet,nullif(btrim(r.source_name),''),r.user_id,coalesce(r.items,'{}'::jsonb),coalesce(r.side,'{}'::jsonb),clock_timestamp(),auth.uid()
    from jsonb_to_recordset(p_rows) as r(source_sheet text,source_name text,user_id uuid,items jsonb,side jsonb);
    get diagnostics n=row_count;
  else
    insert into public.payroll_extra_rows(month,source_sheet,source_name,user_id,items,side,imported_at,imported_by)
    select p_month,r.source_sheet,nullif(btrim(r.source_name),''),r.user_id,coalesce(r.items,'{}'::jsonb),coalesce(r.side,'{}'::jsonb),clock_timestamp(),auth.uid()
    from jsonb_to_recordset(p_rows) as r(source_sheet text,source_name text,user_id uuid,items jsonb,side jsonb)
    on conflict(month,source_sheet,source_name) where not archived do update
    set user_id=excluded.user_id,items=coalesce(payroll_extra_rows.items,'{}'::jsonb)||excluded.items,side=coalesce(payroll_extra_rows.side,'{}'::jsonb)||excluded.side,imported_at=excluded.imported_at,imported_by=excluded.imported_by;
    get diagnostics n=row_count;
  end if;
  return n;
end$$;
revoke all on function public.payroll_extra_replace_month(text,jsonb,boolean) from public,anon,authenticated;
grant execute on function public.payroll_extra_replace_month(text,jsonb,boolean) to authenticated;
-- 기존 화면의 두 인자 호출은 전체 교체 동작을 유지한다.
create or replace function public.payroll_extra_replace_month(p_month text,p_rows jsonb)
returns integer language sql security definer set search_path='' as $$
  select public.payroll_extra_replace_month(p_month,p_rows,true);
$$;
revoke all on function public.payroll_extra_replace_month(text,jsonb) from public,anon,authenticated;
grant execute on function public.payroll_extra_replace_month(text,jsonb) to authenticated;

-- 직원 수기 입력은 미입력 항목을 보존하고 엑셀 행은 원본 전체 값으로 저장한다.
create or replace function public.payroll_save_month(p_month text,p_rows jsonb)
returns integer language plpgsql security definer set search_path='' as $$
declare r record; new_items jsonb; new_side jsonb; n integer:=0;
begin
 if auth.uid() is null or not coalesce(public.employee_hub_access_allowed(),false) or public.my_role() is distinct from 'owner' then raise exception 'owner required'; end if;
 if p_month is null or p_month !~ '^[0-9]{4}-(0[1-9]|1[0-2])$' then raise exception 'invalid month'; end if;
 if coalesce(jsonb_typeof(p_rows),'null')<>'array' then raise exception 'rows array required'; end if;
 perform pg_advisory_xact_lock(hashtext('payroll:'||p_month));
 for r in select * from jsonb_to_recordset(p_rows) as x(user_id uuid,items jsonb,side jsonb,manual boolean,imported_by text) loop
  if r.user_id is null then raise exception 'user required'; end if;
  new_items:=coalesce(r.items,'{}'::jsonb);new_side:=coalesce(r.side,'{}'::jsonb);
  if coalesce(r.manual,false) then
   select coalesce(jsonb_object_agg(key,value),'{}'::jsonb) into new_items from jsonb_each(new_items) where value not in ('null'::jsonb,'""'::jsonb);
   select coalesce(jsonb_object_agg(key,value),'{}'::jsonb) into new_side from jsonb_each(new_side) where value not in ('null'::jsonb,'""'::jsonb);
   select coalesce(items,'{}'::jsonb)||new_items,coalesce(side,'{}'::jsonb)||new_side into new_items,new_side from public.payroll_rows where month=p_month and user_id=r.user_id;
   if not found then new_items:=coalesce(r.items,'{}'::jsonb);new_side:=coalesce(r.side,'{}'::jsonb);
    select coalesce(jsonb_object_agg(key,value),'{}'::jsonb) into new_items from jsonb_each(new_items) where value not in ('null'::jsonb,'""'::jsonb);
    select coalesce(jsonb_object_agg(key,value),'{}'::jsonb) into new_side from jsonb_each(new_side) where value not in ('null'::jsonb,'""'::jsonb);
   end if;
  end if;
  insert into public.payroll_rows(month,user_id,items,side,net,imported_at,imported_by)
  values(p_month,r.user_id,new_items,new_side,(new_items->>'net_pay')::numeric,clock_timestamp(),r.imported_by)
  on conflict(month,user_id) do update set items=excluded.items,side=excluded.side,net=excluded.net,imported_at=excluded.imported_at,imported_by=excluded.imported_by;
  n:=n+1;
 end loop;
 return n;
end$$;
revoke all on function public.payroll_save_month(text,jsonb) from public,anon,authenticated;
grant execute on function public.payroll_save_month(text,jsonb) to authenticated;

-- 화면은 직원 행·별도 인원을 하나의 요청·트랜잭션으로 확정한다.
create or replace function public.payroll_save_month(p_month text,p_rows jsonb,p_extra_rows jsonb,p_replace boolean)
returns integer language plpgsql security definer set search_path='' as $$
declare n integer; e integer;
begin
 -- 직원 RPC·별도 인원 RPC의 원장 확인과 같은 월 잠금이 이 트랜잭션 안에서 유지된다.
 n:=public.payroll_save_month(p_month,p_rows);
 e:=public.payroll_extra_replace_month(p_month,p_extra_rows,p_replace);
 return n+e;
end$$;
revoke all on function public.payroll_save_month(text,jsonb,jsonb,boolean) from public,anon,authenticated;
grant execute on function public.payroll_save_month(text,jsonb,jsonb,boolean) to authenticated;

create or replace function public.payroll_move_month(p_from text,p_to text)
returns integer language plpgsql security definer set search_path='' as $$
declare n integer; e integer;
begin
  if auth.uid() is null or not public.employee_hub_access_allowed() or public.my_role()<>'owner' then raise exception 'owner required'; end if;
  if p_from !~ '^[0-9]{4}-(0[1-9]|1[0-2])$' or p_to !~ '^[0-9]{4}-(0[1-9]|1[0-2])$' or p_from=p_to then raise exception 'invalid month'; end if;
  perform pg_advisory_xact_lock(hashtext('payroll:'||least(p_from,p_to)));
  perform pg_advisory_xact_lock(hashtext('payroll:'||greatest(p_from,p_to)));
  if exists(select 1 from public.payslips where month in (p_from,p_to)) then raise exception 'payslip already exists'; end if;
  if exists(select 1 from public.payroll_rows where month=p_to) or exists(select 1 from public.payroll_uploads where month=p_to) or exists(select 1 from public.payroll_extra_rows where month=p_to and not archived) then raise exception 'destination month is not empty'; end if;
  update public.payroll_rows set month=p_to where month=p_from;get diagnostics n=row_count;
  update public.payroll_extra_rows set month=p_to where month=p_from and not archived;get diagnostics e=row_count;
  n:=n+e;
  if n=0 then raise exception 'source month has no payroll rows'; end if;
  update public.payroll_uploads set month=p_to where month=p_from;
  return n;
end$$;
revoke all on function public.payroll_move_month(text,text) from public,anon,authenticated;
grant execute on function public.payroll_move_month(text,text) to authenticated;

create or replace function public.payroll_archive_month(p_month text)
returns integer language plpgsql security definer set search_path='' as $$
declare n integer; e integer; batch_at timestamptz;
begin
  if auth.uid() is null or not public.employee_hub_access_allowed() or public.my_role()<>'owner' then raise exception 'owner required'; end if;
  if p_month !~ '^[0-9]{4}-(0[1-9]|1[0-2])$' then raise exception 'invalid month'; end if;
  perform pg_advisory_xact_lock(hashtext('payroll:'||p_month));
  if exists(select 1 from public.payslips where month=p_month) then raise exception 'payslip already exists'; end if;
  batch_at:=clock_timestamp();
  insert into public.payroll_row_archive(original_id,month,user_id,items,net,imported_at,imported_by,side,archived_by,archived_at)
  select id,month,user_id,items,net,imported_at,imported_by,side,auth.uid(),batch_at from public.payroll_rows where month=p_month;
  get diagnostics n=row_count;
  update public.payroll_extra_rows set archived=true,archived_at=batch_at where month=p_month and not archived;get diagnostics e=row_count;
  n:=n+e;
  if n=0 then raise exception 'month has no payroll rows'; end if;
  delete from public.payroll_rows where month=p_month;
  return n;
end$$;
revoke all on function public.payroll_archive_month(text) from public,anon,authenticated;
grant execute on function public.payroll_archive_month(text) to authenticated;

create or replace function public.payroll_restore_month(p_month text)
returns integer language plpgsql security definer set search_path='' as $$
declare n integer; e integer; batch_at timestamptz;
begin
  if auth.uid() is null or not public.employee_hub_access_allowed() or public.my_role()<>'owner' then raise exception 'owner required'; end if;
  if p_month !~ '^[0-9]{4}-(0[1-9]|1[0-2])$' then raise exception 'invalid month'; end if;
  perform pg_advisory_xact_lock(hashtext('payroll:'||p_month));
  if exists(select 1 from public.payroll_rows where month=p_month) or exists(select 1 from public.payroll_extra_rows where month=p_month and not archived) then raise exception 'destination month is not empty'; end if;
  select max(archived_at) into batch_at from (
    select archived_at from public.payroll_row_archive where month=p_month
    union all select archived_at from public.payroll_extra_rows where month=p_month and archived
  ) batches;
  insert into public.payroll_rows(month,user_id,items,net,imported_at,imported_by,side)
  select month,user_id,items,net,imported_at,imported_by,side from public.payroll_row_archive where month=p_month and archived_at=batch_at;
  get diagnostics n=row_count;
  update public.payroll_extra_rows set archived=false,archived_at=null where month=p_month and archived and archived_at=batch_at;get diagnostics e=row_count;
  n:=n+e;
  if n=0 then raise exception 'archive not found'; end if;
  delete from public.payroll_row_archive where month=p_month and archived_at=batch_at;
  return n;
end$$;
revoke all on function public.payroll_restore_month(text) from public,anon,authenticated;
grant execute on function public.payroll_restore_month(text) to authenticated;

commit;
