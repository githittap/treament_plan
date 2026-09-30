-- 광고 알림 확장 초안. 운영의 ai_billing_events 9개 기준 열과 기존 감사 RPC를 보존한다.
begin;

do $$
declare
  v_col_count integer;
  v_policy_count integer;
  v_push_check text;
begin
  if to_regclass('public.ai_billing_events') is null
     or to_regclass('public.profiles') is null
     or to_regclass('public.push_events') is null
     or to_regprocedure('public.enqueue_push_event(text,uuid,text,jsonb)') is null
     or to_regprocedure('public.mark_ai_billing_event_charged(bigint)') is null
     or to_regprocedure('public.can_dispatch_ai_billing_push(bigint,uuid)') is not null then
    raise exception 'ai billing alert preflight: required live objects missing';
  end if;
  select count(*) into v_col_count from information_schema.columns
   where table_schema='public' and table_name='ai_billing_events'
     and column_name = any(array['id','platform','amount_krw','source','note','raw_text','received_at','charged_at','charged_by']);
  if v_col_count <> 9 then raise exception 'ai billing alert preflight: ai_billing_events schema differs'; end if;
  if not exists(select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace
                where n.nspname='public' and c.relname='ai_billing_events' and c.relrowsecurity) then
    raise exception 'ai billing alert preflight: event RLS is not enabled';
  end if;
  select count(*) into v_policy_count from pg_policies
   where schemaname='public' and tablename='ai_billing_events'
     and policyname in ('ai_billing_events_owner_select','ai_billing_events_owner_manager_select');
  if v_policy_count < 1 then raise exception 'ai billing alert preflight: baseline select policy not recognized'; end if;
  select pg_get_constraintdef(oid) into v_push_check from pg_constraint
   where conrelid='public.push_events'::regclass and conname='push_events_event_type_check';
  if v_push_check is null or v_push_check not like '%leave_submitted%' or v_push_check not like '%consultation_received%' then
    raise exception 'ai billing alert preflight: push event type constraint differs';
  end if;
end $$;

alter table public.ai_billing_events add column if not exists account_id text;
alter table public.ai_billing_events add column if not exists account_name text;
alter table public.ai_billing_events add column if not exists threshold_krw integer;

create table if not exists public.ai_billing_alert_recipients (
  user_id uuid primary key references public.profiles(user_id) on delete cascade,
  enabled boolean not null default false,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles(user_id)
);
alter table public.ai_billing_alert_recipients enable row level security;
drop policy if exists ai_billing_alert_recipients_owner_all on public.ai_billing_alert_recipients;
create policy ai_billing_alert_recipients_owner_all on public.ai_billing_alert_recipients
  for all using (public.my_role()='owner') with check (public.my_role()='owner');
grant select, insert, update, delete on public.ai_billing_alert_recipients to authenticated;

-- 설정 행이 없으면 활성 매니저는 기본 수신이다. 비활성화 선택은 enabled=false로 보존한다.
create or replace function public.can_view_ai_billing_alerts()
returns boolean language plpgsql stable security definer set search_path=public,pg_temp as $$
declare v_role text; v_active boolean; v_approved boolean; v_access text; v_enabled boolean;
begin
  if auth.uid() is null then return false; end if;
  v_role:=public.my_role();
  if v_role='owner' then return true; end if;
  if v_role<>'manager' then return false; end if;
  select p.active,p.approved,p.account_access_status into v_active,v_approved,v_access
    from public.profiles p where p.user_id=auth.uid();
  if not found or v_active is not true or v_approved is not true or v_access='차단' then return false; end if;
  select r.enabled into v_enabled from public.ai_billing_alert_recipients r where r.user_id=auth.uid();
  return coalesce(v_enabled,true);
end $$;
revoke all on function public.can_view_ai_billing_alerts() from public,anon;
grant execute on function public.can_view_ai_billing_alerts() to authenticated;

drop policy if exists ai_billing_events_owner_select on public.ai_billing_events;
drop policy if exists ai_billing_events_owner_manager_select on public.ai_billing_events;
create policy ai_billing_events_owner_manager_select on public.ai_billing_events for select
  using (public.my_role()='owner' or (
    public.can_view_ai_billing_alerts() and note in ('NAVER_AD_STOP','NAVER_AD_LOW_BALANCE','NAVER_AD_CHARGE')
  ));

