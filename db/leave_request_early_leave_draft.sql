begin;
do $$ begin
  if not exists (
    select 1 from pg_constraint c
    join pg_class t on t.oid=c.conrelid
    join pg_namespace n on n.oid=t.relnamespace
    where n.nspname='public' and t.relname='leave_requests'
      and c.conname='leave_requests_type_check'
  ) then raise exception 'leave_requests_type_check not found'; end if;
end $$;
alter table public.leave_requests drop constraint leave_requests_type_check;
alter table public.leave_requests add constraint leave_requests_type_check check (type in ('연차','반차','조퇴','기타'));
commit;
