-- N-2/N-3 로컬 초안. 운영 데이터에는 적용하지 않았다.
create table if not exists public.payroll_row_archive (
  archive_id bigint generated always as identity primary key,
  original_id bigint not null, month text not null, user_id uuid not null,
  items jsonb not null, net numeric, imported_at timestamptz, imported_by text,
  archived_at timestamptz not null default now(), archived_by uuid not null references auth.users(id),
  unique(original_id)
);
alter table public.payroll_row_archive enable row level security;
revoke all on public.payroll_row_archive from public,anon,authenticated;
grant select on public.payroll_row_archive to authenticated;
create policy payroll_archive_owner_read on public.payroll_row_archive for select to authenticated
using (public.employee_hub_access_allowed() and public.my_role()='owner');

create table if not exists public.payroll_uploads (
  id uuid primary key default gen_random_uuid(), month text not null check(month ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  storage_path text not null unique, file_name text not null, size_bytes bigint not null check(size_bytes between 1 and 20971520),
  sha256 text not null check(sha256 ~ '^[0-9a-f]{64}$'), uploaded_by uuid not null references auth.users(id),
  uploaded_at timestamptz not null default now()
);
alter table public.payroll_uploads enable row level security;
revoke all on public.payroll_uploads from public,anon,authenticated;
grant select,insert on public.payroll_uploads to authenticated;
create policy payroll_uploads_owner_read on public.payroll_uploads for select to authenticated
using(public.employee_hub_access_allowed() and public.my_role()='owner');
create policy payroll_uploads_owner_insert on public.payroll_uploads for insert to authenticated
with check(public.employee_hub_access_allowed() and public.my_role()='owner' and uploaded_by=auth.uid()
  and split_part(storage_path,'/',1)=auth.uid()::text and split_part(storage_path,'/',2) ~ '^[0-9a-f-]{36}\.xlsx?$');

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('payroll-originals','payroll-originals',false,20971520,null)
on conflict(id) do update set public=false,file_size_limit=20971520;
drop policy if exists payroll_originals_owner_select on storage.objects;
create policy payroll_originals_owner_select on storage.objects for select to authenticated
using(bucket_id='payroll-originals' and public.employee_hub_access_allowed() and public.my_role()='owner');
drop policy if exists payroll_originals_owner_insert on storage.objects;
create policy payroll_originals_owner_insert on storage.objects for insert to authenticated
with check(bucket_id='payroll-originals' and public.employee_hub_access_allowed() and public.my_role()='owner'
  and split_part(name,'/',1)=auth.uid()::text and name ~ '\.xlsx?$'
  and coalesce((metadata->>'size')::bigint,20971521) between 1 and 20971520);
drop policy if exists payroll_originals_owner_guard on storage.objects;
create policy payroll_originals_owner_guard on storage.objects as restrictive for all to authenticated
using(bucket_id<>'payroll-originals' or (public.employee_hub_access_allowed() and public.my_role()='owner'))
with check(bucket_id<>'payroll-originals' or (public.employee_hub_access_allowed() and public.my_role()='owner'));
-- Storage DELETE/UPDATE 권한은 부여하지 않는다. 원본을 월 변경·행 삭제와 분리해 보존한다.

create or replace function public.payroll_move_month(p_from text,p_to text)
returns integer language plpgsql security definer set search_path='' as $$
declare n integer;
begin
  if auth.uid() is null or not public.employee_hub_access_allowed() or public.my_role()<>'owner' then raise exception 'owner required'; end if;
  if p_from !~ '^[0-9]{4}-(0[1-9]|1[0-2])$' or p_to !~ '^[0-9]{4}-(0[1-9]|1[0-2])$' or p_from=p_to then raise exception 'invalid month'; end if;
  perform pg_advisory_xact_lock(hashtext('payroll:'||least(p_from,p_to)));
  perform pg_advisory_xact_lock(hashtext('payroll:'||greatest(p_from,p_to)));
  if exists(select 1 from public.payslips where month in (p_from,p_to)) then raise exception 'payslip already exists'; end if;
  if exists(select 1 from public.payroll_rows where month=p_to) or exists(select 1 from public.payroll_uploads where month=p_to) then raise exception 'destination month is not empty'; end if;
  update public.payroll_rows set month=p_to where month=p_from;get diagnostics n=row_count;
  if n=0 then raise exception 'source month has no payroll rows'; end if;
  update public.payroll_uploads set month=p_to where month=p_from;
  return n;
end$$;
revoke all on function public.payroll_move_month(text,text) from public,anon,authenticated;
grant execute on function public.payroll_move_month(text,text) to authenticated;

create or replace function public.payroll_archive_month(p_month text)
returns integer language plpgsql security definer set search_path='' as $$
declare n integer;
begin
  if auth.uid() is null or not public.employee_hub_access_allowed() or public.my_role()<>'owner' then raise exception 'owner required'; end if;
  if p_month !~ '^[0-9]{4}-(0[1-9]|1[0-2])$' then raise exception 'invalid month'; end if;
  perform pg_advisory_xact_lock(hashtext('payroll:'||p_month));
  if exists(select 1 from public.payslips where month=p_month) then raise exception 'payslip already exists'; end if;
  insert into public.payroll_row_archive(original_id,month,user_id,items,net,imported_at,imported_by,archived_by)
  select id,month,user_id,items,net,imported_at,imported_by,auth.uid() from public.payroll_rows where month=p_month;
  get diagnostics n=row_count;
  if n=0 then raise exception 'month has no payroll rows'; end if;
  delete from public.payroll_rows where month=p_month;
  return n;
end$$;
revoke all on function public.payroll_archive_month(text) from public,anon,authenticated;
grant execute on function public.payroll_archive_month(text) to authenticated;

create or replace function public.payroll_restore_month(p_month text)
returns integer language plpgsql security definer set search_path='' as $$
declare n integer;
begin
  if auth.uid() is null or not public.employee_hub_access_allowed() or public.my_role()<>'owner' then raise exception 'owner required'; end if;
  if p_month !~ '^[0-9]{4}-(0[1-9]|1[0-2])$' then raise exception 'invalid month'; end if;
  perform pg_advisory_xact_lock(hashtext('payroll:'||p_month));
  if exists(select 1 from public.payroll_rows where month=p_month) then raise exception 'destination month is not empty'; end if;
  insert into public.payroll_rows(month,user_id,items,net,imported_at,imported_by)
  select month,user_id,items,net,imported_at,imported_by from public.payroll_row_archive where month=p_month;
  get diagnostics n=row_count;
  if n=0 then raise exception 'archive not found'; end if;
  delete from public.payroll_row_archive where month=p_month;
  return n;
end$$;
revoke all on function public.payroll_restore_month(text) from public,anon,authenticated;
grant execute on function public.payroll_restore_month(text) to authenticated;
