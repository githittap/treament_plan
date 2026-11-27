-- att_rules_20261127.sql 되돌리기 (2026-11-27)
-- 주의: 단계 상태가 '매니저확인'·'실장확인'인 달은 옛 상태 '집계중'으로 돌려놓음(확정은 그대로).
-- attendance_day_marks·attendance_edit_log의 기록은 지워짐 — 필요하면 먼저 내보내기.

drop function if exists public.att_month_step(text,text);
drop function if exists public.att_log_recalc(text,int,int,jsonb);
drop function if exists public.att_mark_remove(bigint);
drop function if exists public.att_mark_add(uuid,date,text,text);
drop function if exists public.att_set_shift_group(uuid,text);
drop function if exists public.att_hourly_user_ids(date);
drop function if exists public.att_month_is_final(text);
drop function if exists public.att_edit_log_write(text,uuid,date,text,jsonb);

drop table if exists public.attendance_edit_log;
drop table if exists public.attendance_day_marks;

-- att_months: 단계 상태 → 집계중, 칸·제약·옛 정책 복구
update public.att_months set status='집계중' where status in ('매니저확인','실장확인');
do $$ declare c text; begin
  for c in select conname from pg_constraint
    where conrelid='public.att_months'::regclass and contype='c' and pg_get_constraintdef(oid) like '%status%'
  loop execute format('alter table public.att_months drop constraint %I',c); end loop;
end $$;
alter table public.att_months add constraint att_months_status_check check (status in ('집계중','확정'));
alter table public.att_months drop column if exists manager_checked_by;
alter table public.att_months drop column if exists manager_checked_at;
alter table public.att_months drop column if exists chief_checked_by;
alter table public.att_months drop column if exists chief_checked_at;
drop policy if exists att_months_insert_owner on public.att_months;
create policy att_months_insert_owner on public.att_months for insert to authenticated with check (public.my_role() = 'owner');
drop policy if exists att_months_update_owner on public.att_months;
create policy att_months_update_owner on public.att_months for update to authenticated
  using (public.my_role() = 'owner') with check (public.my_role() = 'owner');

-- 매니저 읽기 권한 되돌림(본인 · 실장 · 원장만)
drop policy if exists attendance_manual_release_select on public.attendance_manual_entries;
create policy attendance_manual_release_select on public.attendance_manual_entries for select to authenticated using (
  exists(select 1 from public.profiles p where p.user_id=auth.uid() and p.active=true and p.approved=true)
  and (user_id=auth.uid() or public.my_role() in ('chief','owner'))
);
drop policy if exists attendance_issue_resolution_release_select on public.attendance_issue_resolutions;
create policy attendance_issue_resolution_release_select on public.attendance_issue_resolutions for select to authenticated using (
  exists(select 1 from public.profiles p where p.user_id=auth.uid() and p.active=true and p.approved=true)
  and (user_id=auth.uid() or public.my_role() in ('chief','owner'))
);

-- 근무조 설정·칸
delete from public.app_settings where key in ('att.shift_group.A.late_cut','att.shift_group.B.late_cut','att.shift_group.C.late_cut');
alter table public.profiles drop constraint if exists profiles_att_shift_group_check;
alter table public.profiles drop column if exists att_shift_group;
