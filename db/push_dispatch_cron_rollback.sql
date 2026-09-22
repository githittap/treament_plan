-- push_dispatch_cron_draft.sql 전용 롤백. 이 작업이 만든 cron job 하나만 지운다.
-- pg_cron/pg_net 확장 자체는 다른 기능이 함께 쓸 수 있으므로 여기서 drop extension 하지 않는다.
begin;
do $$ begin
  if to_regnamespace('cron') is null or not exists(select 1 from cron.job where jobname='push-dispatcher-every-minute') then
    raise exception 'push-dispatcher-every-minute cron job missing; nothing to roll back or already rolled back';
  end if;
end $$;
select cron.unschedule('push-dispatcher-every-minute');
commit;
