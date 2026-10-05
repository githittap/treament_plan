-- 되돌리기: 보완 전 상태로 — marketing_budget_alert_carry_20261005.sql 의 queue_marketing_budget_alert 와
-- marketing_budget_alert_push_type_20261005.sql 의 can_dispatch_ai_billing_push 를 다시 실행하고 아래를 실행
drop function if exists public.marketing_event_category(uuid);
grant execute on function public.marketing_budget_for(date) to authenticated;
