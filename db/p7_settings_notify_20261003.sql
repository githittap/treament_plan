-- P7 5장 브랜치 검토용 초안. 운영 반영은 별도 검수 후 수행함.
-- 선행: push_notifications_draft, ai_billing_alerts_draft, employment phase B/C, app_settings.
-- 기존 서버 함수 원문을 저장하여 실제 적용 직전 동작 그대로 되돌림. 설정값·알림·인사 이력은 건드리지 않음.
begin;
create table if not exists public.p7_settings_notify_backup(signature text primary key,definition text not null);
alter table public.p7_settings_notify_backup add column if not exists applied_definition text;
create table if not exists public.p7_settings_notify_backup_history(
  signature text not null,apply_round bigint not null,definition text not null,
  saved_at timestamptz not null default now(),primary key(signature,apply_round)
);
revoke all on public.p7_settings_notify_backup from public,anon,authenticated,service_role;
revoke all on public.p7_settings_notify_backup_history from public,anon,authenticated,service_role;
do $$ declare v_signature text;current_definition text;saved record;next_round bigint; begin
  lock table public.p7_settings_notify_backup,public.p7_settings_notify_backup_history in share row exclusive mode;
  foreach v_signature in array array['public.queue_leave_push_event()','public.queue_payment_push_event()','public.queue_approval_push_event()','public.queue_notice_push_event()','public.queue_document_push_event()','public.queue_consultation_push_event()','public.queue_ai_billing_alert_push()','public.can_dispatch_ai_billing_push(bigint,uuid)','public.set_employment_status(uuid,text,date,text)'] loop
    if to_regprocedure(v_signature) is null then raise exception 'P7 prerequisite missing: %',v_signature; end if;
    current_definition:=pg_get_functiondef(to_regprocedure(v_signature));
    select b.* into saved from public.p7_settings_notify_backup b where b.signature=v_signature;
    if not found then
      insert into public.p7_settings_notify_backup(signature,definition) values(v_signature,current_definition);
      insert into public.p7_settings_notify_backup_history(signature,apply_round,definition) values(v_signature,1,current_definition);
    elsif current_definition is distinct from saved.definition and current_definition is distinct from saved.applied_definition then
      insert into public.p7_settings_notify_backup_history(signature,apply_round,definition)
        values(v_signature,1,saved.definition) on conflict do nothing;
      -- 되돌린 뒤 새 정상 수정이 있으면 그 회차 원문을 추가로 보존하고 이번 되돌리기 기준으로 사용함.
      select coalesce(max(h.apply_round),0)+1 into next_round from public.p7_settings_notify_backup_history h where h.signature=v_signature;
      insert into public.p7_settings_notify_backup_history(signature,apply_round,definition) values(v_signature,next_round,current_definition);
      update public.p7_settings_notify_backup b set definition=current_definition where b.signature=v_signature;
    end if;
  end loop;
end $$;
-- 미설정 칸은 기존 트리거가 정한 대상·처리단계를 그대로 사용함(문의의 실장만 기본 끔).
-- 명시한 true/false는 기존 대상보다 우선함. 신청자 본인 칸은 본인에게만 적용함.
create or replace function public.p7_notify_recipients(p_kind text,p_defaults uuid[],p_subject uuid default null)
returns table(user_id uuid) language sql stable security definer set search_path='' as $$
 select p.user_id from public.profiles p
 left join public.app_settings own on own.key='notify.'||p_kind||'.applicant' and p.user_id=p_subject
 left join public.app_settings role_setting on role_setting.key='notify.'||p_kind||'.'||
   case when p.role in ('owner','chief','manager') then p.role when p.dept='데스크' then 'desk' else '' end
 where p.active=true and p.approved=true and p.account_access_status is distinct from '차단'
 and coalesce(case when own.value in ('true','false') then own.value::boolean end,
   case when role_setting.value in ('true','false') then role_setting.value::boolean end,
   case when p_kind='inquiry' and p.role='chief' then false else p.user_id=any(coalesce(p_defaults,array[]::uuid[])) end);
