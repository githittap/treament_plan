-- 2차 배포: 애플리케이션이 person_id만 기록하도록 전환한 뒤 실행한다.
-- 기존 schedules.user_id는 롤백을 위해 삭제하지 않는다.
begin;

do $$
begin
  if exists (select 1 from public.schedules where person_id is null) then
    raise exception 'cannot finalize schedule roster: schedules with null person_id remain';
  end if;
end;
$$;

alter table public.schedules
  alter column person_id set not null;

commit;
