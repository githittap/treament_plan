-- 직원 건의 1: 승인 연차 변경. 운영에는 검수·원장 승인 뒤 적용함.
begin;
create table if not exists public.leave_change_requests (
  id bigint generated always as identity primary key,
  request_id bigint not null references public.leave_requests(id),
  user_id uuid not null references public.profiles(user_id),
  action text not null check(action in ('cancel','half')),
  type_note text, reason text not null check(length(trim(reason))>0),
  status text not null default '대기' check(status in ('대기','승인','반려')),
  created_at timestamptz not null default now(), processed_at timestamptz, processed_by uuid
);
create unique index if not exists leave_change_one_pending on public.leave_change_requests(request_id) where status='대기';
alter table public.leave_change_requests enable row level security;
revoke all on public.leave_change_requests from public,anon,authenticated;
grant select on public.leave_change_requests to authenticated;
drop policy if exists leave_change_read on public.leave_change_requests;
create policy leave_change_read on public.leave_change_requests for select to authenticated
  using(public.employee_hub_access_allowed() and (user_id=auth.uid() or public.my_role() in ('chief','owner')));

create or replace function public.request_leave_change(p_request_id bigint,p_action text,p_reason text,p_type_note text default null)
returns bigint language plpgsql security definer set search_path=public as $$
declare r public.leave_requests%rowtype; new_id bigint;
begin
  if not public.employee_hub_access_allowed() then raise exception 'active approved profile required'; end if;
  select * into r from public.leave_requests where id=p_request_id for update;
  if not found or r.user_id<>auth.uid() or r.status<>'승인' or r.date_from<(now() at time zone 'Asia/Seoul')::date then raise exception 'only own future approved leave can be changed'; end if;
  if p_action is null or p_action not in ('cancel','half') or p_reason is null or length(trim(p_reason))=0 then raise exception 'action and reason required'; end if;
  if p_action='half' and (r.type<>'연차' or r.days<=0 or p_type_note is null or p_type_note !~ '^[0-2][0-9]:[0-5][0-9]~[0-2][0-9]:[0-5][0-9]$') then raise exception 'full leave and half-day time range required'; end if;
  if p_action='half' and (split_part(p_type_note,'~',1)::time>=split_part(p_type_note,'~',2)::time) then raise exception 'invalid half-day time range'; end if;
  insert into public.leave_change_requests(request_id,user_id,action,reason,type_note) values(r.id,r.user_id,p_action,trim(p_reason),p_type_note) returning id into new_id;
  return new_id;
end $$;

create or replace function public.process_leave_change(p_id bigint,p_action text)
returns table(change_id bigint,status text) language plpgsql security definer set search_path=public as $$
declare c public.leave_change_requests%rowtype; r public.leave_requests%rowtype; role_name text; restored numeric;
begin
  role_name:=coalesce(public.my_role(),'');
  if not public.employee_hub_access_allowed() or role_name not in ('chief','owner') or p_action is null or p_action not in ('approve','reject') or (p_action='approve' and role_name<>'chief') then raise exception 'chief approval or lead rejection required'; end if;
  select * into c from public.leave_change_requests where id=p_id for update;
  if not found or c.status<>'대기' then raise exception 'pending change required'; end if;
  if p_action='approve' then
    select * into r from public.leave_requests where id=c.request_id for update;
    if not found or r.status<>'승인' or r.date_from<(now() at time zone 'Asia/Seoul')::date or (c.action='half' and r.type<>'연차') then raise exception 'original leave changed or date passed'; end if;
    perform pg_advisory_xact_lock(hashtextextended(r.user_id::text,0));
    restored:=case when c.action='cancel' then r.days else r.days/2 end;
    if c.action='cancel' then
      update public.leave_requests set status='취소',cancelled_by=(select name from public.profiles where user_id=auth.uid()),cancelled_at=now() where id=r.id;
    else
      update public.leave_requests set type='반차',type_note=c.type_note,days=r.days/2 where id=r.id;
    end if;
    insert into public.leave_ledger(user_id,kind,days,ref,note) values(r.user_id,'조정',restored,r.id,format('승인취소 복구: 변경요청 %s (%s)',c.id,c.action));
  end if;
  update public.leave_change_requests set status=case when p_action='approve' then '승인' else '반려' end,processed_at=now(),processed_by=auth.uid() where id=c.id;
  return query select lc.id,lc.status from public.leave_change_requests lc where lc.id=c.id;
end $$;

create or replace function public.queue_leave_change_push()
returns trigger language plpgsql security definer set search_path=public as $$
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
end $$;
drop trigger if exists queue_leave_change_push on public.leave_change_requests;
create trigger queue_leave_change_push after insert or update of status on public.leave_change_requests for each row execute function public.queue_leave_change_push();
revoke all on function public.request_leave_change(bigint,text,text,text),public.process_leave_change(bigint,text),public.queue_leave_change_push() from public,anon,authenticated;
grant execute on function public.request_leave_change(bigint,text,text,text),public.process_leave_change(bigint,text) to authenticated;
commit;
