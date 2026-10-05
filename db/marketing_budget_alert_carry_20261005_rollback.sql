-- 되돌리기: 예산 알림·이월 함수 제거(예산 입력값·app_settings 값은 남김)
drop trigger if exists marketing_budget_alert_after_insert on public.marketing_expense_events;
drop function if exists public.queue_marketing_budget_alert();
drop function if exists public.marketing_budget_for(date);
delete from public.app_settings where key='marketing.budget_alert_pct';
