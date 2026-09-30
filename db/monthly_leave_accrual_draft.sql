-- 로컬 검토용 초안. 운영 DB·실제 직원 데이터에는 적용하지 않는다.
-- 기본 호출은 preview-only다. 실제 적용은 미리보기 뒤 원장이 개근 기간을 명시 확인한 호출만 허용한다.
create table if not exists public.leave_accrual_runs (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles(user_id),
  due_date date not null,
  accrual_kind text not null default 'monthly'
    check (accrual_kind in ('monthly','annual')),
  months_completed integer not null check (months_completed between 1 and 12),
  target_days numeric(3,1) not null default 1,
  days numeric(3,1) not null default 1,
  ledger_id bigint references public.leave_ledger(id),
  attendance_confirmed_by uuid references public.profiles(user_id),
  attendance_confirmed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (user_id,due_date)
);

alter table public.leave_accrual_runs
  add column if not exists accrual_kind text not null default 'monthly',
  add column if not exists target_days numeric(3,1) not null default 1,
  add column if not exists attendance_confirmed_by uuid references public.profiles(user_id),
  add column if not exists attendance_confirmed_at timestamptz;

-- 이전 초안에서 만든 월차 실행 이력이 있어도 새 누적 목표 제약을 안전하게 통과시킨다.
update public.leave_accrual_runs
set accrual_kind=case when months_completed=12 then 'annual' else 'monthly' end,
    target_days=case when months_completed=12 then 15 else months_completed end;

alter table public.leave_accrual_runs
  drop constraint if exists leave_accrual_runs_months_completed_check,
  drop constraint if exists leave_accrual_runs_accrual_kind_check,
  drop constraint if exists leave_accrual_runs_target_days_check,
  drop constraint if exists leave_accrual_runs_days_check,
  add constraint leave_accrual_runs_months_completed_check
    check (months_completed between 1 and 12),
  add constraint leave_accrual_runs_accrual_kind_check
    check (accrual_kind in ('monthly','annual')),
  add constraint leave_accrual_runs_target_days_check
    check (
      (accrual_kind='monthly' and months_completed between 1 and 11 and target_days=months_completed)
      or (accrual_kind='annual' and months_completed=12 and target_days=15)
    ),
  add constraint leave_accrual_runs_days_check
    check (days>=0 and days<=target_days);

alter table public.leave_accrual_runs enable row level security;
revoke all on table public.leave_accrual_runs from public,anon,authenticated;
grant select,insert on table public.leave_accrual_runs to authenticated;
revoke all on sequence public.leave_accrual_runs_id_seq from public,anon;
grant usage,select on sequence public.leave_accrual_runs_id_seq to authenticated;

drop policy if exists leave_accrual_runs_select_lead on public.leave_accrual_runs;
create policy leave_accrual_runs_select_lead
on public.leave_accrual_runs for select to authenticated
using (
  public.my_role() in ('chief','owner')
  and exists (
    select 1 from public.profiles p
    where p.user_id=auth.uid() and p.active=true and p.approved=true
  )
);

drop policy if exists leave_accrual_runs_insert_owner on public.leave_accrual_runs;
create policy leave_accrual_runs_insert_owner
on public.leave_accrual_runs for insert to authenticated
with check (
  attendance_confirmed_by=auth.uid()
  and attendance_confirmed_at is not null
  and exists (
    select 1 from public.profiles p
    where p.user_id=auth.uid() and p.active=true and p.approved=true and p.role='owner'
  )
);

drop function if exists public.apply_monthly_leave_accruals(date);
drop function if exists public.apply_monthly_leave_accruals(date,jsonb,boolean);
drop function if exists public.preview_monthly_leave_accruals(date);

