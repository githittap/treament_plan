begin;
lock table public.consultation_inbox in share row exclusive mode;

do $$
begin
  if exists (
    select 1 from public.consultation_inbox
    where dentweb_entered_at is not null or dentweb_entered_by is not null
  ) then
    raise exception 'consultation inbox dentweb stamp contains data';
  end if;
end
$$;

revoke update(dentweb_entered_at, dentweb_entered_by) on public.consultation_inbox from authenticated;
drop function if exists public.consultation_inbox_set_dentweb_entered(uuid, boolean);
drop trigger if exists consultation_inbox_set_dentweb_stamp on public.consultation_inbox;
drop function if exists public.consultation_inbox_set_dentweb_stamp();
alter table public.consultation_inbox
  drop constraint if exists consultation_inbox_dentweb_stamp_pair_check,
  drop column if exists dentweb_entered_by,
  drop column if exists dentweb_entered_at;

commit;
