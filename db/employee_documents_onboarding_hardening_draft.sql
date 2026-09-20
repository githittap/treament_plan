-- Task 4 로컬 검토용 초안: 직원 서류의 허용 형식과 크기를 DB에서도 강제한다.
alter table public.employee_documents drop constraint if exists employee_documents_mime_type_check;
alter table public.employee_documents add constraint employee_documents_mime_type_check check (mime_type in (
  'application/pdf','image/jpeg','image/png','application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/x-hwp','application/vnd.hancom.hwp'
));
alter table public.employee_documents drop constraint if exists employee_documents_size_bytes_check;
alter table public.employee_documents add constraint employee_documents_size_bytes_check check (size_bytes > 0 and size_bytes <= 10485760);
