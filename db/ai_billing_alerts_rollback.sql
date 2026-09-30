-- 운영 적용 취소용. 이벤트·수신자 설정 데이터는 보존하고 새 로직만 되돌린다.
begin;
do $$ begin
  if to_regclass('public.ai_billing_events') is null or to_regclass('public.ai_billing_alert_recipients') is null then
    raise exception 'ai billing rollback: expected objects missing';
  end if;
end $$;

drop trigger if exists ai_billing_alert_push_after_insert on public.ai_billing_events;
drop function if exists public.queue_ai_billing_alert_push();
drop function if exists public.can_dispatch_ai_billing_push(bigint,uuid);
drop policy if exists ai_billing_events_owner_manager_select on public.ai_billing_events;
create policy ai_billing_events_owner_manager_select on public.ai_billing_events for select using (
  public.my_role()='owner' or (public.my_role()='manager' and note='NAVER_AD_STOP')
);

-- 원래 운영 RPC 정의(owner/manager, NAVER_AD_STOP만)을 복원한다.
create or replace function public.mark_ai_billing_event_charged(p_event_id bigint)
returns timestamptz language plpgsql security definer set search_path=public,pg_temp as $$
declare v_at timestamptz;
begin
  if public.my_role() not in ('owner','manager') then raise exception 'ai billing alert not allowed'; end if;
  update public.ai_billing_events set charged_at=now(),charged_by=auth.uid()
   where id=p_event_id and note='NAVER_AD_STOP' and charged_at is null returning charged_at into v_at;
  if v_at is null then raise exception 'ai billing alert already hidden or not found'; end if;
  return v_at;
end $$;
revoke all on function public.mark_ai_billing_event_charged(bigint) from public,anon;
grant execute on function public.mark_ai_billing_event_charged(bigint) to authenticated;

-- RLS helper and recipient table/data remain for safe reapplication and to preserve owner choices.
commit;
