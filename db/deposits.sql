-- Run in the 기공차트 SQL Editor; do not change existing objects.

create table public.deposits (
  id bigint generated always as identity primary key,
  event_id text not null unique,
  bank_dt timestamptz not null,
  amount bigint not null check (amount > 0),
  payer_raw text,
  is_card boolean not null default false,
  account_tail text,
  created_at timestamptz not null default now()
);

create index deposits_bank_dt_idx
on public.deposits (bank_dt desc);

alter table public.deposits enable row level security;

revoke all on table public.deposits from anon, authenticated, service_role;
grant select on table public.deposits to authenticated;
grant select, insert on table public.deposits to service_role;

revoke all on sequence public.deposits_id_seq from anon, authenticated, service_role;
grant usage, select on sequence public.deposits_id_seq to service_role;

create policy deposits_select_active
on public.deposits
for select
to authenticated
using (
  exists (
    select 1
    from public.profiles as p
    where p.user_id = auth.uid()
      and p.active
  )
);
