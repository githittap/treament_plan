-- Task 7 초안: 단일 migration으로 실행한다. VAPID·발송키·실제 발송은 포함하지 않는다.
begin;
create table if not exists public.push_subscriptions (id uuid primary key default gen_random_uuid(),user_id uuid not null references public.profiles(user_id) on delete cascade,endpoint text not null,subscription jsonb not null,created_at timestamptz not null default now(),updated_at timestamptz not null default now(),unique(user_id,endpoint),check (endpoint ~ '^https://[^[:space:]]+$'),check (jsonb_typeof(subscription)='object' and subscription->>'endpoint'=endpoint and jsonb_typeof(subscription->'keys')='object' and length(coalesce(subscription->'keys'->>'p256dh',''))>0 and length(coalesce(subscription->'keys'->>'auth',''))>0));
alter table public.push_subscriptions enable row level security;
revoke all on public.push_subscriptions from anon;
grant select,insert,update,delete on public.push_subscriptions to authenticated;
create policy push_subscriptions_select_own on public.push_subscriptions for select to authenticated using (user_id=auth.uid() and exists (select 1 from public.profiles p where p.user_id=auth.uid() and p.active and p.approved));
create policy push_subscriptions_insert_own on public.push_subscriptions for insert to authenticated with check (user_id=auth.uid() and exists (select 1 from public.profiles p where p.user_id=auth.uid() and p.active and p.approved));
create policy push_subscriptions_update_own on public.push_subscriptions for update to authenticated using (user_id=auth.uid() and exists (select 1 from public.profiles p where p.user_id=auth.uid() and p.active and p.approved)) with check (user_id=auth.uid() and exists (select 1 from public.profiles p where p.user_id=auth.uid() and p.active and p.approved));
create policy push_subscriptions_delete_own on public.push_subscriptions for delete to authenticated using (user_id=auth.uid() and exists (select 1 from public.profiles p where p.user_id=auth.uid() and p.active and p.approved));
create or replace function public.guard_push_subscription_timestamps() returns trigger language plpgsql as $$ begin if tg_op='INSERT' then new.created_at:=now();new.updated_at:=now();else if new.created_at is distinct from old.created_at then raise exception 'created_at is immutable';end if;new.updated_at:=now();end if;return new;end $$;
drop trigger if exists guard_push_subscription_timestamps on public.push_subscriptions;
create trigger guard_push_subscription_timestamps before insert or update on public.push_subscriptions for each row execute function public.guard_push_subscription_timestamps();
commit;
