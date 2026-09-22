-- push_notifications_draft.sql 전용 롤백. push_subscriptions(Task 7)는 절대 건드리지 않는다.
-- 큐/기록에 행이 남아있으면 보존하고 멈춘다(fail-closed). 이미 걷힌 상태(테이블 없음)에도 조용히 성공하지 않는다.
begin;
do $$ begin
  if to_regclass('public.push_events') is null or to_regclass('public.push_event_deliveries') is null then
    raise exception 'push notification outbox tables missing; nothing to roll back or already rolled back';
  end if;
  if exists(select 1 from public.push_events) then
    raise exception 'push events exist; preserve data and stop rollback';
  end if;
  if exists(select 1 from public.push_event_deliveries) then
    raise exception 'push event deliveries exist; preserve data and stop rollback';
  end if;
  if not exists(select 1 from pg_trigger where tgname='queue_leave_push_event' and tgrelid='public.leave_requests'::regclass) then
    raise exception 'queue_leave_push_event trigger missing; preserve state and stop rollback';
  end if;
end $$;
drop trigger queue_leave_push_event on public.leave_requests;
drop function public.queue_leave_push_event();
drop function public.release_push_event(bigint,uuid,text,text,timestamptz,timestamptz);
drop function public.record_push_delivery(bigint,uuid,uuid,text,integer);
drop function public.get_push_event_deliveries(bigint,uuid);
drop function public.seed_push_event_deliveries(bigint,uuid,uuid[]);
drop function public.delete_push_event_subscription(bigint,uuid,uuid);
drop function public.get_push_event_subscriptions(bigint,uuid);
drop function public.get_push_event_recipient_status(bigint,uuid);
drop function public.renew_push_event_claim(bigint,uuid);
drop function public.claim_push_events(uuid,integer);
drop function public.enqueue_push_event(text,uuid,text,jsonb);
drop table public.push_event_deliveries;
drop table public.push_events;
commit;
