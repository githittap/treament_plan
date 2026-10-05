-- 마케팅비 예산 알림 푸시 종류 허용 — 2026-10-05
-- 앞서 만든 marketing_budget_alert_carry_20261005.sql 의 알림이 push_events CHECK에 막혀 큐에 못 들어가는 문제 수정.
-- (롤백 시험에서 발견: push_events_event_type_check 위반 → 알림 0건)
alter table public.push_events drop constraint if exists push_events_event_type_check;
alter table public.push_events add constraint push_events_event_type_check check (event_type = any (array[
  'leave_submitted','leave_status_changed','consultation_received','payment_pending','approval_submitted','notice_published','document_approved',
  'ai_billing_stop','ai_billing_low_balance','ai_billing_charge',
  'marketing_expense_recorded','marketing_expense_cancelled','marketing_expense_review','marketing_budget_alert']));

create or replace function public.can_dispatch_ai_billing_push(p_event_id bigint, p_claim_token uuid)
 returns boolean language plpgsql security definer set search_path to 'public','pg_temp' as $function$
declare locked_event public.push_events%rowtype; recipient record;
begin
  select e.* into locked_event from public.push_events e where e.id=p_event_id;
  if not found or locked_event.claim_token is distinct from p_claim_token or locked_event.claimed_at is null or locked_event.claimed_at<now()-interval '10 minutes' then
    raise exception 'push delivery claim lost';
  end if;
  if locked_event.event_type not in ('ai_billing_stop','ai_billing_low_balance','ai_billing_charge','marketing_expense_recorded','marketing_expense_cancelled','marketing_expense_review','marketing_budget_alert') then return false; end if;
  select p.role,p.active,p.approved,p.account_access_status into recipient
    from public.profiles p where p.user_id=locked_event.recipient_id;
  if not found or recipient.active is not true or recipient.approved is not true or recipient.account_access_status='차단' then return false; end if;
  return exists(select 1 from public.p7_notify_recipients('advertising',array(
    select p.user_id from public.profiles p where p.role='owner' or (p.role='manager' and not exists(
      select 1 from public.ai_billing_alert_recipients r where r.user_id=p.user_id and r.enabled=false))
  )) enabled where enabled.user_id=locked_event.recipient_id)
  and not exists(select 1 from public.ai_billing_alert_recipients r where r.user_id=locked_event.recipient_id and recipient.role='manager' and r.enabled=false);
end $function$;
