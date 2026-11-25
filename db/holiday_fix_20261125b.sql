-- 휴진·단축 연동 사후 검증(Sol 2026-11-25) 고침 — 365치과 공휴일 진료 방식·근태 휴일 표시 동시 저장·구글 전송 기본값 (T8 9차 B)
-- 먼저 적용: db/holiday_gbp_sync.sql → db/holiday_editors_20261125.sql
-- 하는 일:
--   1) 공휴일 행에도 진료 시각을 넣을 수 있게 함(병원은 공휴일에도 진료 — 원장 11-25 「365치과, 요즘은 거의 단축, 가끔 휴일」).
--      공휴일 행: sync_gbp=false → 평소대로 진료(구글 그대로) · sync_gbp=true+시각 → 구글에 단축 진료 · sync_gbp=true+시각 없음 → 구글에 휴진.
--      공휴일은 그대로 공휴일(연차·근태·급여의 휴일 기준은 바뀌지 않음).
--   2) 매니저·데스크는 공휴일 행의 「진료 방식(시각·구글 전송·메모)」만 고칠 수 있음 — 날짜·이름·종류는 원장·실장만(holidays_editor_guard).
--   3) 근태의 휴일 표시(attendance.is_holiday)는 DB가 holidays 표로 직접 정함(attendance_set_is_holiday) + 같은 날짜 잠금으로
--      근태 업로드와 휴진 입력이 동시에 일어나도 어긋나지 않게 함.
--   4) holidays.sync_gbp 기본값 true → false(전송 여부를 안 적고 넣은 행은 구글로 안 보냄 — 화면은 항상 직접 적음).
--   5) gbp_special_hours_due: 시각이 있으면 단축(closed=false), 없으면 휴진(closed=true). 시각 반쪽·거꾸로인 행은 안 내보냄.
-- 되돌리기: db/holiday_fix_20261125b_rollback.sql
begin;

-- 1) 시각 제약: 공휴일도 시각 둘 다 있거나 둘 다 없음
alter table public.holidays drop constraint if exists holidays_gbp_times_chk;
alter table public.holidays add constraint holidays_gbp_times_chk check (
  (kind='단축' and open_time is not null and close_time is not null and open_time<close_time)
  or (coalesce(kind,'공휴일')='공휴일' and ((open_time is null and close_time is null) or (open_time is not null and close_time is not null and open_time<close_time)))
  or (kind is not null and kind not in ('단축','공휴일') and open_time is null and close_time is null)
) not valid;

alter table public.holidays alter column sync_gbp set default false;

-- 2) 매니저·데스크의 공휴일 행 수정 범위
create or replace function public.holidays_editor_guard()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or coalesce(public.my_role(),'') in ('chief','owner') then return new; end if;
  if old.kind is not distinct from '공휴일' or new.kind is not distinct from '공휴일' then
    if old.kind is distinct from '공휴일' or new.kind is distinct from '공휴일'
       or new.date is distinct from old.date or new.name is distinct from old.name then
      raise exception 'holiday_public_lead_only' using errcode='42501',
        hint='only chief/owner can change date, name or kind of a public holiday row';
    end if;
  end if;
  return new;
end $$;
revoke all on function public.holidays_editor_guard() from public, anon, authenticated;
drop trigger if exists holidays_editor_guard on public.holidays;
create trigger holidays_editor_guard before update on public.holidays
  for each row execute function public.holidays_editor_guard();

drop policy if exists holidays_update_approvers on public.holidays;
create policy holidays_update_approvers on public.holidays for update to authenticated
  using (public.my_role() in ('chief','owner')
         or (public.can_edit_clinic_hours() and kind in ('지정휴일','단축','공휴일')))
  with check (public.my_role() in ('chief','owner')
              or (public.can_edit_clinic_hours() and kind in ('지정휴일','단축','공휴일')));

-- 3) 근태 휴일 표시는 DB가 정함 + 같은 날짜 잠금
create or replace function public.attendance_set_is_holiday()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.work_date is null then return new; end if;
  perform pg_advisory_xact_lock(hashtext('hub.holiday:'||new.work_date::text));
  new.is_holiday := exists(select 1 from public.holidays h where h.date=new.work_date and h.kind is distinct from '단축');
  return new;
end $$;
revoke all on function public.attendance_set_is_holiday() from public, anon, authenticated;
drop trigger if exists attendance_set_is_holiday on public.attendance;
create trigger attendance_set_is_holiday before insert or update of work_date, is_holiday on public.attendance
  for each row execute function public.attendance_set_is_holiday();

-- 휴진 쪽 보호 트리거도 같은 날짜 잠금을 잡은 뒤 근태를 고침(본문은 holiday_gbp_sync.sql과 같고 잠금 한 줄만 더함).
create or replace function public.holidays_guard_status_change()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  d date; was boolean; now_closed boolean; n int; m text;
begin
  for d, was, now_closed in
    select x.d, x.was, x.now_closed from (
      select old.date as d,
             (tg_op in ('UPDATE','DELETE') and coalesce(old.kind,'공휴일')<>'단축') as was,
             (tg_op='UPDATE' and new.date=old.date and coalesce(new.kind,'공휴일')<>'단축') as now_closed
        where tg_op in ('UPDATE','DELETE')
      union all
      select new.date,
             false,
             (coalesce(new.kind,'공휴일')<>'단축')
        where tg_op='INSERT' or (tg_op='UPDATE' and new.date<>old.date)
    ) x
  loop
    if was is not distinct from now_closed then continue; end if;
    perform pg_advisory_xact_lock(hashtext('hub.holiday:'||d::text));
    select count(*) into n from public.leave_requests lr
      where lr.status in ('대기','1차승인','승인') and lr.type in ('연차','기타')
        and d between lr.date_from and lr.date_to;
    if n>0 then
      raise exception 'holiday_conflicts_leave' using errcode='P0001',
        detail=format('%s: %s leave request(s) cover this date', d, n),
        hint='adjust the leave dates first';
    end if;
    m := to_char(d,'YYYY-MM');
    if exists(select 1 from public.attendance a where a.work_date=d and a.is_holiday is distinct from now_closed)
       and exists(select 1 from public.att_months am where am.month=m and am.status='확정') then
      raise exception 'holiday_month_closed' using errcode='P0001',
        detail=format('%s: attendance month %s is already closed', d, m),
        hint='reopen the month first';
    end if;
    update public.attendance a set is_holiday=now_closed where a.work_date=d and a.is_holiday is distinct from now_closed;
  end loop;
  return null;
end $$;
revoke all on function public.holidays_guard_status_change() from public, anon, authenticated;

-- 5) 구글로 보낼 목록: 시각 있으면 단축, 없으면 휴진
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
    select h.date, (h.open_time is null) as closed, h.open_time, h.close_time, h.name, h.kind, h.note
    from public.holidays h
    where h.sync_gbp
      and not (coalesce(h.kind,'공휴일')='단축' and (h.open_time is null or h.close_time is null))
      and not ((h.open_time is null) <> (h.close_time is null))
      and not (h.open_time is not null and h.open_time>=h.close_time)
      and h.date between today_kst and today_kst + greatest(0, least(coalesce(p_days,60), 366))
    order by h.date;
end $$;
revoke all on function public.gbp_special_hours_due(int) from public, anon;
grant execute on function public.gbp_special_hours_due(int) to authenticated, service_role;

commit;
