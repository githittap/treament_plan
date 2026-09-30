-- H-3 적용용 migration rollback. 본문은 migration 전 역할 목록만 되돌린다.
begin;
do $$ declare fn regprocedure; src text; begin
  foreach fn in array array[
    'public.begin_contract_pdf_signing(bigint,text,integer,numeric,numeric,numeric,numeric)'::regprocedure,
    'public.confirm_contract_pdf_source(bigint)'::regprocedure,
    'public.record_contract_pdf_signature(bigint,uuid,uuid,text,text,text,text,integer,numeric,numeric,numeric,numeric)'::regprocedure
  ] loop
    select pg_get_functiondef(fn::oid) into src;
    if src is null then raise exception 'required contract PDF function is missing: %',fn; end if;
    src:=replace(src, 'p.role in (''staff'',''manager'',''chief'',''owner'',''deputy'')', 'p.role in (''staff'',''manager'',''chief'',''owner'')');
    src:=replace(src, 'p.role in (''staff'', ''manager'', ''chief'', ''owner'', ''deputy'')', 'p.role in (''staff'', ''manager'', ''chief'', ''owner'')');
    src:=replace(src, 'p.role in(''staff'',''manager'',''chief'',''owner'',''deputy'')', 'p.role in(''staff'',''manager'',''chief'',''owner'')');
    execute src;
  end loop;
end $$;
commit;
