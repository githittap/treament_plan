-- 계약 서명 RPC 보완분만 되돌린다. 실제 계약 사용기록이 있으면 중단한다.
do $$
begin
  if exists(select 1 from public.employee_signature_uses where contract_id is not null) then
    raise exception 'rollback blocked: contract signature use records exist';
  end if;
end;
$$;
drop function if exists public.apply_employee_contract_signature(bigint,text,jsonb,timestamptz,bigint);
drop function if exists public.record_contract_pdf_signature_with_use(bigint,uuid,uuid,text,text,text,text,integer,numeric,numeric,numeric,numeric,bigint);
drop index if exists public.employee_signature_uses_contract_signature_idx;
alter table public.employee_signature_uses drop column if exists contract_id;
