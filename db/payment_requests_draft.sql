-- H-2: 민감한 결제 요청은 일반 결재문서와 분리한다. 운영 적용 전에는 preview와 역할별 시험을 먼저 수행한다.
begin;
create table if not exists public.payment_requests (
  id bigint generated always as identity primary key,
  requester_id uuid not null references public.profiles(user_id),
  payment_item text not null check (length(btrim(payment_item)) between 1 and 500),
  requested_at timestamptz not null default now(),
  deadline_date date,
  bank_name text not null check (length(btrim(bank_name)) between 1 and 100),
  account_holder text not null check (length(btrim(account_holder)) between 1 and 100),
  account_number text not null check (length(btrim(account_number)) between 1 and 100),
  amount_krw bigint not null check (amount_krw > 0),
  status text not null default 'chief_pending' check (status in ('chief_pending','owner_pending','approved','rejected')),
  completed_at timestamptz,
  rejected_reason text,
  updated_at timestamptz not null default now()
);
create table if not exists public.payment_request_receipts (
  id bigint generated always as identity primary key,
  request_id bigint not null references public.payment_requests(id) on delete restrict,
  storage_path text not null unique,
  original_name text not null,
  mime_type text,
  size_bytes bigint not null check (size_bytes > 0 and size_bytes <= 10485760),
  uploaded_at timestamptz not null default now()
);
create table if not exists public.payment_request_actions (
  id bigint generated always as identity primary key,
  request_id bigint not null references public.payment_requests(id) on delete restrict,
  actor_id uuid not null references public.profiles(user_id),
  action text not null check (action in ('submitted','chief_approved','owner_approved','rejected')),
  reason text,
  acted_at timestamptz not null default now()
);
create index if not exists payment_requests_requester_idx on public.payment_requests(requester_id,requested_at desc);
create index if not exists payment_request_receipts_request_idx on public.payment_request_receipts(request_id);
alter table public.payment_requests enable row level security;
alter table public.payment_request_receipts enable row level security;
alter table public.payment_request_actions enable row level security;
revoke all on table public.payment_requests from public, anon, authenticated;
revoke all on table public.payment_request_receipts from public, anon, authenticated;
revoke all on table public.payment_request_actions from public, anon, authenticated;
grant select on table public.payment_requests,public.payment_request_receipts,public.payment_request_actions to authenticated;
drop policy if exists payment_requests_select_approval_line on public.payment_requests;
create policy payment_requests_select_approval_line on public.payment_requests for select to authenticated using (public.employee_hub_access_allowed() and (requester_id=auth.uid() or public.my_role() in ('chief','owner')));
drop policy if exists payment_request_receipts_select_approval_line on public.payment_request_receipts;
create policy payment_request_receipts_select_approval_line on public.payment_request_receipts for select to authenticated using (public.employee_hub_access_allowed() and exists(select 1 from public.payment_requests p where p.id=request_id and (p.requester_id=auth.uid() or public.my_role() in ('chief','owner'))));
drop policy if exists payment_request_actions_select_approval_line on public.payment_request_actions;
create policy payment_request_actions_select_approval_line on public.payment_request_actions for select to authenticated using (public.employee_hub_access_allowed() and exists(select 1 from public.payment_requests p where p.id=request_id and (p.requester_id=auth.uid() or public.my_role() in ('chief','owner'))));
create or replace function public.submit_payment_request(p_payment_item text,p_deadline_date date,p_bank_name text,p_account_holder text,p_account_number text,p_amount_krw bigint) returns bigint language plpgsql security definer set search_path=public,pg_temp as $$
declare v_id bigint;
begin
  if not public.employee_hub_access_allowed() then raise exception 'payment request not allowed'; end if;
  if coalesce(length(btrim(p_payment_item)),0)=0 or coalesce(length(btrim(p_bank_name)),0)=0 or coalesce(length(btrim(p_account_holder)),0)=0 or coalesce(length(btrim(p_account_number)),0)=0 or p_amount_krw is null or p_amount_krw<=0 then raise exception 'payment request fields are required'; end if;
  insert into public.payment_requests(requester_id,payment_item,deadline_date,bank_name,account_holder,account_number,amount_krw) values(auth.uid(),btrim(p_payment_item),p_deadline_date,btrim(p_bank_name),btrim(p_account_holder),btrim(p_account_number),p_amount_krw) returning id into v_id;
  insert into public.payment_request_actions(request_id,actor_id,action) values(v_id,auth.uid(),'submitted');
  return v_id;
