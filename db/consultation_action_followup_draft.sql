-- Z②-20 로컬 후행 초안: 현 상담일지와 manager/chief/owner RLS 적용 뒤 검토한다.
-- 기존 상담 행·정책은 변경하거나 삭제하지 않는다.
begin;
do $$ begin
  if to_regclass('public.consultation_journals') is null then
    raise exception 'consultation_journals must exist before follow-up draft';
  end if;
  if not (select relrowsecurity from pg_class where oid='public.consultation_journals'::regclass) then
    raise exception 'consultation_journals RLS must be enabled';
  end if;
end $$;

alter table public.consultation_journals
  add column action_assignee_id uuid,
  add column action_due_on date,
  add column action_done boolean not null default false;

alter table public.consultation_journals
  add constraint consultation_action_requires_text check (
    (action_assignee_id is null and action_due_on is null and action_done is false)
    or nullif(btrim(next_action),'') is not null
  ) not valid;

create schema if not exists employee_private;
revoke all on schema employee_private from public,anon,authenticated;
create function employee_private.validate_consultation_action_assignee()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if tg_op='UPDATE' and new.action_assignee_id is not distinct from old.action_assignee_id then
    return new;
  end if;
  if new.action_assignee_id is not null and not exists (
    select 1 from public.profiles p
    where p.user_id=new.action_assignee_id and p.active is true and p.approved is true
      and p.account_access_status is distinct from '차단'
      and p.role in ('manager','chief','owner')
  ) then
    raise exception 'consultation action assignee must be an active administrator' using errcode='23514';
  end if;
  return new;
end;
$$;
revoke all on function employee_private.validate_consultation_action_assignee() from public,anon,authenticated;

create trigger consultation_action_assignee_guard
before insert or update of action_assignee_id on public.consultation_journals
for each row execute function employee_private.validate_consultation_action_assignee();

create index consultation_journals_open_action_due_idx
  on public.consultation_journals (action_due_on,id)
  where action_done is false and action_due_on is not null;
commit;
