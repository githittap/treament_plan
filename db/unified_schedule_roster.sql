-- 통합 근무명부 1차 배포: 기존 user_id는 롤백을 위해 유지한다.
begin;

create table if not exists public.schedule_people (
  id uuid primary key default gen_random_uuid(),
  profile_user_id uuid unique references public.profiles(user_id) on delete set null,
  name text not null,
  department text not null default '미지정'
    check (department in ('Dr.', '진료실', '데스크', '기공실', '미지정')),
  included_in_schedule boolean not null default true,
  active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.schedules
  add column if not exists person_id uuid;

alter table public.schedules
  alter column user_id drop not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.schedules'::regclass
      and conname = 'schedules_person_id_fkey'
  ) then
    alter table public.schedules
      add constraint schedules_person_id_fkey
      foreign key (person_id) references public.schedule_people(id);
  end if;
end;
$$;

-- 모든 기존 profiles를 명부에 연결한다. 부서는 허용된 명부 값으로 정규화한다.
insert into public.schedule_people (
  profile_user_id, name, department, included_in_schedule, active, sort_order
)
select
  p.user_id,
  p.name,
  case when p.name = '정용태' then 'Dr.'
       when p.dept in ('Dr.', '진료실', '데스크', '기공실') then p.dept
       else '미지정' end,
  case when p.name in ('abc', '테스트', '공용1') then false else true end,
  p.active,
  0
from public.profiles as p
on conflict (profile_user_id) do nothing;

-- 로그인 계정이 없는 원장도 명부에서 선택할 수 있게 한다.
insert into public.schedule_people (name, department, included_in_schedule, active)
select v.name, 'Dr.', true, true
from (values ('정도경'), ('정규민')) as v(name)
where not exists (
  select 1 from public.schedule_people sp where sp.name = v.name
);

-- 기존 일정은 profile_user_id를 통해 명부 항목으로 백필한다.
update public.schedules as s
set person_id = sp.id
from public.schedule_people as sp
where s.person_id is null
  and s.user_id is not null
  and sp.profile_user_id = s.user_id;

do $$
begin
  if exists (select 1 from public.schedules where person_id is null) then
    raise exception 'schedule roster backfill incomplete: schedules with null person_id remain';
  end if;
end;
$$;

-- 기존 부분 인덱스는 Supabase upsert 충돌 대상으로 사용할 수 없으므로 전체 unique로 교체한다.
do $$
begin
  if exists (
    select 1
    from pg_catalog.pg_index i
    join pg_catalog.pg_class c on c.oid = i.indexrelid
    join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname = 'schedules_week_person_day_unique'
      and i.indpred is not null
  ) then
    execute 'drop index public.schedules_week_person_day_unique';
  end if;
end;
$$;

create unique index if not exists schedules_week_person_day_unique
  on public.schedules (week_start, person_id, day);

create index if not exists schedules_person_id_idx
  on public.schedules (person_id);

-- 구버전 user_id 클라이언트와 person_id 클라이언트를 모두 정규화한다.
create or replace function public.normalize_schedule_person()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_person_id uuid;
  v_profile_user_id uuid;
begin
  if new.person_id is null then
    if new.user_id is null then
      raise exception 'schedule requires person_id or user_id';
    end if;

    select sp.id into v_person_id
    from public.schedule_people sp
    where sp.profile_user_id = new.user_id;

    if not found then
      raise exception 'schedule user_id has no schedule_people row';
    end if;

    new.person_id := v_person_id;
  else
    select sp.profile_user_id into v_profile_user_id
    from public.schedule_people sp
    where sp.id = new.person_id;

    if not found then
      raise exception 'schedule person_id does not exist';
    end if;

    if new.user_id is not null and new.user_id is distinct from v_profile_user_id then
      raise exception 'schedule person_id and user_id do not match';
    end if;

    new.user_id := v_profile_user_id;
  end if;

  return new;
end;
$$;

drop trigger if exists schedules_normalize_person_before_write on public.schedules;
create trigger schedules_normalize_person_before_write
before insert or update on public.schedules
for each row execute function public.normalize_schedule_person();

create or replace function public.set_schedule_people_updated_at()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists schedule_people_set_updated_at on public.schedule_people;
create trigger schedule_people_set_updated_at
before update on public.schedule_people
for each row execute function public.set_schedule_people_updated_at();

alter table public.schedule_people enable row level security;
revoke all privileges on table public.schedule_people from anon;
revoke all privileges on table public.schedule_people from authenticated;
grant select, insert, update on table public.schedule_people to authenticated;

drop policy if exists schedule_people_select_authenticated on public.schedule_people;
create policy schedule_people_select_authenticated
on public.schedule_people for select to authenticated
using (
  exists (
    select 1 from public.profiles p
    where p.user_id = (select auth.uid()) and p.approved = true
  )
);

drop policy if exists schedule_people_write_leads_insert on public.schedule_people;
create policy schedule_people_write_leads_insert
on public.schedule_people for insert to authenticated
with check (
  exists (
    select 1 from public.profiles p
    where p.user_id = (select auth.uid()) and p.approved = true
  )
  and public.my_role() in ('manager', 'chief', 'owner')
);

