begin;

alter table public.attendance_issues add column if not exists staff_kind text;
alter table public.attendance_issues add column if not exists staff_reason text;
alter table public.attendance_issues add column if not exists staff_responded_at timestamptz;

do $$ begin
  if not exists(select 1 from pg_constraint where conrelid='public.attendance_issues'::regclass and conname='attendance_issues_staff_kind_check') then
    alter table public.attendance_issues add constraint attendance_issues_staff_kind_check check (staff_kind is null or staff_kind in ('지문인식오류','입력오류','기타'));
  end if;
  if not exists(select 1 from pg_constraint where conrelid='public.attendance_issues'::regclass and conname='attendance_issues_staff_reason_check') then
    alter table public.attendance_issues add constraint attendance_issues_staff_reason_check check (staff_reason is null or char_length(btrim(staff_reason)) between 1 and 2000);
  end if;
end $$;

create table if not exists public.attendance_issue_evidence (
  id bigint generated always as identity primary key,
  issue_id bigint not null references public.attendance_issues(id) on delete restrict,
  storage_path text not null unique,
  original_name text not null check (char_length(btrim(original_name)) between 1 and 200),
  mime_type text not null check (mime_type in ('image/jpeg','image/png','image/webp','application/pdf')),
  size_bytes bigint not null check (size_bytes between 1 and 10485760),
  uploaded_at timestamptz not null default now()
);
create index if not exists attendance_issue_evidence_issue_idx on public.attendance_issue_evidence(issue_id);
alter table public.attendance_issue_evidence enable row level security;
revoke all on table public.attendance_issue_evidence from public,anon,authenticated;
grant select on table public.attendance_issue_evidence to authenticated;
drop policy if exists attendance_issue_evidence_select_scoped on public.attendance_issue_evidence;
create policy attendance_issue_evidence_select_scoped on public.attendance_issue_evidence for select to authenticated using (
  public.employee_hub_access_allowed() and exists(
    select 1 from public.attendance_issues i where i.id=issue_id and (i.user_id=auth.uid() or public.my_role() in ('chief','owner'))
  )
);
drop policy if exists attendance_issue_evidence_deputy_block on public.attendance_issue_evidence;
create policy attendance_issue_evidence_deputy_block on public.attendance_issue_evidence as restrictive for all to authenticated using (public.my_role()<>'deputy') with check (public.my_role()<>'deputy');

create or replace function public.submit_attendance_issue_v2(p_work_date date,p_kind text,p_reason text)
returns public.attendance_issues language plpgsql security definer set search_path=public,pg_temp as $$
declare v_issue public.attendance_issues;v_reason text:=btrim(coalesce(p_reason,''));
begin
  if auth.uid() is null or not public.employee_hub_access_allowed() or public.my_role()='deputy'
    or not exists(select 1 from public.profiles p where p.user_id=auth.uid() and p.active and p.approved and p.account_access_status='활성') then raise exception 'attendance issue submission not allowed'; end if;
  if p_work_date is null or p_work_date>(now() at time zone 'Asia/Seoul')::date+1 then raise exception 'attendance issue date invalid'; end if;
  if p_kind is null or p_kind not in ('지문인식오류','입력오류','기타') or char_length(v_reason) not between 1 and 2000 then raise exception 'attendance issue fields invalid'; end if;
  insert into public.attendance_issues(user_id,work_date,type,rule_label,reason,staff_kind,staff_reason,staff_responded_at)
  values(auth.uid(),p_work_date,'정정',p_kind,v_reason,p_kind,v_reason,now()) returning * into v_issue;
  return v_issue;
end $$;

create or replace function public.respond_attendance_issue(p_id bigint,p_kind text,p_reason text)
returns public.attendance_issues language plpgsql security definer set search_path=public,pg_temp as $$
declare v_issue public.attendance_issues;v_reason text:=btrim(coalesce(p_reason,''));
begin
  if auth.uid() is null or not public.employee_hub_access_allowed() or public.my_role()='deputy'
    or not exists(select 1 from public.profiles p where p.user_id=auth.uid() and p.active and p.approved and p.account_access_status='활성') then raise exception 'attendance issue response not allowed'; end if;
  if p_kind is null or p_kind not in ('지문인식오류','입력오류','기타') or char_length(v_reason) not between 1 and 2000 then raise exception 'attendance issue response fields invalid'; end if;
  select * into v_issue from public.attendance_issues where id=p_id for update;
  if not found or v_issue.user_id<>auth.uid() or v_issue.status<>'대기' then raise exception 'attendance issue response not allowed'; end if;
  update public.attendance_issues set staff_kind=p_kind,staff_reason=v_reason,staff_responded_at=now() where id=p_id returning * into v_issue;
  return v_issue;
end $$;

