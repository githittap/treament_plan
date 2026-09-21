-- Only the private v3 manifest with its fixed canonical definition may be removed.
-- EXPECTED_MANIFEST=push-v3-private-5d9a
-- EXPECTED_CANONICAL_MD5=8f6afbfff63ecf0dac24d41f76b42837
begin;
do $$ declare current_snapshot jsonb; begin
 if to_regnamespace('employee_hub_private') is null or to_regclass('public.push_subscriptions') is null or to_regclass('employee_hub_private.push_subscriptions_migration_marker') is null then raise exception 'push subscription ownership manifest or schema snapshot mismatch; preserve state and stop rollback'; end if;
 select employee_hub_private.push_subscription_schema_snapshot() into current_snapshot;
 if not exists(select 1 from employee_hub_private.push_subscriptions_migration_marker m where m.fingerprint='task7-push-v3-5d9a' and m.manifest='push-v3-private-5d9a' and m.canonical=current_snapshot->'canonical' and m.identity=current_snapshot->'identity' and md5((current_snapshot->'canonical')::text)='8f6afbfff63ecf0dac24d41f76b42837' and md5(m.canonical::text)='8f6afbfff63ecf0dac24d41f76b42837') then raise exception 'push subscription ownership manifest or fixed canonical schema mismatch; preserve state and stop rollback'; end if;
 if exists(select 1 from public.push_subscriptions) or exists(select 1 from pg_depend d join pg_class c on c.oid=d.refobjid left join pg_constraint con on d.classid='pg_constraint'::regclass and con.oid=d.objid left join pg_trigger trg on d.classid='pg_trigger'::regclass and trg.oid=d.objid left join pg_policy pol on d.classid='pg_policy'::regclass and pol.oid=d.objid where c.oid='public.push_subscriptions'::regclass and d.deptype not in ('a','i') and coalesce(con.conrelid,trg.tgrelid,pol.polrelid,0)<>c.oid) then raise exception 'push subscriptions rows or dependencies exist; preserve data and stop rollback'; end if;
end $$;
drop trigger guard_push_subscription_timestamps on public.push_subscriptions;
drop policy push_subscriptions_select_own on public.push_subscriptions;
drop policy push_subscriptions_insert_own on public.push_subscriptions;
drop policy push_subscriptions_update_own on public.push_subscriptions;
drop policy push_subscriptions_delete_own on public.push_subscriptions;
drop function employee_hub_private.guard_push_subscription_timestamps();
drop function employee_hub_private.push_subscription_active_approved();
drop function employee_hub_private.push_subscription_schema_snapshot();
drop table public.push_subscriptions;
drop table employee_hub_private.push_subscriptions_migration_marker;
drop schema employee_hub_private;
commit;
