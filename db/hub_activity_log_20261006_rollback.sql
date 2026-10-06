-- 운영에서는 별도 승인 뒤에만 실행함.
begin;
do $$begin
 if exists(select 1 from pg_extension where extname='pg_cron') then
  if exists(select 1 from cron.job where jobname='hub-activity-retention') then perform cron.unschedule('hub-activity-retention');end if;
 end if;
end;$$;
drop function if exists public.hub_activity_page(timestamptz,timestamptz,uuid,text,integer);
drop function if exists public.hub_activity_summary();
drop function if exists public.prune_hub_activity_log();
drop function if exists public.log_hub_activity(jsonb);
drop table if exists public.hub_activity_log;
delete from public.app_settings where key in('activity_log.retention_days','activity_log.exclude_owner');
commit;
