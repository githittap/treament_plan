-- 로컬 검토용 초안. 실제 발송(VAPID 개인키)은 Edge Function push-dispatcher가 별도 환경변수로 갖는다.
-- Task 7(push_subscriptions, db/push_subscriptions_draft.sql)의 테이블/컬럼/RLS는 이미 운영에 적용돼 있으므로 그대로 두고
-- 여기서는 outbox(push_events/push_event_deliveries)와 발송기 전용 RPC만 추가한다.
-- push_subscriptions은 RLS enable 후 service_role에는 아무 GRANT도 남지 않으므로(원장 승인 반영, 최소권한),
-- 발송기는 반드시 아래 SECURITY DEFINER 함수를 통해서만 읽고/지운다(테이블 직접 권한 부여 없음).
-- 선행: db/employment_status_access_block_phase_b.sql (profiles.account_access_status),
-- db/employee_documents.sql, db/consultation_inbox.sql, db/consultation_access_widen.sql,
-- db/payment_requests_draft.sql, db/notice_attachments_deposit_access_draft.sql
-- (hr_schema.sql의 notices에 author_id 추가), db/push_subscriptions_draft.sql.
-- leave_requests/profiles는 기존 허브 기본 스키마가 먼저 있어야 한다. 모든 선행 객체는 로컬 확인 후 적용한다.
begin;
do $$ begin
  if to_regclass('public.profiles') is null or to_regclass('public.leave_requests') is null
     or to_regclass('public.push_subscriptions') is null or to_regclass('public.payment_requests') is null
     or to_regclass('public.notices') is null or to_regclass('public.approval_steps') is null or to_regclass('public.employee_documents') is null
     or to_regclass('public.consultation_inbox') is null then
    raise exception 'push notification prerequisite table missing; preserve state and stop';
  end if;
  if exists(
    select 1 from (values
      ('profiles','user_id'),('profiles','role'),('profiles','dept'),('profiles','active'),('profiles','approved'),('profiles','account_access_status'),
      ('leave_requests','id'),('leave_requests','user_id'),('leave_requests','status'),
      ('push_subscriptions','id'),('push_subscriptions','user_id'),('push_subscriptions','endpoint'),('push_subscriptions','subscription'),
      ('payment_requests','id'),('payment_requests','status'),
      ('approval_steps','id'),('approval_steps','doc_id'),('approval_steps','seq'),('approval_steps','status'),
      ('notices','id'),('notices','author_id'),
      ('employee_documents','id'),('employee_documents','user_id'),('employee_documents','checked_at'),
      ('consultation_inbox','id'),('consultation_inbox','created_via')
    ) required(table_name,column_name)
    where not exists(select 1 from information_schema.columns c
      where c.table_schema='public' and c.table_name=required.table_name and c.column_name=required.column_name)
  ) then
    raise exception 'push notification prerequisite column missing; preserve state and stop';
  end if;
  if to_regclass('public.push_events') is not null
     or to_regclass('public.push_event_deliveries') is not null
     or to_regprocedure('public.enqueue_push_event(text,uuid,text,jsonb)') is not null
     or to_regprocedure('public.claim_push_events(uuid,integer)') is not null
     or to_regprocedure('public.record_push_delivery(bigint,uuid,uuid,text,integer)') is not null
     or exists(select 1 from pg_trigger where tgname in ('queue_leave_push_event','queue_payment_push_event','queue_approval_push_event','queue_notice_push_event','queue_document_push_event','queue_consultation_push_event'))
  then raise exception 'push notification outbox migration object collision; preserve state and stop'; end if;
end $$;

-- 서버 발송기가 소비할 멱등 outbox. 클라이언트에는 절대 공개하지 않는다(REVOKE ALL, 정책 없음).
create table public.push_events (
  id bigint generated always as identity primary key,
  event_key text not null unique,
  recipient_id uuid not null references public.profiles(user_id) on delete cascade,
  event_type text not null check (event_type in ('leave_submitted','leave_status_changed','payment_pending','approval_submitted','notice_published','document_approved','consultation_received','ai_billing_stop','ai_billing_low_balance','ai_billing_charge')),
  payload jsonb not null,
  status text not null default 'queued' check (status in ('queued','sent','failed')),
  attempts integer not null default 0,
  last_error text,
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  claim_token uuid,
  claimed_at timestamptz,
  next_attempt_at timestamptz
);
alter table public.push_events enable row level security;
revoke all on public.push_events from public,anon,authenticated,service_role;

