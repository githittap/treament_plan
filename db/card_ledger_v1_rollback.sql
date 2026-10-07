-- 카드 원장 되돌리기 초안. 데이터가 남으면 보존하고 중단함. 운영에서 자동 실행하지 않음.
begin;
do $$declare v_table text;n bigint;begin
 foreach v_table in array array['card_transactions','card_merchants','card_sms_failed_raw'] loop
  if to_regclass('public.'||v_table) is not null then
   execute format('select count(*) from public.%I',v_table) into n;
   if n>0 then raise exception 'preserve data and stop rollback: % has % rows',v_table,n;end if;
  end if;
 end loop;
 if exists(select 1 from information_schema.columns where table_schema='public' and table_name='ai_billing_events' and column_name='card_merchant') then
  if exists(select 1 from public.ai_billing_events where card_merchant is not null) then
   raise exception 'preserve data and stop rollback: structured legacy merchants exist';
  end if;
 end if;
 if exists(select 1 from pg_extension where extname='pg_cron') then
  perform cron.unschedule(jobid) from cron.job where jobname='card-sms-failed-raw-purge';
 end if;
end$$;
drop function if exists public.record_card_transaction(jsonb);
drop function if exists public.card_sms_failed_raw_purge();
drop table if exists public.card_sms_failed_raw;
drop table if exists public.card_transactions;
drop table if exists public.card_merchants;
alter table public.ai_billing_events drop column if exists card_merchant;
commit;