begin;
do $$
begin
  if to_regclass('public.marketing_expense_events') is null
     or to_regclass('public.marketing_month_budgets') is null
     or to_regclass('public.marketing_merchant_rules') is null
     or to_regclass('public.marketing_foreign_charge_links') is null then
    raise exception 'marketing expenses rollback preflight: expected objects missing';
  end if;
  if exists(select 1 from public.marketing_expense_events)
     or exists(select 1 from public.marketing_month_budgets)
     or exists(select 1 from public.marketing_foreign_charge_links)
     or (select count(*) from public.marketing_merchant_rules) <> 12
     or exists(
       select 1 from (values
         ('당근','당근','daangn'),('당근페이','당근페이','daangn'),('카카','카카오','kakao'),('카카오','카카오','kakao'),
         ('googleads','Google Ads','google'),('네이버광고','네이버 광고','naver'),('naverads','Naver Ads','naver'),
         ('facebook','Facebook','meta'),('meta','Meta','meta'),('coupang','쿠팡','not_marketing'),
         ('apple','Apple','not_marketing'),('youtubepremium','YouTube Premium','not_marketing')
       ) as expected(merchant_key,merchant_label,category)
       left join public.marketing_merchant_rules actual using(merchant_key)
       where actual.merchant_key is null or actual.merchant_label<>expected.merchant_label or actual.category<>expected.category
     ) then
    raise exception 'marketing expenses rollback blocked: data or edited rules exist';
  end if;
end $$;

drop policy if exists marketing_foreign_charge_links_owner_all on public.marketing_foreign_charge_links;
drop policy if exists marketing_merchant_rules_owner_all on public.marketing_merchant_rules;
drop policy if exists marketing_month_budgets_owner_all on public.marketing_month_budgets;
drop policy if exists marketing_expense_events_owner_update on public.marketing_expense_events;
drop policy if exists marketing_expense_events_owner_select on public.marketing_expense_events;
drop table public.marketing_foreign_charge_links;
drop table public.marketing_merchant_rules;
drop table public.marketing_month_budgets;
drop table public.marketing_expense_events;
commit;