create or replace function public.attendance_issue_add_evidence(p_issue_id bigint,p_storage_path text,p_original_name text,p_mime_type text,p_size_bytes bigint)
returns bigint language plpgsql security definer set search_path=public,pg_temp as $$
declare v_issue public.attendance_issues;v_id bigint;v_ext text;v_object_found boolean;
begin
  if auth.uid() is null or not public.employee_hub_access_allowed() or public.my_role()='deputy'
    or not exists(select 1 from public.profiles p where p.user_id=auth.uid() and p.active and p.approved and p.account_access_status='활성') then raise exception 'attendance evidence not allowed'; end if;
  select * into v_issue from public.attendance_issues where id=p_issue_id for update;
  if not found or v_issue.user_id<>auth.uid() or v_issue.status<>'대기' then raise exception 'attendance evidence not allowed'; end if;
  if p_storage_path !~ ('^'||auth.uid()::text||'/'||p_issue_id::text||'/[A-Za-z0-9_-]{8,64}\.(jpg|jpeg|png|webp|pdf)$')
    or char_length(btrim(coalesce(p_original_name,''))) not between 1 and 200
    or p_mime_type not in ('image/jpeg','image/png','image/webp','application/pdf')
    or p_size_bytes is null or p_size_bytes not between 1 and 10485760 then raise exception 'attendance evidence fields invalid'; end if;
  v_ext:=lower(split_part(p_storage_path,'.',array_length(string_to_array(p_storage_path,'.'),1)));
  if (v_ext in ('jpg','jpeg') and p_mime_type<>'image/jpeg') or (v_ext='png' and p_mime_type<>'image/png')
    or (v_ext='webp' and p_mime_type<>'image/webp') or (v_ext='pdf' and p_mime_type<>'application/pdf') then raise exception 'attendance evidence type mismatch'; end if;
  if (select count(*) from public.attendance_issue_evidence e where e.issue_id=p_issue_id)>=10 then raise exception 'attendance evidence limit reached'; end if;
  select exists(select 1 from storage.objects o where o.bucket_id='attendance-evidence' and o.name=p_storage_path and o.owner_id=auth.uid()::text
    and o.metadata->>'mimetype'=p_mime_type
    and case when coalesce(o.metadata->>'size','') ~ '^[0-9]+$' then (o.metadata->>'size')::bigint else -1 end=p_size_bytes) into v_object_found;
  if not v_object_found then raise exception 'attendance evidence object not found'; end if;
  insert into public.attendance_issue_evidence(issue_id,storage_path,original_name,mime_type,size_bytes)
  values(p_issue_id,p_storage_path,btrim(p_original_name),p_mime_type,p_size_bytes) returning id into v_id;
  return v_id;
end $$;

revoke all on function public.submit_attendance_issue_v2(date,text,text) from public,anon;
revoke all on function public.respond_attendance_issue(bigint,text,text) from public,anon;
revoke all on function public.attendance_issue_add_evidence(bigint,text,text,text,bigint) from public,anon;
grant execute on function public.submit_attendance_issue_v2(date,text,text),public.respond_attendance_issue(bigint,text,text),public.attendance_issue_add_evidence(bigint,text,text,text,bigint) to authenticated;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('attendance-evidence','attendance-evidence',false,10485760,array['image/jpeg','image/png','image/webp','application/pdf'])
on conflict(id) do update set name=excluded.name,public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;
grant usage on schema storage to authenticated;
grant select,insert,delete on storage.objects to authenticated;
drop policy if exists attendance_evidence_insert_own_pending on storage.objects;
create policy attendance_evidence_insert_own_pending on storage.objects for insert to authenticated with check (
  bucket_id='attendance-evidence' and public.employee_hub_access_allowed()
  and name ~ ('^'||auth.uid()::text||'/[0-9]+/[A-Za-z0-9_-]{8,64}\.(jpg|jpeg|png|webp|pdf)$')
  and exists(select 1 from public.attendance_issues i where i.id::text=split_part(name,'/',2) and i.user_id=auth.uid() and i.status='대기')
  and coalesce(metadata->>'mimetype','') in ('image/jpeg','image/png','image/webp','application/pdf')
);
drop policy if exists attendance_evidence_select_scoped on storage.objects;
create policy attendance_evidence_select_scoped on storage.objects for select to authenticated using (
  bucket_id='attendance-evidence' and public.employee_hub_access_allowed() and (
    split_part(name,'/',1)=auth.uid()::text or (
      public.my_role() in ('chief','owner') and exists(
        select 1 from public.attendance_issue_evidence e where e.storage_path=name
      )
    )
  )
);
drop policy if exists attendance_evidence_delete_unlinked_own on storage.objects;
create policy attendance_evidence_delete_unlinked_own on storage.objects for delete to authenticated using (
  bucket_id='attendance-evidence' and split_part(name,'/',1)=auth.uid()::text
  and not exists(select 1 from public.attendance_issue_evidence e where e.storage_path=name)
);
drop policy if exists attendance_evidence_deputy_block on storage.objects;
create policy attendance_evidence_deputy_block on storage.objects as restrictive for all to authenticated
using(bucket_id<>'attendance-evidence' or public.my_role()<>'deputy')
with check(bucket_id<>'attendance-evidence' or public.my_role()<>'deputy');

commit;
