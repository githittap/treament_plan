-- LOCAL DELTA DRAFT ONLY — do not run in production.
-- G3 approval is absent. Do not apply before an independently confirmed PITR/recovery point
-- and the approved authenticated/API role test path. This additive delta preserves existing rows,
-- grants, RLS state, policies, triggers, and functions; it does not change who can read or write.
-- Expected current catalog: public.consultation_journals exists, RLS is enabled, source_fields absent.
-- If the column or named constraint exists with a different definition, stop without changing it.

begin;

do $delta$
declare
  v_table oid := to_regclass('public.consultation_journals');
  v_column_type oid;
  v_not_null boolean;
  v_default text;
  v_constraint oid;
  v_constraint_def text;
  v_normalized text;
  v_rls_enabled boolean;
begin
  if v_table is null then
    raise exception 'consultation_journal_source_fields_delta: expected table is missing';
  end if;
  select c.relrowsecurity into v_rls_enabled from pg_class c where c.oid=v_table;
  if not v_rls_enabled then
    raise exception 'consultation_journal_source_fields_delta: expected RLS is not enabled';
  end if;

  select a.atttypid, a.attnotnull, pg_get_expr(d.adbin,d.adrelid)
    into v_column_type, v_not_null, v_default
  from pg_attribute a
  left join pg_attrdef d on d.adrelid=a.attrelid and d.adnum=a.attnum
  where a.attrelid=v_table and a.attname='source_fields'
    and a.attnum>0 and not a.attisdropped;

  if v_column_type is null then
    alter table public.consultation_journals
      add column source_fields jsonb not null default '{}'::jsonb;
  elsif v_column_type <> 'jsonb'::regtype::oid
     or not v_not_null
     or regexp_replace(coalesce(v_default,''), '[[:space:]()]', '', 'g') <> '''{}''::jsonb' then
    raise exception 'consultation_journal_source_fields_delta: existing source_fields definition differs';
  end if;

  select c.oid, pg_get_constraintdef(c.oid)
    into v_constraint, v_constraint_def
  from pg_constraint c
  where c.conrelid=v_table and c.conname='consultation_journals_source_fields_object_check';

  if v_constraint is null then
    alter table public.consultation_journals
      add constraint consultation_journals_source_fields_object_check
      check (jsonb_typeof(source_fields)='object');
  else
    v_normalized := regexp_replace(lower(v_constraint_def), '[[:space:]]', '', 'g');
    if v_normalized <> 'check((jsonb_typeof(source_fields)=''object''::text))'
      or not (select c.convalidated from pg_constraint c where c.oid=v_constraint) then
      raise exception 'consultation_journal_source_fields_delta: existing named constraint differs';
    end if;
  end if;
end
$delta$;

commit;
