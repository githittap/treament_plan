-- Restore the exact pre-change function and policy behavior read from production.
begin;

CREATE OR REPLACE FUNCTION public.set_leave_balance(p_user_id uuid, p_target numeric, p_note text DEFAULT NULL::text)
 RETURNS TABLE(user_id uuid, previous_balance numeric, target_balance numeric, delta numeric, ledger_id bigint)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare prev numeric; d numeric; lid bigint;
begin
  if auth.uid() is null or not exists(select 1 from public.profiles as p where p.user_id=auth.uid() and p.active and p.approved) or coalesce(public.my_role(),'')<>'owner' or p_target is null or p_target<0 or p_target in ('NaN'::numeric,'Infinity'::numeric,'-Infinity'::numeric) then raise exception 'not allowed or invalid target'; end if;
  if not exists(select 1 from public.profiles as p where p.user_id=p_user_id) then raise exception 'profile not found'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text,0));
  select coalesce(sum(case when ll.kind in ('부여','조정') then ll.days when ll.kind='사용' then -ll.days else 0 end),0) into prev from public.leave_ledger as ll where ll.user_id=p_user_id;
  d:=p_target-prev;
  insert into public.leave_ledger(user_id,kind,days,note) values(p_user_id,'조정',d,coalesce(p_note,'절대 잔액 설정: '||p_target||'일')) returning id into lid;
  return query select p_user_id,prev,p_target,d,lid;
end; $function$;

CREATE OR REPLACE FUNCTION public.grant_leave_entry(p_user_id uuid, p_kind text, p_days numeric, p_note text DEFAULT NULL::text)
 RETURNS TABLE(ledger_id bigint, days numeric)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare lid bigint;
begin
  if auth.uid() is null or not exists(select 1 from public.profiles as p where p.user_id=auth.uid() and p.active and p.approved) or coalesce(public.my_role(),'')<>'owner' or p_days is null or p_days<0 or p_days in ('NaN'::numeric,'Infinity'::numeric,'-Infinity'::numeric) or p_kind not in ('부여','조정') then raise exception 'not allowed or invalid leave entry'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text,0));
  insert into public.leave_ledger(user_id,kind,days,note) values(p_user_id,p_kind,p_days,p_note) returning id into lid;
  return query select lid,p_days;
end; $function$;

