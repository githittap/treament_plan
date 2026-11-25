-- 휴진 연동 사후 검증(Sol 3차) 뿌리 고침 (T8 9차 B · 2026-11-25)
-- 먼저 적용: holiday_gbp_sync.sql → holiday_editors_20261125.sql → holiday_fix_20261125b.sql → holiday_fix_20261125c.sql
-- 하는 일:
--   1) 구글 반영 기록에 바뀌지 않는 고유번호 record_uid — 되돌리기·복원은 이 번호로 같은 기록을 알아봄(행 번호 id는 복원 때 새로 매길 수 있음).
--   2) 연차 신청·수정도 휴진과 같은 날짜 잠금을 잡고, 잠금을 잡은 뒤 DB가 일수를 다시 셈 — 화면이 보낸 일수와 다르면 저장을 막음(leave_days_stale).
--      (휴진 입력과 연차 신청이 동시에 일어나 휴진일이 연차 1일로 남는 일을 막음. 일수 공식은 edit_approved_leave_dates와 같음.)
-- 되돌리기: db/holiday_fix_20261125d_rollback.sql
begin;

alter table public.gbp_special_hours_sync_log add column if not exists record_uid uuid not null default gen_random_uuid();
create unique index if not exists uq_gbp_special_hours_sync_log_record_uid on public.gbp_special_hours_sync_log(record_uid);

create or replace function public.leave_requests_days_check()
returns trigger language plpgsql security definer set search_path = '' as $$
declare d date; n numeric;
begin
  if new.type not in ('연차','기타') or new.status not in ('대기','1차승인','승인')
     or new.date_from is null or new.date_to is null or new.date_to < new.date_from then
    return new;
  end if;
  if tg_op='UPDATE' and new.date_from=old.date_from and new.date_to=old.date_to and new.type=old.type
     and new.days is not distinct from old.days and new.user_id=old.user_id then
    return new; -- 결재·상태만 바뀜(날짜·일수 그대로) — 다시 세지 않음
  end if;
  if new.date_to - new.date_from > 400 then raise exception 'leave_range_too_long' using errcode='P0001'; end if;
  -- 휴진 보호 트리거와 같은 날짜 열쇠를 날짜 오름차순으로 잠금
  for d in select g::date from generate_series(new.date_from::timestamp, new.date_to::timestamp, interval '1 day') g order by 1 loop
    perform pg_advisory_xact_lock(hashtext('hub.holiday:'||d::text));
  end loop;
  select count(*) into n from generate_series(new.date_from::timestamp,new.date_to::timestamp,interval '1 day') g
    where not exists(select 1 from public.holidays h where h.date=g::date and h.kind is distinct from '단축')
      and not exists(select 1 from public.schedules s where s.user_id=new.user_id and s.week_start=date_trunc('week',g)::date and s.day=extract(dow from g)::integer and s.shift='off');
  if new.days is distinct from n then
    raise exception 'leave_days_stale' using errcode='P0001',
      detail=format('client days %s, server days %s', new.days, n),
      hint='holidays or schedule changed — recompute and submit again';
  end if;
  return new;
end $$;
revoke all on function public.leave_requests_days_check() from public, anon, authenticated;
drop trigger if exists leave_requests_days_check on public.leave_requests;
create trigger leave_requests_days_check before insert or update of date_from, date_to, type, days, status, user_id on public.leave_requests
  for each row execute function public.leave_requests_days_check();

commit;
