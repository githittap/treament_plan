-- 로컬 검토용 초안. 연차 신청 증빙은 일반 직원서류·hr-docs와 분리한다.
create table if not exists public.leave_application_documents (
  id bigint generated always as identity primary key,
  request_id bigint not null references public.leave_requests(id),
  user_id uuid not null references public.profiles(user_id),
  document_type text not null default '연차 신청서',
  original_name text not null,
  storage_path text not null unique,
  mime_type text not null,
  size_bytes bigint not null,
  created_at timestamptz not null default now(),
  constraint leave_application_documents_path_scope check (storage_path like (user_id::text || '/%'))
);
alter table public.leave_application_documents enable row level security;
revoke all on table public.leave_application_documents from public,anon;
grant select,insert,delete on table public.leave_application_documents to authenticated;
drop policy if exists leave_application_documents_select_scoped on public.leave_application_documents;
create policy leave_application_documents_select_scoped on public.leave_application_documents for select to authenticated
using (exists (select 1 from public.profiles p where p.user_id=auth.uid() and p.active=true and p.approved=true) and (user_id=auth.uid() or public.my_role() in ('manager','chief','owner')));
drop policy if exists leave_application_documents_insert_self on public.leave_application_documents;
create policy leave_application_documents_insert_self on public.leave_application_documents for insert to authenticated
with check (user_id=auth.uid() and exists (select 1 from public.leave_requests r where r.id=request_id and r.user_id=auth.uid()) and exists (select 1 from public.profiles p where p.user_id=auth.uid() and p.active=true and p.approved=true));
drop policy if exists leave_application_documents_delete_owner on public.leave_application_documents;
create policy leave_application_documents_delete_owner on public.leave_application_documents for delete to authenticated
using (public.my_role()='owner');

-- 운영 전 기존 버킷의 id/public/파일 수를 스냅샷한다. 없을 때만 private 버킷을 만든다.
insert into storage.buckets (id,name,public) values ('leave-docs','leave-docs',false) on conflict do nothing;
drop policy if exists leave_docs_select_scoped on storage.objects;
create policy leave_docs_select_scoped on storage.objects for select to authenticated
using (bucket_id='leave-docs' and exists (select 1 from public.profiles p where p.user_id=auth.uid() and p.active=true and p.approved=true) and (public.my_role() in ('manager','chief','owner') or (storage.foldername(name))[1]=auth.uid()::text));
drop policy if exists leave_docs_insert_self on storage.objects;
create policy leave_docs_insert_self on storage.objects for insert to authenticated
with check (bucket_id='leave-docs' and exists (select 1 from public.profiles p where p.user_id=auth.uid() and p.active=true and p.approved=true) and (storage.foldername(name))[1]=auth.uid()::text);
drop policy if exists leave_docs_delete_temp on storage.objects;
create policy leave_docs_delete_temp on storage.objects for delete to authenticated
using (bucket_id='leave-docs' and exists (select 1 from public.profiles p where p.user_id=auth.uid() and p.active=true and p.approved=true) and (storage.foldername(name))[1]=auth.uid()::text and (storage.foldername(name))[2]='tmp' and not exists (select 1 from public.leave_application_documents d where d.storage_path=storage.objects.name));
