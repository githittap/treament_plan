-- SNAPSHOT, NOT A MIGRATION.
-- Source: production Supabase project texevhsxttfoqkrucfzl, read via pg_get_functiondef /
-- pg_get_triggerdef / pg_policies / information_schema on 2026-09-22.
-- Captured to record what is actually deployed, matching migration:
--   20260920074925_contract_pdf_signing_a_hardening
-- (there is no earlier "plan A" migration on record for this feature; the hardening
-- migration is the only one that touches contract PDF signing objects).
--
-- This file documents production. It is NOT wired into supabase/functions or the
-- migration chain and must not be applied as-is. It replaces db/contract_pdf_signing_draft.sql
-- because that owner draft (root comment: "A안: 원본 PDF 불변 보관 + 직원 명시 확인 + 서버 생성
-- 완료 PDF + 감사기록") is an earlier, pre-hardening revision that differs from production in
-- ways that matter for security -- see the diff summary at the bottom of this file.

alter table public.contracts
  add column if not exists source_pdf_path text,
  add column if not exists source_pdf_sha256 text,
  add column if not exists source_pdf_version text,
  add column if not exists source_pdf_registered_at timestamptz,
  add column if not exists source_pdf_registered_by uuid references public.profiles(user_id),
  add column if not exists source_pdf_confirmed_at timestamptz,
  add column if not exists pdf_signing_attempt_id uuid,
  add column if not exists pdf_signing_started_at timestamptz,
  add column if not exists pdf_signing_signature_sha256 text,
  add column if not exists pdf_signing_page_no integer,
  add column if not exists pdf_signing_x numeric,
  add column if not exists pdf_signing_y numeric,
  add column if not exists pdf_signing_width numeric,
  add column if not exists pdf_signing_height numeric,
  add column if not exists signed_pdf_path text,
  add column if not exists signed_pdf_sha256 text,
  add column if not exists pdf_signed_at timestamptz;

create table if not exists public.contract_pdf_signature_audits (
  id bigint generated always as identity primary key,
  contract_id bigint not null references public.contracts(id) on delete restrict,
  user_id uuid not null references public.profiles(user_id),
  action text not null check (action in ('source_registered','employee_confirmed','signed_pdf_created')),
  source_sha256 text not null,
  signed_sha256 text,
  signature_sha256 text,
  page_no integer,
  x numeric,
  y numeric,
  width numeric,
  height numeric,
  created_at timestamptz not null default now(),
  unique(contract_id,action)
);

create unique index if not exists contracts_pdf_signing_attempt_uidx
  on public.contracts(pdf_signing_attempt_id) where pdf_signing_attempt_id is not null;

-- Production body: adds a TG_OP='INSERT' branch (rejects protected fields set on insert;
-- the draft's trigger was UPDATE-only and never exercised this path) and a second guard that
-- blocks the legacy HTML e-signature path (merged_html/sign_slots/signed_at/status) once a
-- PDF source has been registered, forcing PDF-sourced contracts through server-side signing.
create or replace function public.guard_contract_pdf_immutability()
returns trigger language plpgsql as $$
begin
  if TG_OP='INSERT' then
    if new.source_pdf_path is not null or new.source_pdf_sha256 is not null or new.source_pdf_version is not null or
       new.source_pdf_registered_at is not null or new.source_pdf_registered_by is not null or new.source_pdf_confirmed_at is not null or
       new.pdf_signing_attempt_id is not null or new.pdf_signing_started_at is not null or new.pdf_signing_signature_sha256 is not null or
       new.pdf_signing_page_no is not null or new.pdf_signing_x is not null or new.pdf_signing_y is not null or
       new.pdf_signing_width is not null or new.pdf_signing_height is not null or new.signed_pdf_path is not null or
       new.signed_pdf_sha256 is not null or new.pdf_signed_at is not null then
      raise exception 'contract PDF protected fields cannot be inserted';
    end if;
    return new;
  end if;
  if coalesce(current_setting('app.contract_pdf_mutation',true),'') not in ('source_register','source_confirm','pdf_record') then
    if old.source_pdf_path is not null and (
       new.merged_html is distinct from old.merged_html or new.sign_slots is distinct from old.sign_slots or
       new.signed_at is distinct from old.signed_at or new.status is distinct from old.status and new.status='서명완료'
    ) then
      raise exception 'PDF contracts require server PDF signing';
    end if;
    if (to_jsonb(new)-'updated_at') ?| array['source_pdf_path','source_pdf_sha256','source_pdf_version','source_pdf_registered_at','source_pdf_registered_by','source_pdf_confirmed_at','pdf_signing_attempt_id','pdf_signing_started_at','signed_pdf_path','signed_pdf_sha256','pdf_signed_at']
       and (
         new.source_pdf_path is distinct from old.source_pdf_path or new.source_pdf_sha256 is distinct from old.source_pdf_sha256 or
         new.source_pdf_version is distinct from old.source_pdf_version or new.source_pdf_registered_at is distinct from old.source_pdf_registered_at or
         new.source_pdf_registered_by is distinct from old.source_pdf_registered_by or new.source_pdf_confirmed_at is distinct from old.source_pdf_confirmed_at or
         new.pdf_signing_attempt_id is distinct from old.pdf_signing_attempt_id or new.pdf_signing_started_at is distinct from old.pdf_signing_started_at or
         new.pdf_signing_signature_sha256 is distinct from old.pdf_signing_signature_sha256 or new.pdf_signing_page_no is distinct from old.pdf_signing_page_no or
         new.pdf_signing_x is distinct from old.pdf_signing_x or new.pdf_signing_y is distinct from old.pdf_signing_y or new.pdf_signing_width is distinct from old.pdf_signing_width or new.pdf_signing_height is distinct from old.pdf_signing_height or
         new.signed_pdf_path is distinct from old.signed_pdf_path or new.signed_pdf_sha256 is distinct from old.signed_pdf_sha256 or new.pdf_signed_at is distinct from old.pdf_signed_at
       ) then raise exception 'contract PDF protected fields are immutable'; end if;
  end if;
  return new;
end; $$;

-- Production registers this BEFORE INSERT OR UPDATE (the draft only registered BEFORE UPDATE).
drop trigger if exists contracts_pdf_immutability_guard on public.contracts;
create trigger contracts_pdf_immutability_guard before insert or update on public.contracts
for each row execute function public.guard_contract_pdf_immutability();

alter table public.contract_pdf_signature_audits enable row level security;
drop policy if exists contract_pdf_audits_select_scoped on public.contract_pdf_signature_audits;
create policy contract_pdf_audits_select_scoped on public.contract_pdf_signature_audits for select to authenticated
using (
  exists(select 1 from public.profiles p where p.user_id=auth.uid() and p.active=true and p.approved=true)
  and (user_id=auth.uid() or public.my_role() in ('manager','chief','owner'))
);
revoke all on public.contract_pdf_signature_audits from public,anon,authenticated;
grant select on public.contract_pdf_signature_audits to authenticated;

drop policy if exists contract_pdf_source_select_scoped on storage.objects;
create policy contract_pdf_source_select_scoped on storage.objects for select to authenticated
using (
  bucket_id='hr-docs'
  and exists(select 1 from public.profiles p where p.user_id=auth.uid() and p.active=true and p.approved=true)
  and name ~ '^contracts/[0-9]+/(source|signed)\.pdf$'
  and exists(select 1 from public.contracts c where c.id::text=split_part(name,'/',2) and (c.user_id=auth.uid() or public.my_role() in ('manager','chief','owner')))
);
drop policy if exists contract_pdf_source_insert_lead on storage.objects;
create policy contract_pdf_source_insert_lead on storage.objects for insert to authenticated
with check (
  bucket_id='hr-docs'
  and name ~ '^contracts/[0-9]+/source\.pdf$'
  and exists(select 1 from public.profiles p where p.user_id=auth.uid() and p.active=true and p.approved=true and p.role in ('manager','chief','owner'))
  and exists(select 1 from public.contracts c where c.id::text=split_part(name,'/',2) and c.status='발송요청')
);

drop policy if exists contract_pdf_protected_files_no_update on storage.objects;
create policy contract_pdf_protected_files_no_update on storage.objects as restrictive for update to public
using (not (bucket_id='hr-docs' and name ~ '^contracts/[0-9]+/(source|signed)\.pdf$'))
with check (not (bucket_id='hr-docs' and name ~ '^contracts/[0-9]+/(source|signed)\.pdf$'));
drop policy if exists contract_pdf_protected_files_no_delete on storage.objects;
create policy contract_pdf_protected_files_no_delete on storage.objects as restrictive for delete to public
using (not (bucket_id='hr-docs' and name ~ '^contracts/[0-9]+/(source|signed)\.pdf$'));
drop policy if exists contract_pdf_protected_files_insert_only_source on storage.objects;
create policy contract_pdf_protected_files_insert_only_source on storage.objects as restrictive for insert to public
with check (not (bucket_id='hr-docs' and name ~ '^contracts/[0-9]+/(source|signed)\.pdf$') or name ~ '^contracts/[0-9]+/source\.pdf$');

-- Present in production, absent from the owner's draft: a RESTRICTIVE select policy that
-- layers on top of contract_pdf_source_select_scoped so protected PDFs are only readable by
-- the owning employee or leadership, even if some other permissive policy would otherwise allow it.
drop policy if exists contract_pdf_protected_files_select_scope on storage.objects;
create policy contract_pdf_protected_files_select_scope on storage.objects as restrictive for select to public
using (
  not (bucket_id='hr-docs' and name ~ '^contracts/[0-9]+/(source|signed)\.pdf$')
  or (
    exists(select 1 from public.profiles p where p.user_id=auth.uid() and p.active=true and p.approved=true)
    and exists(select 1 from public.contracts c where c.id::text=split_part(name,'/',2) and (c.user_id=auth.uid() or public.my_role() in ('manager','chief','owner')))
  )
);

-- Production hardens null-handling throughout: every "<>" comparison against a nullable
-- contract column in the draft is "is distinct from" here (a NULL operand with "<>" evaluates
-- to NULL, which silently fails to raise the exception; "is distinct from" cannot be bypassed
-- this way).
create or replace function public.register_contract_pdf_source(
  p_contract_id bigint,p_source_path text,p_source_sha256 text,p_source_version text
)
returns public.contracts language plpgsql security definer set search_path=public,pg_temp as $$
declare r public.contracts; role_name text; actor uuid:=auth.uid();
begin
  if not exists(select 1 from public.profiles p where p.user_id=actor and p.active=true and p.approved=true) then raise exception 'active approved profile required'; end if;
  role_name:=coalesce(public.my_role(),'');
  if role_name not in ('manager','chief','owner') then raise exception 'contract PDF source registration requires leadership'; end if;
  if p_contract_id is null or p_source_path is null or p_source_path is distinct from format('contracts/%s/source.pdf',p_contract_id) or p_source_sha256 is null or p_source_sha256 !~ '^[0-9a-f]{64}$' or p_source_version is null or trim(p_source_version)='' then raise exception 'invalid contract PDF source metadata'; end if;
  select * into r from public.contracts where id=p_contract_id for update;
  if not found then raise exception 'contract not found'; end if;
  if r.status<>'발송요청' then raise exception 'contract PDF source requires pending request'; end if;
  if r.source_pdf_path is not null or r.source_pdf_sha256 is not null then raise exception 'contract PDF source is immutable'; end if;
  perform set_config('app.contract_pdf_mutation','source_register',true);
  update public.contracts set source_pdf_path=p_source_path,source_pdf_sha256=p_source_sha256,source_pdf_version=p_source_version,source_pdf_registered_at=now(),source_pdf_registered_by=actor where id=p_contract_id returning * into r;
  insert into public.contract_pdf_signature_audits(contract_id,user_id,action,source_sha256) values (p_contract_id,actor,'source_registered',p_source_sha256);
  return r;
end; $$;

-- Production reorders the signed_path check ahead of the attempt_id check and adds an explicit
-- "p_signed_path is null" test (the draft's bare "p_signed_path<>format(...)" evaluates to NULL,
-- not TRUE, if p_signed_path is null -- silently skipping the guard).
create or replace function public.record_contract_pdf_signature(
  p_contract_id bigint,p_user_id uuid,p_attempt_id uuid,p_source_sha256 text,p_signed_path text,p_signed_sha256 text,p_signature_sha256 text,
  p_page_no integer,p_x numeric,p_y numeric,p_width numeric,p_height numeric
)
returns public.contracts language plpgsql security definer set search_path=public,pg_temp as $$
declare r public.contracts; actor uuid:=auth.uid();
begin
  if p_contract_id is null or p_user_id is null or p_attempt_id is null or p_source_sha256 is null or p_source_sha256 !~ '^[0-9a-f]{64}$' or p_signed_sha256 is null or p_signed_sha256 !~ '^[0-9a-f]{64}$' or p_signature_sha256 is null or p_signature_sha256 !~ '^[0-9a-f]{64}$' or p_page_no is null or p_page_no<1 or p_x is null or p_y is null or p_width is null or p_height is null or p_x<0 or p_y<0 or p_width<=0 or p_height<=0 then raise exception 'invalid contract PDF signature metadata'; end if;
  if not exists(select 1 from public.profiles p where p.user_id=p_user_id and p.active=true and p.approved=true and p.role in ('staff','manager','chief','owner')) then raise exception 'active approved employee profile required'; end if;
  select * into r from public.contracts where id=p_contract_id for update;
  if not found then raise exception 'contract not found'; end if;
  if r.user_id is distinct from p_user_id or r.source_pdf_sha256 is distinct from p_source_sha256 or r.source_pdf_path is distinct from format('contracts/%s/source.pdf',p_contract_id) or r.source_pdf_version is null or trim(r.source_pdf_version)='' then raise exception 'contract PDF identity mismatch'; end if;
  if r.source_pdf_confirmed_at is null or r.sent_at is null or r.due_at is null or r.due_at<now() then raise exception 'contract PDF was not confirmed, finally sent, or is expired'; end if;
  if p_signed_path is null or p_signed_path is distinct from format('contracts/%s/signed.pdf',p_contract_id) then raise exception 'invalid signed PDF path'; end if;
  if r.pdf_signing_attempt_id is distinct from p_attempt_id then raise exception 'contract PDF signing attempt mismatch'; end if;
  if r.pdf_signing_signature_sha256 is distinct from p_signature_sha256 or r.pdf_signing_page_no is distinct from p_page_no or r.pdf_signing_x is distinct from p_x or r.pdf_signing_y is distinct from p_y or r.pdf_signing_width is distinct from p_width or r.pdf_signing_height is distinct from p_height then raise exception 'contract PDF signing payload mismatch'; end if;
  if r.status='서명완료' and r.signed_pdf_path=format('contracts/%s/signed.pdf',p_contract_id) and r.signed_pdf_sha256=p_signed_sha256 then return r; end if;
  if r.status<>'대기' or r.signed_at is not null or r.signed_pdf_path is not null then raise exception 'contract PDF is immutable or not signable'; end if;
  perform set_config('app.contract_pdf_mutation','pdf_record',true);
  update public.contracts set signed_pdf_path=p_signed_path,signed_pdf_sha256=p_signed_sha256,pdf_signed_at=now(),signed_at=now(),status='서명완료' where id=p_contract_id returning * into r;
  insert into public.contract_pdf_signature_audits(contract_id,user_id,action,source_sha256,signed_sha256,signature_sha256,page_no,x,y,width,height) values (p_contract_id,p_user_id,'signed_pdf_created',p_source_sha256,p_signed_sha256,p_signature_sha256,p_page_no,p_x,p_y,p_width,p_height);
  return r;
end; $$;

create or replace function public.begin_contract_pdf_signing(p_contract_id bigint,p_signature_sha256 text,p_page_no integer,p_x numeric,p_y numeric,p_width numeric,p_height numeric)
returns public.contracts language plpgsql security definer set search_path=public,pg_temp as $$
declare r public.contracts; actor uuid:=auth.uid();
begin
  if not exists(select 1 from public.profiles p where p.user_id=actor and p.active=true and p.approved=true and p.role in ('staff','manager','chief','owner')) then raise exception 'active approved employee profile required'; end if;
  if p_signature_sha256 is null or p_signature_sha256 !~ '^[0-9a-f]{64}$' or p_page_no is null or p_page_no<1 or p_x is null or p_y is null or p_width is null or p_height is null or p_x<0 or p_y<0 or p_width<=0 or p_height<=0 then raise exception 'invalid contract PDF signing payload'; end if;
  select * into r from public.contracts where id=p_contract_id and user_id=actor for update;
  if not found then raise exception 'contract PDF access denied'; end if;
  if r.status='서명완료' and r.signed_pdf_path is not null then return r; end if;
  if r.status<>'대기' or r.sent_at is null or r.due_at is null or r.due_at<now() or r.signed_at is not null or r.source_pdf_path is distinct from format('contracts/%s/source.pdf',p_contract_id) or r.source_pdf_sha256 is null or r.source_pdf_version is null or trim(r.source_pdf_version)='' or r.source_pdf_confirmed_at is null then raise exception 'contract PDF is not ready for signing'; end if;
  if r.pdf_signing_attempt_id is not null and (r.pdf_signing_signature_sha256 is distinct from p_signature_sha256 or r.pdf_signing_page_no is distinct from p_page_no or r.pdf_signing_x is distinct from p_x or r.pdf_signing_y is distinct from p_y or r.pdf_signing_width is distinct from p_width or r.pdf_signing_height is distinct from p_height) then raise exception 'contract PDF signing payload mismatch'; end if;
  if r.pdf_signing_attempt_id is null then
    perform set_config('app.contract_pdf_mutation','source_confirm',true);
    update public.contracts set pdf_signing_attempt_id=(format('%s-%s-4%s-8%s-%s',substr(md5(p_contract_id::text||r.source_pdf_sha256),1,8),substr(md5(p_contract_id::text||r.source_pdf_sha256),9,4),substr(md5(p_contract_id::text||r.source_pdf_sha256),14,3),substr(md5(p_contract_id::text||r.source_pdf_sha256),18,3),substr(md5(p_contract_id::text||r.source_pdf_sha256),21,12)))::uuid,pdf_signing_started_at=now(),pdf_signing_signature_sha256=p_signature_sha256,pdf_signing_page_no=p_page_no,pdf_signing_x=p_x,pdf_signing_y=p_y,pdf_signing_width=p_width,pdf_signing_height=p_height where id=p_contract_id returning * into r;
  end if;
  return r;
end; $$;

create or replace function public.confirm_contract_pdf_source(p_contract_id bigint)
returns public.contracts language plpgsql security definer set search_path=public,pg_temp as $$
declare r public.contracts; actor uuid:=auth.uid();
begin
  if not exists(select 1 from public.profiles p where p.user_id=actor and p.active=true and p.approved=true and p.role in ('staff','manager','chief','owner')) then raise exception 'active approved employee profile required'; end if;
  select * into r from public.contracts where id=p_contract_id and user_id=actor for update;
  if not found then raise exception 'contract PDF confirmation access denied'; end if;
  if r.status<>'대기' or r.sent_at is null or r.due_at is null or r.due_at<now() or r.source_pdf_path is distinct from format('contracts/%s/source.pdf',p_contract_id) or r.source_pdf_version is null or trim(r.source_pdf_version)='' or r.source_pdf_sha256 is null or r.signed_at is not null then raise exception 'contract PDF is not confirmable'; end if;
  if r.source_pdf_confirmed_at is not null then return r; end if;
  perform set_config('app.contract_pdf_mutation','source_confirm',true);
  update public.contracts set source_pdf_confirmed_at=now() where id=p_contract_id returning * into r;
  insert into public.contract_pdf_signature_audits(contract_id,user_id,action,source_sha256) values (p_contract_id,actor,'employee_confirmed',r.source_pdf_sha256);
  return r;
end; $$;

revoke all on function public.register_contract_pdf_source(bigint,text,text,text) from public,anon,authenticated;
revoke all on function public.record_contract_pdf_signature(bigint,uuid,uuid,text,text,text,text,integer,numeric,numeric,numeric,numeric) from public,anon,authenticated;
revoke all on function public.confirm_contract_pdf_source(bigint) from public,anon,authenticated;
revoke all on function public.begin_contract_pdf_signing(bigint,text,integer,numeric,numeric,numeric,numeric) from public,anon,authenticated;
grant execute on function public.register_contract_pdf_source(bigint,text,text,text) to authenticated;
grant execute on function public.confirm_contract_pdf_source(bigint) to authenticated;
grant execute on function public.begin_contract_pdf_signing(bigint,text,integer,numeric,numeric,numeric,numeric) to authenticated;
-- 완료 PDF는 Edge Function이 auth를 확인한 뒤 service_role로 이 함수만 호출한다.
grant execute on function public.record_contract_pdf_signature(bigint,uuid,uuid,text,text,text,text,integer,numeric,numeric,numeric,numeric) to service_role;

-- ============================================================================
-- Diff summary vs. db/contract_pdf_signing_draft.sql (owner's local, uncommitted draft):
--
-- 1. Trigger timing: production is `BEFORE INSERT OR UPDATE`; the draft only registers
--    `BEFORE UPDATE`, so it never runs on INSERT.
-- 2. guard_contract_pdf_immutability(): production adds (a) a TG_OP='INSERT' branch that
--    rejects any protected column being set on insert, and (b) a second guard that blocks
--    mutating merged_html/sign_slots/signed_at/status through the legacy HTML e-signature
--    path once a PDF source is registered ("PDF contracts require server PDF signing").
--    Neither exists in the draft.
-- 3. NULL-safety: register_contract_pdf_source, record_contract_pdf_signature,
--    begin_contract_pdf_signing, and confirm_contract_pdf_source all replace "<>" with
--    "is distinct from" for comparisons against nullable contract columns in production.
--    With "<>", a NULL operand makes the whole OR-chain evaluate to NULL (not TRUE), which
--    can silently skip the guard instead of raising; "is distinct from" cannot be bypassed
--    this way.
-- 4. record_contract_pdf_signature also reorders checks: production validates p_signed_path
--    (including an explicit "is null" check the draft lacks) before checking the signing
--    attempt id; the draft checks the attempt id first and never null-checks p_signed_path.
-- 5. Storage RLS: production has an extra RESTRICTIVE select policy,
--    contract_pdf_protected_files_select_scope, layered on storage.objects. It is not present
--    in the draft.
-- 6. Everything else (added contracts columns, contract_pdf_signature_audits table shape and
--    constraints, contracts_pdf_signing_attempt_uidx, the audits table's RLS policy and
--    grants, and the function grant/revoke set) matches the draft.
--
-- Net effect: the draft is a pre-hardening revision. Production is safer. Do not apply the
-- draft to a fresh environment expecting parity with what is live.
-- ============================================================================
