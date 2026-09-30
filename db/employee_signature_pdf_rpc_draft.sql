-- 적용 정본: Edge PDF 완료 기록과 보관 서명 사용기록을 한 트랜잭션으로 묶는다.
-- 선행: contract_pdf_signing_production_snapshot.sql의 record_contract_pdf_signature,
-- employee_signature_vault_draft.sql의 employee_signature_uses 구조.
create or replace function public.record_contract_pdf_signature_with_use(
  p_contract_id bigint,p_user_id uuid,p_attempt_id uuid,p_source_sha256 text,p_signed_path text,p_signed_sha256 text,p_signature_sha256 text,
  p_page_no integer,p_x numeric,p_y numeric,p_width numeric,p_height numeric,p_signature_id bigint default null
)
returns public.contracts language plpgsql security definer set search_path=public,pg_temp as $$
declare r public.contracts; v_use_id bigint;
begin
  if p_signature_id is not null and not exists(select 1 from public.employee_signature_vault v where v.id=p_signature_id and v.user_id=p_user_id and v.revoked_at is null) then
    raise exception 'signature is not available to contract owner';
  end if;
  select * into r from public.record_contract_pdf_signature(p_contract_id,p_user_id,p_attempt_id,p_source_sha256,p_signed_path,p_signed_sha256,p_signature_sha256,p_page_no,p_x,p_y,p_width,p_height);
  if p_signature_id is not null then
    insert into public.employee_signature_uses(contract_id,signature_id,document_kind,confirmed_at,used_by)
      values(p_contract_id,p_signature_id,'근로계약서',now(),p_user_id)
      on conflict (contract_id,signature_id,document_kind) where contract_id is not null do update set confirmed_at=excluded.confirmed_at,used_by=excluded.used_by
      returning id into v_use_id;
  end if;
  return r;
end;
$$;
revoke all on function public.record_contract_pdf_signature_with_use(bigint,uuid,uuid,text,text,text,text,integer,numeric,numeric,numeric,numeric,bigint) from public,anon,authenticated;
grant execute on function public.record_contract_pdf_signature_with_use(bigint,uuid,uuid,text,text,text,text,integer,numeric,numeric,numeric,numeric,bigint) to service_role;
