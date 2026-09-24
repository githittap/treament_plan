begin;
do $$ begin
  if exists (select 1 from public.leave_requests where type='조퇴') then
    raise exception '조퇴 데이터가 남아 있어 롤백을 중단';
  end if;
end $$;
alter table public.leave_requests drop constraint leave_requests_type_check;
alter table public.leave_requests add constraint leave_requests_type_check check (type in ('연차','반차','기타'));
commit;
