-- 2026-09 직원허브 1단계 연차 흐름. 원격 적용은 좁은 변경 단위로 검토한다.
create or replace function public.replace_pending_leave_request(p_id bigint,p_type text,p_type_note text,p_date_from date,p_date_to date,p_days numeric,p_reason text,p_contact text,p_special boolean,p_special_reason text)
returns table(request_id bigint,status text) language plpgsql security definer set search_path=public as $$
begin
  if auth.uid() is null or p_date_from is null or p_date_to is null or p_date_to<p_date_from or p_days is null or p_days<0 or p_days in ('NaN'::numeric,'Infinity'::numeric,'-Infinity'::numeric) then raise exception 'invalid leave request'; end if;
  update public.leave_requests as lr set type=p_type,type_note=p_type_note,date_from=p_date_from,date_to=p_date_to,days=p_days,reason=p_reason,contact=p_contact,special=coalesce(p_special,false),special_reason=p_special_reason
    where lr.id=p_id and lr.user_id=auth.uid() and lr.status='대기' and exists(select 1 from public.profiles as p where p.user_id=auth.uid() and p.active and p.approved);
  if not found then raise exception 'only own pending request can be edited'; end if;
  return query select lr.id,lr.status from public.leave_requests as lr where lr.id=p_id;
end; $$;

-- chief 승인과 사용 차감은 하나의 트랜잭션으로 처리한다. 직원 취소는 본인 대기 건만 허용한다.
create or replace function public.process_leave_request(p_id bigint,p_action text)
returns table(request_id bigint,status text) language plpgsql security definer set search_path=public as $$
declare r public.leave_requests%rowtype; role_name text;
begin
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
end; $$;

create or replace function public.grant_leave_entry(p_user_id uuid,p_kind text,p_days numeric,p_note text default null)
returns table(ledger_id bigint,days numeric) language plpgsql security definer set search_path=public as $$
declare lid bigint;
begin
  if auth.uid() is null or not exists(select 1 from public.profiles as p where p.user_id=auth.uid() and p.active and p.approved) or coalesce(public.my_role(),'')<>'owner' or p_days is null or p_days<0 or p_days in ('NaN'::numeric,'Infinity'::numeric,'-Infinity'::numeric) or p_kind not in ('부여','조정') then raise exception 'not allowed or invalid leave entry'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text,0));
  insert into public.leave_ledger(user_id,kind,days,note) values(p_user_id,p_kind,p_days,p_note) returning id into lid;
  return query select lid,p_days;
end; $$;

create or replace function public.set_leave_balance(p_user_id uuid,p_target numeric,p_note text default null)
returns table(user_id uuid,previous_balance numeric,target_balance numeric,delta numeric,ledger_id bigint) language plpgsql security definer set search_path=public as $$
declare prev numeric; d numeric; lid bigint;
begin
  if auth.uid() is null or not exists(select 1 from public.profiles as p where p.user_id=auth.uid() and p.active and p.approved) or coalesce(public.my_role(),'')<>'owner' or p_target is null or p_target<0 or p_target in ('NaN'::numeric,'Infinity'::numeric,'-Infinity'::numeric) then raise exception 'not allowed or invalid target'; end if;
  if not exists(select 1 from public.profiles as p where p.user_id=p_user_id) then raise exception 'profile not found'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text,0));
  select coalesce(sum(case when ll.kind in ('부여','조정') then ll.days when ll.kind='사용' then -ll.days else 0 end),0) into prev from public.leave_ledger as ll where ll.user_id=p_user_id;
  d:=p_target-prev;
  insert into public.leave_ledger(user_id,kind,days,note) values(p_user_id,'조정',d,coalesce(p_note,'절대 잔액 설정: '||p_target||'일')) returning id into lid;
  return query select p_user_id,prev,p_target,d,lid;
end; $$;

revoke all on function public.replace_pending_leave_request(bigint,text,text,date,date,numeric,text,text,boolean,text) from public, anon;
revoke all on function public.process_leave_request(bigint,text) from public, anon;
revoke all on function public.grant_leave_entry(uuid,text,numeric,text) from public, anon;
revoke all on function public.set_leave_balance(uuid,numeric,text) from public, anon;
grant execute on function public.replace_pending_leave_request(bigint,text,text,date,date,numeric,text,text,boolean,text) to authenticated;
grant execute on function public.process_leave_request(bigint,text) to authenticated;
grant execute on function public.grant_leave_entry(uuid,text,numeric,text) to authenticated;
grant execute on function public.set_leave_balance(uuid,numeric,text) to authenticated;
