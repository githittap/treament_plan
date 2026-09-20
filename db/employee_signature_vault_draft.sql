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
  document_kind text not null,
  confirmed_at timestamptz not null,
  used_by uuid not null default auth.uid() references public.profiles(user_id),
  created_at timestamptz not null default now()
);

create table if not exists public.employee_signature_audit (
  id bigint generated always as identity primary key,
  signature_use_id bigint not null unique references public.employee_signature_uses(id) on delete cascade,
  user_id uuid not null,
  document_kind text not null,
  confirmed_at timestamptz not null,
  created_at timestamptz not null default now()
);

alter table public.employee_signature_vault enable row level security;
alter table public.employee_signature_uses enable row level security;
alter table public.employee_signature_audit enable row level security;

grant select,insert,update,delete on public.employee_signature_vault,public.employee_signature_uses to authenticated;
grant select on public.employee_signature_audit to authenticated;
grant usage,select on all sequences in schema public to authenticated;

create policy employee_signature_vault_private on public.employee_signature_vault for all to authenticated
using (user_id=auth.uid()) with check (user_id=auth.uid());

create policy employee_signature_uses_self on public.employee_signature_uses for all to authenticated
using (used_by=auth.uid() and exists (select 1 from public.employee_signature_vault v where v.id=signature_id and v.user_id=auth.uid()))
with check (used_by=auth.uid() and confirmed_at is not null and exists (select 1 from public.employee_signature_vault v where v.id=signature_id and v.user_id=auth.uid() and v.revoked_at is null));

create policy employee_signature_audit_self on public.employee_signature_audit for select to authenticated
using (user_id=auth.uid() or public.my_role()='owner');

create or replace function public.audit_employee_signature_use()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if new.confirmed_at is null then raise exception 'explicit confirmation required'; end if;
  insert into public.employee_signature_audit(signature_use_id,user_id,document_kind,confirmed_at)
  select new.id,v.user_id,new.document_kind,new.confirmed_at from public.employee_signature_vault v where v.id=new.signature_id;
  return new;
end;
$$;
drop trigger if exists employee_signature_use_audit on public.employee_signature_uses;
create trigger employee_signature_use_audit after insert on public.employee_signature_uses
for each row execute function public.audit_employee_signature_use();

insert into storage.buckets (id,name,public) values ('employee-signatures','employee-signatures',false) on conflict do nothing;
create policy employee_signature_storage_private on storage.objects for all to authenticated
using (bucket_id='employee-signatures' and (storage.foldername(name))[1]=auth.uid()::text)
with check (bucket_id='employee-signatures' and (storage.foldername(name))[1]=auth.uid()::text);
