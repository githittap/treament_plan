-- H-4: 운영 실측 ai_billing_events 6개 열(id/platform/amount_krw/source/note/raw_text/received_at)을 보존한다.
begin;
alter table public.ai_billing_events add column if not exists charged_at timestamptz;
alter table public.ai_billing_events add column if not exists charged_by uuid references public.profiles(user_id);
alter table public.ai_billing_events enable row level security;
drop policy if exists ai_billing_events_owner_select on public.ai_billing_events;
drop policy if exists ai_billing_events_owner_manager_select on public.ai_billing_events;
create policy ai_billing_events_owner_manager_select on public.ai_billing_events for select using (public.my_role() in ('owner','manager'));
create or replace function public.mark_ai_billing_event_charged(p_event_id bigint) returns timestamptz language plpgsql security definer set search_path=public,pg_temp as $$
declare v_at timestamptz;
begin
 if public.my_role() not in ('owner','manager') then raise exception 'ai billing alert not allowed'; end if;
 update public.ai_billing_events set charged_at=now(),charged_by=auth.uid() where id=p_event_id and note='NAVER_AD_STOP' and charged_at is null returning charged_at into v_at;
 if v_at is null then raise exception 'ai billing alert already hidden or not found'; end if;return v_at;
end $$;
revoke all on function public.mark_ai_billing_event_charged(bigint) from public,anon;
grant execute on function public.mark_ai_billing_event_charged(bigint) to authenticated;
commit;
