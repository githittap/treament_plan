-- Task 4 로컬 검토용 초안: 개인서명은 일반 직원서류와 다른 비공개 버킷에 보관한다.
create table if not exists public.employee_signature_vault (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles(user_id) on delete cascade,
  storage_path text not null unique,
  mime_type text not null check (mime_type='image/png'),
  size_bytes bigint not null check (size_bytes > 0 and size_bytes <= 1048576),
  created_at timestamptz not null default now(),
  revoked_at timestamptz
);

create table if not exists public.employee_signature_uses (
  id bigint generated always as identity primary key,
  signature_id bigint not null references public.employee_signature_vault(id),
  contract_id bigint references public.contracts(id),
  document_kind text not null,
  confirmed_at timestamptz not null,
  used_by uuid not null default auth.uid() references public.profiles(user_id),
  created_at timestamptz not null default now()
);
alter table public.employee_signature_uses add column if not exists contract_id bigint references public.contracts(id);
create unique index if not exists employee_signature_uses_contract_signature_idx
  on public.employee_signature_uses(contract_id,signature_id,document_kind)
  where contract_id is not null;

create table if not exists public.employee_signature_audit (
  id bigint generated always as identity primary key,
  signature_use_id bigint not null unique references public.employee_signature_uses(id),
  user_id uuid not null,
  document_kind text not null,
  confirmed_at timestamptz not null,
  created_at timestamptz not null default now()
);

alter table public.employee_signature_vault enable row level security;
alter table public.employee_signature_uses enable row level security;
alter table public.employee_signature_audit enable row level security;

revoke all on table public.employee_signature_vault,public.employee_signature_uses,public.employee_signature_audit from anon,authenticated;
grant select,insert on table public.employee_signature_vault to authenticated;
grant update(revoked_at) on table public.employee_signature_vault to authenticated;
grant select on table public.employee_signature_uses to authenticated;
grant select on table public.employee_signature_audit to authenticated;
revoke all on sequence public.employee_signature_vault_id_seq,public.employee_signature_uses_id_seq,public.employee_signature_audit_id_seq from anon,authenticated;
grant usage,select on sequence public.employee_signature_vault_id_seq,public.employee_signature_uses_id_seq to authenticated;

drop policy if exists employee_signature_vault_private on public.employee_signature_vault;
drop policy if exists employee_signature_vault_select_self on public.employee_signature_vault;
create policy employee_signature_vault_select_self on public.employee_signature_vault for select to authenticated
using (user_id=auth.uid());
drop policy if exists employee_signature_vault_insert_self on public.employee_signature_vault;
create policy employee_signature_vault_insert_self on public.employee_signature_vault for insert to authenticated
with check (user_id=auth.uid());
drop policy if exists employee_signature_vault_revoke_self on public.employee_signature_vault;
create policy employee_signature_vault_revoke_self on public.employee_signature_vault for update to authenticated
using (user_id=auth.uid()) with check (user_id=auth.uid());

drop policy if exists employee_signature_uses_self on public.employee_signature_uses;
drop policy if exists employee_signature_uses_select_self on public.employee_signature_uses;
create policy employee_signature_uses_select_self on public.employee_signature_uses for select to authenticated
using (used_by=auth.uid() and exists (select 1 from public.employee_signature_vault v where v.id=signature_id and v.user_id=auth.uid()));
drop policy if exists employee_signature_uses_insert_self on public.employee_signature_uses;
create policy employee_signature_uses_insert_self on public.employee_signature_uses for insert to authenticated
with check (used_by=auth.uid() and confirmed_at is not null and exists (select 1 from public.employee_signature_vault v where v.id=signature_id and v.user_id=auth.uid() and v.revoked_at is null));

drop policy if exists employee_signature_audit_self on public.employee_signature_audit;
create policy employee_signature_audit_self on public.employee_signature_audit for select to authenticated
using (user_id=auth.uid() or public.my_role()='owner');

