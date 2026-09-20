-- 로컬 검토용 초안. 운영 DB/다수 행 지급에는 적용하지 않는다.
-- 1년 미만 1개월 개근 1일 구조는 후보만 분리한다. 1년 이후 15일은 별도 확인 대상이다.
create table if not exists public.leave_accrual_runs (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles(user_id),
  due_date date not null,
  months_completed integer not null check (months_completed between 1 and 11),
  days numeric(3,1) not null default 1,
  ledger_id bigint references public.leave_ledger(id),
  created_at timestamptz not null default now(),
  unique (user_id,due_date)
);
alter table public.leave_accrual_runs enable row level security;
revoke all on table public.leave_accrual_runs from public,anon;
grant select on table public.leave_accrual_runs to authenticated;
drop policy if exists leave_accrual_runs_select_lead on public.leave_accrual_runs;
create policy leave_accrual_runs_select_lead on public.leave_accrual_runs for select to authenticated
using (public.my_role() in ('chief','owner') and exists (select 1 from public.profiles p where p.user_id=auth.uid() and p.active=true and p.approved=true));

create or replace function public.preview_monthly_leave_accruals(p_as_of date)
returns table(user_id uuid,user_name text,hire_date date,months_completed integer,due_date date,days numeric,already_recorded boolean)
language plpgsql security definer set search_path=public as $$
begin
  if auth.uid() is null or coalesce(public.my_role(),'')<>'owner' or not exists(select 1 from public.profiles x where x.user_id=auth.uid() and x.active=true and x.approved=true) then
    raise exception 'owner execution required';
  end if;
  return query with eligible as (
    select p.user_id,p.name,p.hire_date,
      greatest(0,((extract(year from age(p_as_of,p.hire_date))*12)+extract(month from age(p_as_of,p.hire_date)))::integer) as months_elapsed
    from public.profiles p
    where p.active=true and p.approved=true and p.hire_date is not null and p_as_of>=p.hire_date
  ), candidates as (
    select e.user_id,e.name,e.hire_date,m.months_completed
    from eligible e
    cross join lateral generate_series(1,least(11,e.months_elapsed)) as m(months_completed)
  )
  select c.user_id,c.name,c.hire_date,c.months_completed,
    (c.hire_date + (c.months_completed||' months')::interval)::date,
    1::numeric,
    exists(select 1 from public.leave_accrual_runs r where r.user_id=c.user_id and r.due_date=(c.hire_date + (c.months_completed||' months')::interval)::date)
  from candidates c
  where c.months_completed between 1 and 11;
end;
$$;

-- 근태 개근 확인이 연결되기 전에는 owner도 실제 ledger·run을 만들 수 없다.
create or replace function public.apply_monthly_leave_accruals(p_as_of date)
returns table(user_id uuid,granted_days numeric,created_runs integer)
language plpgsql security invoker set search_path=public as $$
declare caller_role text;
begin
  caller_role:=coalesce(public.my_role(),'');
  if auth.uid() is null or caller_role<>'owner' or not exists(select 1 from public.profiles x where x.user_id=auth.uid() and x.active=true and x.approved=true) then
    raise exception 'owner execution required';
  end if;
  raise exception 'attendance confirmation required; preview only';
end;
$$;
revoke all on function public.preview_monthly_leave_accruals(date) from public,anon;
revoke all on function public.apply_monthly_leave_accruals(date) from public,anon;
grant execute on function public.preview_monthly_leave_accruals(date) to authenticated;
grant execute on function public.apply_monthly_leave_accruals(date) to authenticated;
