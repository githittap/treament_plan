-- 실제 PDF 사용기록이 있으면 함수 제거를 중단한다.
do $$
begin
  if exists(select 1 from public.employee_signature_uses where contract_id is not null) then
    raise exception 'rollback blocked: contract signature use records exist';
  end if;
end;
$$;
drop function if exists public.record_contract_pdf_signature_with_use(bigint,uuid,uuid,text,text,text,text,integer,numeric,numeric,numeric,numeric,bigint);
