-- 10-06 반차 변경은 하루짜리 연차에서만. suggestion_asks_20261006.sql 적용 뒤 이 함수만 다시 정의함.
create or replace function public.request_leave_change(p_request_id bigint,p_action text,p_reason text,p_type_note text default null)
returns bigint language plpgsql security definer set search_path=public as $$
declare r public.leave_requests%rowtype; new_id bigint;
begin
  if not public.employee_hub_access_allowed() then raise exception 'active approved profile required'; end if;
  select * into r from public.leave_requests where id=p_request_id for update;
  if not found or r.user_id<>auth.uid() or r.status<>'승인' or r.date_from<(now() at time zone 'Asia/Seoul')::date then raise exception 'only own future approved leave can be changed'; end if;
  if p_action is null or p_action not in ('cancel','half') or p_reason is null or length(trim(p_reason))=0 then raise exception 'action and reason required'; end if;
  if p_action='half' and (r.type<>'연차' or r.days<=0 or r.date_from<>r.date_to or p_type_note is null or p_type_note !~ '^[0-2][0-9]:[0-5][0-9]~[0-2][0-9]:[0-5][0-9]$') then raise exception 'full leave and half-day time range required'; end if;
  if p_action='half' and (split_part(p_type_note,'~',1)::time>=split_part(p_type_note,'~',2)::time) then raise exception 'invalid half-day time range'; end if;
  insert into public.leave_change_requests(request_id,user_id,action,reason,type_note) values(r.id,r.user_id,p_action,trim(p_reason),p_type_note) returning id into new_id;
  return new_id;
end $$;
revoke all on function public.request_leave_change(bigint,text,text,text) from public,anon,authenticated;
grant execute on function public.request_leave_change(bigint,text,text,text) to authenticated;
