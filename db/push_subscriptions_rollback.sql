-- Task 7 rollback only removes the exact portable semantic manifest.
-- EXPECTED_MANIFEST=push-v4-portable-20260921
-- EXPECTED_SEMANTIC_SHA256=9e2745a2e1056172c67858e20ca9c61a0ee54e9877b980da2052f97565e6fb26
begin;
do $$ declare s jsonb; begin
 if to_regnamespace('employee_hub_private') is null or to_regclass('public.push_subscriptions') is null or to_regclass('employee_hub_private.push_subscriptions_migration_marker') is null or to_regclass('employee_hub_private.push_subscriptions_semantic_fixture') is null then raise exception 'push subscription ownership manifest or schema snapshot mismatch; preserve state and stop rollback'; end if;
 select employee_hub_private.push_subscription_schema_snapshot() into s;
 if not exists(select 1 from employee_hub_private.push_subscriptions_migration_marker m join employee_hub_private.push_subscriptions_semantic_fixture f on f.singleton where m.fingerprint='task7-push-v4-portable' and m.manifest='push-v4-portable-20260921' and m.canonical=s->'canonical' and m.identity=s->'identity' and f.canonical=s->'canonical' and f.sha256='9e2745a2e1056172c67858e20ca9c61a0ee54e9877b980da2052f97565e6fb26' and md5((s->'canonical')::text)=f.semantic_md5) then raise exception 'push subscription ownership manifest or portable semantic schema mismatch; preserve state and stop rollback'; end if;
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
drop table employee_hub_private.push_subscriptions_semantic_fixture;
drop schema employee_hub_private;
commit;
