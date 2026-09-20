-- Task 4 로컬 검토용 초안: 직원 서류의 허용 형식과 크기를 DB에서도 강제한다.
alter table public.employee_documents drop constraint if exists employee_documents_mime_type_check;
alter table public.employee_documents add constraint employee_documents_mime_type_check check (mime_type in (
  'application/pdf','image/jpeg','image/png','application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/x-hwp','application/vnd.hancom.hwp'
));
alter table public.employee_documents drop constraint if exists employee_documents_size_bytes_check;
alter table public.employee_documents add constraint employee_documents_size_bytes_check check (size_bytes > 0 and size_bytes <= 10485760);

-- 기존 INSERT 정책의 경로 권한을 보존하면서 metadata 검사만 결합한다.
alter policy hr_docs_insert_scoped on storage.objects
with check (bucket_id='hr-docs' and (public.my_role() in ('manager','chief','owner') or (storage.foldername(name))[1] = auth.uid()::text) and metadata->>'mimetype' in (
  'application/pdf','image/jpeg','image/png','application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/x-hwp','application/vnd.hancom.hwp'
) and coalesce((metadata->>'size')::bigint,0) between 1 and 10485760);
