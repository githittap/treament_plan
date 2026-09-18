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
  true,
  p.active,
  0
from public.profiles as p
on conflict (profile_user_id) do update
set name = excluded.name,
    department = excluded.department,
    active = excluded.active,
    updated_at = now();

-- 로그인 계정이 없는 원장도 명부에서 선택할 수 있게 한다.
insert into public.schedule_people (name, department, included_in_schedule, active)
select v.name, 'Dr.', true, true
from (values ('정도경'), ('정규민')) as v(name)
where not exists (
  select 1 from public.schedule_people sp where sp.name = v.name
);

-- 테스트·공용 명부 항목은 일정 선택 목록에서 제외한다.
update public.schedule_people
set included_in_schedule = false,
    updated_at = now()
where name in ('abc', '테스트', '공용1');

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

create unique index if not exists schedules_week_person_day_unique
  on public.schedules (week_start, person_id, day)
  where person_id is not null;

alter table public.schedule_people enable row level security;
revoke all privileges on table public.schedule_people from anon;
revoke all privileges on table public.schedule_people from authenticated;
grant select, insert, update on table public.schedule_people to authenticated;

drop policy if exists schedule_people_select_authenticated on public.schedule_people;
create policy schedule_people_select_authenticated
on public.schedule_people for select to authenticated
using (true);

drop policy if exists schedule_people_write_leads_insert on public.schedule_people;
create policy schedule_people_write_leads_insert
on public.schedule_people for insert to authenticated
with check (public.my_role() in ('manager', 'chief', 'owner'));

drop policy if exists schedule_people_write_leads_update on public.schedule_people;
create policy schedule_people_write_leads_update
on public.schedule_people for update to authenticated
using (public.my_role() in ('manager', 'chief', 'owner'))
with check (public.my_role() in ('manager', 'chief', 'owner'));

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
using (true);

drop policy if exists schedule_weeks_insert_authenticated on public.schedule_weeks;
create policy schedule_weeks_insert_authenticated
on public.schedule_weeks for insert to authenticated
with check (true);

drop policy if exists schedule_weeks_update_approvers on public.schedule_weeks;
create policy schedule_weeks_update_approvers
on public.schedule_weeks for update to authenticated
using (status = '초안' or public.my_role() in ('chief', 'owner'))
with check (status = '초안' or public.my_role() in ('chief', 'owner'));

drop policy if exists schedules_select_authenticated on public.schedules;
create policy schedules_select_authenticated
on public.schedules for select to authenticated
using (true);

drop policy if exists schedules_insert_authenticated on public.schedules;
create policy schedules_insert_authenticated
on public.schedules for insert to authenticated
with check (
  exists (
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
    select 1 from public.schedule_weeks sw
    where sw.week_start = schedules.week_start
      and (sw.status = '초안' or public.my_role() in ('chief', 'owner'))
  )
)
with check (
  exists (
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
    select 1 from public.schedule_weeks sw
    where sw.week_start = schedules.week_start
      and (sw.status = '초안' or public.my_role() in ('chief', 'owner'))
  )
);

commit;
