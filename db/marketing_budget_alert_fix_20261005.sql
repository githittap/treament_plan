-- 마케팅비 예산 알림 보완(Sol 1차 검증 FAIL 반영) — 2026-10-05
-- ① 합계를 화면과 같게(마케팅 5채널만, 해외 연결건 제외, 취소는 원거래 분류) ② 같은 달 동시 입력 줄 세우기(advisory lock)
-- ③ 첫 통과 때 큐 실패해도 다음 결제에서 재시도(기준 이상이면 시도, 중복은 event_key로 막음) ④ 이번 달(KST)만 알림
-- ⑤ 예산 조회 함수는 일반 로그인 직원에게 안 줌 ⑥ 발송 권한 함수에서 원장 아니면 거부
create or replace function public.marketing_event_category(p_id uuid)
returns text language plpgsql stable security definer set search_path to 'public','pg_temp' as $$
declare e public.marketing_expense_events%rowtype; s public.marketing_expense_events%rowtype; v_source uuid; v_cat text;
begin
  select * into e from public.marketing_expense_events where id = p_id;
  if not found then return null; end if;
  if e.event_kind = 'cancellation' then v_source := e.reversed_event_id;
  else select l.foreign_event_id into v_source from public.marketing_foreign_charge_links l where l.krw_event_id = e.id limit 1; end if;
  s := e;
  if v_source is not null then
    select * into s from public.marketing_expense_events where id = v_source;
    if not found then s := e; end if;
  end if;
  if s.category_override is not null and s.category_override <> '' then return s.category_override; end if;
  select r.category into v_cat from public.marketing_merchant_rules r
   where coalesce(s.merchant_key,'') = r.merchant_key or position(r.merchant_key in coalesce(s.merchant_key,'')) > 0
   order by length(r.merchant_key) desc limit 1;
  return v_cat;
end $$;
revoke all on function public.marketing_event_category(uuid) from public, anon, authenticated;
grant execute on function public.marketing_event_category(uuid) to service_role;

revoke all on function public.marketing_budget_for(date) from public, anon, authenticated;
grant execute on function public.marketing_budget_for(date) to service_role;

create or replace function public.queue_marketing_budget_alert()
returns trigger language plpgsql security definer set search_path to 'public','pg_temp' as $$
declare v_month date; v_budget bigint; v_pct int; v_total bigint; v_limit numeric; v_recipient record; v_payload jsonb; v_body text;
begin
  begin
    if new.parse_status <> 'recorded' or new.currency is distinct from 'KRW' or new.amount_krw is null then return new; end if;
    v_month := date_trunc('month', coalesce(new.transaction_at, new.received_at) at time zone 'Asia/Seoul')::date;
    if v_month <> date_trunc('month', now() at time zone 'Asia/Seoul')::date then return new; end if;
    perform pg_advisory_xact_lock(hashtext('marketing-budget-alert:' || to_char(v_month,'YYYY-MM')));
    v_budget := public.marketing_budget_for(v_month);
    if v_budget is null or v_budget <= 0 then return new; end if;
    select case when value ~ '^\d+$' then value::int end into v_pct from public.app_settings where key='marketing.budget_alert_pct';
    if v_pct is null or v_pct < 1 or v_pct > 1000 then return new; end if;
    select coalesce(sum(e.amount_krw),0) into v_total from public.marketing_expense_events e
     where e.parse_status='recorded' and e.currency='KRW'
       and date_trunc('month', coalesce(e.transaction_at, e.received_at) at time zone 'Asia/Seoul')::date = v_month
       and not exists (select 1 from public.marketing_foreign_charge_links l where l.foreign_event_id = e.id)
       and public.marketing_event_category(e.id) in ('daangn','kakao','google','naver','meta');
    v_limit := v_budget::numeric * v_pct / 100;
    if v_total >= v_limit then
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

create or replace function public.can_dispatch_ai_billing_push(p_event_id bigint, p_claim_token uuid)
 returns boolean language plpgsql security definer set search_path to 'public','pg_temp' as $function$
declare locked_event public.push_events%rowtype; recipient record;
begin
  select e.* into locked_event from public.push_events e where e.id=p_event_id;
  if not found or locked_event.claim_token is distinct from p_claim_token or locked_event.claimed_at is null or locked_event.claimed_at<now()-interval '10 minutes' then
    raise exception 'push delivery claim lost';
  end if;
  if locked_event.event_type not in ('ai_billing_stop','ai_billing_low_balance','ai_billing_charge','marketing_expense_recorded','marketing_expense_cancelled','marketing_expense_review','marketing_budget_alert') then return false; end if;
  select p.role,p.active,p.approved,p.account_access_status into recipient
    from public.profiles p where p.user_id=locked_event.recipient_id;
  if not found or recipient.active is not true or recipient.approved is not true or recipient.account_access_status='차단' then return false; end if;
  if locked_event.event_type='marketing_budget_alert' and recipient.role is distinct from 'owner' then return false; end if;
  return exists(select 1 from public.p7_notify_recipients('advertising',array(
    select p.user_id from public.profiles p where p.role='owner' or (p.role='manager' and not exists(
      select 1 from public.ai_billing_alert_recipients r where r.user_id=p.user_id and r.enabled=false))
  )) enabled where enabled.user_id=locked_event.recipient_id)
  and not exists(select 1 from public.ai_billing_alert_recipients r where r.user_id=locked_event.recipient_id and recipient.role='manager' and r.enabled=false);
end $function$;
