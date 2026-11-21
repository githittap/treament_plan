begin;

-- Restore the previous one-hop helper body only; keep its owner, grants, and policies.
create or replace function public.marketing_manager_event_category(p_event_id uuid) returns text
language sql stable security definer set search_path='' as $$
  with original as (
    select e.*,case when e.event_kind='cancellation' then e.reversed_event_id
      else (select l.foreign_event_id from public.marketing_foreign_charge_links l where l.krw_event_id=e.id) end as source_id
    from public.marketing_expense_events e where e.id=p_event_id and e.parse_status='recorded'
  ), classified as (
    select case when s.id is not null then s.category_override else o.category_override end as category_override,
      case when s.id is not null then s.merchant_key else o.merchant_key end as merchant_key
    from original o left join public.marketing_expense_events s on s.id=o.source_id
    where s.id is null or s.parse_status='recorded'
  )
  select coalesce(c.category_override,(select r.category from public.marketing_merchant_rules r
    where strpos(c.merchant_key,r.merchant_key)>0
    order by length(r.merchant_key) desc,r.merchant_key limit 1)) from classified c;
$$;

commit;
