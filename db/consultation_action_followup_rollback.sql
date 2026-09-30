-- Z②-20 로컬 롤백: 새 조치값이 한 건이라도 있으면 중단해 자료를 보존한다.
begin;
do $$ begin
  if exists (
    select 1 from public.consultation_journals
    where action_assignee_id is not null or action_due_on is not null or action_done is true
  ) then
    raise exception 'follow-up data exists; preserve rows and stop rollback';
  end if;
end $$;
drop trigger if exists consultation_action_assignee_guard on public.consultation_journals;
drop function if exists employee_private.validate_consultation_action_assignee();
drop index if exists public.consultation_journals_open_action_due_idx;
alter table public.consultation_journals drop constraint if exists consultation_action_requires_text;
alter table public.consultation_journals
  drop column if exists action_assignee_id,
  drop column if exists action_due_on,
  drop column if exists action_done;
commit;
