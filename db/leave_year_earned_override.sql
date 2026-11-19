-- The displayed calendar-year earned amount is independent of the leave ledger.
begin;

create table public.leave_year_earned_override (
  user_id uuid not null references public.profiles(user_id) on delete cascade,
  year integer not null check (year between 1 and 9999),
  earned_days numeric not null check (
    earned_days >= 0
    and earned_days not in ('NaN'::numeric,'Infinity'::numeric,'-Infinity'::numeric)
    and mod(earned_days,0.5) = 0
  ),
  note text,
  updated_by uuid not null,
  updated_by_name text,
  updated_at timestamptz not null default now(),
  primary key (user_id, year)
);

alter table public.leave_year_earned_override enable row level security;
revoke all on table public.leave_year_earned_override from public, anon, authenticated, service_role;
grant select on table public.leave_year_earned_override to authenticated;

create policy leave_year_earned_select_scoped on public.leave_year_earned_override
  for select to authenticated
  using (user_id=auth.uid() or public.my_role() in ('owner','chief') or public.leave_manager_allowed());

create policy deputy_contract_only_block on public.leave_year_earned_override
  as restrictive for select to authenticated
  using (public.my_role()<>'deputy');

create policy employee_hub_access_gate on public.leave_year_earned_override
  as restrictive for select to authenticated
  using (public.employee_hub_access_allowed());

create function public.set_leave_year_earned(
  p_user_id uuid, p_year integer, p_days numeric, p_note text default null
)
returns table(earned_days numeric, updated_by_name text)
language plpgsql
security definer
set search_path = ''
as $function$
declare
  actor_id uuid := auth.uid();
  actor_role text := public.my_role();
  actor_name text;
begin
  select p.name into actor_name
  from public.profiles p
  where p.user_id=actor_id and p.active and p.approved;
  if not found or (actor_role is distinct from 'owner' and not public.leave_manager_allowed()) then
    raise exception 'not allowed to edit earned leave' using errcode='42501';
  end if;
  if actor_role='manager' and p_user_id=actor_id then
    raise exception 'not allowed to edit own leave' using errcode='42501';
  end if;
  if p_year is null or p_year not between 1 and 9999 then
    raise exception 'invalid year' using errcode='22023';
  end if;
  if p_days is null or p_days<0 or p_days in ('NaN'::numeric,'Infinity'::numeric,'-Infinity'::numeric)
    or mod(p_days,0.5)<>0 then
    raise exception 'invalid earned days' using errcode='22023';
  end if;
  if not exists(select 1 from public.profiles p where p.user_id=p_user_id) then
    raise exception 'profile not found' using errcode='22023';
  end if;

  return query
    insert into public.leave_year_earned_override as target
      (user_id,year,earned_days,note,updated_by,updated_by_name)
    values (p_user_id,p_year,p_days,nullif(btrim(p_note),''),actor_id,actor_name)
    on conflict on constraint leave_year_earned_override_pkey do update set
      earned_days=excluded.earned_days,
      note=excluded.note,
      updated_by=excluded.updated_by,
      updated_by_name=excluded.updated_by_name,
      updated_at=now()
    returning target.earned_days,target.updated_by_name;
end;
$function$;

create function public.clear_leave_year_earned(p_user_id uuid, p_year integer)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  actor_id uuid := auth.uid();
  actor_role text := public.my_role();
begin
  if not exists(select 1 from public.profiles p where p.user_id=actor_id and p.active and p.approved)
    or (actor_role is distinct from 'owner' and not public.leave_manager_allowed()) then
    raise exception 'not allowed to edit earned leave' using errcode='42501';
  end if;
  if actor_role='manager' and p_user_id=actor_id then
    raise exception 'not allowed to edit own leave' using errcode='42501';
  end if;
  if p_year is null or p_year not between 1 and 9999 then
    raise exception 'invalid year' using errcode='22023';
  end if;
  if not exists(select 1 from public.profiles p where p.user_id=p_user_id) then
    raise exception 'profile not found' using errcode='22023';
  end if;

  delete from public.leave_year_earned_override where user_id=p_user_id and year=p_year;
end;
$function$;

revoke all on function public.set_leave_year_earned(uuid,integer,numeric,text),
  public.clear_leave_year_earned(uuid,integer) from public, anon, authenticated, service_role;
grant execute on function public.set_leave_year_earned(uuid,integer,numeric,text),
  public.clear_leave_year_earned(uuid,integer) to authenticated;

commit;
