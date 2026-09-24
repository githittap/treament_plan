-- J-2 local follow-up. Apply after hr_settings, employment phase B,
-- push subscriptions, and the attendance owner/chief gate patch.
-- Before rolling back older guarded migrations, run employee_hub_security_j2_s4_rollback.sql.
begin;
do $$ begin
  if to_regclass('public.app_settings') is null
     or to_regprocedure('public.employee_hub_access_allowed()') is null
     or to_regclass('employee_hub_private.push_subscriptions_migration_marker') is null
     or to_regclass('employee_hub_private.push_subscriptions_semantic_fixture') is null then
    raise exception 'J-2 prerequisites missing; preserve state and stop';
  end if;
end $$;

alter table public.app_settings enable row level security;
drop policy if exists employee_hub_access_gate on public.app_settings;
create policy employee_hub_access_gate on public.app_settings as restrictive for all to authenticated
using (public.employee_hub_access_allowed()) with check (public.employee_hub_access_allowed());

alter table employee_hub_private.push_subscriptions_migration_marker enable row level security;
alter table employee_hub_private.push_subscriptions_semantic_fixture enable row level security;
-- The portable catalog includes both markers' RLS flags. Keep its stored fixture
-- and exact fingerprint aligned, so future guarded migrations still validate it.
alter table employee_hub_private.push_subscriptions_semantic_fixture
  drop constraint push_subscriptions_semantic_fixture_semantic_md5_check;
update employee_hub_private.push_subscriptions_semantic_fixture
   set semantic_md5='4cf7a7a6b9350437dc46335126d1bce9';
alter table employee_hub_private.push_subscriptions_semantic_fixture
  add constraint push_subscriptions_semantic_fixture_semantic_md5_check
  check (semantic_md5='4cf7a7a6b9350437dc46335126d1bce9');
do $$ declare s jsonb; begin
  select employee_hub_private.push_subscription_schema_snapshot() into s;
  if md5((s->'canonical')::text)<>'4cf7a7a6b9350437dc46335126d1bce9' then
    raise exception 'J-2 catalog mismatch; preserve state and stop';
  end if;
  update employee_hub_private.push_subscriptions_semantic_fixture
     set canonical=s->'canonical',semantic_md5='4cf7a7a6b9350437dc46335126d1bce9';
  update employee_hub_private.push_subscriptions_migration_marker
     set canonical=s->'canonical',identity=s->'identity';
end $$;
commit;
