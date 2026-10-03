-- Local draft only. Apply after hub_ui_texts.sql and integrated_contract_three_signatures_draft.sql.
begin;
alter table public.contracts add column if not exists pledge_required boolean not null default false;
-- Existing completed contracts retain their original content and completion state.
alter table public.contracts alter column pledge_required set default true;

create table if not exists public.contract_security_pledges (
  contract_id bigint primary key references public.contracts(id),
  user_id uuid not null references public.profiles(user_id),
  contract_signatures jsonb,
  pdf_coordinates jsonb,
  staged_at timestamptz,
  document jsonb not null,
  version text not null,
  signature_png text,
  read_confirmed boolean not null default false,
  rules_confirmed boolean not null default false,
  signed_at timestamptz
);
alter table public.contract_security_pledges
  add column if not exists pdf_validation jsonb,
  add column if not exists coordinate_corrections jsonb not null default '[]'::jsonb,
  add column if not exists pdf_attempt_corrections jsonb not null default '[]'::jsonb,
  add column if not exists signature_validation jsonb,
  add column if not exists signature_corrections jsonb not null default '[]'::jsonb;
alter table public.contract_security_pledges enable row level security;
revoke all on public.contract_security_pledges from public,anon,authenticated;
grant select on public.contract_security_pledges to authenticated,service_role;
drop policy if exists contract_security_pledges_read on public.contract_security_pledges;
create policy contract_security_pledges_read on public.contract_security_pledges for select to authenticated
  using (public.employee_hub_access_allowed() and (user_id=auth.uid() or public.my_role() in ('owner','chief','manager')));

create or replace function public.p9_pledge_document() returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare d jsonb; n integer;
begin
  select jsonb_object_agg(key,value) into d from public.hub_ui_texts where key like 'pledge.body.%' or key='pledge.signed_meta';
  for n in 1..14 loop
    if coalesce(d->>('pledge.body.clause.'||n),'')='' then raise exception 'pledge clause % missing',n; end if;
  end loop;
  if coalesce(d->>'pledge.body.rules','')='' or coalesce(d->>'pledge.body.title','')='' then raise exception 'pledge confirmation missing'; end if;
  return d;
end $$;
revoke all on function public.p9_pledge_document() from public,anon,authenticated;

create or replace function public.prepare_contract_security_pledge(p_contract_id bigint) returns public.contract_security_pledges
language plpgsql security definer set search_path=public,pg_temp as $$
declare c public.contracts; r public.contract_security_pledges; d jsonb;
begin
  if not public.employee_hub_access_allowed() then raise exception 'employee access required'; end if;
  select * into c from public.contracts where id=p_contract_id and user_id=auth.uid() for update;
  if not found or c.status not in ('대기','서명완료') then raise exception 'own contract required'; end if;
  if c.status='대기' and c.due_at<now() then raise exception 'contract expired'; end if;
  d:=public.p9_pledge_document();
  insert into public.contract_security_pledges(contract_id,user_id,document,version)
    values(c.id,c.user_id,d,md5(d::text)) on conflict(contract_id) do nothing;
  select * into r from public.contract_security_pledges where contract_id=c.id;
  return r;
end $$;
revoke all on function public.prepare_contract_security_pledge(bigint) from public,anon,authenticated;
grant execute on function public.prepare_contract_security_pledge(bigint) to authenticated;

-- Only Edge can attest that pdf-lib decoded the exact image. A browser cannot
-- manufacture this proof by calling submit, changing a setting, or updating RLS rows.
create or replace function public.validate_contract_security_pledge_signature(
  p_contract_id bigint,p_user_id uuid,p_signature_png text,p_version text,
  p_previous_signature_png text default null,p_previous_invalid boolean default false
) returns public.contract_security_pledges
language plpgsql security definer set search_path=public,pg_temp as $$
declare c public.contracts; r public.contract_security_pledges;
begin
  select * into c from public.contracts where id=p_contract_id and user_id=p_user_id for update;
  if not found or c.status not in ('대기','서명완료') or (c.status='대기' and c.due_at<now()) then raise exception 'own signable contract required'; end if;
  select * into r from public.contract_security_pledges where contract_id=p_contract_id and user_id=p_user_id for update;
  if not found or r.version is distinct from p_version then raise exception 'pledge version changed'; end if;
  if p_previous_invalid and (r.signed_at is null or r.signature_png is distinct from p_previous_signature_png) then raise exception 'signed pledge evidence changed'; end if;
  if coalesce(p_signature_png,'') !~ '^data:image/png;base64,[A-Za-z0-9+/]+={0,2}$' or length(p_signature_png)>700000 then raise exception 'invalid pledge PNG'; end if;
  update public.contract_security_pledges set signature_validation=jsonb_build_object(
    'at',now(),'signature_md5',md5(p_signature_png),'version',p_version,
    'previous_signature_md5',md5(p_previous_signature_png),'previous_invalid',p_previous_invalid)
    where contract_id=p_contract_id returning * into r;
  return r;
