-- H-2 신규 객체만 되돌린다. 실제 요청·영수증·감사기록이 있으면 보존하고 중단한다.
begin;
do $$ begin if exists(select 1 from public.payment_requests) or exists(select 1 from public.payment_request_receipts) or exists(select 1 from public.payment_request_actions) then raise exception 'payment_requests contains data; rollback stopped'; end if; end $$;
drop policy if exists payment_receipts_delete_unlinked_requester on storage.objects;
drop policy if exists payment_receipts_insert_requester_pending on storage.objects;
drop policy if exists payment_receipts_select_approval_line on storage.objects;
do $$ begin if exists(select 1 from storage.objects where bucket_id='payment-receipts') then raise exception 'payment-receipts contains objects; rollback stopped'; end if; end $$;
delete from storage.buckets where id='payment-receipts';
drop policy if exists payment_request_actions_select_approval_line on public.payment_request_actions;
drop policy if exists payment_request_receipts_select_approval_line on public.payment_request_receipts;
drop policy if exists payment_requests_select_approval_line on public.payment_requests;
drop function if exists public.payment_request_act(bigint,text,text);
drop function if exists public.payment_request_add_receipt(bigint,text,text,text,bigint);
drop function if exists public.submit_payment_request(text,date,text,text,text,bigint);
drop table if exists public.payment_request_actions;
drop table if exists public.payment_request_receipts;
drop table if exists public.payment_requests;
commit;
