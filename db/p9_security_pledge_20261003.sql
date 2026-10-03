-- Local draft only. Apply after hub_ui_texts.sql and integrated_contract_three_signatures_draft.sql.
begin;
alter table public.contracts add column if not exists pledge_required boolean not null default false;
-- Existing completed contracts retain their original content and completion state.
update public.contracts set pledge_required=true where status in ('대기','발송요청') and integrated_signature_required;
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
alter table public.contract_security_pledges enable row level security;
revoke all on public.contract_security_pledges from public,anon,authenticated;
grant select on public.contract_security_pledges to authenticated,service_role;
create policy contract_security_pledges_read on public.contract_security_pledges for select to authenticated
  using (public.employee_hub_access_allowed() and (user_id=auth.uid() or public.my_role() in ('owner','chief','manager')));

create function public.p9_pledge_document() returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare d jsonb; n integer;
begin
  select jsonb_object_agg(key,value) into d from public.hub_ui_texts where key like 'pledge.body.%';
  for n in 1..14 loop
    if coalesce(d->>('pledge.body.clause.'||n),'')='' then raise exception 'pledge clause % missing',n; end if;
  end loop;
  if coalesce(d->>'pledge.body.rules','')='' or coalesce(d->>'pledge.body.title','')='' then raise exception 'pledge confirmation missing'; end if;
  return d;
end $$;
revoke all on function public.p9_pledge_document() from public,anon,authenticated;

create function public.prepare_contract_security_pledge(p_contract_id bigint) returns public.contract_security_pledges
language plpgsql security definer set search_path=public,pg_temp as $$
declare c public.contracts; r public.contract_security_pledges; d jsonb;
begin
  if not public.employee_hub_access_allowed() then raise exception 'employee access required'; end if;
  select * into c from public.contracts where id=p_contract_id and user_id=auth.uid() for update;
  if not found or c.status not in ('대기','서명완료') then raise exception 'own contract required'; end if;
  d:=public.p9_pledge_document();
  insert into public.contract_security_pledges(contract_id,user_id,document,version)
    values(c.id,c.user_id,d,md5(d::text)) on conflict(contract_id) do nothing;
  select * into r from public.contract_security_pledges where contract_id=c.id;
  return r;
end $$;
revoke all on function public.prepare_contract_security_pledge(bigint) from public,anon,authenticated;
grant execute on function public.prepare_contract_security_pledge(bigint) to authenticated;

create function public.stage_contract_pledge_signatures(p_contract_id bigint,p_signatures jsonb,p_coordinates jsonb default null)
returns public.contract_security_pledges language plpgsql security definer set search_path=public,pg_temp as $$
declare c public.contracts; r public.contract_security_pledges; part text; item jsonb; b bytea; sid bigint;
begin
  r:=public.prepare_contract_security_pledge(p_contract_id);
  select * into c from public.contracts where id=p_contract_id and user_id=auth.uid() for update;
  if c.status<>'대기' or not c.integrated_signature_required or c.due_at<now() or r.signed_at is not null then raise exception 'contract is not signable'; end if;
  if jsonb_typeof(p_signatures) is distinct from 'array' or jsonb_array_length(p_signatures)<>3 then raise exception 'three signatures required'; end if;
  foreach part in array array['employment','medical','privacy'] loop
    select value into item from jsonb_array_elements(p_signatures) where value->>'part'=part;
    if not found or (select count(*) from jsonb_array_elements(p_signatures) where value->>'part'=part)<>1 or item->>'confirmed' is distinct from 'true' then raise exception 'one confirmed signature per part required'; end if;
    if coalesce(item->>'signature_png','') !~ '^data:image/png;base64,[A-Za-z0-9+/]+={0,2}$' or length(item->>'signature_png')>1400000 then raise exception 'invalid PNG signature'; end if;
    b:=decode(substr(item->>'signature_png',23),'base64');
    if octet_length(b)<100 or octet_length(b)>1048576 or substring(b from 1 for 8)<>decode('89504e470d0a1a0a','hex') then raise exception 'invalid PNG bytes'; end if;
    sid:=nullif(item->>'signature_id','')::bigint;
    if sid is not null and not exists(select 1 from public.employee_signature_vault where id=sid and user_id=auth.uid() and revoked_at is null) then raise exception 'stored signature unavailable'; end if;
  end loop;
  if c.source_pdf_path is not null and (jsonb_typeof(p_coordinates) is distinct from 'array' or jsonb_array_length(p_coordinates)<>3) then raise exception 'three PDF coordinates required'; end if;
  update public.contract_security_pledges set contract_signatures=p_signatures,pdf_coordinates=p_coordinates,staged_at=now()
    where contract_id=p_contract_id returning * into r;
  return r;
