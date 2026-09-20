-- Task 3 초안: 운영 적용 전 별도 migration과 사전 스냅샷 검토가 필요하다.
-- 이채원 입사일 2026-09-18의 첫 대상일은 2026-10-18이다.
create or replace function public.accrue_monthly_leave(p_as_of date default current_date)
returns table(user_id uuid, accrued_on date, days numeric)
language plpgsql security definer set search_path=public as $$
declare p record; due_date date;
begin
  if auth.uid() is null or coalesce(public.my_role(),'') <> 'owner' then
    raise exception 'owner required';
  end if;

  for p in
    select p.user_id,p.hire_date
      from public.profiles as p
     where p.active and p.approved and p.hire_date is not null
       and p.hire_date + interval '1 month' <= p_as_of
  loop
    due_date := (p.hire_date + interval '1 month')::date;
    while due_date <= p_as_of loop
      perform pg_advisory_xact_lock(hashtextextended(p.user_id::text || due_date::text, 0));
      if not exists(select 1 from public.leave_ledger
         where leave_ledger.user_id = p.user_id
           and leave_ledger.kind = '부여'
           and leave_ledger.note = format('월차 자동발생: %s', due_date)
      ) then
        insert into public.leave_ledger(user_id,kind,days,note)
        values (p.user_id,'부여',1,format('월차 자동발생: %s', due_date));
        return query select p.user_id,due_date,1::numeric;
      end if;
      due_date := (due_date + interval '1 month')::date;
    end loop;
  end loop;
end; $$;

revoke all on function public.accrue_monthly_leave(date) from public, anon;
grant execute on function public.accrue_monthly_leave(date) to authenticated;
