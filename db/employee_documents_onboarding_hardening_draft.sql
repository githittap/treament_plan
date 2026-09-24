-- Task 4 로컬 검토용 초안: 일반 문서는 확장자·MIME를 넓게 허용하되 실행·압축만 차단한다.
-- application/vnd.hancom.hwpx, 빈 MIME, application/octet-stream도 hwpx 등 확장자가 안전하면 허용한다.
alter table public.employee_documents drop constraint if exists employee_documents_mime_type_check;
alter table public.employee_documents add constraint employee_documents_mime_type_check check (
  coalesce(mime_type,'') not in ('application/x-msdownload','application/x-msdos-program','application/x-7z-compressed','application/zip','application/x-rar-compressed','application/vnd.rar','application/gzip','application/x-gzip','application/x-bzip2','application/x-xz','application/x-tar','application/x-sh','text/javascript','application/javascript','application/x-javascript','application/java-archive')
  and coalesce(original_name,'') !~* '\.(exe|msi|bat|cmd|com|scr|js|vbs|ps1|sh|jar|dll|dmg|iso|apk|ipa|wasm|zip|rar|7z|tar|gz|bz2|xz)$'
);
alter table public.employee_documents drop constraint if exists employee_documents_size_bytes_check;
alter table public.employee_documents add constraint employee_documents_size_bytes_check check (size_bytes > 0 and size_bytes <= 10485760);
revoke all on table public.employee_documents from anon,authenticated;
grant select,insert,update,delete on table public.employee_documents to authenticated;
revoke all on sequence public.employee_documents_id_seq from anon,authenticated;
grant usage,select on sequence public.employee_documents_id_seq to authenticated;

-- 기존 INSERT 정책의 경로 권한을 보존하면서 metadata 검사만 결합한다.
alter policy hr_docs_insert_scoped on storage.objects
with check (bucket_id='hr-docs' and (public.my_role() in ('manager','chief','owner') or (storage.foldername(name))[1] = auth.uid()::text) and coalesce(metadata->>'mimetype','') not in ('application/x-msdownload','application/x-msdos-program','application/x-7z-compressed','application/zip','application/x-rar-compressed','application/vnd.rar','application/gzip','application/x-gzip','application/x-bzip2','application/x-xz','application/x-tar','application/x-sh','text/javascript','application/javascript','application/x-javascript','application/java-archive') and name !~* '\.(exe|msi|bat|cmd|com|scr|js|vbs|ps1|sh|jar|dll|dmg|iso|apk|ipa|wasm|zip|rar|7z|tar|gz|bz2|xz)$' and coalesce(metadata->>'size','') ~ '^[0-9]+$' and (metadata->>'size')::bigint between 1 and 10485760);
