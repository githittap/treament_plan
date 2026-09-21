-- Task 7 단일 실행 초안. 기존 객체를 채택·변경하지 않으며 충돌하면 무변경 중단한다.
begin;
do $$ begin
 if to_regclass('public.push_subscriptions') is not null or to_regclass('public.push_subscriptions_migration_marker') is not null or exists(select 1 from pg_proc where pronamespace='public'::regnamespace and proname='guard_push_subscription_timestamps') or exists(select 1 from pg_trigger where tgname='guard_push_subscription_timestamps') or exists(select 1 from pg_policies where schemaname='public' and tablename='push_subscriptions' and policyname in ('push_subscriptions_select_own','push_subscriptions_insert_own','push_subscriptions_update_own','push_subscriptions_delete_own')) then raise exception 'push subscription migration object collision; preserve state and stop'; end if;
end $$;
create table public.push_subscriptions_migration_marker (fingerprint text primary key check(fingerprint='task7-push-v1'),created_at timestamptz not null default now());
insert into public.push_subscriptions_migration_marker(fingerprint) values('task7-push-v1');
create table public.push_subscriptions (id uuid primary key default gen_random_uuid(),user_id uuid not null references public.profiles(user_id) on delete cascade,endpoint text not null unique,subscription jsonb not null,created_at timestamptz not null default now(),updated_at timestamptz not null default now(),check(endpoint ~ '^https://[^/:[:space:]]+(:[0-9]+)?(/[^[:space:]]*)?$'),check(jsonb_typeof(subscription)='object' and subscription->>'endpoint'=endpoint and jsonb_typeof(subscription->'keys')='object' and length(coalesce(subscription->'keys'->>'p256dh',''))>0 and length(coalesce(subscription->'keys'->>'auth',''))>0));
alter table public.push_subscriptions enable row level security;
revoke all on public.push_subscriptions from anon;
grant select,insert,update,delete on public.push_subscriptions to authenticated;
create policy push_subscriptions_select_own on public.push_subscriptions for select to authenticated using (user_id=auth.uid() and exists(select 1 from public.profiles p where p.user_id=auth.uid() and p.active and p.approved));
create policy push_subscriptions_insert_own on public.push_subscriptions for insert to authenticated with check (user_id=auth.uid() and exists(select 1 from public.profiles p where p.user_id=auth.uid() and p.active and p.approved));
create policy push_subscriptions_update_own on public.push_subscriptions for update to authenticated using (user_id=auth.uid() and exists(select 1 from public.profiles p where p.user_id=auth.uid() and p.active and p.approved)) with check (user_id=auth.uid() and exists(select 1 from public.profiles p where p.user_id=auth.uid() and p.active and p.approved));
create policy push_subscriptions_delete_own on public.push_subscriptions for delete to authenticated using (user_id=auth.uid() and exists(select 1 from public.profiles p where p.user_id=auth.uid() and p.active and p.approved));
create function public.guard_push_subscription_timestamps() returns trigger language plpgsql as $$ begin if tg_op='INSERT' then new.created_at:=now();new.updated_at:=now();elsif new.created_at is distinct from old.created_at then raise exception 'created_at is immutable';else new.updated_at:=now();end if;return new;end $$;
create trigger guard_push_subscription_timestamps before insert or update on public.push_subscriptions for each row execute function public.guard_push_subscription_timestamps();
commit;