create function public.preview_monthly_leave_accruals(p_as_of date)
returns table(
  user_id uuid,
  user_name text,
  hire_date date,
  accrual_kind text,
  months_completed integer,
  due_date date,
  target_days numeric,
  existing_credit_days numeric,
  grant_days numeric,
  past boolean,
  already_recorded boolean,
  attendance_confirmation_required boolean
)
language plpgsql security invoker set search_path=public as $$
begin
  if p_as_of is null then
    raise exception 'as-of date required';
  end if;
  if auth.uid() is null or coalesce(public.my_role(),'')<>'owner'
     or not exists(
       select 1 from public.profiles x
       where x.user_id=auth.uid() and x.active=true and x.approved=true
     ) then
    raise exception 'owner execution required';
  end if;

  return query
  with profile_base as (
    select
      p.user_id as profile_user_id,
      p.name as profile_name,
      p.hire_date as profile_hire_date,
      coalesce(p.employment_status,'재직') as profile_employment_status,
      p.employment_effective_date as profile_employment_effective_date
    from public.profiles p
    where p.hire_date is not null
      and p_as_of>=p.hire_date
      and (
        (coalesce(p.employment_status,'재직')='재직' and p.active=true and p.approved=true)
        or (coalesce(p.employment_status,'재직')<>'재직' and p.employment_effective_date is not null)
      )
  ), monthly_milestones as (
    select
      p.profile_user_id,
      p.profile_name,
      p.profile_hire_date,
      p.profile_employment_status,
      p.profile_employment_effective_date,
      'monthly'::text as milestone_kind,
      n as milestone_months,
      (p.profile_hire_date + make_interval(months => n))::date as milestone_due_date,
      n::numeric as milestone_target_days,
      n::numeric as milestone_cumulative_due_days
    from profile_base p
    cross join lateral generate_series(1,11) as series(n)
  ), annual_milestones as (
    select
      p.profile_user_id,
      p.profile_name,
      p.profile_hire_date,
      p.profile_employment_status,
      p.profile_employment_effective_date,
      'annual'::text as milestone_kind,
      12 as milestone_months,
      (p.profile_hire_date + make_interval(years => n))::date as milestone_due_date,
      15::numeric as milestone_target_days,
      (11 + 15*n)::numeric as milestone_cumulative_due_days
    from profile_base p
    cross join lateral generate_series(
      1,
      extract(year from p_as_of)::integer-extract(year from p.profile_hire_date)::integer
    ) as series(n)
  ), eligible_milestones as (
    select * from monthly_milestones
    union all
    select * from annual_milestones
  ), due_milestones as (
    select m.*
    from eligible_milestones m
    where m.milestone_due_date<=p_as_of
      and (
        m.profile_employment_status='재직'
        or (
          m.profile_employment_effective_date is not null
          and m.milestone_due_date<m.profile_employment_effective_date
        )
      )
  ), ledger_credits as (
    select
      p.user_id as profile_user_id,
      greatest(coalesce(sum(case when ll.kind in ('부여','조정') then ll.days else 0 end),0),0)::numeric as credit_days
    from public.profiles p
    left join public.leave_ledger ll on ll.user_id=p.user_id
    group by p.user_id
  ), ordered as (
    select
      m.*,
      c.credit_days,
      lag(m.milestone_cumulative_due_days,1,0::numeric) over (
        partition by m.profile_user_id order by m.milestone_due_date,m.milestone_months
      ) as previous_cumulative_due_days
    from due_milestones m
    join ledger_credits c on c.profile_user_id=m.profile_user_id
  )
  select
    o.profile_user_id,
    o.profile_name,
    o.profile_hire_date,
    o.milestone_kind,
    o.milestone_months,
    o.milestone_due_date,
    o.milestone_target_days,
    o.credit_days,
    case
      when r.id is not null then 0::numeric
      else greatest(0::numeric,o.milestone_cumulative_due_days-greatest(o.credit_days,o.previous_cumulative_due_days))
    end,
    o.milestone_due_date<p_as_of,
    r.id is not null,
    r.id is null
  from ordered o
  left join public.leave_accrual_runs r
    on r.user_id=o.profile_user_id and r.due_date=o.milestone_due_date
  order by o.profile_user_id,o.milestone_due_date,o.milestone_months;