end $$;
revoke all on function public.validate_contract_security_pledge_signature(bigint,uuid,text,text,text,boolean) from public,anon,authenticated;
grant execute on function public.validate_contract_security_pledge_signature(bigint,uuid,text,text,text,boolean) to service_role;

-- A failed, unfinished PDF attempt may be reopened by its owner. Keep the signed
-- pledge and the complete old attempt in append-only correction history.
create or replace function public.recover_contract_pdf_signing_attempt(p_contract_id bigint,p_reason text)
returns public.contracts language plpgsql security definer set search_path=public,pg_temp as $$
declare c public.contracts; r public.contract_security_pledges; prior_mode text;
begin
  if not public.employee_hub_access_allowed() then raise exception 'employee access required'; end if;
  if nullif(btrim(p_reason),'') is null or length(p_reason)>500 then raise exception 'recovery reason required'; end if;
  select * into c from public.contracts where id=p_contract_id and user_id=auth.uid() for update;
  if not found or c.status<>'대기' or c.signed_at is not null or c.signed_pdf_path is not null or c.pdf_signed_at is not null then raise exception 'own unfinished PDF contract required'; end if;
  if c.pdf_signing_attempt_id is null then return c; end if;
  r:=public.prepare_contract_security_pledge(p_contract_id);
  update public.contract_security_pledges set pdf_attempt_corrections=pdf_attempt_corrections||jsonb_build_array(jsonb_build_object(
    'at',now(),'user_id',auth.uid(),'reason',p_reason,'attempt_id',c.pdf_signing_attempt_id,
    'started_at',c.pdf_signing_started_at,'signature_sha256',c.pdf_signing_signature_sha256,
    'page_no',c.pdf_signing_page_no,'x',c.pdf_signing_x,'y',c.pdf_signing_y,'width',c.pdf_signing_width,'height',c.pdf_signing_height)),
    pdf_validation=null where contract_id=p_contract_id;
  prior_mode:=current_setting('app.contract_pdf_mutation',true);
  perform set_config('app.contract_pdf_mutation','source_confirm',true);
  update public.contracts set pdf_signing_attempt_id=null,pdf_signing_started_at=null,pdf_signing_signature_sha256=null,
    pdf_signing_page_no=null,pdf_signing_x=null,pdf_signing_y=null,pdf_signing_width=null,pdf_signing_height=null
    where id=p_contract_id returning * into c;
  perform set_config('app.contract_pdf_mutation',coalesce(prior_mode,''),true);
  return c;
end $$;
revoke all on function public.recover_contract_pdf_signing_attempt(bigint,text) from public,anon,authenticated;
grant execute on function public.recover_contract_pdf_signing_attempt(bigint,text) to authenticated;

-- Replace only an image which Edge has independently proved cannot be decoded.
-- Preserve the original signed record (including the image), its hash and reason.
create or replace function public.recover_contract_security_pledge(p_contract_id bigint,p_reason text)
returns public.contract_security_pledges language plpgsql security definer set search_path=public,pg_temp as $$
declare c public.contracts; r public.contract_security_pledges;
begin
  if not public.employee_hub_access_allowed() then raise exception 'employee access required'; end if;
  if nullif(btrim(p_reason),'') is null or length(p_reason)>500 then raise exception 'recovery reason required'; end if;
  select * into c from public.contracts where id=p_contract_id and user_id=auth.uid() for update;
  if not found or c.status not in ('대기','서명완료') or (c.status='서명완료' and c.pledge_required) then raise exception 'own uncompleted pledge flow required'; end if;
  select * into r from public.contract_security_pledges where contract_id=p_contract_id and user_id=auth.uid() for update;
  if not found or r.signed_at is null or r.signature_validation->>'previous_invalid' is distinct from 'true'
    or r.signature_validation->>'previous_signature_md5' is distinct from md5(r.signature_png) then raise exception 'invalid signed pledge validation required'; end if;
  if c.pdf_signing_attempt_id is not null then perform public.recover_contract_pdf_signing_attempt(p_contract_id,p_reason); end if;
  update public.contract_security_pledges set signature_corrections=signature_corrections||jsonb_build_array(jsonb_build_object(
    'at',now(),'user_id',auth.uid(),'reason',p_reason,'previous_hash',md5(r.signature_png),'previous_signed_at',r.signed_at,
    'evidence',to_jsonb(r)-array['signature_corrections','pdf_attempt_corrections','coordinate_corrections','signature_validation'])),
    signature_png=null,signed_at=null,read_confirmed=false,rules_confirmed=false,
    contract_signatures=null,staged_at=null,pdf_coordinates=null,pdf_validation=null
    where contract_id=p_contract_id returning * into r;
  return r;
