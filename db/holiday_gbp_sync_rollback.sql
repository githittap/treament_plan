-- db/holiday_gbp_sync.sql 되돌리기.
-- 새 칸과 구글 반영 기록 표를 지우기 전에 값을 백업 표에 복사하고, 백업 표는 되돌리기 뒤에도 그대로 남김(자동으로 지우지 않음).
--   holidays 새 칸 → public.holidays_gbp_backup_20261123 (date·name·kind·open_time·close_time·sync_gbp·note·updated_at·updated_by·backed_up_at)
--   구글 반영 기록 → public.gbp_special_hours_sync_log_backup_20261123 (원래 칸 전부 + backed_up_at)
-- 다시 적용한 뒤 값을 되살리려면 db/holiday_gbp_sync_restore.sql. 백업을 영구 삭제하는 일은 원장 승인 뒤에만.
-- 여러 번 되돌리면 백업 표에 backed_up_at 이 다른 줄이 쌓임(복원은 날짜별 가장 최근 것만 씀).
begin;

-- 0) 구글 자동 연동 스위치를 먼저 끔(Sol 4차 B1 뿌리 막기): 되돌림→재적용→복원 사이에 T2가 빈 목록을 「지울 날짜」로 읽지 않게 함.
--    재적용·복원 뒤 목록을 확인하고 원장(또는 T2)이 허브 설정에서 다시 켬.
do $off$
begin
  if to_regclass('public.app_settings') is not null then
    update public.app_settings set value='false' where key='gbp.sync_live';
    if not found then insert into public.app_settings(key,value) values('gbp.sync_live','false'); end if;
  end if;
end $off$;

do $bk$
begin
  create table if not exists public.holidays_gbp_backup_20261123 (
    date date not null, name text, kind text, open_time time, close_time time, sync_gbp boolean, note text,
    updated_at timestamptz, updated_by uuid, backed_up_at timestamptz not null default now()
  );
  if exists(select 1 from information_schema.columns where table_schema='public' and table_name='holidays' and column_name='sync_gbp') then
    insert into public.holidays_gbp_backup_20261123(date,name,kind,open_time,close_time,sync_gbp,note,updated_at,updated_by)
      select h.date,h.name,h.kind,h.open_time,h.close_time,h.sync_gbp,h.note,h.updated_at,h.updated_by from public.holidays h;
  end if;
  if to_regclass('public.gbp_special_hours_sync_log') is not null then
    if to_regclass('public.gbp_special_hours_sync_log_backup_20261123') is null then
      create table public.gbp_special_hours_sync_log_backup_20261123 as select * from public.gbp_special_hours_sync_log with no data;
      alter table public.gbp_special_hours_sync_log_backup_20261123 add column backed_up_at timestamptz not null default now();
    end if;
    insert into public.gbp_special_hours_sync_log_backup_20261123(id,holiday_date,action,sent_value,result,error,created_at,created_by)
      select id,holiday_date,action,sent_value,result,error,created_at,created_by from public.gbp_special_hours_sync_log;
  end if;
end $bk$;
alter table public.holidays_gbp_backup_20261123 enable row level security;
revoke all on table public.holidays_gbp_backup_20261123 from public, anon, authenticated;
do $bk2$
begin
  if to_regclass('public.gbp_special_hours_sync_log_backup_20261123') is not null then
    alter table public.gbp_special_hours_sync_log_backup_20261123 enable row level security;
    revoke all on table public.gbp_special_hours_sync_log_backup_20261123 from public, anon, authenticated;
  end if;
end $bk2$;

drop trigger if exists holidays_guard_status_change on public.holidays;
drop function if exists public.holidays_guard_status_change();
drop function if exists public.gbp_special_hours_due(int);
drop function if exists public.gbp_special_hours_log_write(date,text,jsonb,text,text,text);
drop table if exists public.gbp_special_hours_sync_log;

-- 「단축」을 쉬는 날로 세지 않는 계산 수정(연차·결근 후보 함수 2개와 v_holiday_work)은 되돌리지 않음.
-- kind '단축'은 이 마이그레이션 전부터 표에 허용된 값이라, 되돌린 뒤에도 단축 행을 휴일로 세면 계산이 틀림(Sol 2차 B1).

drop trigger if exists holidays_stamp_update on public.holidays;
drop function if exists public.holidays_stamp_update();
drop index if exists public.idx_holidays_sync_gbp_date;
alter table public.holidays drop constraint if exists holidays_gbp_times_chk;
alter table public.holidays drop constraint if exists holidays_note_len_chk;
alter table public.holidays
  drop column if exists open_time,
  drop column if exists close_time,
  drop column if exists sync_gbp,
  drop column if exists note,
  drop column if exists updated_at,
  drop column if exists updated_by;
commit;
