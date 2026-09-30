-- 카카오 예약의 덴트웹 입력 확인 시각과 수행자 기록.
-- consultation_inbox의 기존 RLS 정책과 employee_hub_access_allowed()는 변경하지 않는다.
alter table public.consultation_inbox
  add column if not exists dentweb_entered_at timestamptz,
  add column if not exists dentweb_entered_by uuid references auth.users(id);

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid='public.consultation_inbox'::regclass
      and conname='consultation_inbox_dentweb_stamp_pair_check'
  ) then
    alter table public.consultation_inbox
      add constraint consultation_inbox_dentweb_stamp_pair_check
      check ((dentweb_entered_at is null) = (dentweb_entered_by is null));
  end if;
end
$$;

create or replace function public.consultation_inbox_set_dentweb_stamp()
returns trigger
language plpgsql
set search_path=''
as $$
begin
  if new.dentweb_entered_at is distinct from old.dentweb_entered_at
     or new.dentweb_entered_by is distinct from old.dentweb_entered_by then
    if new.dentweb_entered_at is null and new.dentweb_entered_by is null then
      null;
    else
      if auth.uid() is null or not public.employee_hub_access_allowed() then
        raise exception 'active employee hub access required';
      end if;
      new.dentweb_entered_at := now();
      new.dentweb_entered_by := auth.uid();
    end if;
  end if;
  return new;
end
$$;

revoke all on function public.consultation_inbox_set_dentweb_stamp() from public, anon, authenticated;
drop trigger if exists consultation_inbox_set_dentweb_stamp on public.consultation_inbox;
create trigger consultation_inbox_set_dentweb_stamp
before update on public.consultation_inbox
for each row execute function public.consultation_inbox_set_dentweb_stamp();

grant update(dentweb_entered_at, dentweb_entered_by) on public.consultation_inbox to authenticated;

create or replace function public.consultation_inbox_set_dentweb_entered(p_inbox_id uuid, p_entered boolean)
returns table(dentweb_entered_at timestamptz, dentweb_entered_by uuid)
language plpgsql
security invoker
set search_path=''
as $$
begin
  if auth.uid() is null or not public.employee_hub_access_allowed() then
    raise exception 'active employee hub access required';
  end if;
  if p_entered then
    return query
      update public.consultation_inbox i
      set dentweb_entered_at=now(), dentweb_entered_by=auth.uid()
      where i.id=p_inbox_id and i.source='kakao'
        and i.external_event_id like 'kbook-%' and i.journal_id is null
      returning i.dentweb_entered_at, i.dentweb_entered_by;
  else
    return query
      update public.consultation_inbox i
      set dentweb_entered_at=null, dentweb_entered_by=null
      where i.id=p_inbox_id and i.source='kakao'
        and i.external_event_id like 'kbook-%' and i.journal_id is null
      returning i.dentweb_entered_at, i.dentweb_entered_by;
  end if;
  if not found then raise exception 'kakao booking not found or not editable'; end if;
end
$$;

revoke all on function public.consultation_inbox_set_dentweb_entered(uuid, boolean) from public, anon, authenticated;
grant execute on function public.consultation_inbox_set_dentweb_entered(uuid, boolean) to authenticated;
