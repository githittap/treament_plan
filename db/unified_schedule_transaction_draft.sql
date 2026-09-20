-- 로컬 검토용 초안: 운영 DB에 직접 적용하지 않는다.
-- schedule_weeks 상태와 schedules 행을 한 RPC 문장 안에서 처리해 부분 저장을 막는다.

create or replace function public.set_schedule_cell(
  p_week_start date,
  p_person_id uuid,
  p_user_id uuid,
  p_day int,
  p_shift text default null
)
returns public.schedules
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_role text := coalesce(public.my_role(),'');
  v_status text;
  v_profile_user_id uuid;
  r public.schedules;
begin
  if not exists (
    select 1 from public.profiles p
    where p.user_id=(select auth.uid()) and p.active=true and p.approved=true
  ) then raise exception 'active approved profile required'; end if;
  if p_week_start is null or extract(isodow from p_week_start) <> 1 or p_person_id is null or p_day is null or p_day not between 0 and 6 then
    raise exception 'invalid schedule cell key';
  end if;
  if p_shift is not null and p_shift not in ('work','off','evening','etc') then
    raise exception 'invalid schedule shift';
  end if;
  select sp.profile_user_id into v_profile_user_id
  from public.schedule_people sp
  where sp.id=p_person_id and sp.included_in_schedule=true;
  if not found then raise exception 'schedule person not found or excluded'; end if;
  if p_user_id is distinct from v_profile_user_id then raise exception 'schedule person profile key mismatch'; end if;

  insert into public.schedule_weeks(week_start,status)
  values(p_week_start,'초안')
  on conflict (week_start) do nothing;
  select sw.status into v_status from public.schedule_weeks sw where sw.week_start=p_week_start for update;
  if v_status='공표' and v_role not in ('chief','owner') then
    raise exception 'published schedule is not editable by this role';
  elsif v_status='공표' then
    update public.schedule_weeks set status='초안',confirmed_by=null,confirmed_at=null where week_start=p_week_start;
  end if;

  if p_shift is null then
    delete from public.schedules where week_start=p_week_start and person_id=p_person_id and day=p_day returning * into r;
  else
    insert into public.schedules(week_start,person_id,user_id,day,shift)
    values(p_week_start,p_person_id,p_user_id,p_day,p_shift)
    on conflict(week_start,person_id,day) do update set user_id=excluded.user_id,shift=excluded.shift
    returning * into r;
  end if;
  return r;
end;
$$;

revoke all on function public.set_schedule_cell(date,uuid,uuid,int,text) from public,anon,authenticated;
grant execute on function public.set_schedule_cell(date,uuid,uuid,int,text) to authenticated;

