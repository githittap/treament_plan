-- 되돌리기: push_events 허용 종류에서 marketing_budget_alert 제거(이 종류 행이 있으면 먼저 지워야 함), 권한 함수 원복
delete from public.push_events where event_type='marketing_budget_alert';
alter table public.push_events drop constraint if exists push_events_event_type_check;
alter table public.push_events add constraint push_events_event_type_check check (event_type = any (array[
  'leave_submitted','leave_status_changed','consultation_received','payment_pending','approval_submitted','notice_published','document_approved',
  'ai_billing_stop','ai_billing_low_balance','ai_billing_charge',
  'marketing_expense_recorded','marketing_expense_cancelled','marketing_expense_review']));
-- can_dispatch_ai_billing_push 는 이 파일 위쪽 정의에서 'marketing_budget_alert' 만 뺀 형태로 다시 create or replace
