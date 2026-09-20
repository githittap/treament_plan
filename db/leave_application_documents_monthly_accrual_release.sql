-- Task 3 운영 migration: 연차 신청 증빙과 1년 미만 월차 후보를 분리한다.
-- 기존 hr-docs, leave_requests, leave_ledger 및 기존 객체는 변경하지 않는다.

create table if not exists public.leave_application_documents (
  id bigint generated always as identity primary key,
  request_id bigint not null references public.leave_requests(id),
  user_id uuid not null references public.profiles(user_id),
  document_type text not null default '연차 신청서',
  original_name text not null,
  storage_path text not null unique,
  mime_type text not null,
  size_bytes bigint not null,
  created_at timestamptz not null default now(),
  constraint leave_application_documents_path_scope check (storage_path like (user_id::text || '/%'))
);
alter table public.leave_application_documents enable row level security;
revoke all on table public.leave_application_documents from public,anon;
grant select,insert,delete on table public.leave_application_documents to authenticated;
drop policy if exists leave_application_documents_select_scoped on public.leave_application_documents;
create policy leave_application_documents_select_scoped on public.leave_application_documents for select to authenticated
using (exists (select 1 from public.profiles p where p.user_id=auth.uid() and p.active=true and p.approved=true) and (user_id=auth.uid() or public.my_role() in ('manager','chief','owner')));
drop policy if exists leave_application_documents_insert_self on public.leave_application_documents;
create policy leave_application_documents_insert_self on public.leave_application_documents for insert to authenticated
with check (user_id=auth.uid() and exists (select 1 from public.leave_requests r where r.id=request_id and r.user_id=auth.uid()) and exists (select 1 from public.profiles p where p.user_id=auth.uid() and p.active=true and p.approved=true));
drop policy if exists leave_application_documents_delete_owner on public.leave_application_documents;
create policy leave_application_documents_delete_owner on public.leave_application_documents for delete to authenticated
using (public.my_role()='owner');

-- 기존 버킷이 있으면 설정과 객체를 보존하고, 없을 때만 private 버킷을 만든다.
insert into storage.buckets (id,name,public) values ('leave-docs','leave-docs',false) on conflict do nothing;
drop policy if exists leave_docs_select_scoped on storage.objects;
create policy leave_docs_select_scoped on storage.objects for select to authenticated
using (bucket_id='leave-docs' and exists (select 1 from public.profiles p where p.user_id=auth.uid() and p.active=true and p.approved=true) and (public.my_role() in ('manager','chief','owner') or (storage.foldername(name))[1]=auth.uid()::text));
drop policy if exists leave_docs_insert_self on storage.objects;
create policy leave_docs_insert_self on storage.objects for insert to authenticated
with check (bucket_id='leave-docs' and exists (select 1 from public.profiles p where p.user_id=auth.uid() and p.active=true and p.approved=true) and (storage.foldername(name))[1]=auth.uid()::text);
drop policy if exists leave_docs_delete_temp on storage.objects;
create policy leave_docs_delete_temp on storage.objects for delete to authenticated
using (bucket_id='leave-docs' and exists (select 1 from public.profiles p where p.user_id=auth.uid() and p.active=true and p.approved=true) and (storage.foldername(name))[1]=auth.uid()::text and (storage.foldername(name))[2]='tmp' and not exists (select 1 from public.leave_application_documents d where d.storage_path=storage.objects.name));

-- 1년 미만 월차는 1~11개월 후보만 구조적으로 식별한다. 실제 지급은 근태 확인 연결 전까지 차단한다.
create table if not exists public.leave_accrual_runs (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles(user_id),
  due_date date not null,
  months_completed integer not null check (months_completed between 1 and 11),
  days numeric(3,1) not null default 1,
  ledger_id bigint references public.leave_ledger(id),
  created_at timestamptz not null default now(),
  unique (user_id,due_date)
);
alter table public.leave_accrual_runs enable row level security;
revoke all on table public.leave_accrual_runs from public,anon;
grant select on table public.leave_accrual_runs to authenticated;
drop policy if exists leave_accrual_runs_select_lead on public.leave_accrual_runs;
create policy leave_accrual_runs_select_lead on public.leave_accrual_runs for select to authenticated
using (public.my_role() in ('chief','owner') and exists (select 1 from public.profiles p where p.user_id=auth.uid() and p.active=true and p.approved=true));

create or replace function public.preview_monthly_leave_accruals(p_as_of date)
returns table(user_id uuid,user_name text,hire_date date,months_completed integer,due_date date,days numeric,already_recorded boolean)
language plpgsql security definer set search_path=public as $$
begin
  if auth.uid() is null or coalesce(public.my_role(),'')<>'owner' or not exists(select 1 from public.profiles x where x.user_id=auth.uid() and x.active=true and x.approved=true) then
    raise exception 'owner execution required';
  end if;
  return query with eligible as (
    select p.user_id,p.name,p.hire_date,
      greatest(0,((extract(year from age(p_as_of,p.hire_date))*12)+extract(month from age(p_as_of,p.hire_date)))::integer) as months_elapsed
    from public.profiles p
    where p.active=true and p.approved=true and p.hire_date is not null and p_as_of>=p.hire_date
  ), candidates as (
    select e.user_id,e.name,e.hire_date,m.months_completed
    from eligible e
    cross join lateral generate_series(1,least(11,e.months_elapsed)) as m(months_completed)
  )
  select c.user_id,c.name,c.hire_date,c.months_completed,
    (c.hire_date + (c.months_completed||' months')::interval)::date,
    1::numeric,
    exists(select 1 from public.leave_accrual_runs r where r.user_id=c.user_id and r.due_date=(c.hire_date + (c.months_completed||' months')::interval)::date)
  from candidates c
  where c.months_completed between 1 and 11;
end;
$$;

create or replace function public.apply_monthly_leave_accruals(p_as_of date)
returns table(user_id uuid,granted_days numeric,created_runs integer)
language plpgsql security invoker set search_path=public as $$
declare caller_role text;
begin
  caller_role:=coalesce(public.my_role(),'');
  if auth.uid() is null or caller_role<>'owner' or not exists(select 1 from public.profiles x where x.user_id=auth.uid() and x.active=true and x.approved=true) then
    raise exception 'owner execution required';
  end if;
  raise exception 'attendance confirmation required; preview only';
end;
$$;
revoke all on function public.preview_monthly_leave_accruals(date) from public,anon;
revoke all on function public.apply_monthly_leave_accruals(date) from public,anon;
grant execute on function public.preview_monthly_leave_accruals(date) to authenticated;
grant execute on function public.apply_monthly_leave_accruals(date) to authenticated;
