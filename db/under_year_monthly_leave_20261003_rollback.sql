-- 자동 월차만 중단함. 기존 월차·연차 장부·실행 이력·수동 확인 함수를 보존함.
begin;
do $$
begin
  if exists(select 1 from pg_extension where extname='pg_cron') then
    execute 'select cron.unschedule(jobid) from cron.job where jobname=$1' using 'hub-under-year-monthly-leave';
  end if;
end;
$$;
drop function if exists public.run_under_year_monthly_leave_accrual(date);

-- DB 스케줄러 예외도 제거하고 기존 원장 전용 미리보기 가드를 정확히 복원함.
create or replace function public.preview_monthly_leave_accruals(p_as_of date)
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


-- 새 기능만 제거함. 적립·취소 조정 장부와 실행 행은 모두 보존함.
drop function if exists public.get_monthly_leave_accrual_candidates();
drop function if exists public.revoke_monthly_leave_accrual(bigint,text);
drop function if exists public.monthly_leave_absence_candidates(uuid,date,date,text);
-- attendance_mode·취소 감사 열·monthly_leave_attendance_mode 설정은 재적용 후에도 보존함.
commit;
