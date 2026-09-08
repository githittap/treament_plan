-- 치과 직원 허브 급여 기능 추가 스키마

alter table public.attendance
  add column if not exists early_min int not null default 0 check (early_min >= 0);

create table if not exists public.wage_info (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles(user_id) on delete cascade,
  wage_type text not null default 'monthly'
    check (wage_type in ('hourly', 'monthly')),
  base_wage numeric not null default 0,
  normal_hours numeric not null default 209,
  fixed_bonus numeric not null default 0,
  housing_support numeric not null default 0,
  housing_from date,
  housing_to date,
  effective_from date not null default current_date,
  memo text,
  updated_by text,
  updated_at timestamptz default now(),
  unique (user_id, effective_from)
);

alter table public.wage_info enable row level security;

drop policy if exists wage_info_select_owner on public.wage_info;
create policy wage_info_select_owner
on public.wage_info for select to authenticated
using (public.my_role() = 'owner');

drop policy if exists wage_info_insert_owner on public.wage_info;
create policy wage_info_insert_owner
on public.wage_info for insert to authenticated
with check (public.my_role() = 'owner');

drop policy if exists wage_info_update_owner on public.wage_info;
create policy wage_info_update_owner
on public.wage_info for update to authenticated
using (public.my_role() = 'owner')
with check (public.my_role() = 'owner');

drop policy if exists wage_info_delete_owner on public.wage_info;
create policy wage_info_delete_owner
on public.wage_info for delete to authenticated
using (public.my_role() = 'owner');