create table public.push_event_deliveries (
  event_id bigint not null references public.push_events(id) on delete cascade,
  subscription_id uuid not null references public.push_subscriptions(id) on delete cascade,
  status text not null default 'queued' check (status in ('queued','sent','failed')),
  attempts integer not null default 0,
  last_error text,
  sent_at timestamptz,
  primary key(event_id,subscription_id)
);
alter table public.push_event_deliveries enable row level security;
revoke all on public.push_event_deliveries from public,anon,authenticated,service_role;

-- 트리거 전용 내부 함수. service_role에도 EXECUTE를 주지 않는다(트리거 함수가 owner 자격으로만 호출).
create function public.enqueue_push_event(p_event_key text,p_recipient_id uuid,p_event_type text,p_payload jsonb)
returns bigint language plpgsql security definer set search_path=public as $$
declare event_id bigint;
begin
  insert into public.push_events(event_key,recipient_id,event_type,payload)
  values(p_event_key,p_recipient_id,p_event_type,p_payload)
  on conflict(event_key) do update set event_key=excluded.event_key
  returning id into event_id;
  return event_id;
end; $$;
revoke all on function public.enqueue_push_event(text,uuid,text,jsonb) from public,anon,authenticated,service_role;

-- 연차 신청 제출/상태변경을 outbox에 적재한다. 개인정보(사유 등)는 담지 않는다.
create function public.queue_leave_push_event()
returns trigger language plpgsql security definer set search_path=public as $$
declare recipient record; requester record; event_key text; event_payload jsonb;
begin
  if tg_op='INSERT' and new.status='대기' then
    for recipient in select user_id from public.profiles where role in ('chief','owner') and active=true and approved=true loop
      event_key:=format('leave-request:%s:approver:%s:submitted',new.id,recipient.user_id);
      event_payload:=jsonb_build_object('title','연차 신청 알림','body','새 연차 신청을 확인해 주세요.','url','/hr.html?tab=leave');
      perform public.enqueue_push_event(event_key,recipient.user_id,'leave_submitted',event_payload);
    end loop;
  elsif tg_op='UPDATE' and old.status is distinct from new.status then
    select active,approved into requester from public.profiles where user_id=new.user_id;
    if requester.active is true and requester.approved is true then
      event_key:=format('leave-request:%s:employee:%s:%s',new.id,new.user_id,new.status);
      event_payload:=jsonb_build_object('title','연차 신청 상태 변경','body',format('연차 신청 상태가 %s로 변경되었습니다.',new.status),'url','/hr.html?tab=leave');
      perform public.enqueue_push_event(event_key,new.user_id,'leave_status_changed',event_payload);
    end if;
  end if;
  return new;
end; $$;
revoke all on function public.queue_leave_push_event() from public,anon,authenticated,service_role;
create trigger queue_leave_push_event after insert or update of status on public.leave_requests
for each row execute function public.queue_leave_push_event();

-- 추가 알림 payload에는 업무 원문을 담지 않는다.
-- payload에는 고정 빈 객체만 저장한다(결재 금액·계좌, 공지 본문, 문서 경로, 환자 문의 원문 제외).
create function public.queue_payment_push_event()
returns trigger language plpgsql security definer set search_path=public as $$
declare recipient record; target_role text;
begin
  if tg_op='INSERT' and new.status='chief_pending' then target_role:='chief';
  elsif tg_op='UPDATE' and old.status is distinct from new.status and new.status='owner_pending' then target_role:='owner';
  else return new; end if;
  for recipient in select user_id from public.profiles
    where role=target_role and active=true and approved=true and account_access_status='활성' loop
    perform public.enqueue_push_event(format('payment-request:%s:%s:%s',new.id,new.status,recipient.user_id),recipient.user_id,'payment_pending','{}'::jsonb);
  end loop;
  return new;
end; $$;
revoke all on function public.queue_payment_push_event() from public,anon,authenticated,service_role;
create trigger queue_payment_push_event after insert or update of status on public.payment_requests
for each row execute function public.queue_payment_push_event();

