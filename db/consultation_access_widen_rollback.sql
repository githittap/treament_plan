-- 되돌리기 — db/consultation_access_widen.sql 을 적용하기 직전 상태로 복구한다.
-- (2026-09-23 적용 전 운영 DB에서 pg_policies·pg_get_functiondef 로 읽어 그대로 옮긴 것)

begin;

drop policy if exists consultation_inbox_select on public.consultation_inbox;
create policy consultation_inbox_select on public.consultation_inbox
  for select to authenticated
  using (
    employee_hub_access_allowed()
    and (select my_role()) = any (array['manager','owner'])
  );

drop policy if exists consultation_inbox_insert on public.consultation_inbox;
create policy consultation_inbox_insert on public.consultation_inbox
  for insert to authenticated
  with check (
    employee_hub_access_allowed()
    and (select my_role()) = any (array['manager','owner'])
    and source = any (array['phone','manual','other'])
    and external_event_id is null
    and status = 'new'
    and assigned_to is null
    and journal_id is null
    and created_via = 'manual'
    and created_by = (select auth.uid())
  );

drop policy if exists consultation_inbox_update on public.consultation_inbox;
create policy consultation_inbox_update on public.consultation_inbox
  for update to authenticated
  using (
    employee_hub_access_allowed()
    and (select my_role()) = any (array['manager','owner'])
  )
  with check (
    employee_hub_access_allowed()
    and (select my_role()) = any (array['manager','owner'])
    and status = any (array['new','in_progress','closed'])
    and journal_id is null
    and (assigned_to is null or consultation_inbox_assignee_allowed(assigned_to))
  );

drop policy if exists consultation_journals_select on public.consultation_journals;
create policy consultation_journals_select on public.consultation_journals
  for select to authenticated
  using ((select my_role()) = any (array['manager','owner']));

drop policy if exists consultation_journals_insert on public.consultation_journals;
create policy consultation_journals_insert on public.consultation_journals
  for insert to authenticated
  with check (
    (select my_role()) = any (array['manager','owner'])
    and author_id = (select auth.uid())
  );

drop policy if exists consultation_journals_update on public.consultation_journals;
create policy consultation_journals_update on public.consultation_journals
  for update to authenticated
  using ((select my_role()) = any (array['manager','owner']))
  with check ((select my_role()) = any (array['manager','owner']));

create or replace function public.consultation_inbox_assignee_allowed(p_user_id uuid)
returns boolean language sql stable security definer set search_path to '' as $$
  select exists(
    select 1 from public.profiles p
    where p.user_id = p_user_id and p.active and p.approved
      and p.account_access_status <> '차단'
      and p.role in ('manager','owner')
  )
$$;

create or replace function public.consultation_inbox_convert_to_journal(p_inbox_id uuid)
returns table(journal_id uuid) language plpgsql security definer set search_path to '' as $$
declare i public.consultation_inbox; v_journal uuid; v_source text;
begin
  if auth.uid() is null
     or not public.employee_hub_access_allowed()
     or coalesce(public.my_role(),'') not in ('manager','owner') then
    raise exception 'manager or owner access required';
  end if;
  select * into i from public.consultation_inbox where id = p_inbox_id for update;
  if not found then raise exception 'inbox not found'; end if;
  if i.journal_id is not null or i.status = 'converted' then
    raise exception 'inbox already converted';
  end if;
  v_source = case
    when i.source = 'homepage' then '홈페이지'
    when i.source in ('daangn','kakao','naver_email') then '카카오,네이버예약,당근'
    else '원본' end;
  insert into public.consultation_journals(
    patient_name, contact_phone, source_sheet, consulted_on, status,
    consultation_note, next_action, author_id)
  values (coalesce(i.sender_name,'미상'), i.contact, v_source, i.received_at::date, '대기',
          i.message, i.subject, auth.uid())
  returning id into v_journal;
  update public.consultation_inbox set status='converted', journal_id=v_journal where id=i.id;
  return query select v_journal;
end $$;

commit;
