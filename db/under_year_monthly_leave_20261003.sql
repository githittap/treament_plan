-- P7 2장: 운영 적용 전 검수할 SQL 초안. monthly_leave_accrual_draft.sql 적용 뒤 실행함.
-- 입사일 기준 매월 같은 날(월말은 그 달 마지막 날), 첫해 최대 11일만 자동 처리함.
-- 기존 누적 목표·수기 상계·leave_accrual_runs 중복 방지를 그대로 사용함.
-- 공표된 근무표에서 빠진 날짜는 개근을 추측하지 않고 기존 수동 확인 화면에 남김.

-- 기존 미리보기 계산을 DB 스케줄러(postgres, 로그인 없음)에서도 부를 수 있게 함.
-- authenticated·anon과 비활성 원장에 대한 기존 가드는 그대로 유지함.
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
  if not (auth.uid() is null and current_user='postgres') and (
     auth.uid() is null or coalesce(public.my_role(),'')<>'owner'
     or not exists(
       select 1 from public.profiles x
       where x.user_id=auth.uid() and x.active=true and x.approved=true
     )) then
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


create or replace function public.run_under_year_monthly_leave_accrual(
  p_as_of date default (now() at time zone 'Asia/Seoul')::date
)
returns table(user_id uuid,granted_days numeric,created_runs integer)
language plpgsql security definer set search_path=pg_catalog,public as $$
declare
  candidate record;
  current_credit numeric;
  previous_target numeric;
  actual_grant numeric;
  new_ledger_id bigint;
  new_run_id bigint;
  created_ids bigint[]:='{}'::bigint[];
  period_start date;
begin
  -- 이 함수는 DB 스케줄러 전용임. 로그인 이용자의 RPC에서는 실행하지 않음.
  if auth.uid() is not null then raise exception 'database scheduler execution required'; end if;
  if p_as_of is null then raise exception 'as-of date required'; end if;
  if p_as_of>(now() at time zone 'Asia/Seoul')::date then raise exception 'future as-of date not allowed'; end if;
  for candidate in
    select preview.user_id,preview.hire_date,preview.months_completed,preview.due_date
    from public.preview_monthly_leave_accruals(p_as_of) preview
    join public.profiles p on p.user_id=preview.user_id
    where preview.accrual_kind='monthly' and not preview.already_recorded
      and p.active=true and p.approved=true and coalesce(p.employment_status,'재직')='재직'
      and p_as_of<(p.hire_date+interval '1 year')::date
    order by preview.user_id,preview.due_date
  loop
    perform pg_advisory_xact_lock(hashtextextended(candidate.user_id::text,0));
    if exists(select 1 from public.leave_accrual_runs r where r.user_id=candidate.user_id and r.due_date=candidate.due_date) then continue; end if;
    -- 기존 수동 적용처럼 앞 발생일을 확인하기 전에 다음 발생일을 처리하지 않음.
    if exists(
      select 1 from generate_series(1,candidate.months_completed-1) prior(n)
      where not exists(select 1 from public.leave_accrual_runs r
        where r.user_id=candidate.user_id and r.due_date=(candidate.hire_date+make_interval(months=>prior.n))::date)
    ) then continue; end if;
    period_start:=(candidate.hire_date+make_interval(months=>candidate.months_completed-1))::date;
    -- 기존 결근/미기록 후보 규칙: 휴무·공휴일·출근 기록·승인 휴가·수기 확인 건은 제외함.
    -- 지각 분·반차·조퇴를 새로운 개근 탈락 규칙으로 추가하지 않음.
    if exists(
      select 1 from generate_series(period_start,candidate.due_date-1,interval '1 day') d
      where not exists(select 1 from public.holidays h where h.date=d::date)
        and (
          not exists(select 1 from public.schedules s join public.schedule_weeks w on w.week_start=s.week_start and w.status='공표'
            where s.user_id=candidate.user_id and s.week_start=(d::date-(extract(isodow from d)::integer-1)) and s.day=extract(dow from d)::integer)
          or (
            exists(select 1 from public.schedules s join public.schedule_weeks w on w.week_start=s.week_start and w.status='공표'
              where s.user_id=candidate.user_id and s.week_start=(d::date-(extract(isodow from d)::integer-1)) and s.day=extract(dow from d)::integer and s.shift<>'off')
            and not exists(select 1 from public.attendance a where a.user_id=candidate.user_id and a.work_date=d::date)
            and not exists(select 1 from public.attendance_issue_resolutions a where a.user_id=candidate.user_id and a.work_date=d::date)
            and not exists(select 1 from public.leave_requests l where l.user_id=candidate.user_id and l.status='승인' and d::date between l.date_from and l.date_to)
            and not exists(select 1 from public.attendance_manual_entries a where a.user_id=candidate.user_id and a.work_date=d::date and a.status in ('대기','실장승인','원장확정')
              and coalesce((select value from public.app_settings where key='absence_exclude_pending_manual'),'true')<>'false')
          )
        )
    ) then continue; end if;
    select greatest(coalesce(sum(case when ll.kind in ('부여','조정') then ll.days else 0 end),0),0)::numeric
      into current_credit from public.leave_ledger ll where ll.user_id=candidate.user_id;
    select coalesce(max(r.target_days),0)::numeric into previous_target
      from public.leave_accrual_runs r where r.user_id=candidate.user_id and r.due_date<candidate.due_date and r.accrual_kind='monthly';
    actual_grant:=greatest(0::numeric,candidate.months_completed-greatest(current_credit,previous_target));
    new_ledger_id:=null;
    if actual_grant>0 then
      insert into public.leave_ledger(user_id,kind,days,note)
        values(candidate.user_id,'부여',actual_grant,format('자동 월차: 입사 %s개월',candidate.months_completed))
        returning id into new_ledger_id;
    end if;
    -- 자동 확인은 사람 이름을 사칭하지 않음. 확인자 null + 확인 시각으로 구분함.
    insert into public.leave_accrual_runs(user_id,due_date,accrual_kind,months_completed,target_days,days,ledger_id,attendance_confirmed_by,attendance_confirmed_at)
      values(candidate.user_id,candidate.due_date,'monthly',candidate.months_completed,candidate.months_completed,actual_grant,new_ledger_id,null,now())
      returning id into new_run_id;
    created_ids:=array_append(created_ids,new_run_id);
  end loop;
  return query select r.user_id,sum(r.days)::numeric,count(*)::integer
    from public.leave_accrual_runs r where r.id=any(created_ids) group by r.user_id order by r.user_id;
end;
$$;
revoke all on function public.run_under_year_monthly_leave_accrual(date) from public,anon,authenticated;

-- 매일 한 번 한국시간 00:10. pg_cron이 없으면 설치하지 않고 대안을 알림.
do $$
declare
  cron_zone text:=coalesce(nullif(current_setting('cron.timezone',true),''),'UTC');
  cron_at timestamp;
  cron_expression text;
begin
  if exists(select 1 from pg_extension where extname='pg_cron') then
    cron_at:=timestamptz '2000-01-02 00:10:00+09' at time zone cron_zone;
    cron_expression:=extract(minute from cron_at)::integer||' '||extract(hour from cron_at)::integer||' * * *';
    execute 'select cron.schedule($1,$2,$3)' using 'hub-under-year-monthly-leave',cron_expression,'select * from public.run_under_year_monthly_leave_accrual();';
  else
    raise notice 'pg_cron unavailable: use an approved daily DB scheduler at 00:10 Asia/Seoul to execute select * from public.run_under_year_monthly_leave_accrual();';
  end if;
end;
$$;