end;
$$;

-- 날짜 하나만 넘기는 기존 호출은 항상 미리보기 전용이다.
create function public.apply_monthly_leave_accruals(p_as_of date)
returns table(user_id uuid,granted_days numeric,created_runs integer)
language plpgsql security invoker set search_path=public as $$
begin
  if auth.uid() is null or coalesce(public.my_role(),'')<>'owner'
     or not exists(
       select 1 from public.profiles x
       where x.user_id=auth.uid() and x.active=true and x.approved=true
     ) then
    raise exception 'owner execution required';
  end if;
  raise exception 'explicit apply confirmation required; preview only';
end;
$$;

-- 미리보기에서 확인한 각 발생일을 full_attendance=true로 다시 보내고,
-- 마지막 boolean도 true로 명시한 owner 호출만 실제 장부에 반영한다.
create function public.apply_monthly_leave_accruals(
  p_as_of date,
  p_attendance_confirmations jsonb,
  p_apply_confirmed boolean
)
returns table(user_id uuid,granted_days numeric,created_runs integer)
language plpgsql security invoker set search_path=public as $$
declare
  candidate record;
  current_credit numeric;
  candidate_cumulative_due numeric;
  previous_cumulative_due numeric;
  actual_grant numeric;
  new_ledger_id bigint;
  new_run_id bigint;
  created_run_ids bigint[]:='{}'::bigint[];
