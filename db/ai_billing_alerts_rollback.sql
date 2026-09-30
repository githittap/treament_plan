-- 숨김 감사가 생긴 뒤에는 삭제하지 않는다.
begin;
do $$ begin if exists(select 1 from public.ai_billing_events where charged_at is not null or charged_by is not null) then raise exception 'ai billing charged audit exists; rollback stopped'; end if; end $$;
drop function if exists public.mark_ai_billing_event_charged(bigint);
drop policy if exists ai_billing_events_owner_manager_select on public.ai_billing_events;
create policy ai_billing_events_owner_select on public.ai_billing_events for select using (my_role()='owner');
alter table public.ai_billing_events drop column if exists charged_by;
alter table public.ai_billing_events drop column if exists charged_at;
commit;