end $$;
create or replace function public.payment_request_add_receipt(p_request_id bigint,p_storage_path text,p_original_name text,p_mime_type text,p_size_bytes bigint) returns bigint language plpgsql security definer set search_path=public,pg_temp as $$
declare v_id bigint;
begin
  if not public.employee_hub_access_allowed() or not exists(select 1 from public.payment_requests p where p.id=p_request_id and p.requester_id=auth.uid() and p.status='chief_pending') then raise exception 'payment receipt not allowed'; end if;
  if p_storage_path !~ ('^'||auth.uid()::text||'/'||p_request_id::text||'/') or coalesce(length(btrim(p_original_name)),0)=0 or p_size_bytes is null or p_size_bytes<=0 or p_size_bytes>10485760 then raise exception 'payment receipt invalid'; end if;
  insert into public.payment_request_receipts(request_id,storage_path,original_name,mime_type,size_bytes) values(p_request_id,p_storage_path,btrim(p_original_name),nullif(btrim(p_mime_type),''),p_size_bytes) returning id into v_id;
  return v_id;
end $$;
create or replace function public.payment_request_act(p_request_id bigint,p_action text,p_reason text default null) returns text language plpgsql security definer set search_path=public,pg_temp as $$
declare v_status text;v_role text:=public.my_role();v_next text;v_audit text;
begin
  select status into v_status from public.payment_requests where id=p_request_id for update;
  if v_status is null then raise exception 'payment request not found'; end if;
  if p_action='approve' and v_role='chief' and v_status='chief_pending' then v_next:='owner_pending';v_audit:='chief_approved';
  elsif p_action='approve' and v_role='owner' and v_status='owner_pending' then v_next:='approved';v_audit:='owner_approved';
  elsif p_action='reject' and ((v_role='chief' and v_status='chief_pending') or (v_role='owner' and v_status='owner_pending')) then v_next:='rejected';v_audit:='rejected';
  else raise exception 'payment request current approval step not allowed'; end if;
  update public.payment_requests set status=v_next,rejected_reason=case when v_next='rejected' then nullif(btrim(p_reason),'') else null end,completed_at=case when v_next in ('approved','rejected') then now() else null end,updated_at=now() where id=p_request_id;
  insert into public.payment_request_actions(request_id,actor_id,action,reason) values(p_request_id,auth.uid(),v_audit,nullif(btrim(p_reason),''));
  return v_next;
end $$;
revoke all on function public.submit_payment_request(text,date,text,text,text,bigint) from public,anon;
revoke all on function public.payment_request_add_receipt(bigint,text,text,text,bigint) from public,anon;
revoke all on function public.payment_request_act(bigint,text,text) from public,anon;
grant execute on function public.submit_payment_request(text,date,text,text,text,bigint),public.payment_request_add_receipt(bigint,text,text,text,bigint),public.payment_request_act(bigint,text,text) to authenticated;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('payment-receipts','payment-receipts',false,10485760,null) on conflict(id) do nothing;
grant usage on schema storage to authenticated;
grant select,insert,delete on storage.objects to authenticated;
drop policy if exists payment_receipts_select_approval_line on storage.objects;
create policy payment_receipts_select_approval_line on storage.objects for select to authenticated using (bucket_id='payment-receipts' and public.employee_hub_access_allowed() and exists(select 1 from public.payment_request_receipts r join public.payment_requests p on p.id=r.request_id where r.storage_path=name and (p.requester_id=auth.uid() or public.my_role() in ('chief','owner'))));
drop policy if exists payment_receipts_insert_requester_pending on storage.objects;
create policy payment_receipts_insert_requester_pending on storage.objects for insert to authenticated with check (bucket_id='payment-receipts' and public.employee_hub_access_allowed() and split_part(name,'/',1)=auth.uid()::text and split_part(name,'/',2)~'^[0-9]+$' and exists(select 1 from public.payment_requests p where p.id=split_part(name,'/',2)::bigint and p.requester_id=auth.uid() and p.status='chief_pending') and coalesce((metadata->>'size')::bigint,10485761)<=10485760);
drop policy if exists payment_receipts_delete_unlinked_requester on storage.objects;
create policy payment_receipts_delete_unlinked_requester on storage.objects for delete to authenticated using (bucket_id='payment-receipts' and split_part(name,'/',1)=auth.uid()::text and not exists(select 1 from public.payment_request_receipts r where r.storage_path=name));
commit;
