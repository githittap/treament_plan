-- H-3 적용용 migration 정본. 선행: 20260920074925_contract_pdf_signing_a_hardening.
-- 현재 적용된 함수 본문을 보존한 채 직원 계약 PDF 확인/서명 함수의 역할 목록만 확장한다.
begin;
do $$ declare fn regprocedure; src text; begin
  foreach fn in array array[
    'public.begin_contract_pdf_signing(bigint,text,integer,numeric,numeric,numeric,numeric)'::regprocedure,
    'public.confirm_contract_pdf_source(bigint)'::regprocedure,
    'public.record_contract_pdf_signature(bigint,uuid,uuid,text,text,text,text,integer,numeric,numeric,numeric,numeric)'::regprocedure
  ] loop
    select pg_get_functiondef(fn::oid) into src;
    if src is null then raise exception 'required contract PDF function is missing: %',fn; end if;
    src:=replace(src, 'p.role in (''staff'',''manager'',''chief'',''owner'')', 'p.role in (''staff'',''manager'',''chief'',''owner'',''deputy'')');
    src:=replace(src, 'p.role in (''staff'', ''manager'', ''chief'', ''owner'')', 'p.role in (''staff'', ''manager'', ''chief'', ''owner'', ''deputy'')');
    src:=replace(src, 'p.role in(''staff'',''manager'',''chief'',''owner'')', 'p.role in(''staff'',''manager'',''chief'',''owner'',''deputy'')');
    execute src;
  end loop;
end $$;
commit;
