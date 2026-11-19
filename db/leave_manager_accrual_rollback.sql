-- Restore the pre-manager monthly accrual functions and policies. Keep accrued rows.
begin;
drop policy if exists leave_accrual_runs_insert_owner on public.leave_accrual_runs;
create policy leave_accrual_runs_insert_owner on public.leave_accrual_runs
for insert to authenticated with check (
  attendance_confirmed_by=auth.uid() and attendance_confirmed_at is not null
  and exists (select 1 from public.profiles p where p.user_id=auth.uid()
    and p.active=true and p.approved=true and p.role='owner')
);
drop policy if exists leave_accrual_runs_select_lead on public.leave_accrual_runs;
create policy leave_accrual_runs_select_lead on public.leave_accrual_runs
for select to authenticated using (
  (public.my_role() in ('chief','owner') or public.leave_manager_allowed())
  and exists (select 1 from public.profiles p where p.user_id=auth.uid() and p.active=true and p.approved=true)
);
create or replace function public.get_monthly_leave_accrual_candidates()
returns table(run_id bigint,user_id uuid,due_date date,days numeric,candidate_dates date[],revoked_at timestamptz)
language plpgsql security definer set search_path=pg_catalog,public as $$
begin
  if auth.uid() is null or coalesce(public.my_role(),'')<>'owner'
    or not exists(select 1 from public.profiles p where p.user_id=auth.uid() and p.active=true and p.approved=true) then
    raise exception 'owner execution required';
  end if;
  return query select r.id,r.user_id,r.due_date,r.days,
    array(select c.work_date from public.monthly_leave_absence_candidates(r.user_id,
      (p.hire_date+make_interval(months=>r.months_completed-1))::date,r.due_date,'auto') c),r.revoked_at
    from public.leave_accrual_runs r join public.profiles p on p.user_id=r.user_id
    where r.accrual_kind='monthly' and r.attendance_mode='auto' and r.days>0
    order by r.user_id,r.due_date;
end;
$$;

create or replace function public.revoke_monthly_leave_accrual(p_run_id bigint,p_reason text)
returns table(run_id bigint,revoked_days numeric,already_revoked boolean)
language plpgsql security definer set search_path=pg_catalog,public as $$
declare item public.leave_accrual_runs%rowtype; target_user uuid; adjustment_id bigint;
begin
  if auth.uid() is null or coalesce(public.my_role(),'')<>'owner'
    or not exists(select 1 from public.profiles p where p.user_id=auth.uid() and p.active=true and p.approved=true) then
    raise exception 'owner execution required';
  end if;
  if nullif(btrim(p_reason),'') is null then raise exception 'reason required'; end if;
  select r.user_id into target_user from public.leave_accrual_runs r where r.id=p_run_id;
  if not found then raise exception 'monthly accrual not found'; end if;
  -- 자동 적립과 같은 직원 잠금을 먼저 잡은 뒤 행 잠금을 잡아 중복·교착을 막음.
  perform pg_advisory_xact_lock(hashtextextended(target_user::text,0));
  select r.* into item from public.leave_accrual_runs r where r.id=p_run_id for update;
  if item.accrual_kind<>'monthly' or item.days<=0 then raise exception 'monthly credited accrual required'; end if;
  if item.revoked_at is not null then
    return query select item.id,0::numeric,true; return;
  end if;
  insert into public.leave_ledger(user_id,kind,days,note)
    values(item.user_id,'조정',-item.days,format('월차 취소: %s / %s',item.due_date,btrim(p_reason))) returning id into adjustment_id;
  update public.leave_accrual_runs set revoked_at=now(),revoked_by=auth.uid(),revoke_reason=btrim(p_reason),revoke_ledger_id=adjustment_id where id=item.id;
  return query select item.id,item.days,false;
end;
$$;

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

create or replace function public.apply_monthly_leave_accruals(p_as_of date)
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

create or replace function public.apply_monthly_leave_accruals(
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
drop function if exists public.leave_monthly_accrual_actor_allowed();
delete from public.app_settings where key='leave.manager_can_accrue';
commit;
