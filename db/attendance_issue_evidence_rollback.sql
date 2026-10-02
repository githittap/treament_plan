begin;

do $$
declare v_column text;v_has_data boolean;v_relation regclass;
begin
  -- Halt concurrent issue writes, object uploads, evidence links, and bucket changes before checking data.
  v_relation:=to_regclass('public.attendance_issues');
  if v_relation is not null then execute format('lock table %s in access exclusive mode',v_relation); end if;
  v_relation:=to_regclass('storage.objects');
  if v_relation is not null then execute format('lock table %s in access exclusive mode',v_relation); end if;
  v_relation:=to_regclass('public.attendance_issue_evidence');
  if v_relation is not null then execute format('lock table %s in access exclusive mode',v_relation); end if;
  v_relation:=to_regclass('storage.buckets');
  if v_relation is not null then execute format('lock table %s in access exclusive mode',v_relation); end if;

  v_relation:=to_regclass('public.attendance_issue_evidence');
  if v_relation is not null then
    if not exists(
      select 1 from information_schema.columns where table_schema='public' and table_name='attendance_issue_evidence'
        and column_name in ('id','issue_id','storage_path','original_name','mime_type','size_bytes','uploaded_at')
      having count(*)=7
    ) then raise exception 'attendance issue evidence schema incomplete; rollback stopped'; end if;
    execute format('select exists(select 1 from %s)',v_relation) into v_has_data;
    if v_has_data then raise exception 'attendance issue evidence contains data; rollback stopped'; end if;
  end if;
  v_relation:=to_regclass('public.attendance_issues');
  if v_relation is not null then
    foreach v_column in array array['staff_kind','staff_reason','staff_responded_at'] loop
      if exists(select 1 from information_schema.columns where table_schema='public' and table_name='attendance_issues' and column_name=v_column) then
        execute format('select exists(select 1 from %s where %I is not null)',v_relation,v_column) into v_has_data;
        if v_has_data then raise exception 'attendance issues contain staff response data; rollback stopped'; end if;
      end if;
    end loop;
  end if;
  v_relation:=to_regclass('storage.objects');
  if v_relation is not null and exists(select 1 from information_schema.columns where table_schema='storage' and table_name='objects' and column_name='bucket_id') then
    execute format('select exists(select 1 from %s where bucket_id=$1)',v_relation) into v_has_data using 'attendance-evidence';
    if v_has_data then raise exception 'attendance evidence bucket contains objects; rollback stopped'; end if;
  end if;
end $$;

do $$ begin
  if to_regclass('storage.objects') is not null then
    execute 'drop policy if exists attendance_evidence_deputy_block on storage.objects';
    execute 'drop policy if exists attendance_evidence_delete_unlinked_own on storage.objects';
    execute 'drop policy if exists attendance_evidence_select_scoped on storage.objects';
    execute 'drop policy if exists attendance_evidence_insert_own_pending on storage.objects';
  end if;
end $$;
do $$ begin
  if to_regclass('public.attendance_issue_evidence') is not null then
    execute 'drop policy if exists attendance_issue_evidence_deputy_block on public.attendance_issue_evidence';
    execute 'drop policy if exists attendance_issue_evidence_select_scoped on public.attendance_issue_evidence';
  end if;
end $$;

drop function if exists public.attendance_issue_add_evidence(bigint,text,text,text,bigint);
drop function if exists public.respond_attendance_issue(bigint,text,text);
drop function if exists public.submit_attendance_issue_v2(date,text,text);
drop table if exists public.attendance_issue_evidence;
alter table if exists public.attendance_issues drop constraint if exists attendance_issues_staff_reason_check;
alter table if exists public.attendance_issues drop constraint if exists attendance_issues_staff_kind_check;
alter table if exists public.attendance_issues drop column if exists staff_responded_at;
alter table if exists public.attendance_issues drop column if exists staff_reason;
alter table if exists public.attendance_issues drop column if exists staff_kind;
do $$ declare v_buckets regclass;v_objects regclass;v_has_data boolean;
begin
  v_buckets:=to_regclass('storage.buckets');
  if v_buckets is not null and exists(select 1 from information_schema.columns where table_schema='storage' and table_name='buckets' and column_name='id') then
    v_objects:=to_regclass('storage.objects');
    if v_objects is not null and exists(select 1 from information_schema.columns where table_schema='storage' and table_name='objects' and column_name='bucket_id') then
      execute format('delete from %s b where b.id=$1 and not exists(select 1 from %s o where o.bucket_id=$1)',v_buckets,v_objects) using 'attendance-evidence';
    else
      execute format('delete from %s where id=$1',v_buckets) using 'attendance-evidence';
    end if;
  end if;
end $$;

commit;
