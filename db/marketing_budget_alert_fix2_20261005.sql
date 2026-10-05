-- 마케팅비 예산 알림 보완 2(Sol 2차 검증 FAIL 3번 반영) — 2026-10-05
-- 같은 달 잠금 대기가 길어져도 결제 기록 입력이 취소되지 않게: 잠금 대기 1초 제한(넘으면 이번 알림만 건너뛰고 다음 결제 때 재시도).
-- 수용한 위험(2차 FAIL 1·2번): 유니코드 보충 문자(𠮷 등) 가맹점 키 길이 동률 순서 차이 · 한 트랜잭션에서 같은 행을 두 번 넣는 비정상 입력의 교착 — 문자 파서·웹훅은 한 건씩 입력이라 실사용 영향 없음.
create or replace function public.queue_marketing_budget_alert()
returns trigger language plpgsql security definer set search_path to 'public','pg_temp' as $$
declare v_month date; v_budget bigint; v_pct int; v_total bigint; v_limit numeric; v_recipient record; v_payload jsonb; v_body text; v_old_timeout text;
begin
  v_old_timeout := current_setting('lock_timeout', true);
  begin
    if new.parse_status <> 'recorded' or new.currency is distinct from 'KRW' or new.amount_krw is null then return new; end if;
    v_month := date_trunc('month', coalesce(new.transaction_at, new.received_at) at time zone 'Asia/Seoul')::date;
    if v_month <> date_trunc('month', now() at time zone 'Asia/Seoul')::date then return new; end if;
    perform set_config('lock_timeout', '1s', true);
    perform pg_advisory_xact_lock(hashtext('marketing-budget-alert:' || to_char(v_month,'YYYY-MM')));
    perform set_config('lock_timeout', coalesce(v_old_timeout,'0'), true);
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
    perform set_config('lock_timeout', coalesce(v_old_timeout,'0'), true);
    raise warning 'marketing budget alert skipped for event %', new.id;
  end;
  return new;
end $$;
revoke all on function public.queue_marketing_budget_alert() from public, anon, authenticated;