begin
  if p_as_of is null then
    raise exception 'as-of date required';
  end if;
  if p_as_of>(now() at time zone 'Asia/Seoul')::date then
    raise exception 'future as-of date not allowed';
  end if;
  if auth.uid() is null or coalesce(public.my_role(),'')<>'owner'
     or not exists(
       select 1 from public.profiles x
       where x.user_id=auth.uid() and x.active=true and x.approved=true
     ) then
    raise exception 'owner execution required';
  end if;
  if p_apply_confirmed is distinct from true then
    raise exception 'explicit apply confirmation required; preview only';
  end if;
  if p_attendance_confirmations is null
     or jsonb_typeof(p_attendance_confirmations)<>'array'
     or jsonb_array_length(p_attendance_confirmations)=0 then
    raise exception 'attendance confirmations required';
  end if;
  if exists(
    select 1
    from jsonb_array_elements(p_attendance_confirmations) as item(value)
    where item.value->>'user_id' is null
       or item.value->>'user_id' !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
       or item.value->>'due_date' is null
       or item.value->>'due_date' !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
       or coalesce((item.value->>'full_attendance')::boolean,false) is not true
  ) then
    raise exception 'full attendance confirmation required';
  end if;
  if exists(
    select 1
    from (
      select
        (item.value->>'user_id')::uuid as confirmed_user_id,
        (item.value->>'due_date')::date as confirmed_due_date,
        count(*) as confirmation_count
      from jsonb_array_elements(p_attendance_confirmations) as item(value)
      group by 1,2
      having count(*)>1
    ) duplicates
  ) then
    raise exception 'duplicate attendance confirmation';
  end if;
  if exists(
    select 1
    from jsonb_array_elements(p_attendance_confirmations) as item(value)
    where not exists(
      select 1
      from public.preview_monthly_leave_accruals(p_as_of) preview
      where preview.user_id=(item.value->>'user_id')::uuid
        and preview.due_date=(item.value->>'due_date')::date
    )
  ) then
    raise exception 'attendance confirmation does not match preview';
  end if;
  if exists(
    select 1
    from jsonb_array_elements(p_attendance_confirmations) as item(value)
    join public.preview_monthly_leave_accruals(p_as_of) selected
      on selected.user_id=(item.value->>'user_id')::uuid
     and selected.due_date=(item.value->>'due_date')::date
    where exists(
      select 1
      from public.preview_monthly_leave_accruals(p_as_of) earlier
      where earlier.user_id=selected.user_id
        and earlier.due_date<selected.due_date
        and earlier.already_recorded=false
        and not exists(
          select 1
          from jsonb_array_elements(p_attendance_confirmations) as prior_item(value)
          where (prior_item.value->>'user_id')::uuid=earlier.user_id
            and (prior_item.value->>'due_date')::date=earlier.due_date
        )
    )
  ) then
    raise exception 'earlier attendance confirmation required';
  end if;

  for candidate in
    select preview.*
    from public.preview_monthly_leave_accruals(p_as_of) preview
    join jsonb_array_elements(p_attendance_confirmations) as item(value)
      on preview.user_id=(item.value->>'user_id')::uuid
     and preview.due_date=(item.value->>'due_date')::date
    order by preview.user_id,preview.due_date,preview.months_completed
  loop
    perform pg_advisory_xact_lock(hashtextextended(candidate.user_id::text,0));
    if exists(
      select 1 from public.leave_accrual_runs r
      where r.user_id=candidate.user_id and r.due_date=candidate.due_date
    ) then
      continue;
    end if;

    select greatest(
      coalesce(sum(case when ll.kind in ('부여','조정') then ll.days else 0 end),0),
      0
    )::numeric
    into current_credit
    from public.leave_ledger ll
    where ll.user_id=candidate.user_id;

    candidate_cumulative_due:=case
      when candidate.accrual_kind='annual' then 11+15*(extract(year from candidate.due_date)::integer-extract(year from candidate.hire_date)::integer)
      else candidate.target_days
    end;

    select coalesce(max(
      case when r.accrual_kind='annual' then 11+15*(extract(year from r.due_date)::integer-extract(year from p.hire_date)::integer) else r.target_days end
    ),0)::numeric
    into previous_cumulative_due
    from public.leave_accrual_runs r
    join public.profiles p on p.user_id=r.user_id
    where r.user_id=candidate.user_id and r.due_date<candidate.due_date;

    actual_grant:=greatest(
      0::numeric,
      candidate_cumulative_due-greatest(current_credit,previous_cumulative_due)
    );
    new_ledger_id:=null;
    if actual_grant>0 then
      insert into public.leave_ledger(user_id,kind,days,note)
      values(
        candidate.user_id,
        '부여',
        actual_grant,
        format(
          '자동 연차 발생: %s · 해당 단계 %s일',
          case when candidate.accrual_kind='annual' then (extract(year from candidate.due_date)::integer-extract(year from candidate.hire_date)::integer)||'주년 기념일' else candidate.months_completed||'개월' end,
          candidate.target_days
        )
      )
      returning id into new_ledger_id;
    end if;

    insert into public.leave_accrual_runs(
      user_id,due_date,accrual_kind,months_completed,target_days,days,ledger_id,
      attendance_confirmed_by,attendance_confirmed_at
    ) values(
      candidate.user_id,candidate.due_date,candidate.accrual_kind,
      candidate.months_completed,candidate.target_days,actual_grant,new_ledger_id,
      auth.uid(),now()
    )
    returning id into new_run_id;
    created_run_ids:=array_append(created_run_ids,new_run_id);
  end loop;

  return query
  select
    r.user_id,
    coalesce(sum(r.days),0)::numeric as granted_days,
    count(*)::integer as created_runs
  from public.leave_accrual_runs r
  where r.id=any(created_run_ids)
  group by r.user_id
  order by r.user_id;
end;
$$;

revoke all on function public.preview_monthly_leave_accruals(date) from public,anon;
revoke all on function public.apply_monthly_leave_accruals(date) from public,anon;
revoke all on function public.apply_monthly_leave_accruals(date,jsonb,boolean) from public,anon;
grant execute on function public.preview_monthly_leave_accruals(date) to authenticated;
grant execute on function public.apply_monthly_leave_accruals(date) to authenticated;
grant execute on function public.apply_monthly_leave_accruals(date,jsonb,boolean) to authenticated;
