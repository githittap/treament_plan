-- 마케팅비 월 예산: 없는 달은 직전 예산 이어가기 + 예산 N% 도달 알림(원장 전용 푸시) — 2026-10-05
-- 적용: 기공차트 프로젝트(texevhsxttfoqkrucfzl) apply_migration marketing_budget_alert_carry_20261005
insert into public.app_settings(key,value,label) values ('marketing.budget_alert_pct','80','마케팅비 월 예산 알림 기준(%)') on conflict (key) do nothing;

create or replace function public.marketing_budget_for(p_month date)
returns bigint language sql stable security definer set search_path to 'public','pg_temp' as $$
  select amount_krw from public.marketing_month_budgets where month <= date_trunc('month', p_month)::date order by month desc limit 1;
$$;
revoke all on function public.marketing_budget_for(date) from public, anon;
grant execute on function public.marketing_budget_for(date) to authenticated, service_role;

create or replace function public.queue_marketing_budget_alert()
returns trigger language plpgsql security definer set search_path to 'public','pg_temp' as $$
declare v_month date; v_budget bigint; v_pct int; v_total bigint; v_limit numeric; v_recipient record; v_payload jsonb; v_body text;
begin
  begin
    if new.parse_status <> 'recorded' or new.currency is distinct from 'KRW' or new.amount_krw is null then return new; end if;
    v_month := date_trunc('month', coalesce(new.transaction_at, new.received_at) at time zone 'Asia/Seoul')::date;
    v_budget := public.marketing_budget_for(v_month);
    if v_budget is null or v_budget <= 0 then return new; end if;
    select case when value ~ '^\d+$' then value::int end into v_pct from public.app_settings where key='marketing.budget_alert_pct';
    if v_pct is null or v_pct < 1 or v_pct > 1000 then return new; end if;
    select coalesce(sum(e.amount_krw),0) into v_total from public.marketing_expense_events e
     where e.parse_status='recorded' and e.currency='KRW'
       and date_trunc('month', coalesce(e.transaction_at, e.received_at) at time zone 'Asia/Seoul')::date = v_month
       and not exists (select 1 from public.marketing_foreign_charge_links l where l.foreign_event_id = e.id);
    v_limit := v_budget::numeric * v_pct / 100;
    if v_total >= v_limit and (v_total - new.amount_krw) < v_limit then
      v_body := '이번 달 마케팅비가 월 예산 ' || to_char(v_budget,'FM999,999,999,990') || '원의 ' || v_pct || '%를 넘었어요 (현재 ' || to_char(v_total,'FM999,999,999,990') || '원)';
      v_payload := jsonb_build_object('title','마케팅비 예산 알림','body',v_body,'url','/hr.html?tab=aicost','tag','marketing-budget-alert','expense_event_id',new.id);
      for v_recipient in
        select user_id from public.p7_notify_recipients('advertising', array(
          select p.user_id from public.profiles p where p.role='owner' and p.active is true and p.approved is true and p.account_access_status is distinct from '차단'), null)
         where user_id in (select p.user_id from public.profiles p where p.role='owner')
      loop
        begin
          perform public.enqueue_push_event(format('marketing-budget:%s:%s:%s', to_char(v_month,'YYYY-MM'), v_pct, v_recipient.user_id), v_recipient.user_id, 'marketing_budget_alert', v_payload);
        exception when others then raise warning 'marketing budget push enqueue failed for event %', new.id;
        end;
      end loop;
    end if;
  exception when others then
    raise warning 'marketing budget alert skipped for event %', new.id;
  end;
  return new;
end $$;
revoke all on function public.queue_marketing_budget_alert() from public, anon, authenticated;

drop trigger if exists marketing_budget_alert_after_insert on public.marketing_expense_events;
create trigger marketing_budget_alert_after_insert after insert on public.marketing_expense_events
  for each row execute function public.queue_marketing_budget_alert();
