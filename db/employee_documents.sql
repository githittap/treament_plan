-- 직원 제출 서류 메타데이터 + 비공개 Storage 경로 권한
-- 파일 경로는 반드시 hr-docs/<직원 UUID>/... 형식을 사용한다.
create table if not exists public.employee_documents (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles(user_id) on delete cascade,
  document_type text not null,
  original_name text not null,
  storage_path text not null unique,
  mime_type text not null check (mime_type in ('application/pdf','image/jpeg','image/png')),
  size_bytes bigint not null check (size_bytes > 0 and size_bytes <= 10485760),
  uploaded_by uuid not null default auth.uid() references public.profiles(user_id),
  created_at timestamptz not null default now(),
  checked_by text,
  checked_at timestamptz,
  note text
);

alter table public.employee_documents enable row level security;

drop policy if exists employee_documents_select_scoped on public.employee_documents;
create policy employee_documents_select_scoped on public.employee_documents for select to authenticated
using (user_id = auth.uid() or public.my_role() in ('manager','chief','owner'));

drop policy if exists employee_documents_insert_scoped on public.employee_documents;
create policy employee_documents_insert_scoped on public.employee_documents for insert to authenticated
with check ((user_id = auth.uid() or public.my_role() in ('manager','chief','owner')) and uploaded_by = auth.uid());

drop policy if exists employee_documents_update_lead on public.employee_documents;
create policy employee_documents_update_lead on public.employee_documents for update to authenticated
using (public.my_role() in ('manager','chief','owner'))
with check (public.my_role() in ('manager','chief','owner'));

drop policy if exists employee_documents_delete_owner on public.employee_documents;
create policy employee_documents_delete_owner on public.employee_documents for delete to authenticated
using (public.my_role() = 'owner');

-- 기존 hr-docs 버킷은 비어 있는 것을 확인한 후 직원 폴더 기준으로 교체한다.
drop policy if exists hr_docs_select_authenticated on storage.objects;
drop policy if exists hr_docs_insert_authenticated on storage.objects;
drop policy if exists hr_docs_delete_owner on storage.objects;

create policy hr_docs_select_scoped on storage.objects for select to authenticated
using (bucket_id = 'hr-docs' and (public.my_role() in ('manager','chief','owner') or (storage.foldername(name))[1] = auth.uid()::text));

create policy hr_docs_insert_scoped on storage.objects for insert to authenticated
with check (bucket_id = 'hr-docs' and (public.my_role() in ('manager','chief','owner') or (storage.foldername(name))[1] = auth.uid()::text));

create policy hr_docs_delete_owner on storage.objects for delete to authenticated
using (bucket_id = 'hr-docs' and public.my_role() = 'owner');
