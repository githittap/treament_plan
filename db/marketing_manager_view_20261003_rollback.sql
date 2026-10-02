-- P7 매니저 열람만 되돌리는 초안. 운영에 적용하지 않았음.
-- 결제·분류·예산·연결 데이터와 원장이 정한 설정값은 모두 보존함.
-- 설정 키도 보존하여 초안 재적용 시 원장 끔 설정이 켜지지 않게 함.
begin;
drop policy if exists marketing_expense_events_manager_select on public.marketing_expense_events;
drop policy if exists marketing_month_budgets_manager_select on public.marketing_month_budgets;
drop policy if exists marketing_merchant_rules_manager_select on public.marketing_merchant_rules;
drop policy if exists marketing_foreign_charge_links_manager_select on public.marketing_foreign_charge_links;
drop function if exists public.marketing_manager_can_read_event(uuid);
drop function if exists public.marketing_manager_event_category(uuid);
drop function if exists public.marketing_manager_view_enabled();
commit;