end $$;
revoke all on function public.recover_contract_security_pledge(bigint,text) from public,anon,authenticated;
grant execute on function public.recover_contract_security_pledge(bigint,text) to authenticated;

create or replace function public.stage_contract_pledge_signatures(p_contract_id bigint,p_signatures jsonb,p_coordinates jsonb default null)
returns public.contract_security_pledges language plpgsql security definer set search_path=public,pg_temp as $$
declare c public.contracts; r public.contract_security_pledges; part text; item jsonb; coord jsonb; b bytea; sid bigint; parts text[]; html text; slots jsonb; signed_time timestamptz;
begin
  r:=public.prepare_contract_security_pledge(p_contract_id);
  select * into c from public.contracts where id=p_contract_id and user_id=auth.uid() for update;
  if c.status<>'대기' or c.due_at<now() then raise exception 'contract is not signable'; end if;
  if r.signed_at is null or not r.read_confirmed or not r.rules_confirmed then raise exception 'signed security pledge and confirmations required'; end if;
  if c.pdf_signing_attempt_id is not null then
    if r.contract_signatures is not distinct from p_signatures and r.pdf_coordinates is not distinct from p_coordinates then return r; end if;
    raise exception 'PDF signing already started; signatures and coordinates are locked';
  end if;
  parts:=case when c.integrated_signature_required then array['employment','medical','privacy'] else array['employment'] end;
  if jsonb_typeof(p_signatures) is distinct from 'array' or jsonb_array_length(p_signatures)<>cardinality(parts) then raise exception 'one or three signatures required for contract kind'; end if;
  foreach part in array parts loop
    select value into item from jsonb_array_elements(p_signatures) where value->>'part'=part;
    if not found or (select count(*) from jsonb_array_elements(p_signatures) where value->>'part'=part)<>1 or item->>'confirmed' is distinct from 'true' then raise exception 'one confirmed signature per part required'; end if;
    if coalesce(item->>'signature_png','') !~ '^data:image/png;base64,[A-Za-z0-9+/]+={0,2}$' or length(item->>'signature_png')>1400000 then raise exception 'invalid PNG signature'; end if;
    b:=decode(substr(item->>'signature_png',23),'base64');
    if octet_length(b)<100 or octet_length(b)>1048576 or substring(b from 1 for 8)<>decode('89504e470d0a1a0a','hex') then raise exception 'invalid PNG bytes'; end if;
    sid:=nullif(item->>'signature_id','')::bigint;
    if sid is not null and not exists(select 1 from public.employee_signature_vault where id=sid and user_id=auth.uid() and revoked_at is null) then raise exception 'stored signature unavailable'; end if;
  end loop;
  if c.source_pdf_path is not null and (jsonb_typeof(p_coordinates) is distinct from 'array' or jsonb_array_length(p_coordinates)<>cardinality(parts)) then raise exception 'one or three PDF coordinates required for contract kind'; end if;
  if c.source_pdf_path is not null then
    foreach part in array parts loop
      select value into coord from jsonb_array_elements(p_coordinates) where value->>'part'=part;
      if not found or (select count(*) from jsonb_array_elements(p_coordinates) where value->>'part'=part)<>1
        or coalesce(coord->>'page_no','') !~ '^[1-9][0-9]*$'
        or coalesce((coord->>'x')::numeric,-1)<0 or coalesce((coord->>'y')::numeric,-1)<0
        or coalesce((coord->>'width')::numeric,0)<=0 or (coord->>'width')::numeric>1200
        or coalesce((coord->>'height')::numeric,0)<=0 or (coord->>'height')::numeric>800 then
        raise exception 'valid unique PDF coordinate per part required';
      end if;
    end loop;
  end if;
  update public.contract_security_pledges set contract_signatures=p_signatures,
    coordinate_corrections=case when pdf_coordinates is not null and pdf_coordinates is distinct from p_coordinates then
      coordinate_corrections||jsonb_build_array(jsonb_build_object('at',now(),'user_id',auth.uid(),'before',pdf_coordinates,'after',p_coordinates)) else coordinate_corrections end,
    pdf_coordinates=p_coordinates,staged_at=now(),pdf_validation=null
    where contract_id=p_contract_id returning * into r;
  -- The final contract signature completes HTML contracts; PDF contracts finish in Edge.
  if c.source_pdf_path is null then
    signed_time:=r.staged_at;
    if c.integrated_signature_required then
      perform public.apply_integrated_contract_signatures(p_contract_id,p_signatures);
    else
      item:=p_signatures->0;
      if c.merged_html !~* $slot$<span\M[^>]*\mdata-sign-slot\s*=\s*("employee"|'employee')[^>]*>.*?</span>$slot$ then raise exception 'employee signature slot missing'; end if;
      html:=regexp_replace(c.merged_html,$slot$<span\M[^>]*\mdata-sign-slot\s*=\s*("employee"|'employee')[^>]*>.*?</span>$slot$,
        '<img src="'||(item->>'signature_png')||'" alt="employee" style="height:60px"> <span>'||signed_time::text||'</span>','i');
      select coalesce(jsonb_agg(case when value->>'who'='employee' then value||jsonb_build_object('signed',true,'signed_at',signed_time) else value end),'[]'::jsonb)
        into slots from jsonb_array_elements(coalesce(c.sign_slots,'[]'::jsonb));
      perform public.apply_employee_contract_signature(p_contract_id,html,slots,signed_time,nullif(item->>'signature_id','')::bigint);
    end if;
  end if;
  return r;