create function public.queue_approval_push_event()
returns trigger language plpgsql security definer set search_path=public as $$
declare recipient record; target_role text;
begin
  if tg_op='INSERT' and new.seq=1 and new.status='대기' then target_role:='chief';
  elsif tg_op='UPDATE' and new.seq=1 and old.status is distinct from new.status and new.status='승인' then target_role:='owner';
  else return new; end if;
  for recipient in select user_id from public.profiles
    where role=target_role and active=true and approved=true and account_access_status='활성' loop
    perform public.enqueue_push_event(format('approval-doc:%s:step:%s:%s',new.doc_id,new.seq,recipient.user_id),recipient.user_id,'approval_submitted','{}'::jsonb);
  end loop;
  return new;
end; $$;
revoke all on function public.queue_approval_push_event() from public,anon,authenticated,service_role;
create trigger queue_approval_push_event after insert or update of status on public.approval_steps
for each row execute function public.queue_approval_push_event();

create function public.queue_notice_push_event()
returns trigger language plpgsql security definer set search_path=public as $$
declare recipient record;
begin
  for recipient in select user_id from public.profiles
    where user_id is distinct from new.author_id and active=true and approved=true and account_access_status='활성' loop
    perform public.enqueue_push_event(format('notice:%s:%s',new.id,recipient.user_id),recipient.user_id,'notice_published','{}'::jsonb);
  end loop;
  return new;
end; $$;
revoke all on function public.queue_notice_push_event() from public,anon,authenticated,service_role;
create trigger queue_notice_push_event after insert on public.notices
for each row execute function public.queue_notice_push_event();

create function public.queue_document_push_event()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if old.checked_at is null and new.checked_at is not null and exists(
    select 1 from public.profiles p where p.user_id=new.user_id
      and p.active=true and p.approved=true and p.account_access_status='활성') then
    perform public.enqueue_push_event(format('employee-document:%s:approved:%s',new.id,new.user_id),new.user_id,'document_approved','{}'::jsonb);
  end if;
  return new;
end; $$;
revoke all on function public.queue_document_push_event() from public,anon,authenticated,service_role;
create trigger queue_document_push_event after update of checked_at on public.employee_documents
for each row execute function public.queue_document_push_event();

-- consultation_access_widen.sql의 최신 권한: manager/chief/owner 모두 문의함을 처리할 수 있다.
create function public.queue_consultation_push_event()
returns trigger language plpgsql security definer set search_path=public as $$
declare recipient record;
begin
  -- 외부에서 들어온 문의만 알린다. 직원이 직접 적은 문의는 알리지 않는다.
  if new.created_via is distinct from 'service_ingest' then
    return new;
  end if;
  begin
    -- 받는 사람: 실장·매니저·데스크 + 통역 Bakirova. dept 변경으로 다른 권한이 붙지 않게 직접 지정한다.
  for recipient in select user_id from public.profiles
    where active=true and approved=true
      and (role in ('chief','manager') or dept='데스크' or user_id='212cef7e-8aab-4f72-b78d-4dfca59581e0'::uuid) loop
    perform public.enqueue_push_event(format('consultation:%s:%s',new.id,recipient.user_id),recipient.user_id,'consultation_received','{}'::jsonb);
  end loop;
  exception when others then
    -- 알림 적재가 실패해도 문의 저장은 막지 않는다.
    raise warning 'consultation push enqueue failed: %', sqlerrm;
  end;
  return new;
end; $$;
revoke all on function public.queue_consultation_push_event() from public,anon,authenticated,service_role;
create trigger queue_consultation_push_event after insert on public.consultation_inbox
for each row execute function public.queue_consultation_push_event();

-- 아래부터는 push-dispatcher(service_role)만 호출하는 RPC. 전부 claim_token 소유권을 검증하는
-- SECURITY DEFINER이며, push_subscriptions/push_events/push_event_deliveries에는 service_role에게
-- 테이블 권한을 직접 주지 않는다(최소권한 — claim/record 계열 함수 EXECUTE만 부여).

create function public.claim_push_events(p_claim_token uuid,p_limit integer default 20)
returns setof public.push_events language plpgsql security definer set search_path=public as $$
declare picked public.push_events%rowtype; limit_value integer:=least(greatest(coalesce(p_limit,20),1),50);
begin
  update public.push_events
    set status='failed',last_error='max attempts reached; claim lease expired',claim_token=null,claimed_at=null
    where status='queued' and attempts>=5 and claimed_at is not null and claimed_at<now()-interval '10 minutes';
  for picked in select * from public.push_events e
    where e.status='queued' and e.attempts<5 and (e.next_attempt_at is null or e.next_attempt_at<=now())
      and (e.claimed_at is null or e.claimed_at<now()-interval '10 minutes')
    order by e.created_at for update skip locked limit limit_value loop
    update public.push_events e set claim_token=p_claim_token,claimed_at=now(),attempts=e.attempts+1 where e.id=picked.id returning e.* into picked;
    return next picked;
  end loop;