drop policy if exists schedule_people_write_leads_update on public.schedule_people;
create policy schedule_people_write_leads_update
on public.schedule_people for update to authenticated
using (
  exists (
    select 1 from public.profiles p
    where p.user_id = (select auth.uid()) and p.approved = true
  )
  and public.my_role() in ('manager', 'chief', 'owner')
)
with check (
  exists (
    select 1 from public.profiles p
    where p.user_id = (select auth.uid()) and p.approved = true
  )
  and public.my_role() in ('manager', 'chief', 'owner')
);

-- 근무표는 인증 사용자에게 필요한 권한만 부여하고, 행 단위 초안 상태를 정책으로 확인한다.
revoke all privileges on table public.schedules from anon;
revoke all privileges on table public.schedule_weeks from anon;
revoke all privileges on table public.schedules from authenticated;
revoke all privileges on table public.schedule_weeks from authenticated;
grant select, insert, update, delete on table public.schedules to authenticated;
grant select, insert, update on table public.schedule_weeks to authenticated;

drop policy if exists schedule_weeks_select_authenticated on public.schedule_weeks;
create policy schedule_weeks_select_authenticated
on public.schedule_weeks for select to authenticated
using (
  exists (
    select 1 from public.profiles p
    where p.user_id = (select auth.uid()) and p.approved = true
  )
);

drop policy if exists schedule_weeks_insert_authenticated on public.schedule_weeks;
create policy schedule_weeks_insert_authenticated
on public.schedule_weeks for insert to authenticated
with check (
  exists (
    select 1 from public.profiles p
    where p.user_id = (select auth.uid()) and p.approved = true
  )
  and (status = '초안' or public.my_role() in ('chief', 'owner'))
);

drop policy if exists schedule_weeks_update_approvers on public.schedule_weeks;
create policy schedule_weeks_update_approvers
on public.schedule_weeks for update to authenticated
using (
  exists (
    select 1 from public.profiles p
    where p.user_id = (select auth.uid()) and p.approved = true
  )
  and (status = '초안' or public.my_role() in ('chief', 'owner'))
)
with check (
  exists (
    select 1 from public.profiles p
    where p.user_id = (select auth.uid()) and p.approved = true
  )
  and (status = '초안' or public.my_role() in ('chief', 'owner'))
);

drop policy if exists schedules_select_authenticated on public.schedules;
create policy schedules_select_authenticated
on public.schedules for select to authenticated
using (
  exists (
    select 1 from public.profiles p
    where p.user_id = (select auth.uid()) and p.approved = true
  )
);

drop policy if exists schedules_insert_authenticated on public.schedules;
create policy schedules_insert_authenticated
on public.schedules for insert to authenticated
with check (
  exists (
    select 1 from public.profiles p
    where p.user_id = (select auth.uid()) and p.approved = true
  )
  and exists (
    select 1 from public.schedule_weeks sw
    where sw.week_start = schedules.week_start
      and (sw.status = '초안' or public.my_role() in ('chief', 'owner'))
  )
);

drop policy if exists schedules_update_authenticated on public.schedules;
create policy schedules_update_authenticated
on public.schedules for update to authenticated
using (
  exists (
    select 1 from public.profiles p
    where p.user_id = (select auth.uid()) and p.approved = true
  )
  and exists (
    select 1 from public.schedule_weeks sw
    where sw.week_start = schedules.week_start
      and (sw.status = '초안' or public.my_role() in ('chief', 'owner'))
  )
)
with check (
  exists (
    select 1 from public.profiles p
    where p.user_id = (select auth.uid()) and p.approved = true
  )
  and exists (
    select 1 from public.schedule_weeks sw
    where sw.week_start = schedules.week_start
      and (sw.status = '초안' or public.my_role() in ('chief', 'owner'))
  )
);

drop policy if exists schedules_delete_authenticated on public.schedules;
create policy schedules_delete_authenticated
on public.schedules for delete to authenticated
using (
  exists (
    select 1 from public.profiles p
    where p.user_id = (select auth.uid()) and p.approved = true
  )
  and exists (
    select 1 from public.schedule_weeks sw
    where sw.week_start = schedules.week_start
      and (sw.status = '초안' or public.my_role() in ('chief', 'owner'))
  )
);

create or replace function public.copy_schedule_week(p_source_week date, p_target_week date)
returns void
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_copied_count integer;
begin
  if p_source_week = p_target_week then
    raise exception 'source and target schedule weeks must differ';
  end if;

  if not exists (
    select 1 from public.profiles p
    where p.user_id = (select auth.uid()) and p.approved = true
  ) then
    raise exception 'approved profile required';
  end if;

  insert into public.schedule_weeks (week_start, status)
  values (p_target_week, '초안')
  on conflict (week_start) do update
  set status = excluded.status;

  delete from public.schedules
  where week_start = p_target_week;

  insert into public.schedules (week_start, person_id, user_id, day, shift, note)
  select p_target_week, s.person_id, s.user_id, s.day, s.shift, s.note
  from public.schedules s
  join public.schedule_people sp on sp.id = s.person_id
  where s.week_start = p_source_week
    and sp.active = true
    and sp.included_in_schedule = true;

  get diagnostics v_copied_count = row_count;
  if v_copied_count = 0 then
    raise exception 'source schedule week has no rows';
  end if;
end;
$$;

revoke all on function public.copy_schedule_week(date, date) from public;
revoke all on function public.copy_schedule_week(date, date) from anon;
revoke all on function public.copy_schedule_week(date, date) from authenticated;
grant execute on function public.copy_schedule_week(date, date) to authenticated;

commit;
