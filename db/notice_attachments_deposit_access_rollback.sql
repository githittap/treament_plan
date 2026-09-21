-- Task 6 롤백은 migration snapshot과 적용 전 정책·버킷 설정·행·객체 수 백업을 확인한 경우에만 사용한다.
-- 원본 공지·입금 행과 Storage 객체는 삭제하지 않는다. 객체가 하나라도 있으면 명시적으로 중단하며 강행하지 않는다.
begin;
do $$ begin if exists (select 1 from storage.objects where bucket_id='notice-attachments') then raise exception 'notice-attachments objects exist; preserve data and stop rollback'; end if; end $$;
update storage.buckets b set public=s.public,file_size_limit=s.file_size_limit,allowed_mime_types=s.allowed_mime_types from public.notice_attachments_migration_snapshot s where s.bucket_id='notice-attachments' and s.bucket_existed and b.id=s.bucket_id;
delete from storage.buckets b using public.notice_attachments_migration_snapshot s where s.bucket_id='notice-attachments' and not s.bucket_existed and b.id=s.bucket_id;
-- 기존 버킷은 migration snapshot의 설정으로 복원하고, 신규 버킷은 객체 0개일 때만 제거한다.
drop policy if exists notice_attachments_delete_own_tmp on storage.objects;
drop policy if exists notice_attachments_insert_authenticated on storage.objects;
drop policy if exists notice_attachments_select_authenticated on storage.objects;
drop policy if exists notices_insert_authenticated on public.notices;
drop policy if exists notices_update_approvers on public.notices;
drop policy if exists deposits_select_desk_lead on public.deposits;
drop trigger if exists guard_notice_immutable_fields on public.notices;
drop function if exists public.guard_notice_immutable_fields();
drop policy if exists notices_insert_approvers on public.notices;
create policy notices_insert_approvers on public.notices for insert to authenticated with check (public.my_role() in ('chief','owner'));
drop policy if exists notices_update_approvers on public.notices;
create policy notices_update_approvers on public.notices for update to authenticated using (public.my_role() in ('chief','owner')) with check (public.my_role() in ('chief','owner'));
drop policy if exists deposits_select_active on public.deposits;
create policy deposits_select_active on public.deposits for select to authenticated using (exists (select 1 from public.profiles as p where p.user_id=auth.uid() and p.active));
drop table if exists public.notice_attachments_migration_snapshot;
-- 기존 객체·공지/입금 행·attachments/author_id 열은 보존한다. 기존 notice SELECT 정책과 table grants는 migration이 변경하지 않았다.
commit;