create schema if not exists employee_private;
revoke all on schema employee_private from public,anon,authenticated;
create or replace function employee_private.audit_employee_signature_use()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if new.confirmed_at is null then raise exception 'explicit confirmation required'; end if;
  insert into public.employee_signature_audit(signature_use_id,user_id,document_kind,confirmed_at)
  select new.id,v.user_id,new.document_kind,new.confirmed_at from public.employee_signature_vault v where v.id=new.signature_id;
  return new;
end;
$$;
revoke all on function employee_private.audit_employee_signature_use() from public,anon,authenticated;
drop trigger if exists employee_signature_use_audit on public.employee_signature_uses;
create trigger employee_signature_use_audit after insert on public.employee_signature_uses
for each row execute function employee_private.audit_employee_signature_use();

-- 계약 본문 변경과 보관 서명 사용기록을 한 트랜잭션으로 묶는다.
create or replace function public.apply_employee_contract_signature(
  p_contract_id bigint, p_merged_html text, p_sign_slots jsonb,
  p_signed_at timestamptz, p_signature_id bigint default null
) returns bigint
language plpgsql security definer set search_path=public,pg_temp as $$
declare v_use_id bigint := null; v_user_id uuid;
begin
  select user_id into v_user_id from public.contracts
   where id=p_contract_id and user_id=auth.uid() and status='대기' for update;
  if v_user_id is null then raise exception 'contract is not pending or not owned by current user'; end if;
  if p_signature_id is not null then
    if not exists(select 1 from public.employee_signature_vault v where v.id=p_signature_id and v.user_id=auth.uid() and v.revoked_at is null) then
      raise exception 'signature is not available to current user';
    end if;
    insert into public.employee_signature_uses(contract_id,signature_id,document_kind,confirmed_at,used_by)
      values(p_contract_id,p_signature_id,'근로계약서',p_signed_at,auth.uid())
      on conflict (contract_id,signature_id,document_kind) where contract_id is not null do update set confirmed_at=excluded.confirmed_at,used_by=excluded.used_by
      returning id into v_use_id;
  end if;
  update public.contracts set merged_html=p_merged_html,sign_slots=p_sign_slots,signed_at=p_signed_at,status='서명완료'
    where id=p_contract_id and user_id=auth.uid() and status='대기';
  if not found then raise exception 'contract changed while signing'; end if;
  return coalesce(v_use_id,0);
end;
$$;
revoke all on function public.apply_employee_contract_signature(bigint,text,jsonb,timestamptz,bigint) from public,anon,authenticated;
grant execute on function public.apply_employee_contract_signature(bigint,text,jsonb,timestamptz,bigint) to authenticated;

insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
values ('employee-signatures','employee-signatures',false,1048576,array['image/png']::text[])
on conflict (id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;
drop policy if exists employee_signature_storage_private on storage.objects;
drop policy if exists employee_signature_storage_select_self on storage.objects;
create policy employee_signature_storage_select_self on storage.objects for select to authenticated
using (bucket_id='employee-signatures' and (storage.foldername(name))[1]=auth.uid()::text)
;
drop policy if exists employee_signature_storage_insert_self on storage.objects;
create policy employee_signature_storage_insert_self on storage.objects for insert to authenticated
with check (bucket_id='employee-signatures' and (storage.foldername(name))[1]=auth.uid()::text
  and metadata->>'mimetype'='image/png' and coalesce(metadata->>'size','') ~ '^[0-9]+$'
  and (metadata->>'size')::bigint between 1 and 1048576);
drop policy if exists employee_signature_storage_cleanup_self on storage.objects;
create policy employee_signature_storage_cleanup_self on storage.objects for delete to authenticated
using (bucket_id='employee-signatures' and (storage.foldername(name))[1]=auth.uid()::text
  and not exists (select 1 from public.employee_signature_vault v where v.storage_path=name));
