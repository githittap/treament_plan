-- Task 7 단일 실행 초안. 기존 객체를 채택·변경하지 않으며 충돌하면 무변경 중단한다.
begin;
do $$ begin
 if to_regclass('public.push_subscriptions') is not null or to_regclass('public.push_subscriptions_migration_marker') is not null or exists(select 1 from pg_proc where pronamespace='public'::regnamespace and proname in ('guard_push_subscription_timestamps','push_subscription_active_approved','push_subscription_schema_snapshot')) or exists(select 1 from pg_trigger where tgname='guard_push_subscription_timestamps') or exists(select 1 from pg_policies where schemaname='public' and tablename='push_subscriptions' and policyname in ('push_subscriptions_select_own','push_subscriptions_insert_own','push_subscriptions_update_own','push_subscriptions_delete_own')) then raise exception 'push subscription migration object collision; preserve state and stop'; end if;
end $$;
create table public.push_subscriptions_migration_marker (fingerprint text primary key check(fingerprint='task7-push-v1'),snapshot jsonb not null default '{}'::jsonb,created_at timestamptz not null default now());
insert into public.push_subscriptions_migration_marker(fingerprint) values('task7-push-v1');
create function public.push_subscription_active_approved() returns boolean language sql stable security definer set search_path='' as $$ select exists(select 1 from public.profiles p where p.user_id=auth.uid() and p.active and p.approved) $$;
revoke all on function public.push_subscription_active_approved() from public;
grant execute on function public.push_subscription_active_approved() to authenticated;
create table public.push_subscriptions (id uuid primary key default gen_random_uuid(),user_id uuid not null references public.profiles(user_id) on delete cascade,endpoint text not null unique,subscription jsonb not null,created_at timestamptz not null default now(),updated_at timestamptz not null default now(),check(endpoint ~ '^https://([[:alnum:]]([[:alnum:]-]{0,61}[[:alnum:]])?)(\.([[:alnum:]]([[:alnum:]-]{0,61}[[:alnum:]])?))*(:(6553[0-5]|655[0-2][0-9]|65[0-4][0-9]{2}|6[0-4][0-9]{3}|[1-5][0-9]{4}|[1-9][0-9]{0,3}))?(/[^[:space:]]*)?$'),check(jsonb_typeof(subscription)='object' and subscription->>'endpoint'=endpoint and jsonb_typeof(subscription->'keys')='object' and length(coalesce(subscription->'keys'->>'p256dh',''))>0 and length(coalesce(subscription->'keys'->>'auth',''))>0));
alter table public.push_subscriptions enable row level security;
revoke all on public.push_subscriptions from anon;
grant select,insert,update,delete on public.push_subscriptions to authenticated;
create policy push_subscriptions_select_own on public.push_subscriptions for select to authenticated using (user_id=auth.uid() and (select public.push_subscription_active_approved()));
create policy push_subscriptions_insert_own on public.push_subscriptions for insert to authenticated with check (user_id=auth.uid() and (select public.push_subscription_active_approved()));
create policy push_subscriptions_update_own on public.push_subscriptions for update to authenticated using (user_id=auth.uid() and (select public.push_subscription_active_approved())) with check (user_id=auth.uid() and (select public.push_subscription_active_approved()));
create policy push_subscriptions_delete_own on public.push_subscriptions for delete to authenticated using (user_id=auth.uid() and (select public.push_subscription_active_approved()));
create function public.guard_push_subscription_timestamps() returns trigger language plpgsql as $$ begin if tg_op='INSERT' then new.created_at:=now();new.updated_at:=now();elsif new.created_at is distinct from old.created_at then raise exception 'created_at is immutable';else new.updated_at:=now();end if;return new;end $$;
create trigger guard_push_subscription_timestamps before insert or update on public.push_subscriptions for each row execute function public.guard_push_subscription_timestamps();
create function public.push_subscription_schema_snapshot() returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object(
 'marker_oid',(select c.oid from pg_class c where c.oid='public.push_subscriptions_migration_marker'::regclass),
 'table',(select jsonb_build_object('oid',c.oid,'acl',coalesce(to_jsonb(c.relacl),'null'::jsonb),'rls',c.relrowsecurity,'forcerls',c.relforcerowsecurity) from pg_class c where c.oid='public.push_subscriptions'::regclass),
 'helpers',(select jsonb_agg(jsonb_build_object('oid',p.oid,'name',p.proname,'owner',p.proowner,'config',coalesce(to_jsonb(p.proconfig),'null'::jsonb),'acl',coalesce(to_jsonb(p.proacl),'null'::jsonb),'definition',pg_get_functiondef(p.oid)) order by p.proname) from pg_proc p where p.oid in ('public.push_subscription_active_approved()'::regprocedure,'public.push_subscription_schema_snapshot()'::regprocedure)),
 'triggers',(select jsonb_agg(jsonb_build_object('oid',t.oid,'name',t.tgname,'definition',pg_get_triggerdef(t.oid)) order by t.tgname) from pg_trigger t where t.tgrelid='public.push_subscriptions'::regclass and not t.tgisinternal),
 'policies',(select jsonb_agg(jsonb_build_object('name',p.policyname,'cmd',p.cmd,'roles',to_jsonb(p.roles),'qual',p.qual,'with_check',p.with_check,'permissive',p.permissive) order by p.policyname) from pg_policies p where p.schemaname='public' and p.tablename='push_subscriptions'),
 'constraints',(select jsonb_agg(jsonb_build_object('oid',x.oid,'name',x.conname,'type',x.contype,'definition',pg_get_constraintdef(x.oid,true)) order by x.conname) from pg_constraint x where x.conrelid='public.push_subscriptions'::regclass),
 'indexes',(select jsonb_agg(jsonb_build_object('oid',x.indexrelid,'name',c.relname,'definition',pg_get_indexdef(x.indexrelid)) order by c.relname) from pg_index x join pg_class c on c.oid=x.indexrelid where x.indrelid='public.push_subscriptions'::regclass)
 ) $$;
revoke all on function public.push_subscription_schema_snapshot() from public;
update public.push_subscriptions_migration_marker set snapshot=public.push_subscription_schema_snapshot() where fingerprint='task7-push-v1';
commit;