create or replace function public.mark_ai_billing_event_charged(p_event_id bigint)
returns timestamptz language plpgsql security definer set search_path=public,pg_temp as $$
declare v_at timestamptz;
begin
  if not public.can_view_ai_billing_alerts() then raise exception 'ai billing alert not allowed'; end if;
  update public.ai_billing_events set charged_at=now(),charged_by=auth.uid()
   where id=p_event_id and note in ('NAVER_AD_STOP','NAVER_AD_LOW_BALANCE') and charged_at is null
   returning charged_at into v_at;
  if v_at is null then raise exception 'ai billing alert already hidden or not found'; end if;
  return v_at;
end $$;
revoke all on function public.mark_ai_billing_event_charged(bigint) from public,anon;
grant execute on function public.mark_ai_billing_event_charged(bigint) to authenticated;

-- 큐 적재 뒤 수신자 해제·역할 변경이 있었는지 발송 직전에 다시 검사한다.
create function public.can_dispatch_ai_billing_push(p_event_id bigint,p_claim_token uuid)
returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
declare locked_event public.push_events%rowtype; recipient record;
begin
  select e.* into locked_event from public.push_events e where e.id=p_event_id;
  if not found or locked_event.claim_token is distinct from p_claim_token or locked_event.claimed_at is null or locked_event.claimed_at<now()-interval '10 minutes' then
    raise exception 'push delivery claim lost';
  end if;
  if locked_event.event_type not in ('ai_billing_stop','ai_billing_low_balance','ai_billing_charge') then return false; end if;
  select p.role,p.active,p.approved,p.account_access_status into recipient
    from public.profiles p where p.user_id=locked_event.recipient_id;
  if not found or recipient.active is not true or recipient.approved is not true or recipient.account_access_status='차단' then return false; end if;
  if recipient.role='owner' then return true; end if;
  if recipient.role<>'manager' then return false; end if;
  return not exists(select 1 from public.ai_billing_alert_recipients r where r.user_id=locked_event.recipient_id and r.enabled=false);
end $$;
revoke all on function public.can_dispatch_ai_billing_push(bigint,uuid) from public,anon,authenticated;
grant execute on function public.can_dispatch_ai_billing_push(bigint,uuid) to service_role;

alter table public.push_events drop constraint if exists push_events_event_type_check;
alter table public.push_events add constraint push_events_event_type_check check(event_type = any(array[
  'leave_submitted','leave_status_changed','consultation_received','payment_pending','approval_submitted',
  'notice_published','document_approved','ai_billing_stop','ai_billing_low_balance','ai_billing_charge'
]::text[]));

create or replace function public.queue_ai_billing_alert_push()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
declare v_type text; v_title text; v_body text; v_recipient record; v_payload jsonb;
begin
  if new.note='NAVER_AD_STOP' then
    v_type:='ai_billing_stop'; v_title:='네이버 광고 노출 중단'; v_body:='광고 노출 중단 내용을 허브에서 확인해 주세요.';
  elsif new.note='NAVER_AD_LOW_BALANCE' then
    v_type:='ai_billing_low_balance'; v_title:='네이버 광고 잔액 안내';
    v_body:=format('잔액 %s원 이하 안내를 허브에서 확인해 주세요.',coalesce(new.threshold_krw,100000));
  elsif new.note='NAVER_AD_CHARGE' then
    v_type:='ai_billing_charge'; v_title:='네이버 광고 충전 완료'; v_body:='충전 기록을 허브에서 확인해 주세요.';
  else return new;
  end if;
  v_payload:=jsonb_build_object('title',v_title,'body',v_body,'url','/hr.html?tab=inbox','tag',v_type,
    'account_id',new.account_id,'account_name',new.account_name,'amount_krw',new.amount_krw,'threshold_krw',new.threshold_krw);
  for v_recipient in
    select p.user_id from public.profiles p
     where p.role='owner' and p.active is true and p.approved is true and p.account_access_status is distinct from '차단'
    union
    select p.user_id from public.profiles p
     where p.role='manager' and p.active is true and p.approved is true and p.account_access_status is distinct from '차단'
       and not exists(select 1 from public.ai_billing_alert_recipients r where r.user_id=p.user_id and r.enabled=false)
  loop
    begin
      perform public.enqueue_push_event(format('ai-billing:%s:%s',new.id,v_recipient.user_id),v_recipient.user_id,v_type,v_payload);
    exception when others then
      raise warning 'ai billing push enqueue failed for event %',new.id;
    end;
  end loop;
  return new;
end $$;
revoke all on function public.queue_ai_billing_alert_push() from public,anon,authenticated;
create trigger ai_billing_alert_push_after_insert after insert on public.ai_billing_events
  for each row execute function public.queue_ai_billing_alert_push();

commit;
