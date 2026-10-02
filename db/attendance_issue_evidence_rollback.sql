begin;

do $$
declare v_column text;v_has_data boolean;
begin
  -- Halt concurrent issue writes, object uploads, evidence links, and bucket changes before checking data.
  if to_regclass('public.attendance_issues') is not null then execute 'lock table public.attendance_issues in access exclusive mode'; end if;
  if to_regclass('storage.objects') is not null then execute 'lock table storage.objects in access exclusive mode'; end if;
  if to_regclass('public.attendance_issue_evidence') is not null then execute 'lock table public.attendance_issue_evidence in access exclusive mode'; end if;
  if to_regclass('storage.buckets') is not null then execute 'lock table storage.buckets in access exclusive mode'; end if;
  if to_regclass('public.attendance_issue_evidence') is not null
    and exists(select 1 from public.attendance_issue_evidence) then
    raise exception 'attendance issue evidence contains data; rollback stopped';
  end if;
  if to_regclass('public.attendance_issues') is not null then
    foreach v_column in array array['staff_kind','staff_reason','staff_responded_at'] loop
      if exists(select 1 from pg_attribute where attrelid='public.attendance_issues'::regclass and attname=v_column and not attisdropped) then
        execute format('select exists(select 1 from public.attendance_issues where %I is not null)',v_column) into v_has_data;
        if v_has_data then raise exception 'attendance issues contain staff response data; rollback stopped'; end if;
      end if;
    end loop;
  end if;
  if to_regclass('storage.objects') is not null and exists(select 1 from storage.objects where bucket_id='attendance-evidence') then
    raise exception 'attendance evidence bucket contains objects; rollback stopped';
  end if;
end $$;

drop policy if exists attendance_evidence_deputy_block on storage.objects;
drop policy if exists attendance_evidence_delete_unlinked_own on storage.objects;
drop policy if exists attendance_evidence_select_scoped on storage.objects;
drop policy if exists attendance_evidence_insert_own_pending on storage.objects;
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
delete from storage.buckets where id='attendance-evidence'
  and not exists(select 1 from storage.objects where bucket_id='attendance-evidence');

commit;
