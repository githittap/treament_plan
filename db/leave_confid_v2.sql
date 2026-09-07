alter table public.leave_requests add column if not exists contact text;
alter table public.confidential_records add column if not exists owner_only boolean not null default false;

drop policy if exists confidential_records_select on public.confidential_records;
create policy confidential_records_select on public.confidential_records
  for select to authenticated
  using (my_role() = 'owner' or (owner_only = false and exists (select 1 from public.confidential_access ca where ca.user_id = auth.uid())));

drop policy if exists confidential_records_insert on public.confidential_records;
create policy confidential_records_insert on public.confidential_records
  for insert to authenticated
  with check (my_role() = 'owner' or (owner_only = false and exists (select 1 from public.confidential_access ca where ca.user_id = auth.uid())));
