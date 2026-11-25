-- 병원 휴진·단축 진료 입력 권한을 실장·원장 → 실장·원장·매니저·데스크로 넓힘 (T8 9차 B · 2026-11-25)
-- 원장 11-25 노션: 「먼저 실장, 데스크, 매니저 등이 입력가능하게」 · 「365치과 — 빨간 날에도 안 쉼, 요즘은 거의 단축, 가끔 휴일」
--   · 「허브 연동 → 매니저가 올리고(월 마지막 주 월요일 팝업) → 반영」 · 「매일 연동은 비효율 — 매월 혹은 내가 지시 시」
-- 먼저 적용: db/holiday_gbp_sync.sql
-- 하는 일:
--   1) can_edit_clinic_hours(): 원장·실장·매니저, 또는 데스크 직원(직무 desk 또는 부서 「데스크」) — 퇴사·차단 계정은 안 됨.
--   2) holidays 쓰기: 원장·실장은 지금처럼 모든 행. 매니저·데스크는 「지정휴일(휴진)」·「단축」 행만(공휴일 행은 연차·급여 기준이라 원장·실장만).
--   3) 구글 반영 기록 읽기도 같은 사람에게.
--   4) gbp_special_hours_due 기본 범위 30일 → 60일(T2가 매월 1일·원장 지시 때 앞으로 60일을 맞춤).
-- 되돌리기: db/holiday_editors_20261125_rollback.sql
begin;

create or replace function public.can_edit_clinic_hours()
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce(public.employee_hub_access_allowed(), false) and exists(
    select 1 from public.profiles p
    where p.user_id = auth.uid()
      and (p.role in ('owner','chief','manager')
           or (p.role = 'staff' and (p.job_group = 'desk' or p.dept = '데스크')))
  )
$$;
revoke all on function public.can_edit_clinic_hours() from public, anon;
grant execute on function public.can_edit_clinic_hours() to authenticated;

drop policy if exists holidays_insert_approvers on public.holidays;
create policy holidays_insert_approvers on public.holidays for insert to authenticated
  with check (public.my_role() in ('chief','owner')
              or (public.can_edit_clinic_hours() and kind in ('지정휴일','단축')));

drop policy if exists holidays_update_approvers on public.holidays;
create policy holidays_update_approvers on public.holidays for update to authenticated
  using (public.my_role() in ('chief','owner')
         or (public.can_edit_clinic_hours() and kind in ('지정휴일','단축')))
  with check (public.my_role() in ('chief','owner')
              or (public.can_edit_clinic_hours() and kind in ('지정휴일','단축')));

drop policy if exists holidays_delete_approvers on public.holidays;
create policy holidays_delete_approvers on public.holidays for delete to authenticated
  using (public.my_role() in ('chief','owner')
         or (public.can_edit_clinic_hours() and kind in ('지정휴일','단축')));

drop policy if exists gbp_sync_log_select_lead on public.gbp_special_hours_sync_log;
create policy gbp_sync_log_select_lead on public.gbp_special_hours_sync_log
  for select to authenticated
  using (public.my_role() in ('chief','owner') or public.can_edit_clinic_hours());

-- 기본 범위만 60일로(본문·권한은 그대로).
create or replace function public.gbp_special_hours_due(p_days int default 60)
returns table("date" date, closed boolean, open_time time, close_time time, name text, kind text, note text)
language plpgsql stable security invoker set search_path = pg_catalog, public as $$
#variable_conflict use_column
declare today_kst date := (now() at time zone 'Asia/Seoul')::date;
begin
  if current_user not in ('service_role','postgres','supabase_admin') then
    if coalesce(public.my_role(),'')<>'owner' or not coalesce(public.employee_hub_access_allowed(),false) then
      raise exception 'not allowed' using errcode='42501';
    end if;
  end if;
  return query
    select h.date, (coalesce(h.kind,'공휴일')<>'단축') as closed, h.open_time, h.close_time, h.name, h.kind, h.note
    from public.holidays h
    where h.sync_gbp
      and not (coalesce(h.kind,'공휴일')='단축' and (h.open_time is null or h.close_time is null or h.open_time>=h.close_time))
      and h.date between today_kst and today_kst + greatest(0, least(coalesce(p_days,60), 366))
    order by h.date;
end $$;
revoke all on function public.gbp_special_hours_due(int) from public, anon;
grant execute on function public.gbp_special_hours_due(int) to authenticated, service_role;

-- 원장이 화면에서 끌 수 있는 월말 입력 알림 스위치(기본 켬).
do $s$
begin
  if to_regclass('public.app_settings') is not null then
    insert into public.app_settings(key,value) values('hgbp.remind_on','true') on conflict (key) do nothing;
  end if;
end $s$;

commit;
