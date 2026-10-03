begin;
create function public.get_employee_phone_notification_status()
returns table(user_id uuid,device_count bigint,last_enabled_at timestamptz)
language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if not public.employee_hub_access_allowed() or public.my_role() is distinct from 'owner' then raise exception 'owner access required'; end if;
  return query select p.user_id,count(s.id),max(greatest(s.created_at,s.updated_at))
    from public.profiles p left join public.push_subscriptions s on s.user_id=p.user_id
    group by p.user_id;
end $$;
revoke all on function public.get_employee_phone_notification_status() from public,anon,authenticated;
grant execute on function public.get_employee_phone_notification_status() to authenticated;
commit;
