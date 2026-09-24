-- 로컬 초안. 운영 적용 전 승인·프로필 스키마를 확인한다.
-- 발급본은 결재 완료 시점의 확인된 프로필 필드만 보관한다.
create table if not exists public.employment_certificates (
  id bigint generated always as identity primary key,
  approval_doc_id bigint not null unique references public.approval_docs(id),
  employee_id uuid not null references public.profiles(user_id),
  employee_name text not null,
  department text,
  hire_date date not null,
  issuer_name text not null default '아산정플란트치과의원',
  issued_html text not null,
  issued_at timestamptz not null default now(),
  issued_by uuid not null references public.profiles(user_id)
);
create or replace function public.employment_certificate_escape(p_value text)
returns text language sql immutable set search_path='' as $$
  select pg_catalog.replace(pg_catalog.replace(pg_catalog.replace(pg_catalog.replace(pg_catalog.replace(
    coalesce(p_value,''),'&','&amp;'),'<','&lt;'),'>','&gt;'),'"','&quot;'),'''','&#39;')
$$;
alter table public.employment_certificates enable row level security;
revoke all on public.employment_certificates from public,anon,authenticated;
grant select on public.employment_certificates to authenticated;
create policy employment_certificates_read on public.employment_certificates
  for select to authenticated using (
    exists (
      select 1 from public.profiles viewer
      where viewer.user_id=auth.uid() and viewer.active=true and viewer.approved=true
        and (employee_id=auth.uid() or viewer.role in ('chief','owner'))
    )
  );

create or replace function public.issue_employment_certificate(p_doc_id bigint)
returns public.employment_certificates
language plpgsql security definer set search_path='' as $$
declare
  d public.approval_docs%rowtype;
  p public.profiles%rowtype;
  certificate public.employment_certificates%rowtype;
  owner_step_id bigint;
  issued_date date;
  issued_html text;
begin
  if auth.uid() is null or not exists (
    select 1 from public.profiles actor
    where actor.user_id=auth.uid() and actor.role='owner'
      and actor.active=true and actor.approved=true
  ) then raise exception 'owner approval required'; end if;
  select * into d from public.approval_docs where id=p_doc_id for update;
  if not found or d.kind<>'기타' or d.title not like '[재직증명서 발급] %'
     or d.body not like '[재직증명서 발급 요청]%' then
    raise exception 'employment certificate request required';
  end if;
  if d.status='완결' then
    select * into certificate from public.employment_certificates where approval_doc_id=p_doc_id;
    if found then return certificate; end if;
    raise exception 'completed request has no issued certificate';
  end if;
  if d.status<>'진행' then raise exception 'request is not pending'; end if;
  if (select count(*) from public.approval_steps where doc_id=p_doc_id)<>2
     or not exists (
       select 1 from public.approval_steps
       where doc_id=p_doc_id and seq=1 and approver_role='chief'
         and status='승인' and approver_id is not null and acted_at is not null
     ) then raise exception 'chief approval required'; end if;
  select id into owner_step_id from public.approval_steps
    where doc_id=p_doc_id and seq=2 and approver_role='owner' and status='대기';
  if owner_step_id is null then raise exception 'owner step required'; end if;
  select * into p from public.profiles where user_id=d.author for update;
  if not found or p.active is distinct from true or p.approved is distinct from true
     or p.employment_status<>'재직' or nullif(btrim(p.name),'') is null
     or p.hire_date is null or p.hire_date>(now() at time zone 'Asia/Seoul')::date then
    raise exception 'verified current employment data required';
  end if;
  update public.approval_steps set status='승인',approver_id=auth.uid(),
    stamp=(select name from public.profiles where user_id=auth.uid()),acted_at=now()
    where id=owner_step_id;
  update public.approval_docs set status='완결' where id=p_doc_id;
  issued_date:=(now() at time zone 'Asia/Seoul')::date;
  issued_html:=pg_catalog.format(
    '<div style="background:#fff;color:#111;padding:18mm;min-height:240mm;line-height:1.8"><h1 style="text-align:center;margin:12mm 0 24mm">재 직 증 명 서</h1><table style="width:100%%;border-collapse:collapse"><tr><th style="border:1px solid #111;padding:8px;width:25%%">성명</th><td style="border:1px solid #111;padding:8px">%s</td></tr><tr><th style="border:1px solid #111;padding:8px">소속</th><td style="border:1px solid #111;padding:8px">%s</td></tr><tr><th style="border:1px solid #111;padding:8px">입사일</th><td style="border:1px solid #111;padding:8px">%s</td></tr><tr><th style="border:1px solid #111;padding:8px">재직 확인일</th><td style="border:1px solid #111;padding:8px">%s</td></tr></table><p style="margin-top:24mm;text-align:center">위 사람은 발급일 현재 재직 중임을 확인합니다.</p><p style="margin-top:22mm;text-align:center">%s</p><p style="margin-top:14mm;text-align:right">아산정플란트치과의원</p><p style="margin-top:20mm;font-size:11px">결재문서 %s</p></div>',
    public.employment_certificate_escape(p.name),
    public.employment_certificate_escape(coalesce(nullif(pg_catalog.btrim(p.dept),''),'확인된 정보 없음')),
    p.hire_date::text,issued_date::text,issued_date::text,p_doc_id::text
  );
  insert into public.employment_certificates
    (approval_doc_id,employee_id,employee_name,department,hire_date,issued_html,issued_by)
  values (p_doc_id,p.user_id,p.name,nullif(btrim(p.dept),''),p.hire_date,issued_html,auth.uid())
  returning * into certificate;
  return certificate;
end; $$;
revoke all on function public.issue_employment_certificate(bigint) from public,anon;
grant execute on function public.issue_employment_certificate(bigint) to authenticated;