CREATE OR REPLACE FUNCTION public.process_leave_request(p_id bigint, p_action text)
 RETURNS TABLE(request_id bigint, status text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare r public.leave_requests%rowtype; role_name text;
begin
  if public.my_role()='deputy' then raise exception 'deputy contract-only role'; end if;
  if auth.uid() is null or not exists(select 1 from public.profiles as p where p.user_id=auth.uid() and p.active and p.approved) then raise exception 'active approved profile required'; end if;
  select * into r from public.leave_requests as lr where lr.id=p_id for update;
  if not found then raise exception 'leave request not found'; end if;
  role_name:=coalesce(public.my_role(),'');
  if p_action='cancel' then
    if r.user_id<>auth.uid() or r.status<>'대기' or not exists(select 1 from public.profiles as p where p.user_id=auth.uid() and p.active and p.approved) then raise exception 'only own pending request can be cancelled'; end if;
    update public.leave_requests as lr set status='취소',cancelled_by=(select p.name from public.profiles as p where p.user_id=auth.uid()),cancelled_at=now() where lr.id=p_id and lr.user_id=auth.uid() and lr.status='대기';
    if not found then raise exception 'request changed before cancellation'; end if;
  elsif p_action='cancel_approved' then
    if role_name<>'owner' or r.status<>'승인' then raise exception 'only owner can cancel approved request'; end if;
    perform pg_advisory_xact_lock(hashtextextended(r.user_id::text,0));
    update public.leave_requests as lr set status='취소',cancelled_by=(select p.name from public.profiles as p where p.user_id=auth.uid()),cancelled_at=now() where lr.id=p_id and lr.status='승인';
    if not found then raise exception 'request changed before approved cancellation'; end if;
    if not exists(select 1 from public.leave_ledger as ll where ll.ref=p_id and ll.kind='조정' and ll.note like '승인취소 복구:%') then
      insert into public.leave_ledger(user_id,kind,days,ref,note) values(r.user_id,'조정',r.days,p_id,format('승인취소 복구: %s %s~%s',r.type,r.date_from,r.date_to));
    end if;
  else
    if role_name not in ('chief','owner') then raise exception 'not allowed'; end if;
    if p_action='approve' then
      if role_name<>'chief' or r.status not in ('대기','1차승인') then raise exception 'chief approval is not allowed'; end if;
      perform pg_advisory_xact_lock(hashtextextended(r.user_id::text,0));
      update public.leave_requests as lr set status='승인',chief_by=(select p.name from public.profiles as p where p.user_id=auth.uid()),chief_at=now() where lr.id=p_id and lr.status in ('대기','1차승인');
      if not found then raise exception 'request changed before approval'; end if;
      if not exists(select 1 from public.leave_ledger as ll where ll.ref=p_id and ll.kind='사용') then insert into public.leave_ledger(user_id,kind,days,ref,note) values(r.user_id,'사용',r.days,p_id,format('%s %s~%s',r.type,r.date_from,r.date_to)); end if;
    elsif p_action='reject' then
      if r.status not in ('대기','1차승인') then raise exception 'rejection is not allowed'; end if;
      update public.leave_requests as lr set status='반려',chief_by=case when role_name='chief' then (select p.name from public.profiles as p where p.user_id=auth.uid()) else lr.chief_by end,chief_at=case when role_name='chief' then now() else lr.chief_at end where lr.id=p_id and lr.status in ('대기','1차승인');
      if not found then raise exception 'request changed before rejection'; end if;
    else raise exception 'unknown leave action'; end if;
  end if;
  return query select lr.id,lr.status from public.leave_requests as lr where lr.id=p_id;
end; $function$;

CREATE OR REPLACE FUNCTION public.process_leave_change(p_id bigint, p_action text)
 RETURNS TABLE(change_id bigint, status text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare c public.leave_change_requests%rowtype; r public.leave_requests%rowtype; role_name text; restored numeric; half_days numeric:=0.5; half_setting text;
begin
  role_name:=coalesce(public.my_role(),'');
  if not public.employee_hub_access_allowed() or role_name not in ('chief','owner') or p_action is null or p_action not in ('approve','reject') or (p_action='approve' and role_name<>'chief') then raise exception 'chief approval or lead rejection required'; end if;
  select * into c from public.leave_change_requests where id=p_id for update;
  if not found or c.status<>'대기' then raise exception 'pending change required'; end if;
  if p_action='approve' then
    select * into r from public.leave_requests where id=c.request_id for update;
    if not found or r.status<>'승인' or r.date_from<(now() at time zone 'Asia/Seoul')::date or (c.action='half' and r.type<>'연차') then raise exception 'original leave changed or date passed'; end if;
    perform pg_advisory_xact_lock(hashtextextended(r.user_id::text,0));
    select value into half_setting from public.app_settings where key='leave.half_day_value';
    if coalesce(half_setting,'') ~ '^[0-9]+(\.[0-9]+)?$' and length(half_setting)<20 then
      if half_setting::numeric between 0.1 and 1 and mod(half_setting::numeric,0.1)=0 then half_days:=half_setting::numeric; end if;
    end if;
    if c.action='half' and r.days<half_days then raise exception 'original leave shorter than half-day value'; end if;
    restored:=case when c.action='cancel' then r.days else r.days-half_days end;
    if c.action='cancel' then
      update public.leave_requests set status='취소',cancelled_by=(select name from public.profiles where user_id=auth.uid()),cancelled_at=now() where id=r.id;
    else
      update public.leave_requests set type='반차',type_note=c.type_note,days=half_days where id=r.id;
    end if;
    insert into public.leave_ledger(user_id,kind,days,ref,note) values(r.user_id,'조정',restored,r.id,format('승인취소 복구: 변경요청 %s (%s)',c.id,c.action));
  end if;
  update public.leave_change_requests set status=case when p_action='approve' then '승인' else '반려' end,processed_at=now(),processed_by=auth.uid() where id=c.id;
  return query select lc.id,lc.status from public.leave_change_requests lc where lc.id=c.id;
end $function$;

CREATE OR REPLACE FUNCTION public.queue_leave_push_event()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
end; $function$;

CREATE OR REPLACE FUNCTION public.queue_leave_change_push()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare recipient record;
begin
  if tg_op='INSERT' then
    for recipient in select user_id from public.p7_notify_recipients('leave_request',array(select user_id from public.profiles where role in ('chief','owner') and active and approved),new.user_id) loop
      perform public.enqueue_push_event(format('leave-change:%s:submitted:%s',new.id,recipient.user_id),recipient.user_id,'leave_submitted',jsonb_build_object('url','/hr.html?tab=leave'));
    end loop;
  elsif old.status is distinct from new.status then
    for recipient in select user_id from public.p7_notify_recipients('leave_result',array[new.user_id],new.user_id) loop
      perform public.enqueue_push_event(format('leave-change:%s:%s:%s',new.id,new.status,recipient.user_id),recipient.user_id,'leave_status_changed',jsonb_build_object('url','/hr.html?tab=leave'));
    end loop;
  end if;
  return new;
end $function$;


drop policy if exists leave_ledger_select_scoped on public.leave_ledger;
create policy leave_ledger_select_scoped on public.leave_ledger for select to authenticated
using ((user_id=auth.uid()) or (my_role()=any(array['chief'::text,'owner'::text])));

drop policy if exists leave_requests_select_scoped on public.leave_requests;
create policy leave_requests_select_scoped on public.leave_requests for select to authenticated
using ((user_id=auth.uid()) or (my_role()=any(array['chief'::text,'owner'::text])) or status='승인');

drop policy if exists leave_change_read on public.leave_change_requests;
create policy leave_change_read on public.leave_change_requests for select to authenticated
using (employee_hub_access_allowed() and ((user_id=auth.uid()) or (my_role()=any(array['chief'::text,'owner'::text]))));

drop policy if exists leave_accrual_runs_select_lead on public.leave_accrual_runs;
create policy leave_accrual_runs_select_lead on public.leave_accrual_runs for select to authenticated
using ((my_role()=any(array['chief'::text,'owner'::text])) and exists (
  select 1 from profiles p
  where p.user_id=auth.uid() and p.active=true and p.approved=true
));

drop policy if exists leave_application_documents_select_scoped on public.leave_application_documents;
create policy leave_application_documents_select_scoped on public.leave_application_documents for select to authenticated
using (exists (
  select 1 from profiles p
  where p.user_id=auth.uid() and p.active=true and p.approved=true
) and ((user_id=auth.uid()) or (my_role()=any(array['manager'::text,'chief'::text,'owner'::text]))));

drop policy if exists leave_application_documents_insert_self on public.leave_application_documents;
create policy leave_application_documents_insert_self on public.leave_application_documents for insert to authenticated
with check (
  user_id=auth.uid()
  and exists (
    select 1 from leave_requests r
    where r.id=leave_application_documents.request_id
      and r.user_id=auth.uid()
  )
  and exists (
    select 1 from profiles p
    where p.user_id=auth.uid() and p.active=true and p.approved=true
  )
);

drop policy if exists leave_application_documents_delete_owner on public.leave_application_documents;
create policy leave_application_documents_delete_owner on public.leave_application_documents for delete to authenticated
using (my_role()='owner');

drop policy if exists leave_docs_select_scoped on storage.objects;
create policy leave_docs_select_scoped on storage.objects for select to authenticated
using (
  bucket_id='leave-docs'
  and exists (
    select 1 from profiles p
    where p.user_id=auth.uid() and p.active=true and p.approved=true
  )
  and (
    (my_role()=any(array['manager'::text,'chief'::text,'owner'::text]))
    or (storage.foldername(name))[1]=auth.uid()::text
  )
);

drop policy if exists leave_docs_insert_self on storage.objects;
create policy leave_docs_insert_self on storage.objects for insert to authenticated
with check (
  bucket_id='leave-docs'
  and exists (
    select 1 from profiles p
    where p.user_id=auth.uid() and p.active=true and p.approved=true
  )
  and (storage.foldername(name))[1]=auth.uid()::text
);

drop policy if exists leave_docs_delete_temp on storage.objects;
create policy leave_docs_delete_temp on storage.objects for delete to authenticated
using (
  bucket_id='leave-docs'
  and exists (
    select 1 from profiles p
    where p.user_id=auth.uid() and p.active=true and p.approved=true
  )
  and (storage.foldername(name))[1]=auth.uid()::text
  and (storage.foldername(name))[2]='tmp'
  and not exists (
    select 1 from leave_application_documents d
    where d.storage_path=objects.name
  )
);


drop function if exists public.leave_manager_can_approve();
drop function if exists public.leave_manager_allowed();

delete from public.app_settings
where key in ('leave.manager_access_enabled','leave.manager_can_approve');

commit;
