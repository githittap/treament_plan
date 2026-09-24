-- H-3 적용용 migration rollback.
begin;
drop policy if exists deputy_hr_docs_contract_only on storage.objects;
commit;