$$;
revoke all on function public.p7_notify_recipients(text,uuid[],uuid) from public,anon,authenticated,service_role;
-- 상태 지정만 실장·매니저에 허용함. 영구 차단/삭제 함수와 원장 전용 helper는 그대로임.
create or replace function public.assert_employment_lead(p_user_id uuid) returns uuid
language plpgsql security definer set search_path='' as $$
declare a uuid:=auth.uid();actor_role text;target_role text;
begin
 if not public.employee_hub_access_allowed() then raise exception 'employee hub access required';end if;
 select role into actor_role from public.profiles where user_id=a;
 if actor_role not in ('owner','chief','manager') then raise exception 'active approved employment lead required';end if;
 select role into target_role from public.profiles where user_id=p_user_id for update;
 if not found then raise exception 'profile not found';end if;
 if a=p_user_id then raise exception 'cannot change your own employment status';end if;
 if actor_role='owner' then return public.assert_employment_owner(p_user_id);end if;
 if target_role='owner' then raise exception 'only owner can change owner status';end if;
 return a;
end $$;
revoke all on function public.assert_employment_lead(uuid) from public,anon,authenticated,service_role;
create or replace function public.queue_leave_push_event()
returns trigger language plpgsql security definer set search_path=public as $$
declare recipient record; requester record; event_key text; event_payload jsonb;
begin
  if tg_op='INSERT' and new.status='대기' then
    for recipient in select user_id from public.p7_notify_recipients('leave_request',array(select user_id from public.profiles where role in ('chief','owner') and active=true and approved=true),new.user_id) loop
      event_key:=format('leave-request:%s:approver:%s:submitted',new.id,recipient.user_id);
      event_payload:=jsonb_build_object('title','연차 신청 알림','body','새 연차 신청을 확인해 주세요.','url','/hr.html?tab=leave');
      perform public.enqueue_push_event(event_key,recipient.user_id,'leave_submitted',event_payload);
    end loop;
  elsif tg_op='UPDATE' and old.status is distinct from new.status then
    for recipient in select user_id from public.p7_notify_recipients('leave_result',array[new.user_id],new.user_id) loop
      event_key:=format('leave-request:%s:employee:%s:%s',new.id,recipient.user_id,new.status);
      event_payload:=jsonb_build_object('title','연차 신청 상태 변경','body',format('연차 신청 상태가 %s로 변경되었습니다.',new.status),'url','/hr.html?tab=leave');
      perform public.enqueue_push_event(event_key,recipient.user_id,'leave_status_changed',event_payload);
    end loop;
  end if;
  return new;
end; $$;

create or replace function public.queue_payment_push_event()
returns trigger language plpgsql security definer set search_path=public as $$
declare recipient record; target_role text;
begin
  if tg_op='INSERT' and new.status='chief_pending' then target_role:='chief';
  elsif tg_op='UPDATE' and old.status is distinct from new.status and new.status='owner_pending' then target_role:='owner';
  else return new; end if;
  for recipient in select user_id from public.p7_notify_recipients('payment',array(select user_id from public.profiles
    where role=target_role and active=true and approved=true and account_access_status='활성'),new.requester_id) loop
    perform public.enqueue_push_event(format('payment-request:%s:%s:%s',new.id,new.status,recipient.user_id),recipient.user_id,'payment_pending','{}'::jsonb);
  end loop;
  return new;
end; $$;

create or replace function public.queue_approval_push_event()
returns trigger language plpgsql security definer set search_path=public as $$
declare recipient record; target_role text;
begin
  if tg_op='INSERT' and new.seq=1 and new.status='대기' then target_role:='chief';
  elsif tg_op='UPDATE' and new.seq=1 and old.status is distinct from new.status and new.status='승인' then target_role:='owner';
  else return new; end if;
  for recipient in select user_id from public.p7_notify_recipients('approval',array(select user_id from public.profiles
    where role=target_role and active=true and approved=true and account_access_status='활성'),(select author from public.approval_docs where id=new.doc_id)) loop
    perform public.enqueue_push_event(format('approval-doc:%s:step:%s:%s:%s',new.doc_id,new.seq,target_role,recipient.user_id),recipient.user_id,'approval_submitted','{}'::jsonb);
  end loop;
  return new;
end; $$;

create or replace function public.queue_notice_push_event()
returns trigger language plpgsql security definer set search_path=public as $$
declare recipient record;
begin
  for recipient in select user_id from public.p7_notify_recipients('notice',array(select user_id from public.profiles
    where user_id is distinct from new.author_id and active=true and approved=true and account_access_status='활성'),new.author_id) loop
    perform public.enqueue_push_event(format('notice:%s:%s',new.id,recipient.user_id),recipient.user_id,'notice_published','{}'::jsonb);
  end loop;
  return new;
end; $$;