end $$;
revoke all on function public.stage_contract_pledge_signatures(bigint,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.stage_contract_pledge_signatures(bigint,jsonb,jsonb) to authenticated;

-- Only card metadata; the contracts SELECT policy and old contract body access stay unchanged.
drop function if exists public.get_my_contract_security_pledges();
create function public.get_my_contract_security_pledges()
returns table(contract_id bigint,staged_at timestamptz,signed_at timestamptz,contract_signable boolean,contract_status text)
language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if not public.employee_hub_access_allowed() then raise exception 'employee access required'; end if;
  return query select c.id,p.staged_at,p.signed_at,(c.status='대기' and (c.due_at is null or c.due_at>=now()) and p.signed_at is not null and p.read_confirmed and p.rules_confirmed),c.status from public.contracts c
    left join public.contract_security_pledges p on p.contract_id=c.id and p.user_id=auth.uid()
    where c.user_id=auth.uid() and c.status in ('대기','서명완료') order by c.id desc;
end $$;
revoke all on function public.get_my_contract_security_pledges() from public,anon,authenticated;
grant execute on function public.get_my_contract_security_pledges() to authenticated;

-- Edge calls this only after loading the real source PDF and embedding every PNG.
-- Coordinates may be corrected without replacing the signed pledge evidence.
drop function if exists public.validate_contract_pledge_pdf(bigint,uuid,jsonb,jsonb,text,text);
create or replace function public.validate_contract_pledge_pdf(
  p_contract_id bigint,p_user_id uuid,p_signatures jsonb,p_coordinates jsonb,p_source_sha256 text,p_pledge_signature_png text,p_signature_sha256 text
) returns public.contract_security_pledges
language plpgsql security definer set search_path=public,pg_temp as $$
declare c public.contracts; r public.contract_security_pledges;
begin
  select * into c from public.contracts where id=p_contract_id and user_id=p_user_id for update;
  if not found or c.status<>'대기' or c.due_at<now() or c.source_pdf_path is null
    or c.source_pdf_sha256 is distinct from p_source_sha256 then raise exception 'contract PDF is not signable'; end if;
  select * into r from public.contract_security_pledges where contract_id=p_contract_id and user_id=p_user_id for update;
  if not found or r.signed_at is null or not r.read_confirmed or not r.rules_confirmed then raise exception 'signed security pledge and confirmations required'; end if;
  if r.staged_at is null or r.staged_at<r.signed_at or r.contract_signatures is distinct from p_signatures or r.signature_png is distinct from p_pledge_signature_png then raise exception 'staged contract signatures differ'; end if;
  if c.pdf_signing_attempt_id is not null and r.pdf_coordinates is distinct from p_coordinates then raise exception 'PDF signing already started; coordinates are locked'; end if;
  if p_signature_sha256 is null or p_signature_sha256 !~ '^[0-9a-f]{64}$' then raise exception 'validated signature hash required'; end if;
  update public.contract_security_pledges set
    coordinate_corrections=case when pdf_coordinates is distinct from p_coordinates then
      coordinate_corrections||jsonb_build_array(jsonb_build_object('at',now(),'user_id',p_user_id,'before',pdf_coordinates,'after',p_coordinates)) else coordinate_corrections end,
    pdf_coordinates=p_coordinates,
    pdf_validation=jsonb_build_object('at',now(),'source_sha256',p_source_sha256,'signatures',p_signatures,'coordinates',p_coordinates,'pledge_signature_md5',md5(p_pledge_signature_png),'signature_sha256',p_signature_sha256)
    where contract_id=p_contract_id returning * into r;
  return r;
end $$;
revoke all on function public.validate_contract_pledge_pdf(bigint,uuid,jsonb,jsonb,text,text,text) from public,anon,authenticated;
grant execute on function public.validate_contract_pledge_pdf(bigint,uuid,jsonb,jsonb,text,text,text) to service_role;

-- Keep the actual installed definitions for a reversible local/operational rollback.
create table if not exists public.p9_contract_pdf_function_backups(function_name text primary key,definition text not null);
revoke all on public.p9_contract_pdf_function_backups from public,anon,authenticated;
insert into public.p9_contract_pdf_function_backups(function_name,definition)
  select p.proname,pg_get_functiondef(p.oid) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname in ('begin_contract_pdf_signing','confirm_contract_pdf_source','record_contract_pdf_signature')
  on conflict(function_name) do nothing;

create or replace function public.begin_contract_pdf_signing(p_contract_id bigint,p_signature_sha256 text,p_page_no integer,p_x numeric,p_y numeric,p_width numeric,p_height numeric)
returns public.contracts language plpgsql security definer set search_path=public,pg_temp as $$
declare c public.contracts; r public.contract_security_pledges; prior_mode text;
begin
  if not public.employee_hub_access_allowed() or public.my_role() not in ('owner','chief','manager','staff','vice') then raise exception 'active approved employee profile required'; end if;
  if p_signature_sha256 is null or p_signature_sha256 !~ '^[0-9a-f]{64}$' or p_page_no is null or p_page_no<1 or p_x is null or p_y is null or p_width is null or p_height is null or p_x<0 or p_y<0 or p_width<=0 or p_height<=0 or p_width>1200 or p_height>800 then raise exception 'invalid contract PDF signing payload'; end if;
  select * into c from public.contracts where id=p_contract_id and user_id=auth.uid() for update;
  if not found then raise exception 'contract PDF access denied'; end if;
  if c.status='서명완료' and c.signed_pdf_path is not null then return c; end if;
  if c.status<>'대기' or c.sent_at is null or c.due_at is null or c.due_at<now() or c.signed_at is not null or c.source_pdf_path is distinct from format('contracts/%s/source.pdf',p_contract_id) or c.source_pdf_sha256 is null or nullif(btrim(c.source_pdf_version),'') is null or c.source_pdf_confirmed_at is null then raise exception 'contract PDF is not ready for signing'; end if;
  if c.pledge_required then
    select * into r from public.contract_security_pledges where contract_id=p_contract_id and user_id=auth.uid();
    if not found or r.signed_at is null or not r.read_confirmed or not r.rules_confirmed or r.staged_at is null or r.staged_at<r.signed_at then raise exception 'signed security pledge and confirmations required'; end if;
    if r.pdf_validation->>'signature_sha256' is distinct from p_signature_sha256 then raise exception 'server validated PDF signature required'; end if;
  end if;
  if c.pdf_signing_attempt_id is not null and (c.pdf_signing_signature_sha256 is distinct from p_signature_sha256 or c.pdf_signing_page_no is distinct from p_page_no or c.pdf_signing_x is distinct from p_x or c.pdf_signing_y is distinct from p_y or c.pdf_signing_width is distinct from p_width or c.pdf_signing_height is distinct from p_height) then raise exception 'contract PDF signing payload mismatch'; end if;
  if c.pdf_signing_attempt_id is null then
    prior_mode:=current_setting('app.contract_pdf_mutation',true);
    perform set_config('app.contract_pdf_mutation','source_confirm',true);
    update public.contracts set pdf_signing_attempt_id=gen_random_uuid(),pdf_signing_started_at=now(),pdf_signing_signature_sha256=p_signature_sha256,
      pdf_signing_page_no=p_page_no,pdf_signing_x=p_x,pdf_signing_y=p_y,pdf_signing_width=p_width,pdf_signing_height=p_height
      where id=p_contract_id returning * into c;
    perform set_config('app.contract_pdf_mutation',coalesce(prior_mode,''),true);
  end if;
  return c;
end $$;
revoke all on function public.begin_contract_pdf_signing(bigint,text,integer,numeric,numeric,numeric,numeric) from public,anon,authenticated;
grant execute on function public.begin_contract_pdf_signing(bigint,text,integer,numeric,numeric,numeric,numeric) to authenticated;

create or replace function public.confirm_contract_pdf_source(p_contract_id bigint)
returns public.contracts language plpgsql security definer set search_path=public,pg_temp as $$
declare c public.contracts; prior_mode text;
begin
  if not public.employee_hub_access_allowed() or public.my_role() not in ('owner','chief','manager','staff','vice') then raise exception 'active approved employee profile required'; end if;
  select * into c from public.contracts where id=p_contract_id and user_id=auth.uid() for update;
  if not found then raise exception 'contract PDF confirmation access denied'; end if;
  if c.status<>'대기' or c.sent_at is null or c.due_at is null or c.due_at<now() or c.source_pdf_path is distinct from format('contracts/%s/source.pdf',p_contract_id) or nullif(btrim(c.source_pdf_version),'') is null or c.source_pdf_sha256 is null or c.signed_at is not null then raise exception 'contract PDF is not confirmable'; end if;
  if c.source_pdf_confirmed_at is not null then return c; end if;
  prior_mode:=current_setting('app.contract_pdf_mutation',true);
  perform set_config('app.contract_pdf_mutation','source_confirm',true);
  update public.contracts set source_pdf_confirmed_at=now() where id=p_contract_id returning * into c;
  perform set_config('app.contract_pdf_mutation',coalesce(prior_mode,''),true);
  insert into public.contract_pdf_signature_audits(contract_id,user_id,action,source_sha256) values(p_contract_id,auth.uid(),'employee_confirmed',c.source_pdf_sha256);
  return c;
end $$;
revoke all on function public.confirm_contract_pdf_source(bigint) from public,anon,authenticated;
grant execute on function public.confirm_contract_pdf_source(bigint) to authenticated;

-- Preserve production's final-send, identity, attempt and payload checks, while
-- matching the current employee role vocabulary through the final PDF record.
create or replace function public.record_contract_pdf_signature(
  p_contract_id bigint,p_user_id uuid,p_attempt_id uuid,p_source_sha256 text,p_signed_path text,p_signed_sha256 text,p_signature_sha256 text,
  p_page_no integer,p_x numeric,p_y numeric,p_width numeric,p_height numeric
) returns public.contracts language plpgsql security definer set search_path=public,pg_temp as $$
declare c public.contracts; prior_mode text;
begin
  if p_contract_id is null or p_user_id is null or p_attempt_id is null or p_source_sha256 is null or p_source_sha256 !~ '^[0-9a-f]{64}$' or p_signed_sha256 is null or p_signed_sha256 !~ '^[0-9a-f]{64}$' or p_signature_sha256 is null or p_signature_sha256 !~ '^[0-9a-f]{64}$' or p_page_no is null or p_page_no<1 or p_x is null or p_y is null or p_width is null or p_height is null or p_x<0 or p_y<0 or p_width<=0 or p_height<=0 then raise exception 'invalid contract PDF signature metadata'; end if;
  if not exists(select 1 from public.profiles where user_id=p_user_id and active=true and approved=true and role in ('owner','chief','manager','staff','vice')) then raise exception 'active approved employee profile required'; end if;
  select * into c from public.contracts where id=p_contract_id for update;
  if not found then raise exception 'contract not found'; end if;
  if c.user_id is distinct from p_user_id or c.source_pdf_sha256 is distinct from p_source_sha256 or c.source_pdf_path is distinct from format('contracts/%s/source.pdf',p_contract_id) or nullif(btrim(c.source_pdf_version),'') is null then raise exception 'contract PDF identity mismatch'; end if;
  if c.source_pdf_confirmed_at is null or c.sent_at is null or c.due_at is null or c.due_at<now() then raise exception 'contract PDF was not confirmed, finally sent, or is expired'; end if;
  if p_signed_path is null or p_signed_path is distinct from format('contracts/%s/signed.pdf',p_contract_id) then raise exception 'invalid signed PDF path'; end if;
  if c.pdf_signing_attempt_id is distinct from p_attempt_id then raise exception 'contract PDF signing attempt mismatch'; end if;
  if c.pdf_signing_signature_sha256 is distinct from p_signature_sha256 or c.pdf_signing_page_no is distinct from p_page_no or c.pdf_signing_x is distinct from p_x or c.pdf_signing_y is distinct from p_y or c.pdf_signing_width is distinct from p_width or c.pdf_signing_height is distinct from p_height then raise exception 'contract PDF signing payload mismatch'; end if;
  if c.status='서명완료' and c.signed_pdf_path=p_signed_path and c.signed_pdf_sha256=p_signed_sha256 then return c; end if;
  if c.status<>'대기' or c.signed_at is not null or c.signed_pdf_path is not null then raise exception 'contract PDF is immutable or not signable'; end if;
  prior_mode:=current_setting('app.contract_pdf_mutation',true);
  perform set_config('app.contract_pdf_mutation','pdf_record',true);
  update public.contracts set signed_pdf_path=p_signed_path,signed_pdf_sha256=p_signed_sha256,pdf_signed_at=now(),signed_at=now(),status='서명완료' where id=p_contract_id returning * into c;
  -- The integrated wrapper still updates its three sign_slots in this transaction.
  -- Direct browser UPDATE remains blocked by the invoker-aware P9 trigger.
  insert into public.contract_pdf_signature_audits(contract_id,user_id,action,source_sha256,signed_sha256,signature_sha256,page_no,x,y,width,height)
    values(p_contract_id,p_user_id,'signed_pdf_created',p_source_sha256,p_signed_sha256,p_signature_sha256,p_page_no,p_x,p_y,p_width,p_height);
  return c;
end $$;
revoke all on function public.record_contract_pdf_signature(bigint,uuid,uuid,text,text,text,text,integer,numeric,numeric,numeric,numeric) from public,anon,authenticated;
grant execute on function public.record_contract_pdf_signature(bigint,uuid,uuid,text,text,text,text,integer,numeric,numeric,numeric,numeric) to service_role;

create or replace function public.p9_pledge_html(p_pledge public.contract_security_pledges) returns text
language plpgsql immutable set search_path=public,pg_temp as $$
declare out_html text; item text; n integer;
begin
  out_html:='<section class="contract-part" data-contract-part="security-pledge"><h2>'||replace(replace(replace(p_pledge.document->>'pledge.body.title','&','&amp;'),'<','&lt;'),'>','&gt;')||'</h2><ol>';
  for n in 1..14 loop
    item:=p_pledge.document->>('pledge.body.clause.'||n);
    out_html:=out_html||'<li>'||replace(replace(replace(item,'&','&amp;'),'<','&lt;'),'>','&gt;')||'</li>';
  end loop;
  return out_html||'</ol><p>'||replace(replace(replace(p_pledge.document->>'pledge.body.rules','&','&amp;'),'<','&lt;'),'>','&gt;')||'</p><img src="'||p_pledge.signature_png||'" alt="보안서약 서명" style="height:60px"><p>'||p_pledge.signed_at::text||' · '||p_pledge.version||'</p></section>';
end $$;
revoke all on function public.p9_pledge_html(public.contract_security_pledges) from public,anon,authenticated;

create or replace function public.submit_contract_security_pledge(p_contract_id bigint,p_signature_png text,p_read_confirmed boolean,p_rules_confirmed boolean,p_version text)
returns public.contract_security_pledges language plpgsql security definer set search_path=public,pg_temp as $$
declare c public.contracts; r public.contract_security_pledges; b bytea;
begin
  if not public.employee_hub_access_allowed() then raise exception 'employee access required'; end if;
  select * into c from public.contracts where id=p_contract_id and user_id=auth.uid() for update;
  if not found or c.status not in ('대기','서명완료') then raise exception 'own contract required'; end if;
  select * into r from public.contract_security_pledges where contract_id=p_contract_id and user_id=auth.uid() for update;
  if not found or r.version is distinct from p_version then raise exception 'pledge version changed'; end if;
  if c.status='대기' and c.due_at<now() then raise exception 'contract expired'; end if;
  if r.signed_at is not null then return r; end if;
  if p_read_confirmed is distinct from true or p_rules_confirmed is distinct from true then raise exception 'both pledge confirmations required'; end if;
  if r.signature_validation->>'signature_md5' is distinct from md5(p_signature_png)
    or r.signature_validation->>'version' is distinct from p_version
    or (r.signature_validation->>'at')::timestamptz<now()-interval '10 minutes' then raise exception 'server validated pledge PNG required'; end if;
  if coalesce(p_signature_png,'') !~ '^data:image/png;base64,[A-Za-z0-9+/]+={0,2}$' or length(p_signature_png)>1400000 then raise exception 'invalid pledge PNG'; end if;
  b:=decode(substr(p_signature_png,23),'base64');
  if octet_length(b)<33 or octet_length(b)>524288 or substring(b from 1 for 8)<>decode('89504e470d0a1a0a','hex') then raise exception 'invalid pledge PNG bytes'; end if;
  update public.contract_security_pledges set signature_png=p_signature_png,read_confirmed=true,rules_confirmed=true,signed_at=now(),staged_at=null,pdf_validation=null
    where contract_id=p_contract_id returning * into r;
  -- Preserve evidence only. Contract signatures are collected afterward.
  return r;
end $$;
revoke all on function public.submit_contract_security_pledge(bigint,text,boolean,boolean,text) from public,anon,authenticated;
grant execute on function public.submit_contract_security_pledge(bigint,text,boolean,boolean,text) to authenticated;

create or replace function public.p9_guard_contract_pledge() returns trigger
-- Invoker identity distinguishes direct browser UPDATE from a SECURITY DEFINER
-- signing RPC. Client-set GUCs cannot impersonate the RPC owner.
language plpgsql security invoker set search_path=public,pg_temp as $$
declare r public.contract_security_pledges; medical_start integer;
begin
  if tg_op='INSERT' then
    if not new.pledge_required or new.status='서명완료' or new.signed_pdf_path is not null then raise exception 'new contract requires security pledge'; end if;
  else
    if current_user in ('authenticated','anon') and coalesce(public.my_role(),'') not in ('owner','chief','manager')
      and ((new.status='서명완료' and old.status is distinct from new.status) or exists(
        select 1 from unnest(array['merged_html','sign_slots','signed_at','source_pdf_path','source_pdf_sha256','source_pdf_version',
          'source_pdf_registered_at','source_pdf_registered_by','source_pdf_confirmed_at','pdf_signing_attempt_id','pdf_signing_started_at',
          'pdf_signing_signature_sha256','pdf_signing_page_no','pdf_signing_x','pdf_signing_y','pdf_signing_width','pdf_signing_height',
          'signed_pdf_path','signed_pdf_sha256','pdf_signed_at']) k where to_jsonb(new)->k is distinct from to_jsonb(old)->k)) then
      raise exception 'contract body and signatures require signature RPC';
    end if;
    if old.pledge_required and not new.pledge_required then raise exception 'pledge requirement is immutable'; end if;
    if old.pledge_required and ((new.status='서명완료' and old.status<>'서명완료') or (new.signed_pdf_path is not null and old.signed_pdf_path is null) or (old.pdf_signing_attempt_id is null and new.pdf_signing_attempt_id is not null)) then
      select * into r from public.contract_security_pledges where contract_id=new.id and user_id=new.user_id;
      if not found or r.signed_at is null or not r.read_confirmed or not r.rules_confirmed or r.staged_at is null or r.staged_at<r.signed_at or jsonb_typeof(r.contract_signatures) is distinct from 'array' or jsonb_array_length(r.contract_signatures) is distinct from (case when old.integrated_signature_required then 3 else 1 end) then raise exception 'signed security pledge and confirmations required'; end if;
      if old.status='대기' and old.due_at<now() then raise exception 'contract expired'; end if;
      if old.pdf_signing_attempt_id is null and new.pdf_signing_attempt_id is not null then
        if r.pdf_validation is null or r.pdf_validation->>'source_sha256' is distinct from old.source_pdf_sha256
          or r.pdf_validation->>'signature_sha256' is distinct from new.pdf_signing_signature_sha256
          or r.pdf_validation->'signatures' is distinct from r.contract_signatures
          or r.pdf_validation->'coordinates' is distinct from r.pdf_coordinates
          or r.pdf_validation->>'pledge_signature_md5' is distinct from md5(r.signature_png)
          or not exists(select 1 from jsonb_array_elements(r.pdf_coordinates) coord where coord->>'part'='employment'
            and (coord->>'page_no')::integer=new.pdf_signing_page_no and (coord->>'x')::numeric=new.pdf_signing_x
            and (coord->>'y')::numeric=new.pdf_signing_y and (coord->>'width')::numeric=new.pdf_signing_width
            and (coord->>'height')::numeric=new.pdf_signing_height) then raise exception 'server validated PDF coordinates required'; end if;
      end if;
      if new.status='서명완료' and old.status<>'서명완료' and new.source_pdf_path is null then
        -- Existing integrated bodies put employment first. Move its entire body and signature last.
        medical_start:=strpos(new.merged_html,'<section class="contract-part" data-contract-part="medical"');
        if old.integrated_signature_required and medical_start>0 then
          new.merged_html:=substr(new.merged_html,medical_start)||substr(new.merged_html,1,medical_start-1);
        end if;
        new.merged_html:=public.p9_pledge_html(r)||new.merged_html;
      end if;
    end if;
  end if;
  return new;
end $$;
revoke all on function public.p9_guard_contract_pledge() from public,anon,authenticated;
drop trigger if exists p9_contract_pledge_guard on public.contracts;
create trigger p9_contract_pledge_guard before insert or update on public.contracts
  for each row execute function public.p9_guard_contract_pledge();
-- Run data changes after all ALTERs: existing deferred contract events must not precede DDL.
update public.contracts set pledge_required=true where status in ('대기','발송요청') and not pledge_required;
commit;
