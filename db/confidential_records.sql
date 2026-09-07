create table if not exists public.confidential_access (
  user_id uuid primary key references auth.users(id) on delete cascade,
  granted_at timestamptz not null default now()
);

create table if not exists public.confidential_records (
  id bigint generated always as identity primary key,
  patient_name text not null,
  chart_no text,
  body text not null,
  author text,
  created_at timestamptz not null default now()
);

alter table public.confidential_access enable row level security;
alter table public.confidential_records enable row level security;

drop policy if exists confidential_access_select on public.confidential_access;
create policy confidential_access_select on public.confidential_access
  for select to authenticated
  using (my_role() = 'owner' or user_id = auth.uid());

drop policy if exists confidential_access_owner_write on public.confidential_access;
create policy confidential_access_owner_write on public.confidential_access
  for all to authenticated
  using (my_role() = 'owner') with check (my_role() = 'owner');

drop policy if exists confidential_records_select on public.confidential_records;
create policy confidential_records_select on public.confidential_records
  for select to authenticated
  using (my_role() = 'owner' or exists (select 1 from public.confidential_access ca where ca.user_id = auth.uid()));

drop policy if exists confidential_records_insert on public.confidential_records;
create policy confidential_records_insert on public.confidential_records
  for insert to authenticated
  with check (my_role() = 'owner' or exists (select 1 from public.confidential_access ca where ca.user_id = auth.uid()));