create or replace function public.queue_document_push_event()
returns trigger language plpgsql security definer set search_path=public as $$
declare recipient record;
begin
  if old.checked_at is null and new.checked_at is not null then
    for recipient in select user_id from public.p7_notify_recipients('document',array[new.user_id],new.user_id) loop
      perform public.enqueue_push_event(format('employee-document:%s:approved:%s',new.id,recipient.user_id),recipient.user_id,'document_approved','{}'::jsonb);
    end loop;
  end if;
  return new;
end; $$;

create or replace function public.queue_consultation_push_event()
returns trigger language plpgsql security definer set search_path=public as $$
declare recipient record;
begin
  -- 외부에서 들어온 문의만 알린다. 직원이 직접 적은 문의는 알리지 않는다.
  if new.created_via is distinct from 'service_ingest' then
    return new;
  end if;
  begin
    -- 받는 사람: 실장·매니저·데스크 + 통역 Bakirova. dept 변경으로 다른 권한이 붙지 않게 직접 지정한다.
  for recipient in select user_id from public.p7_notify_recipients('inquiry',array(select user_id from public.profiles
    where active=true and approved=true
      and (role in ('chief','manager') or dept='데스크' or user_id='212cef7e-8aab-4f72-b78d-4dfca59581e0'::uuid)),null) loop
    perform public.enqueue_push_event(format('consultation:%s:%s',new.id,recipient.user_id),recipient.user_id,'consultation_received','{}'::jsonb);
  end loop;
  exception when others then
    -- 알림 적재가 실패해도 문의 저장은 막지 않는다.
    raise warning 'consultation push enqueue failed: %', sqlerrm;
  end;
  return new;
end; $$;

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
    select user_id from public.p7_notify_recipients('advertising',array(    select p.user_id from public.profiles p
     where p.role='owner' and p.active is true and p.approved is true and p.account_access_status is distinct from '차단'
    union
    select p.user_id from public.profiles p
     where p.role='manager' and p.active is true and p.approved is true and p.account_access_status is distinct from '차단'
       and not exists(select 1 from public.ai_billing_alert_recipients r where r.user_id=p.user_id and r.enabled=false)),null) recipient where not exists(select 1 from public.ai_billing_alert_recipients r join public.profiles p on p.user_id=r.user_id where r.user_id=recipient.user_id and p.role='manager' and r.enabled=false)
  loop
    begin
      perform public.enqueue_push_event(format('ai-billing:%s:%s',new.id,v_recipient.user_id),v_recipient.user_id,v_type,v_payload);
    exception when others then
      raise warning 'ai billing push enqueue failed for event %',new.id;
    end;
  end loop;
  return new;
end $$;

create or replace function public.can_dispatch_ai_billing_push(p_event_id bigint,p_claim_token uuid)
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
  return exists(select 1 from public.p7_notify_recipients('advertising',array(
    select p.user_id from public.profiles p where p.role='owner' or (p.role='manager' and not exists(
      select 1 from public.ai_billing_alert_recipients r where r.user_id=p.user_id and r.enabled=false))
  )) enabled where enabled.user_id=locked_event.recipient_id)
  and not exists(select 1 from public.ai_billing_alert_recipients r where r.user_id=locked_event.recipient_id and recipient.role='manager' and r.enabled=false);
end $$;

create or replace function public.set_employment_status(p_user_id uuid,p_employment_status text,p_effective_date date,p_reason text) returns void language plpgsql security definer set search_path='' as $$ declare a uuid;b text;s text;begin if p_employment_status not in('재직','자진퇴사','계약만료','권고사직') or p_effective_date is null then raise exception 'invalid employment status or effective date';end if;a:=public.assert_employment_lead(p_user_id);select employment_status,account_access_status into b,s from public.profiles where user_id=p_user_id for update;if p_employment_status='재직' and s='차단' then raise exception 'blocked account cannot return to employed status';end if;update public.profiles set employment_status=p_employment_status,employment_effective_date=p_effective_date,employment_reason=nullif(btrim(p_reason),''),active=(p_employment_status='재직'),approved=case when p_employment_status='재직' then approved else false end where user_id=p_user_id;if p_employment_status<>'재직' then update public.schedule_people set active=false,included_in_schedule=false where profile_user_id=p_user_id;end if;insert into public.profile_employment_history(user_id,from_status,to_status,effective_date,reason,account_action,acted_by) values(p_user_id,b,p_employment_status,p_effective_date,nullif(btrim(p_reason),''),'상태변경',a);end $$;
update public.p7_settings_notify_backup b set applied_definition=pg_get_functiondef(to_regprocedure(b.signature));
commit;
