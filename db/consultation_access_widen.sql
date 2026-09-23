-- 상담 접근 범위 확대 — 원장 지시 2026-09-23
--   "상담일지는: 매니저, 실장 (추후 원장이 지정하는 사람만 별도로 보거나 쓰게 가능),
--    문의함은 모두 볼수있게해라"
--
-- 바뀌는 것
--   1) consultation_inbox  SELECT : 허브를 쓸 수 있는 직원 "전원"이 본다(읽기만)
--   2) consultation_inbox  INSERT/UPDATE : 실장(chief)을 더한다 — 직원(staff)은 쓰기 불가
--   3) consultation_journals SELECT/INSERT/UPDATE : 실장(chief)을 더한다
--   4) 담당자로 지정할 수 있는 사람에 실장을 더한다
--   5) 문의함 → 상담일지 전환 함수에 실장을 더하고,
--      네이버 톡톡 문의가 '원본'으로 잘못 분류되던 것을 외부채널 칸으로 고친다
--
-- 되돌리기: db/consultation_access_widen_rollback.sql
--
-- ⚠️ 개인정보: 문의함에는 환자 연락처·문의 내용이 들어 있다. 이 변경으로 전 직원이
--    그것을 읽게 된다(원장 지시). 나중에 "목록은 전원 / 상세는 매니저·실장·원장"으로
--    좁히려면 상세 조회를 뷰나 함수로 분리하면 된다.

begin;

-- ── 1) 문의함 보기: 전원 ──────────────────────────────────────────────
drop policy if exists consultation_inbox_select on public.consultation_inbox;
create policy consultation_inbox_select on public.consultation_inbox
  for select to authenticated
  using (employee_hub_access_allowed());

-- ── 2) 문의함 쓰기: 매니저·실장·원장 ─────────────────────────────────
drop policy if exists consultation_inbox_insert on public.consultation_inbox;
create policy consultation_inbox_insert on public.consultation_inbox
  for insert to authenticated
  with check (
    employee_hub_access_allowed()
    and (select my_role()) = any (array['manager','chief','owner'])
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
    and (select my_role()) = any (array['manager','chief','owner'])
  )
  with check (
    employee_hub_access_allowed()
    and (select my_role()) = any (array['manager','chief','owner'])
    and status = any (array['new','in_progress','closed'])
    and journal_id is null
    and (assigned_to is null or consultation_inbox_assignee_allowed(assigned_to))
  );

-- ── 3) 상담일지: 매니저·실장·원장 ────────────────────────────────────
drop policy if exists consultation_journals_select on public.consultation_journals;
create policy consultation_journals_select on public.consultation_journals
  for select to authenticated
  using ((select my_role()) = any (array['manager','chief','owner']));

drop policy if exists consultation_journals_insert on public.consultation_journals;
create policy consultation_journals_insert on public.consultation_journals
  for insert to authenticated
  with check (
    (select my_role()) = any (array['manager','chief','owner'])
    and author_id = (select auth.uid())
  );

drop policy if exists consultation_journals_update on public.consultation_journals;
create policy consultation_journals_update on public.consultation_journals
  for update to authenticated
  using ((select my_role()) = any (array['manager','chief','owner']))
  with check ((select my_role()) = any (array['manager','chief','owner']));

-- ── 4) 담당자 지정 대상에 실장 ───────────────────────────────────────
create or replace function public.consultation_inbox_assignee_allowed(p_user_id uuid)
returns boolean language sql stable security definer set search_path to '' as $$
  select exists(
    select 1 from public.profiles p
    where p.user_id = p_user_id and p.active and p.approved
      and p.account_access_status <> '차단'
      and p.role in ('manager','chief','owner')
  )
$$;

-- ── 5) 전환 함수: 실장 허용 + 네이버 톡톡 분류 고침 ──────────────────
create or replace function public.consultation_inbox_convert_to_journal(p_inbox_id uuid)
returns table(journal_id uuid) language plpgsql security definer set search_path to '' as $$
declare i public.consultation_inbox; v_journal uuid; v_source text;
begin
  if auth.uid() is null
     or not public.employee_hub_access_allowed()
     or coalesce(public.my_role(),'') not in ('manager','chief','owner') then
    raise exception 'manager, chief or owner access required';
  end if;
  select * into i from public.consultation_inbox where id = p_inbox_id for update;
  if not found then raise exception 'inbox not found'; end if;
  if i.journal_id is not null or i.status = 'converted' then
    raise exception 'inbox already converted';
  end if;
  v_source = case
    when i.source = 'homepage' then '홈페이지'
    when i.source in ('daangn','kakao','naver_email','naver_talktalk') then '카카오,네이버예약,당근'
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