end; $$;
revoke all on function public.claim_push_events(uuid,integer) from public,anon,authenticated;
grant execute on function public.claim_push_events(uuid,integer) to service_role;

create function public.renew_push_event_claim(p_event_id bigint,p_claim_token uuid)
returns void language plpgsql security definer set search_path=public as $$
begin
  update public.push_events set claimed_at=now()
    where id=p_event_id and claim_token=p_claim_token and claimed_at is not null and claimed_at>now()-interval '10 minutes';
  if not found then raise exception 'push event claim lost'; end if;
end; $$;
revoke all on function public.renew_push_event_claim(bigint,uuid) from public,anon,authenticated;
grant execute on function public.renew_push_event_claim(bigint,uuid) to service_role;

create function public.get_push_event_recipient_status(p_event_id bigint,p_claim_token uuid)
returns table(active boolean,approved boolean) language plpgsql security definer set search_path=public as $$
declare locked_event public.push_events%rowtype;
begin
  select e.* into locked_event from public.push_events e where e.id=p_event_id;
  if not found or locked_event.claim_token is distinct from p_claim_token or locked_event.claimed_at is null or locked_event.claimed_at<now()-interval '10 minutes' then
    raise exception 'push delivery claim lost';
  end if;
  return query select p.active,p.approved from public.profiles p where p.user_id=locked_event.recipient_id;
end; $$;
revoke all on function public.get_push_event_recipient_status(bigint,uuid) from public,anon,authenticated;
grant execute on function public.get_push_event_recipient_status(bigint,uuid) to service_role;

create function public.get_push_event_subscriptions(p_event_id bigint,p_claim_token uuid)
returns table(subscription_id uuid,endpoint text,subscription jsonb) language plpgsql security definer set search_path=public as $$
declare locked_event public.push_events%rowtype;
begin
  select e.* into locked_event from public.push_events e where e.id=p_event_id;
  if not found or locked_event.claim_token is distinct from p_claim_token or locked_event.claimed_at is null or locked_event.claimed_at<now()-interval '10 minutes' then
    raise exception 'push delivery claim lost';
  end if;
  return query select s.id,s.endpoint,s.subscription from public.push_subscriptions s where s.user_id=locked_event.recipient_id;
end; $$;
revoke all on function public.get_push_event_subscriptions(bigint,uuid) from public,anon,authenticated;
grant execute on function public.get_push_event_subscriptions(bigint,uuid) to service_role;

-- HTTP 404/410로 만료가 확인된 구독만 지운다(active 컬럼이 없으므로 삭제=해제가 곧 모델).
create function public.delete_push_event_subscription(p_event_id bigint,p_claim_token uuid,p_subscription_id uuid)
returns void language plpgsql security definer set search_path=public as $$
declare locked_event public.push_events%rowtype; subscription_owner uuid;
begin
  select e.* into locked_event from public.push_events e where e.id=p_event_id;
  if not found or locked_event.claim_token is distinct from p_claim_token or locked_event.claimed_at is null or locked_event.claimed_at<now()-interval '10 minutes' then
    raise exception 'push delivery claim lost';
  end if;
  select s.user_id into subscription_owner from public.push_subscriptions s where s.id=p_subscription_id;
  if subscription_owner is null or subscription_owner is distinct from locked_event.recipient_id then raise exception 'push subscription owner mismatch'; end if;
  delete from public.push_subscriptions where id=p_subscription_id;
end; $$;
revoke all on function public.delete_push_event_subscription(bigint,uuid,uuid) from public,anon,authenticated;
grant execute on function public.delete_push_event_subscription(bigint,uuid,uuid) to service_role;

