-- 롤백(db/holiday_gbp_sync_rollback.sql) 뒤 db/holiday_gbp_sync.sql 을 다시 적용한 다음, 백업 표에서 값을 되살림.
-- 되살리는 것: holidays 의 open_time·close_time·sync_gbp·note·updated_at·updated_by(날짜·종류가 같은 행만, 날짜별 가장 최근 백업) + 구글 반영 기록 전체.
-- 백업 표(..._backup_20261123)는 지우지 않음. 여러 번 실행해도 같은 결과.
-- 다시 적용한 뒤 복원 전에 새로 쓴 기록이 백업과 같은 id를 차지했으면, 그 새 기록을 뒤 번호로 옮긴 뒤 백업 기록을 원래 id로 넣음(Sol 2026-11-25 B4).
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
    perform setval(pg_get_serial_sequence('public.gbp_special_hours_sync_log','id'), greatest(
      (select coalesce(max(id),1) from public.gbp_special_hours_sync_log),
      (select coalesce(max(id),1) from public.gbp_special_hours_sync_log_backup_20261123)));
    create temp table _gbp_clash on commit drop as
      select l.* from public.gbp_special_hours_sync_log l
       where exists(select 1 from public.gbp_special_hours_sync_log_backup_20261123 b
                     where b.id=l.id and (b.holiday_date,b.action,b.result,b.created_at) is distinct from (l.holiday_date,l.action,l.result,l.created_at));
    delete from public.gbp_special_hours_sync_log l using _gbp_clash c where l.id=c.id;
    insert into public.gbp_special_hours_sync_log(holiday_date,action,sent_value,result,error,created_at,created_by)
      select holiday_date,action,sent_value,result,error,created_at,created_by from _gbp_clash order by id;
    insert into public.gbp_special_hours_sync_log(id,holiday_date,action,sent_value,result,error,created_at,created_by)
      overriding system value
      select distinct on (id) id,holiday_date,action,sent_value,result,error,created_at,created_by
        from public.gbp_special_hours_sync_log_backup_20261123 order by id, backed_up_at desc
      on conflict (id) do nothing;
    perform setval(pg_get_serial_sequence('public.gbp_special_hours_sync_log','id'), greatest((select coalesce(max(id),1) from public.gbp_special_hours_sync_log),1));
  end if;
end $rs$;
commit;
