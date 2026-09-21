-- Task 6 롤백은 migration snapshot과 적용 전 정책·버킷 설정·행·객체 수 백업을 확인한 경우에만 사용한다.
-- 기존 버킷의 객체는 보존하면서 설정·정책·RLS를 복원한다. 신규 버킷만 객체가 있으면 제거하지 않고 중단한다.
begin;
do $$ begin if exists (select 1 from public.notice_attachments_migration_snapshot s where s.bucket_id='notice-attachments' and not s.bucket_existed) and exists (select 1 from storage.objects where bucket_id='notice-attachments') then raise exception 'new notice-attachments bucket has objects; preserve data and stop rollback'; end if; end $$;
do $$ begin if exists ((select table_schema,table_name,grantee,privilege_type from information_schema.role_table_grants where grantee in ('PUBLIC','anon','authenticated') and ((table_schema='public' and table_name in ('notices','deposits')) or (table_schema='storage' and table_name='objects')) except select table_schema,table_name,grantee,privilege_type from public.notice_attachments_migration_acl_snapshot) union all (select table_schema,table_name,grantee,privilege_type from public.notice_attachments_migration_acl_snapshot except select table_schema,table_name,grantee,privilege_type from information_schema.role_table_grants where grantee in ('PUBLIC','anon','authenticated') and ((table_schema='public' and table_name in ('notices','deposits')) or (table_schema='storage' and table_name='objects')))) then raise exception 'table ACL changed after migration; preserve state and stop rollback'; end if; end $$;
update storage.buckets b set public=s.public,file_size_limit=s.file_size_limit,allowed_mime_types=s.allowed_mime_types from public.notice_attachments_migration_snapshot s where s.bucket_id='notice-attachments' and s.bucket_existed and b.id=s.bucket_id;
delete from storage.buckets b using public.notice_attachments_migration_snapshot s where s.bucket_id='notice-attachments' and not s.bucket_existed and b.id=s.bucket_id;
-- 기존 버킷은 migration snapshot의 설정으로 복원하고, 신규 버킷은 객체 0개일 때만 제거한다.
drop policy if exists notice_attachments_delete_own_tmp on storage.objects;
drop policy if exists notice_attachments_delete_published_guard on storage.objects;
drop policy if exists notice_attachments_insert_authenticated on storage.objects;
drop policy if exists notice_attachments_select_authenticated on storage.objects;
drop policy if exists notices_insert_authenticated on public.notices;
drop policy if exists notices_update_approvers on public.notices;
drop policy if exists deposits_select_desk_lead on public.deposits;
drop trigger if exists guard_notice_immutable_fields on public.notices;
drop function if exists public.guard_notice_immutable_fields();
drop policy if exists notices_insert_approvers on public.notices;
drop policy if exists notices_update_approvers on public.notices;
drop policy if exists deposits_select_active on public.deposits;
do $$ declare p record; role_list text; begin for p in select * from public.notice_attachments_migration_policy_snapshot order by schemaname,tablename,policyname loop select coalesce(string_agg(case when r='public' then 'PUBLIC' else format('%I',r) end,', '),'PUBLIC') into role_list from unnest(p.roles) r; execute format('create policy %I on %I.%I as %s for %s to %s%s%s',p.policyname,p.schemaname,p.tablename,p.permissive,p.cmd,role_list,case when p.qual is null then '' else ' using ('||p.qual||')' end,case when p.with_check is null then '' else ' with check ('||p.with_check||')' end); end loop; end $$;
do $$ declare r record; begin for r in select * from public.notice_attachments_migration_rls_snapshot loop execute format('alter table %I.%I %s row level security',r.schemaname,r.tablename,case when r.rls_enabled then 'enable' else 'disable' end); end loop; end $$;
drop table if exists public.notice_attachments_migration_snapshot;
drop table if exists public.notice_attachments_migration_policy_snapshot;
drop table if exists public.notice_attachments_migration_rls_snapshot;
drop table if exists public.notice_attachments_migration_acl_snapshot;
-- 기존 객체·공지/입금 행·attachments/author_id 열은 보존한다. ACL은 migration이 바꾸지 않으며 rollback 전후 동일함을 검사한다.
commit;
