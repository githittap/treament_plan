-- 재직 상태와 계정 차단은 삭제 대신 인사 이력으로 보존한다.
begin;

alter table public.profiles
  add column if not exists employment_status text not null default '재직'
    check (employment_status in ('재직', '자진퇴사', '계약만료', '권고사직')),
  add column if not exists employment_effective_date date,
  add column if not exists employment_reason text,
  add column if not exists account_access_status text not null default '활성'
    check (account_access_status in ('활성', '차단')),
  add column if not exists account_disabled_at timestamptz,
  add column if not exists account_disabled_by uuid,
  add column if not exists account_disabled_reason text;

-- 기존 비활성 프로필도 삭제하지 않고 퇴사 이력의 출발점으로 정규화한다.
update public.profiles
set employment_status = case when active = true then '재직' else '자진퇴사' end
where employment_status is null
   or (employment_status = '재직' and active = false);

create table if not exists public.profile_employment_history (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles(user_id) on delete restrict,
  from_status text,
  to_status text not null check (to_status in ('재직', '자진퇴사', '계약만료', '권고사직')),
  effective_date date not null,
  reason text,
  account_action text not null check (account_action in ('상태변경', '계정차단')),
  acted_by uuid not null,
  acted_at timestamptz not null default now()
);

alter table public.profile_employment_history enable row level security;
drop policy if exists profile_employment_history_select_lead on public.profile_employment_history;
create policy profile_employment_history_select_lead
on public.profile_employment_history for select to authenticated
using (
  exists (
    select 1 from public.profiles p
    where p.user_id = auth.uid()
      and p.active = true and p.approved = true
      and p.role in ('chief', 'owner')
  )
);

revoke all on table public.profile_employment_history from anon;
revoke insert, update, delete on table public.profile_employment_history from authenticated;
grant select on table public.profile_employment_history to authenticated;

drop policy if exists profiles_delete_owner on public.profiles;
revoke delete on table public.profiles from authenticated;
revoke delete on table public.profiles from anon;

create or replace function public.assert_employment_owner(p_user_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_target public.profiles%rowtype;
begin
  if v_actor is null then raise exception 'authenticated owner required'; end if;
  if not exists (
    select 1 from public.profiles p
    where p.user_id = v_actor and p.active = true and p.approved = true and p.role = 'owner'
  ) then raise exception 'active approved owner required'; end if;
  if v_actor = p_user_id then raise exception 'cannot change your own employment status'; end if;
  select * into v_target from public.profiles where user_id = p_user_id;
  if not found then raise exception 'profile not found'; end if;
  if v_target.role = 'owner' and v_target.active = true and (
    select count(*) from public.profiles where role = 'owner' and active = true
  ) <= 1 then raise exception 'cannot change last active owner'; end if;
  return v_actor;
end;
$$;

create or replace function public.set_employment_status(
  p_user_id uuid, p_employment_status text, p_effective_date date, p_reason text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid;
  v_before text;
  v_access_status text;
begin
  if p_employment_status is null or p_employment_status not in ('재직', '자진퇴사', '계약만료', '권고사직') then raise exception 'invalid employment status'; end if;
  if p_effective_date is null then raise exception 'effective date required'; end if;
  v_actor := public.assert_employment_owner(p_user_id);
  select employment_status, account_access_status into v_before, v_access_status from public.profiles where user_id = p_user_id for update;
  if p_employment_status = '재직' and v_access_status = '차단' then raise exception 'blocked account cannot return to employed status'; end if;
  update public.profiles
  set employment_status = p_employment_status,
      employment_effective_date = p_effective_date,
      employment_reason = nullif(btrim(p_reason), ''),
      active = case when p_employment_status = '재직' then true else false end,
      approved = case when p_employment_status = '재직' then approved else false end
  where user_id = p_user_id;
  if p_employment_status <> '재직' then
    update public.schedule_people
    set active = false, included_in_schedule = false
    where profile_user_id = p_user_id;
  end if;
  insert into public.profile_employment_history (user_id, from_status, to_status, effective_date, reason, account_action, acted_by)
  values (p_user_id, v_before, p_employment_status, p_effective_date, nullif(btrim(p_reason), ''), '상태변경', v_actor);
end;
$$;

create or replace function public.assert_employee_approver(p_user_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
begin
  if v_actor is null then raise exception 'authenticated chief or owner required'; end if;
  if not exists (
    select 1 from public.profiles p
    where p.user_id = v_actor and p.active = true and p.approved = true and p.role in ('chief', 'owner')
  ) then raise exception 'active approved chief or owner required'; end if;
  if v_actor = p_user_id then raise exception 'cannot approve your own profile'; end if;
  if not exists (select 1 from public.profiles where user_id = p_user_id) then raise exception 'profile not found'; end if;
  return v_actor;
end;
$$;

create or replace function public.approve_employee_profile(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_access_status text;
  v_employment_status text;
begin
  perform public.assert_employee_approver(p_user_id);
  select account_access_status, employment_status into v_access_status, v_employment_status
  from public.profiles where user_id = p_user_id for update;
  if v_access_status = '차단' then raise exception 'blocked account cannot be approved'; end if;
  if v_employment_status <> '재직' then raise exception 'non-employed profile cannot be approved'; end if;
  update public.profiles set approved = true where user_id = p_user_id;
end;
$$;

create or replace function public.disable_employee_account_preserve_records(
  p_user_id uuid, p_employment_status text, p_reason text, p_effective_date date
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid;
  v_before text;
begin
  if p_employment_status is null or p_employment_status not in ('자진퇴사', '계약만료', '권고사직') then raise exception 'account block requires a non-employed status'; end if;
  if p_effective_date is null then raise exception 'effective date required'; end if;
  v_actor := public.assert_employment_owner(p_user_id);
  select employment_status into v_before from public.profiles where user_id = p_user_id for update;
  update public.profiles
  set employment_status = p_employment_status,
      employment_effective_date = p_effective_date,
      employment_reason = nullif(btrim(p_reason), ''),
      account_access_status = '차단',
      account_disabled_at = now(), account_disabled_by = v_actor,
      account_disabled_reason = nullif(btrim(p_reason), ''),
      active = false, approved = false
  where user_id = p_user_id;
  update public.schedule_people
  set active = false, included_in_schedule = false
  where profile_user_id = p_user_id;
  insert into public.profile_employment_history (user_id, from_status, to_status, effective_date, reason, account_action, acted_by)
  values (p_user_id, v_before, p_employment_status, p_effective_date, nullif(btrim(p_reason), ''), '계정차단', v_actor);
end;
$$;

revoke all on function public.assert_employment_owner(uuid) from public;
revoke all on function public.assert_employee_approver(uuid) from public;
revoke all on function public.set_employment_status(uuid,text,date,text) from public;
revoke all on function public.disable_employee_account_preserve_records(uuid,text,text,date) from public;
revoke all on function public.approve_employee_profile(uuid) from public;
grant execute on function public.set_employment_status(uuid,text,date,text) to authenticated;
grant execute on function public.disable_employee_account_preserve_records(uuid,text,text,date) to authenticated;
grant execute on function public.approve_employee_profile(uuid) to authenticated;

commit;
