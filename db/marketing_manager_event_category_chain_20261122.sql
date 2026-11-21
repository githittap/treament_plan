begin;

-- Resolve only the recorded refund chain: cancellation -> KRW charge -> linked FX approval.
create or replace function public.marketing_manager_event_category(p_event_id uuid) returns text
language sql stable security definer set search_path='' as $$
  with target as (
    select e.id,e.event_kind,e.currency,e.reversed_event_id,e.category_override,e.merchant_key
    from public.marketing_expense_events e
    where e.id=p_event_id and e.parse_status='recorded'
  ), direct_source as (
    select t.*,case when t.event_kind='cancellation' then t.reversed_event_id
      when t.currency='KRW' then l.foreign_event_id else null end as source_id
    from target t
    left join public.marketing_foreign_charge_links l
      on t.event_kind<>'cancellation' and t.currency='KRW' and l.krw_event_id=t.id
  ), source_one as (
    select d.*,s.id as source_one_id,s.currency as source_one_currency,s.parse_status as source_one_status,
      s.category_override as source_one_override,s.merchant_key as source_one_merchant
    from direct_source d left join public.marketing_expense_events s on s.id=d.source_id
  ), source_two as (
    select s1.*,f.id as fx_id,f.category_override as fx_override,f.merchant_key as fx_merchant
    from source_one s1
    left join public.marketing_foreign_charge_links l
      on s1.event_kind='cancellation' and s1.source_one_currency='KRW' and l.krw_event_id=s1.source_one_id
    left join public.marketing_expense_events f on f.id=l.foreign_event_id and f.parse_status='recorded'
    where s1.source_one_id is null or s1.source_one_status='recorded'
  ), classified as (
    select case
        when s.source_one_id is null then s.category_override
        when s.event_kind='cancellation' and s.source_one_currency='KRW' and s.fx_id is not null then s.fx_override
        else s.source_one_override end as category_override,
      case
        when s.source_one_id is null then s.merchant_key
        when s.event_kind='cancellation' and s.source_one_currency='KRW' and s.fx_id is not null then s.fx_merchant
        else s.source_one_merchant end as merchant_key
    from source_two s
  )
  select coalesce(c.category_override,(select r.category from public.marketing_merchant_rules r
    where strpos(c.merchant_key,r.merchant_key)>0
    order by length(r.merchant_key) desc,r.merchant_key limit 1)) from classified c;
$$;

commit;
