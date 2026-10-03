-- Disable the new flow without erasing any contract, signature, or pledge evidence.
begin;
drop trigger if exists p9_contract_pledge_guard on public.contracts;
drop function if exists public.p9_guard_contract_pledge();
drop function if exists public.submit_contract_security_pledge(bigint,text,boolean,boolean,text);
drop function if exists public.p9_pledge_html(public.contract_security_pledges);
drop function if exists public.stage_contract_pledge_signatures(bigint,jsonb,jsonb);
drop function if exists public.validate_contract_pledge_pdf(bigint,uuid,jsonb,jsonb,text,text);
drop function if exists public.validate_contract_pledge_pdf(bigint,uuid,jsonb,jsonb,text,text,text);
drop function if exists public.recover_contract_security_pledge(bigint,text);
drop function if exists public.recover_contract_pdf_signing_attempt(bigint,text);
drop function if exists public.validate_contract_security_pledge_signature(bigint,uuid,text,text,text,boolean);
drop function if exists public.get_my_contract_security_pledges();
drop function if exists public.prepare_contract_security_pledge(bigint);
drop function if exists public.p9_pledge_document();
do $$declare r record;begin
  for r in select definition from public.p9_contract_pdf_function_backups loop execute r.definition;end loop;
end $$;
-- Keep pledge_required and contract_security_pledges: dropping them would erase evidence.
alter table public.contracts alter column pledge_required set default false;
commit;
