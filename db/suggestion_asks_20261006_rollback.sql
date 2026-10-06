-- 요청 이력이 있으면 보존하고 롤백을 중단함.
begin;
do $$ begin
  if exists(select 1 from public.leave_change_requests) then raise exception 'leave change history exists; preserve data and stop rollback'; end if;
end $$;
drop trigger if exists queue_leave_change_push on public.leave_change_requests;
drop function if exists public.queue_leave_change_push();
drop function if exists public.process_leave_change(bigint,text);
drop function if exists public.request_leave_change(bigint,text,text,text);
drop table if exists public.leave_change_requests;
commit;
