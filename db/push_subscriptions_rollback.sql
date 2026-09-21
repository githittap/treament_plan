-- Task 7 rollback only removes the exact portable semantic manifest.
-- EXPECTED_MANIFEST=push-v4-portable-20260921
-- EXPECTED_SEMANTIC_SHA256=491c8e1f3872bc8e958642589248a5819bd9b6af4509e2d43d42df92a87fdb35
begin;
do $$ declare s jsonb; begin
 if to_regnamespace('employee_hub_private') is null or to_regclass('public.push_subscriptions') is null or to_regclass('employee_hub_private.push_subscriptions_migration_marker') is null or to_regclass('employee_hub_private.push_subscriptions_semantic_fixture') is null then raise exception 'push subscription ownership manifest or schema snapshot mismatch; preserve state and stop rollback'; end if;
 select employee_hub_private.push_subscription_schema_snapshot() into s;
 if exists(select 1 from pg_class c where c.relnamespace='employee_hub_private'::regnamespace and c.relkind in ('r','p','v','m','S','f') and c.relname not in ('push_subscriptions_migration_marker','push_subscriptions_semantic_fixture')) or exists(select 1 from pg_proc p where p.pronamespace='employee_hub_private'::regnamespace and p.proname not in ('push_subscription_access_allowed','guard_push_subscription_timestamps','push_subscription_schema_snapshot')) then raise exception 'push subscription private namespace object allowlist mismatch; preserve state and stop rollback'; end if;
 if not exists(select 1 from employee_hub_private.push_subscriptions_migration_marker m join employee_hub_private.push_subscriptions_semantic_fixture f on f.singleton where m.fingerprint='task7-push-v4-portable' and m.manifest='push-v4-portable-20260921' and m.canonical=s->'canonical' and m.identity=s->'identity' and f.canonical=s->'canonical' and f.sha256='491c8e1f3872bc8e958642589248a5819bd9b6af4509e2d43d42df92a87fdb35' and md5((s->'canonical')::text)=f.semantic_md5) then raise exception 'push subscription ownership manifest or portable semantic schema mismatch; preserve state and stop rollback'; end if;
 if exists(select 1 from public.push_subscriptions) then raise exception 'push subscriptions rows exist; preserve data and stop rollback'; end if;
end $$;
drop trigger guard_push_subscription_timestamps on public.push_subscriptions;
drop policy push_subscriptions_select_own on public.push_subscriptions;
drop policy push_subscriptions_insert_own on public.push_subscriptions;
drop policy push_subscriptions_update_own on public.push_subscriptions;
drop policy push_subscriptions_delete_own on public.push_subscriptions;
drop function employee_hub_private.guard_push_subscription_timestamps();
drop function employee_hub_private.push_subscription_access_allowed(uuid);
drop function employee_hub_private.push_subscription_schema_snapshot();
drop table public.push_subscriptions;
drop table employee_hub_private.push_subscriptions_migration_marker;
drop table employee_hub_private.push_subscriptions_semantic_fixture;
drop schema employee_hub_private;
commit;
