begin;

do $$
begin
  if to_regclass('public.profiles') is null or to_regprocedure('public.my_role()') is null then
    raise exception 'marketing expenses preflight: employee profile role helper missing';
  end if;
end $$;

create table if not exists public.marketing_expense_events (
  id uuid primary key default gen_random_uuid(),
  event_hash text not null unique check (event_hash ~ '^[0-9a-f]{64}$'),
  received_at timestamptz not null default now(),
  transaction_at timestamptz,
  event_kind text not null check (event_kind in ('purchase','cancellation')),
  parse_status text not null check (parse_status in ('recorded','failed')),
  failure_code text check (failure_code in ('empty','unsupported_shape','unreadable_fields','unmatched_cancellation','ambiguous_cancellation','duplicate_cancellation')),
  currency text check (currency is null or currency ~ '^[A-Z]{3}$'),
  amount_native numeric(14,4) check (amount_native is null or amount_native <> 0),
  amount_krw bigint check (amount_krw is null or amount_krw <> 0),
  reversed_event_id uuid unique references public.marketing_expense_events(id),
  merchant text check (merchant is null or (length(merchant) between 1 and 80 and merchant !~ '[0-9]{4,}')),
  merchant_key text check (merchant_key is null or (length(merchant_key) between 1 and 80 and merchant_key !~ '[0-9]{4,}')),
  category_override text check (category_override is null or category_override in ('daangn','kakao','google','naver','meta','not_marketing')),
  constraint marketing_expense_parse_fields check (
    (parse_status='recorded' and transaction_at is not null and currency is not null and amount_native is not null and merchant is not null and merchant_key is not null and failure_code is null
      and ((event_kind='purchase' and amount_native>0 and reversed_event_id is null) or (event_kind='cancellation' and amount_native<0 and reversed_event_id is not null)))
    or (parse_status='failed' and event_kind='cancellation' and failure_code in ('unmatched_cancellation','ambiguous_cancellation','duplicate_cancellation') and transaction_at is not null and currency='KRW' and amount_native>0 and merchant is not null and merchant_key is not null and category_override is null and reversed_event_id is null)
    or (parse_status='failed' and transaction_at is null and currency is null and amount_native is null and amount_krw is null and merchant is null and merchant_key is null and category_override is null and reversed_event_id is null and failure_code is not null)
  ),
  constraint marketing_expense_krw_fields check (
    (parse_status='failed' and currency is null and amount_krw is null)
    or (parse_status='failed' and event_kind='cancellation' and failure_code in ('unmatched_cancellation','ambiguous_cancellation','duplicate_cancellation') and currency='KRW' and amount_krw>0)
    or (currency='KRW' and amount_krw is not null and ((event_kind='purchase' and amount_krw>0) or (event_kind='cancellation' and amount_krw<0)))
    or (currency is distinct from 'KRW' and amount_krw is null and event_kind='purchase')
  )
);

create table if not exists public.marketing_month_budgets (
  month date primary key check (extract(day from month)=1),
  amount_krw bigint not null check (amount_krw >= 0),
  updated_at timestamptz not null default now()
);

create table if not exists public.marketing_merchant_rules (
  merchant_key text primary key check (length(merchant_key) between 1 and 80 and merchant_key !~ '[0-9]{4,}'),
  merchant_label text not null check (length(merchant_label) between 1 and 80 and merchant_label !~ '[0-9]{4,}'),
  category text not null check (category in ('daangn','kakao','google','naver','meta','not_marketing')),
  updated_at timestamptz not null default now()
);

create table if not exists public.marketing_foreign_charge_links (
  foreign_event_id uuid primary key references public.marketing_expense_events(id) on delete cascade,
  krw_event_id uuid not null unique references public.marketing_expense_events(id) on delete cascade,
  created_at timestamptz not null default now(),
  created_by uuid not null default auth.uid() references public.profiles(user_id),
  check (foreign_event_id <> krw_event_id)
);

create index if not exists marketing_foreign_charge_links_created_by_idx
  on public.marketing_foreign_charge_links(created_by);

insert into public.marketing_merchant_rules(merchant_key,merchant_label,category) values
  ('당근','당근','daangn'),('당근페이','당근페이','daangn'),
  ('카카','카카오','kakao'),('카카오','카카오','kakao'),
  ('googleads','Google Ads','google'),
  ('네이버광고','네이버 광고','naver'),('naverads','Naver Ads','naver'),
  ('facebook','Facebook','meta'),('meta','Meta','meta'),
  ('coupang','쿠팡','not_marketing'),('apple','Apple','not_marketing'),
  ('youtubepremium','YouTube Premium','not_marketing')
on conflict (merchant_key) do nothing;

alter table public.marketing_expense_events enable row level security;
alter table public.marketing_month_budgets enable row level security;
alter table public.marketing_merchant_rules enable row level security;
alter table public.marketing_foreign_charge_links enable row level security;

revoke all on public.marketing_expense_events, public.marketing_month_budgets,
  public.marketing_merchant_rules, public.marketing_foreign_charge_links from public, anon;
grant select, update(category_override) on public.marketing_expense_events to authenticated;
grant select, insert, update, delete on public.marketing_month_budgets to authenticated;
grant select, insert, update, delete on public.marketing_merchant_rules to authenticated;
grant select, insert, delete on public.marketing_foreign_charge_links to authenticated;
grant insert, select on public.marketing_expense_events to service_role;

create policy marketing_expense_events_owner_select on public.marketing_expense_events
  for select to authenticated using (public.my_role()='owner');
create policy marketing_expense_events_owner_update on public.marketing_expense_events
  for update to authenticated using (public.my_role()='owner') with check (public.my_role()='owner');
create policy marketing_month_budgets_owner_all on public.marketing_month_budgets
  for all to authenticated using (public.my_role()='owner') with check (public.my_role()='owner');
create policy marketing_merchant_rules_owner_all on public.marketing_merchant_rules
  for all to authenticated using (public.my_role()='owner') with check (public.my_role()='owner');
create policy marketing_foreign_charge_links_owner_all on public.marketing_foreign_charge_links
  for all to authenticated using (public.my_role()='owner') with check (public.my_role()='owner');

commit;
