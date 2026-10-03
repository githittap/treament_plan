-- Keep each eligible employee's own receipt visible before it is linked to a request.
-- This also lets failed uploads be removed through Storage DELETE ... RETURNING.
begin;
drop policy if exists payment_receipts_select_approval_line on storage.objects;
create policy payment_receipts_select_approval_line on storage.objects for select to authenticated using (bucket_id='payment-receipts' and public.employee_hub_access_allowed() and (split_part(name,'/',1)=auth.uid()::text or exists(select 1 from public.payment_request_receipts r join public.payment_requests p on p.id=r.request_id where r.storage_path=name and (p.requester_id=auth.uid() or public.my_role() in ('chief','owner')))));
commit;
