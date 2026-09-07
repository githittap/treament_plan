alter table public.profiles add column if not exists approved boolean not null default false;

-- 1회성: 기존 전원(약 25명, owner 포함) 일괄 승인. 이 UPDATE는 배포 직후 1번만 실행하는 것이 목적 —
-- 나중에 이 파일을 다시 통째로 실행하면 그 시점의 미승인자도 함께 승인돼버리니 주의(재실행 시 이 문장은 빼고 실행).
update public.profiles set approved = true;

CREATE OR REPLACE FUNCTION public.my_role()
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select case
    when exists (
      select 1 from public.profiles as p
      where p.user_id = auth.uid() and p.approved = false
    ) then 'pending'
    else coalesce(
      (select p.role from public.profiles as p where p.user_id = auth.uid()),
      'staff'
    )
  end;
$function$;

-- ortho_cases
drop policy if exists ortho_cases_authenticated_select on public.ortho_cases;
create policy ortho_cases_authenticated_select on public.ortho_cases for select to authenticated using (my_role() <> 'pending');
drop policy if exists ortho_cases_authenticated_insert on public.ortho_cases;
create policy ortho_cases_authenticated_insert on public.ortho_cases for insert to authenticated with check (my_role() <> 'pending');
drop policy if exists ortho_cases_authenticated_update on public.ortho_cases;
create policy ortho_cases_authenticated_update on public.ortho_cases for update to authenticated using (my_role() <> 'pending') with check (my_role() <> 'pending');
-- ortho_events
drop policy if exists ortho_events_authenticated_select on public.ortho_events;
create policy ortho_events_authenticated_select on public.ortho_events for select to authenticated using (my_role() <> 'pending');
drop policy if exists ortho_events_authenticated_insert on public.ortho_events;
create policy ortho_events_authenticated_insert on public.ortho_events for insert to authenticated with check (my_role() <> 'pending');
-- ortho_visits
drop policy if exists ortho_visits_authenticated_select on public.ortho_visits;
create policy ortho_visits_authenticated_select on public.ortho_visits for select to authenticated using (my_role() <> 'pending');
drop policy if exists ortho_visits_authenticated_insert on public.ortho_visits;
create policy ortho_visits_authenticated_insert on public.ortho_visits for insert to authenticated with check (my_role() <> 'pending');
-- ortho_rescans
drop policy if exists ortho_rescans_authenticated_select on public.ortho_rescans;
create policy ortho_rescans_authenticated_select on public.ortho_rescans for select to authenticated using (my_role() <> 'pending');
drop policy if exists ortho_rescans_authenticated_insert on public.ortho_rescans;
create policy ortho_rescans_authenticated_insert on public.ortho_rescans for insert to authenticated with check (my_role() <> 'pending');
-- ledger (기공차트)
drop policy if exists "read" on public.ledger;
create policy "read" on public.ledger for select to authenticated using (my_role() <> 'pending');
drop policy if exists "insert" on public.ledger;
create policy "insert" on public.ledger for insert to authenticated with check (my_role() <> 'pending');
-- ledger_files
drop policy if exists ledger_files_select_authenticated on public.ledger_files;
create policy ledger_files_select_authenticated on public.ledger_files for select to authenticated using (my_role() <> 'pending');
drop policy if exists ledger_files_insert_authenticated on public.ledger_files;
create policy ledger_files_insert_authenticated on public.ledger_files for insert to authenticated with check (my_role() <> 'pending');
