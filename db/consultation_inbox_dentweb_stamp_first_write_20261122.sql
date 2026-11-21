begin;

-- Preserve the original SECURITY INVOKER contract and row-level UPDATE checks.
-- COALESCE keeps the first actor/time while still requiring this UPDATE to pass RLS.
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
      set dentweb_entered_at=coalesce(i.dentweb_entered_at,now()),
          dentweb_entered_by=coalesce(i.dentweb_entered_by,auth.uid())
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

commit;
