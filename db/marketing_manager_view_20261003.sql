-- P7 마케팅비 매니저 열람 초안. 운영에 적용하지 않았음.
-- 선행: hr_settings.sql + marketing_expenses_draft.sql.
-- 설정은 원장만 수정하며, 기본 켬. 잘못된 값은 끔으로 처리함.
-- 기존 원장 정책·쓰기 권한은 유지하고 매니저 SELECT 정책만 추가함.
begin;
do $$
begin
  if to_regclass('public.app_settings') is null
    or to_regclass('public.marketing_expense_events') is null
    or to_regclass('public.marketing_merchant_rules') is null
    or to_regclass('public.marketing_month_budgets') is null
    or to_regclass('public.marketing_foreign_charge_links') is null
    or to_regprocedure('public.my_role()') is null then
    raise exception 'marketing manager preflight: settings or marketing schema missing';
  end if;
end $$;

insert into public.app_settings(key,value,label)
values ('marketing.manager_view_enabled','true','마케팅비 매니저 보기')
on conflict(key) do nothing;

create or replace function public.marketing_manager_view_enabled() returns boolean
language sql stable security definer set search_path='' as $$
  select public.my_role()='manager' and coalesce(
    (select s.value='true' from public.app_settings s where s.key='marketing.manager_view_enabled'),true);
$$;

-- RLS 안에서 같은 표를 다시 읽을 때의 재귀를 피함. 외부에서 직접 실행할 수 없음.
-- hr.html marketingEventCategoryFor와 같게 취소는 승인, 원화 청구는 연결한 외화 승인의 분류를 따름.
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

create or replace function public.marketing_manager_can_read_event(p_event_id uuid) returns boolean
language sql stable security definer set search_path='' as $$
  select public.marketing_manager_view_enabled()
    and coalesce(public.marketing_manager_event_category(p_event_id) in ('daangn','kakao','google','naver','meta'),false);
$$;

revoke all on function public.marketing_manager_view_enabled(),
  public.marketing_manager_event_category(uuid),public.marketing_manager_can_read_event(uuid)
  from public,anon,authenticated;
grant execute on function public.marketing_manager_view_enabled(),public.marketing_manager_can_read_event(uuid)
  to authenticated;

drop policy if exists marketing_expense_events_manager_select on public.marketing_expense_events;
create policy marketing_expense_events_manager_select on public.marketing_expense_events
  for select to authenticated using (public.marketing_manager_can_read_event(id));
drop policy if exists marketing_month_budgets_manager_select on public.marketing_month_budgets;
create policy marketing_month_budgets_manager_select on public.marketing_month_budgets
  for select to authenticated using (public.marketing_manager_view_enabled());
drop policy if exists marketing_merchant_rules_manager_select on public.marketing_merchant_rules;
create policy marketing_merchant_rules_manager_select on public.marketing_merchant_rules
  for select to authenticated using (public.marketing_manager_view_enabled() and category in ('daangn','kakao','google','naver','meta'));
drop policy if exists marketing_foreign_charge_links_manager_select on public.marketing_foreign_charge_links;
create policy marketing_foreign_charge_links_manager_select on public.marketing_foreign_charge_links
  for select to authenticated using (
    public.marketing_manager_can_read_event(foreign_event_id) and public.marketing_manager_can_read_event(krw_event_id));
commit;
