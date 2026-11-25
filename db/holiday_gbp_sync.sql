-- 병원 휴진·단축 진료 → 구글 비즈니스 프로필 특별 영업시간 연동 (T8 9차 B · 2026-11-23 초안)
-- 원장 11-22 승인: 직원허브에 올라온 휴진·단축 정보를 구글 특별 영업시간에 자동 연동.
-- 이 파일은 검수용 초안임 — 운영 DB 적용은 클로드 검수 → Sol high 검증 → 원장 「운영 올려」 뒤에만.
-- 하는 일:
--   1) public.holidays 에 시각·구글 전송 여부·사유·수정 기록 칸을 더함(새 표 대신 기존 표 확장, 기존 RLS 그대로).
--   2) 「단축」 행은 문 닫는 날이 아님 — 연차 일수 계산·월차 결근 후보·공휴일 근무 보기가 「단축」을 휴일로 세지 않도록 고침.
--   3) 구글 반영 기록 표 gbp_special_hours_sync_log (읽기 원장·실장 / 쓰기는 service_role 전용 함수).
--   4) T2 연동 작업이 읽는 함수 gbp_special_hours_due(p_days).
--   5) 휴진·단축 상태가 바뀌는 날짜에 승인·대기 연차가 걸려 있으면 막고(holiday_conflicts_leave), 그날 기존 근태의 휴일 표시(is_holiday)를
--      같은 트랜잭션에서 다시 맞춤(이미 확정한 달이면 막음: holiday_month_closed).
-- 배포 순서: 이 SQL 적용 → hr.html 배포. 되돌릴 땐 hr.html 먼저 되돌린 뒤 롤백 SQL(달력은 새 칸이 없어도 옛 칸으로 다시 읽어 깨지지 않게 해 두었음).
-- 되돌리기: db/holiday_gbp_sync_rollback.sql
begin;

-- 1) holidays 확장 ------------------------------------------------------------
-- 칸을 처음 더할 때만 기존 공휴일 행을 sync_gbp=false 로 맞춤. 다시 적용해도 원장이 켠 「구글에 보내기」는 그대로(재적용 안전).
do $mig$
declare fresh boolean := not exists(
  select 1 from information_schema.columns
  where table_schema='public' and table_name='holidays' and column_name='sync_gbp');
begin
  alter table public.holidays
    add column if not exists open_time time,
    add column if not exists close_time time,
    add column if not exists sync_gbp boolean not null default true,
    add column if not exists note text,
    add column if not exists updated_at timestamptz,
    add column if not exists updated_by uuid;
  -- 이미 있던 공휴일 행은 병원이 공휴일에 진료하는지 원장 확인 전이므로 구글로 보내지 않음.
  if fresh then
    update public.holidays set sync_gbp=false where coalesce(kind,'공휴일')='공휴일';
    -- 되돌린 뒤 다시 적용하면 남아 있던 「단축」 행에 시각이 없음 → 복원(holiday_gbp_sync_restore.sql) 전까지 구글로 보내지 않음(Sol 3차 B1).
    update public.holidays set sync_gbp=false where kind='단축' and (open_time is null or close_time is null);
  end if;
end $mig$;

alter table public.holidays drop constraint if exists holidays_gbp_times_chk;
-- not valid: 롤백 뒤 다시 적용할 때 시각이 사라진 옛 「단축」 행이 있어도 적용이 막히지 않게 함(새로 넣거나 고치는 행은 그대로 검사).
alter table public.holidays add constraint holidays_gbp_times_chk check (
  (kind='단축' and open_time is not null and close_time is not null and open_time<close_time)
  or (coalesce(kind,'공휴일')<>'단축' and open_time is null and close_time is null)
) not valid;
alter table public.holidays drop constraint if exists holidays_note_len_chk;
alter table public.holidays add constraint holidays_note_len_chk check (note is null or length(note)<=500);

create or replace function public.holidays_stamp_update()
returns trigger language plpgsql set search_path = pg_catalog, public as $$
begin
  new.updated_at := now();
  new.updated_by := auth.uid();
  return new;
end $$;
drop trigger if exists holidays_stamp_update on public.holidays;
create trigger holidays_stamp_update before insert or update on public.holidays
  for each row execute function public.holidays_stamp_update();

create index if not exists idx_holidays_sync_gbp_date on public.holidays(date) where sync_gbp;

-- 1b) 휴진 상태가 바뀔 때의 안전장치 ------------------------------------------------
-- 「쉬는 날」 = 휴진·공휴일(kind<>'단축') 행이 있는 날. 날짜의 쉬는 날 여부가 바뀌면(행 추가·삭제·휴진↔단축 전환·날짜 변경):
--   a) 그날을 지나는 승인·대기 연차(연차·기타 — 일수가 휴일 기준으로 계산됨)가 있으면 holiday_conflicts_leave 로 막음.
--      연차 장부 일수가 옛 휴일 기준으로 남는 것을 막기 위함 — 먼저 연차 「날짜 바꾸기」로 조정한 뒤 휴진을 바꿔야 함.
--   b) 그날의 기존 근태 is_holiday 를 새 상태에 맞춰 같은 트랜잭션에서 고침(휴일근로·급여 회신이 새로 계산한 값과 같아짐).
--      그 달이 이미 확정(att_months.status='확정')이고 바뀔 근태가 있으면 holiday_month_closed 로 막음.
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
drop trigger if exists holidays_guard_status_change on public.holidays;
create trigger holidays_guard_status_change after insert or update or delete on public.holidays
  for each row execute function public.holidays_guard_status_change();

