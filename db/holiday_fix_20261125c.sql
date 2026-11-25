-- 휴진·근태 날짜 잠금 순서 맞춤 (Sol 사후 2차 B3 · T8 9차 B · 2026-11-25)
-- 먼저 적용: db/holiday_gbp_sync.sql → db/holiday_editors_20261125.sql → db/holiday_fix_20261125b.sql
-- 휴진 날짜를 옮기면(두 날짜) 보호 트리거가 날짜를 순서 없이 잠가, 근태 일괄 업로드(여러 날짜)와 서로 기다리다 한쪽이 취소될 수 있었음.
-- 고침: 보호 트리거가 처음에 관련 날짜를 **날짜 오름차순으로 한꺼번에** 잠금. 근태 업로드도 화면에서 날짜 오름차순으로 보냄(hr.html saveAttendance).
-- 되돌리기: 필요 없음(잠금 순서만 바뀜 · 본문은 holiday_fix_20261125b.sql과 같음).
begin;
create or replace function public.holidays_guard_status_change()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  d date; was boolean; now_closed boolean; n int; m text;
begin
  -- 관련 날짜(옛 날짜·새 날짜)를 날짜 오름차순으로 먼저 잠금 — 근태 업로드와 같은 순서라 서로 막히지 않음.
  for d in
    select distinct y.d from (
      select old.date as d where tg_op in ('UPDATE','DELETE')
      union all select new.date where tg_op in ('INSERT','UPDATE')) y
    where y.d is not null order by y.d
  loop
    perform pg_advisory_xact_lock(hashtext('hub.holiday:'||d::text));
  end loop;
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
commit;
