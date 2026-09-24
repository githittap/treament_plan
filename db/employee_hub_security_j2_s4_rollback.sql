-- Revert only J-2 marker RLS/catalog changes before any older guarded rollback.
begin;
do $$ declare s jsonb; begin
  select employee_hub_private.push_subscription_schema_snapshot() into s;
  if md5((s->'canonical')::text)<>'4cf7a7a6b9350437dc46335126d1bce9' then
    raise exception 'J-2 marker catalog drift; preserve state and stop rollback';
  end if;
end $$;
alter table employee_hub_private.push_subscriptions_migration_marker disable row level security;
alter table employee_hub_private.push_subscriptions_semantic_fixture disable row level security;
alter table employee_hub_private.push_subscriptions_semantic_fixture
  drop constraint push_subscriptions_semantic_fixture_semantic_md5_check;
update employee_hub_private.push_subscriptions_semantic_fixture
   set semantic_md5='4f7a3ffc459b04e0a3c87ea8dfda8c28';
alter table employee_hub_private.push_subscriptions_semantic_fixture
  add constraint push_subscriptions_semantic_fixture_semantic_md5_check
  check (semantic_md5='4f7a3ffc459b04e0a3c87ea8dfda8c28');
do $$ declare s jsonb; begin
  select employee_hub_private.push_subscription_schema_snapshot() into s;
  if md5((s->'canonical')::text)<>'4f7a3ffc459b04e0a3c87ea8dfda8c28' then
    raise exception 'Task 7 catalog mismatch; preserve state and stop rollback';
  end if;
  update employee_hub_private.push_subscriptions_semantic_fixture set canonical=s->'canonical';
  update employee_hub_private.push_subscriptions_migration_marker set canonical=s->'canonical',identity=s->'identity';
end $$;
commit;
