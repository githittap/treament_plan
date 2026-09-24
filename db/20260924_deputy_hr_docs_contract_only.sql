-- H-3 적용용 migration 정본. deputy의 hr-docs 접근은 본인 계약 PDF 경로만 허용한다.
begin;
alter table storage.objects enable row level security;
drop policy if exists deputy_hr_docs_contract_only on storage.objects;
create policy deputy_hr_docs_contract_only on storage.objects as restrictive for all to authenticated
using (public.my_role()<>'deputy' or (bucket_id='hr-docs' and name ~ '^contracts/[0-9]+/(source|signed)\.pdf$' and exists(select 1 from public.contracts c where c.id::text=split_part(name,'/',2) and c.user_id=auth.uid())))
with check (public.my_role()<>'deputy' or (bucket_id='hr-docs' and name ~ '^contracts/[0-9]+/source\.pdf$' and exists(select 1 from public.contracts c where c.id::text=split_part(name,'/',2) and c.user_id=auth.uid())));
commit;
