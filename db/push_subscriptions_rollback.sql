-- marker·지문·행·의존객체를 모두 확인하지 못하면 전혀 변경하지 않는다.
begin;
do $$ begin
 if to_regclass('public.push_subscriptions') is null or not exists(select 1 from public.push_subscriptions_migration_marker m where m.fingerprint='task7-push-v1' and m.snapshot=public.push_subscription_schema_snapshot()) then raise exception 'push subscription ownership marker or schema snapshot mismatch; preserve state and stop rollback'; end if;
 if exists(select 1 from public.push_subscriptions) or exists(select 1 from pg_depend d join pg_class c on c.oid=d.refobjid left join pg_constraint con on d.classid='pg_constraint'::regclass and con.oid=d.objid left join pg_trigger trg on d.classid='pg_trigger'::regclass and trg.oid=d.objid left join pg_policy pol on d.classid='pg_policy'::regclass and pol.oid=d.objid where c.oid='public.push_subscriptions'::regclass and d.deptype not in ('a','i') and coalesce(con.conrelid,trg.tgrelid,pol.polrelid,0)<>c.oid) then raise exception 'push subscriptions rows or dependencies exist; preserve data and stop rollback'; end if;
end $$;
drop trigger guard_push_subscription_timestamps on public.push_subscriptions;
drop function public.guard_push_subscription_timestamps();
drop policy push_subscriptions_select_own on public.push_subscriptions;
drop policy push_subscriptions_insert_own on public.push_subscriptions;
drop policy push_subscriptions_update_own on public.push_subscriptions;
drop policy push_subscriptions_delete_own on public.push_subscriptions;
drop function public.push_subscription_active_approved();
drop function public.push_subscription_schema_snapshot();
drop table public.push_subscriptions;
drop table public.push_subscriptions_migration_marker;
commit;