create function public.seed_push_event_deliveries(p_event_id bigint,p_claim_token uuid,p_subscription_ids uuid[])
returns void language plpgsql security definer set search_path=public as $$
declare locked_event public.push_events%rowtype;
begin
  select e.* into locked_event from public.push_events e where e.id=p_event_id;
  if not found or locked_event.claim_token is distinct from p_claim_token or locked_event.claimed_at is null or locked_event.claimed_at<now()-interval '10 minutes' then
    raise exception 'push delivery claim lost';
  end if;
  insert into public.push_event_deliveries(event_id,subscription_id,status)
  select p_event_id,sid,'queued' from unnest(p_subscription_ids) sid
  on conflict(event_id,subscription_id) do nothing;
end; $$;
revoke all on function public.seed_push_event_deliveries(bigint,uuid,uuid[]) from public,anon,authenticated;
grant execute on function public.seed_push_event_deliveries(bigint,uuid,uuid[]) to service_role;

create function public.get_push_event_deliveries(p_event_id bigint,p_claim_token uuid)
returns table(subscription_id uuid,status text) language plpgsql security definer set search_path=public as $$
declare locked_event public.push_events%rowtype;
begin
  select e.* into locked_event from public.push_events e where e.id=p_event_id;
  if not found or locked_event.claim_token is distinct from p_claim_token or locked_event.claimed_at is null or locked_event.claimed_at<now()-interval '10 minutes' then
    raise exception 'push delivery claim lost';
  end if;
  return query select d.subscription_id,d.status from public.push_event_deliveries d where d.event_id=p_event_id;
end; $$;
revoke all on function public.get_push_event_deliveries(bigint,uuid) from public,anon,authenticated;
grant execute on function public.get_push_event_deliveries(bigint,uuid) to service_role;

-- delivery 상태와 만료 구독 삭제는 event claim 소유권을 잠근 단일 트랜잭션에서 처리한다.
create function public.record_push_delivery(p_event_id bigint,p_subscription_id uuid,p_claim_token uuid,p_outcome text,p_attempts integer)
returns void language plpgsql security definer set search_path=public as $$
declare locked_event public.push_events%rowtype; subscription_owner uuid;
begin
  select * into locked_event from public.push_events where id=p_event_id for update;
  if not found or locked_event.claim_token is distinct from p_claim_token or locked_event.claimed_at is null or locked_event.claimed_at<now()-interval '10 minutes' then
    raise exception 'push delivery claim lost';
  end if;
  select s.user_id into subscription_owner from public.push_subscriptions s where s.id=p_subscription_id;
  if subscription_owner is null or subscription_owner is distinct from locked_event.recipient_id then raise exception 'push subscription owner mismatch'; end if;
  if p_outcome not in ('sent','expired','failed') then raise exception 'invalid push delivery outcome'; end if;
  update public.push_event_deliveries
    set status=case when p_outcome='sent' then 'sent' else 'failed' end,
        attempts=p_attempts,
        last_error=case when p_outcome='expired' then 'subscription expired' when p_outcome='sent' then null else 'send failed' end,
        sent_at=case when p_outcome='sent' then now() else null end
    where event_id=p_event_id and subscription_id=p_subscription_id;
  if not found then raise exception 'push delivery row missing'; end if;
  if p_outcome='expired' then
    delete from public.push_subscriptions where id=p_subscription_id and user_id=locked_event.recipient_id;
    if not found then raise exception 'push subscription row missing'; end if;
  end if;
end; $$;
revoke all on function public.record_push_delivery(bigint,uuid,uuid,text,integer) from public,anon,authenticated;
grant execute on function public.record_push_delivery(bigint,uuid,uuid,text,integer) to service_role;

create function public.release_push_event(p_event_id bigint,p_claim_token uuid,p_status text,p_last_error text default null,p_next_attempt_at timestamptz default null,p_sent_at timestamptz default null)
returns void language plpgsql security definer set search_path=public as $$
begin
  if p_status not in ('queued','sent','failed') then raise exception 'invalid push event status'; end if;
  update public.push_events
    set status=p_status,last_error=p_last_error,next_attempt_at=p_next_attempt_at,sent_at=p_sent_at,claim_token=null,claimed_at=null
    where id=p_event_id and claim_token=p_claim_token;
  if not found then raise exception 'push event claim lost'; end if;
end; $$;
revoke all on function public.release_push_event(bigint,uuid,text,text,timestamptz,timestamptz) from public,anon,authenticated;
grant execute on function public.release_push_event(bigint,uuid,text,text,timestamptz,timestamptz) to service_role;
commit;
