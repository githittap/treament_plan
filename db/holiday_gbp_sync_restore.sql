-- 롤백(db/holiday_gbp_sync_rollback.sql) 뒤 마이그레이션 다섯(holiday_gbp_sync.sql → holiday_editors_20261125.sql → holiday_fix_20261125b.sql → holiday_fix_20261125c.sql → holiday_fix_20261125d.sql)을 다시 적용한 다음, 백업 표에서 값을 되살림.
-- (기반만 다시 적용하면 공휴일 진료 시각이 옛 시각 제약에 걸려 실패함 — 반드시 다섯 모두.)
-- 되살리는 것: holidays 의 open_time·close_time·sync_gbp·note·updated_at·updated_by(날짜·종류가 같은 행만, 날짜별 가장 최근 백업) + 구글 반영 기록 전체.
-- 백업 표(..._backup_20261123)는 지우지 않음. 여러 번 실행해도 같은 결과.
-- 구글 반영 기록은 record_uid로 같은 기록을 알아봐 빠진 것만 새 번호로 넣음(Sol 2026-11-25 3차 B2 — 번호를 지키려다 생긴 누락·중복을 뿌리에서 없앰).
begin;
alter table public.holidays disable trigger holidays_stamp_update;
update public.holidays h
   set open_time=b.open_time, close_time=b.close_time, sync_gbp=b.sync_gbp, note=b.note, updated_at=b.updated_at, updated_by=b.updated_by
  from (select distinct on (date) * from public.holidays_gbp_backup_20261123 order by date, backed_up_at desc) b
 where b.date=h.date and b.kind is not distinct from h.kind;
alter table public.holidays enable trigger holidays_stamp_update;

do $rs$
begin
  if to_regclass('public.gbp_special_hours_sync_log_backup_20261123') is not null then
    alter table public.gbp_special_hours_sync_log_backup_20261123 add column if not exists record_uid uuid;
    alter table public.gbp_special_hours_sync_log add column if not exists record_uid uuid not null default gen_random_uuid();
    create unique index if not exists uq_gbp_special_hours_sync_log_record_uid on public.gbp_special_hours_sync_log(record_uid);
    -- 같은 기록 = 같은 record_uid(옛 백업에 없으면 내용 전체). 여러 번 되돌려 백업에 여러 번 들어가도 한 번만 되살림.
    -- 행 번호(id)는 새로 매김 — 순서는 만든 시각 순. T2는 id가 아니라 날짜·동작·결과로 기록을 읽음(계약서).
    insert into public.gbp_special_hours_sync_log(holiday_date,action,sent_value,result,error,created_at,created_by,record_uid)
      select x.holiday_date,x.action,x.sent_value,x.result,x.error,x.created_at,x.created_by,coalesce(x.record_uid,gen_random_uuid())
        from (select distinct on (coalesce(b.record_uid::text, md5(concat_ws('|',b.id,b.holiday_date,b.action,b.result,b.created_at,b.sent_value::text,b.error,b.created_by)))) b.*
                from public.gbp_special_hours_sync_log_backup_20261123 b
               order by coalesce(b.record_uid::text, md5(concat_ws('|',b.id,b.holiday_date,b.action,b.result,b.created_at,b.sent_value::text,b.error,b.created_by))), b.backed_up_at desc) x
       where not exists(select 1 from public.gbp_special_hours_sync_log l
                         where (x.record_uid is not null and l.record_uid=x.record_uid)
                            or (x.record_uid is null and (l.holiday_date,l.action,l.result,l.created_at,l.sent_value::text,l.error,l.created_by)
                                                         is not distinct from (x.holiday_date,x.action,x.result,x.created_at,x.sent_value::text,x.error,x.created_by)))
       order by x.created_at, x.id;
  end if;
end $rs$;
commit;