end $$;
revoke all on function public.stage_contract_pledge_signatures(bigint,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.stage_contract_pledge_signatures(bigint,jsonb,jsonb) to authenticated;

create function public.p9_pledge_html(p_pledge public.contract_security_pledges) returns text
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

create function public.submit_contract_security_pledge(p_contract_id bigint,p_signature_png text,p_read_confirmed boolean,p_rules_confirmed boolean,p_version text)
returns public.contract_security_pledges language plpgsql security definer set search_path=public,pg_temp as $$
declare c public.contracts; r public.contract_security_pledges; b bytea;
begin
  if not public.employee_hub_access_allowed() then raise exception 'employee access required'; end if;
  select * into c from public.contracts where id=p_contract_id and user_id=auth.uid() for update;
  if not found or c.status not in ('대기','서명완료') then raise exception 'own contract required'; end if;
  select * into r from public.contract_security_pledges where contract_id=p_contract_id and user_id=auth.uid() for update;
  if not found or r.version is distinct from p_version then raise exception 'pledge version changed'; end if;
  if r.signed_at is not null then return r; end if;
  if p_read_confirmed is distinct from true or p_rules_confirmed is distinct from true then raise exception 'both pledge confirmations required'; end if;
  if c.status='대기' and (c.due_at<now() or r.staged_at is null or jsonb_array_length(r.contract_signatures)<>3) then raise exception 'three contract signatures required before pledge'; end if;
  if coalesce(p_signature_png,'') !~ '^data:image/png;base64,[A-Za-z0-9+/]+={0,2}$' or length(p_signature_png)>1400000 then raise exception 'invalid pledge PNG'; end if;
  b:=decode(substr(p_signature_png,23),'base64');
  if octet_length(b)<100 or octet_length(b)>1048576 or substring(b from 1 for 8)<>decode('89504e470d0a1a0a','hex') then raise exception 'invalid pledge PNG bytes'; end if;
  update public.contract_security_pledges set signature_png=p_signature_png,read_confirmed=true,rules_confirmed=true,signed_at=now()
    where contract_id=p_contract_id returning * into r;
  -- PDF completion is performed by the existing server signer after this record commits.
  if c.status='대기' and c.source_pdf_path is null then
    perform public.apply_integrated_contract_signatures(p_contract_id,r.contract_signatures);
    update public.contracts set merged_html=merged_html||public.p9_pledge_html(r) where id=p_contract_id;
  end if;
  return r;
end $$;
revoke all on function public.submit_contract_security_pledge(bigint,text,boolean,boolean,text) from public,anon,authenticated;
grant execute on function public.submit_contract_security_pledge(bigint,text,boolean,boolean,text) to authenticated;

create function public.p9_guard_contract_pledge() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
declare r public.contract_security_pledges;
begin
  if tg_op='INSERT' then
    if not new.pledge_required or new.status='서명완료' or new.signed_pdf_path is not null then raise exception 'new contract requires security pledge'; end if;
  else
    if old.pledge_required and not new.pledge_required then raise exception 'pledge requirement is immutable'; end if;
    if old.pledge_required and ((new.status='서명완료' and old.status<>'서명완료') or (new.signed_pdf_path is not null and old.signed_pdf_path is null)) then
      select * into r from public.contract_security_pledges where contract_id=new.id and user_id=new.user_id;
      if not found or r.signed_at is null or not r.read_confirmed or not r.rules_confirmed or r.staged_at is null or jsonb_array_length(r.contract_signatures)<>3 then raise exception 'signed security pledge and confirmations required'; end if;
    end if;
  end if;
  return new;
end $$;
revoke all on function public.p9_guard_contract_pledge() from public,anon,authenticated;
create trigger p9_contract_pledge_guard before insert or update on public.contracts
  for each row execute function public.p9_guard_contract_pledge();
commit;
