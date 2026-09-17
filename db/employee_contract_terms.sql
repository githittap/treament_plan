create table if not exists public.employee_contract_terms (
  user_id uuid primary key references public.profiles(user_id) on delete cascade,
  end_date date,
  is_indefinite boolean not null default false,
  updated_by text,
  updated_at timestamptz not null default now(),
  check ((is_indefinite and end_date is null) or (not is_indefinite and end_date is not null))
);
alter table public.employee_contract_terms enable row level security;
create policy employee_contract_terms_select_lead on public.employee_contract_terms for select to authenticated using (public.my_role() in ('manager','chief','owner'));
create policy employee_contract_terms_insert_lead on public.employee_contract_terms for insert to authenticated with check (public.my_role() in ('manager','chief','owner'));
create policy employee_contract_terms_update_lead on public.employee_contract_terms for update to authenticated using (public.my_role() in ('manager','chief','owner')) with check (public.my_role() in ('manager','chief','owner'));
