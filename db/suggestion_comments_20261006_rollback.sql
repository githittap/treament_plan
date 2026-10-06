-- 댓글·알림 데이터가 남아 있으면 보존하고 롤백을 멈춤. 운영에서는 직접 실행하지 않음.
begin;
do $$
begin
  if to_regclass('public.suggestion_comments') is not null then
    if exists(select 1 from public.suggestion_comments) then
      raise exception 'suggestion comments exist; preserve data and stop rollback';
    end if;
  end if;
  if exists(select 1 from public.push_events where event_type='suggestion_commented') then
    raise exception 'suggestion comment push events exist; preserve data and stop rollback';
  end if;
end;
$$;
drop table if exists public.suggestion_comments;
drop function if exists public.queue_suggestion_comment_push_event();
drop function if exists public.touch_suggestion_comment();
alter table public.push_events drop constraint if exists push_events_event_type_check;
alter table public.push_events add constraint push_events_event_type_check check(event_type=any(array[
  'leave_submitted','leave_status_changed','consultation_received','payment_pending','approval_submitted','notice_published','document_approved',
  'ai_billing_stop','ai_billing_low_balance','ai_billing_charge',
  'marketing_expense_recorded','marketing_expense_cancelled','marketing_expense_review','marketing_budget_alert']));
-- 허브 설정의 댓글 문구·대상 값은 보존함.
commit;
