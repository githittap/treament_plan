-- 로컬 후행 초안: employee_documents.sql 및 employee_documents_onboarding_hardening_draft.sql 뒤에 적용.
-- 일반 서류의 허용 범위와 기존 RLS/Storage 정책은 변경하지 않는다.
-- NOT VALID: 기존 행을 삭제하거나 일괄 수정하지 않으며, 새 INSERT/UPDATE부터 검사한다.
-- 검사는 행 저장 시점의 Storage 메타데이터 대상이다. 파일 바이트의 진위나 이후 객체 삭제까지 증명하지 않는다.
alter table public.employee_documents
  add constraint employee_documents_latent_tb_mime_name_check
  check (
    document_type <> '잠복결핵 검사서' or (
      (mime_type = 'application/pdf' and original_name ~* '\.pdf$' and storage_path ~* '\.pdf$') or
      (mime_type = 'image/png' and original_name ~* '\.png$' and storage_path ~* '\.png$') or
      (mime_type = 'image/jpeg' and original_name ~* '\.(jpg|jpeg)$' and storage_path ~* '\.(jpg|jpeg)$') or
      (mime_type = 'image/gif' and original_name ~* '\.gif$' and storage_path ~* '\.gif$')
    )
  ) not valid;

create schema if not exists employee_private;
revoke all on schema employee_private from public, anon, authenticated;

-- SECURITY DEFINER는 storage.objects의 RLS가 직원 본인의 객체 조회를 막는 경우에도
-- 정확한 버킷/경로/메타데이터만 읽도록 한다. 외부 호출은 허용하지 않는다.
create function employee_private.validate_latent_tb_document()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.document_type <> '잠복결핵 검사서' then
    return new;
  end if;

  if new.storage_path !~ ('^' || new.user_id::text || '/[^/]+$') then
    raise exception 'latent TB document path must be in the employee folder' using errcode = '23514';
  end if;

  if not exists (
    select 1 from storage.objects o
    where o.bucket_id = 'hr-docs'
      and o.name = new.storage_path
      and o.metadata->>'mimetype' = new.mime_type
      and o.metadata->>'size' = new.size_bytes::text
  ) then
    raise exception 'latent TB document Storage object or metadata does not match' using errcode = '23514';
  end if;
  return new;
end;
$$;
revoke all on function employee_private.validate_latent_tb_document() from public, anon, authenticated;

create trigger employee_documents_latent_tb_guard
before insert or update on public.employee_documents
for each row execute function employee_private.validate_latent_tb_document();

-- 안전 롤백(필요할 때만 실행): 행과 Storage 파일은 삭제하지 않는다.
-- drop trigger if exists employee_documents_latent_tb_guard on public.employee_documents;
-- drop function if exists employee_private.validate_latent_tb_document();
-- alter table public.employee_documents drop constraint if exists employee_documents_latent_tb_mime_name_check;