-- 2) 「단축」 행을 휴일로 세지 않도록 기존 3개를 고침 ----------------------------
-- 운영 함수 본문을 그대로 읽어 한 줄만 바꿈(이미 고쳐져 있으면 건너뜀, 예상 문구가 없으면 중단).
do $patch$
declare
  f text; def text;
  old_txt constant text := 'not exists(select 1 from public.holidays h where h.date=d::date)';
  new_txt constant text := 'not exists(select 1 from public.holidays h where h.date=d::date and h.kind is distinct from ''단축'')';
begin
  foreach f in array array[
    'public.edit_approved_leave_dates(bigint,jsonb,text,text,date,date)',
    'public.monthly_leave_absence_candidates(uuid,date,date,text)'
  ] loop
    def := pg_get_functiondef(f::regprocedure);
    if position(new_txt in def)>0 then continue; end if;
    if position(old_txt in def)=0 then raise exception 'holiday counting text not found in %', f; end if;
    execute replace(def, old_txt, new_txt);
  end loop;
end $patch$;

create or replace view public.v_holiday_work
with (security_invoker = true)
as
select
  a.user_id,
  p.name,
  a.work_date,
  h.name as holiday_name,
  a.clock_in,
  a.clock_out
from public.attendance as a
join public.holidays as h
  on h.date = a.work_date and h.kind is distinct from '단축'
join public.profiles as p
  on p.user_id = a.user_id;

-- 3) 구글 반영 기록 --------------------------------------------------------------
create table if not exists public.gbp_special_hours_sync_log (
  id bigint generated always as identity primary key,
  holiday_date date,
  action text not null check (action in ('set','clear','noop','error')),
  sent_value jsonb,
  result text not null check (result in ('ok','failed','skipped')),
  error text check (error is null or length(error)<=2000),
  created_at timestamptz not null default now(),
  created_by text
);
create index if not exists idx_gbp_special_hours_sync_log_created on public.gbp_special_hours_sync_log(created_at desc, id desc);
alter table public.gbp_special_hours_sync_log enable row level security;
revoke all on table public.gbp_special_hours_sync_log from public, anon, authenticated;
grant select on table public.gbp_special_hours_sync_log to authenticated, service_role;

drop policy if exists gbp_sync_log_select_lead on public.gbp_special_hours_sync_log;
create policy gbp_sync_log_select_lead on public.gbp_special_hours_sync_log
  for select to authenticated
  using (public.my_role() in ('chief','owner'));

-- 접근 차단(퇴직·비활성) 계정은 실장·원장이라도 못 읽게 하는 제한 정책. 운영에는 도우미 함수(_install_employee_hub_access_gate)가 남아 있지 않아 정책을 직접 만듦.
drop policy if exists employee_hub_access_gate on public.gbp_special_hours_sync_log;
create policy employee_hub_access_gate on public.gbp_special_hours_sync_log
  as restrictive for all to authenticated
  using (public.employee_hub_access_allowed())
  with check (public.employee_hub_access_allowed());

-- 기록 쓰기: service_role(T2 연동 작업)만. 직원·익명은 실행 불가.
create or replace function public.gbp_special_hours_log_write(
  p_holiday_date date,
  p_action text,
  p_sent_value jsonb default null,
  p_result text default 'ok',
  p_error text default null,
  p_created_by text default 'gbp-sync'
) returns bigint
language plpgsql security definer set search_path = '' as $$
declare new_id bigint;
begin
  if p_action is null or p_action not in ('set','clear','noop','error') then raise exception 'invalid action'; end if;
  if p_result is null or p_result not in ('ok','failed','skipped') then raise exception 'invalid result'; end if;
  if p_sent_value is not null and pg_column_size(p_sent_value)>20000 then raise exception 'sent_value too large'; end if;
  insert into public.gbp_special_hours_sync_log(holiday_date,action,sent_value,result,error,created_by)
  values(p_holiday_date,p_action,p_sent_value,p_result,left(p_error,2000),left(coalesce(p_created_by,'gbp-sync'),60))
  returning id into new_id;
  return new_id;
end $$;
revoke all on function public.gbp_special_hours_log_write(date,text,jsonb,text,text,text) from public, anon, authenticated;
grant execute on function public.gbp_special_hours_log_write(date,text,jsonb,text,text,text) to service_role;

-- 4) 구글로 보낼 목록 — 오늘(서울)부터 p_days일 안의 sync_gbp 행 ----------------------
-- closed=true: 종일 휴진(공휴일·지정휴일). closed=false: 단축 진료(open_time~close_time, 서울 시각).
create or replace function public.gbp_special_hours_due(p_days int default 30)
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
      -- 시각이 비었거나 거꾸로인 「단축」 행은 절대 돌려주지 않음(계약: closed=false면 open_time<close_time 항상 있음)
      and not (coalesce(h.kind,'공휴일')='단축' and (h.open_time is null or h.close_time is null or h.open_time>=h.close_time))
      and h.date between today_kst and today_kst + greatest(0, least(coalesce(p_days,30), 366))
    order by h.date;
end $$;
revoke all on function public.gbp_special_hours_due(int) from public, anon;
grant execute on function public.gbp_special_hours_due(int) to authenticated, service_role;

commit;
