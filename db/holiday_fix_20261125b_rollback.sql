-- db/holiday_fix_20261125b.sql 되돌리기.
-- 되돌리는 것: 매니저·데스크의 공휴일 「진료 방식」 수정(정책·보호 트리거), 근태 휴일 표시 자동 트리거, 구글 목록 함수(공휴일 시각 해석).
-- 그대로 두는 것(더 안전한 쪽이라): 시각 제약(공휴일 시각 허용은 옛 데이터도 통과), sync_gbp 기본값 false, 휴진 보호 트리거의 날짜 잠금.
-- 공휴일 행에 넣은 시각은 지우지 않음 — 대신 구글 자동 연동 스위치를 끔(옛 목록 함수는 공휴일 시각을 휴진으로 읽기 때문).
-- 전체를 되돌릴 땐 이 파일 → db/holiday_editors_20261125_rollback.sql → db/holiday_gbp_sync_rollback.sql 순서.
begin;
do $off$
begin
  if to_regclass('public.app_settings') is not null then
    update public.app_settings set value='false' where key='gbp.sync_live';
    if not found then insert into public.app_settings(key,value) values('gbp.sync_live','false'); end if;
  end if;
end $off$;

drop trigger if exists holidays_editor_guard on public.holidays;
drop function if exists public.holidays_editor_guard();
drop policy if exists holidays_update_approvers on public.holidays;
create policy holidays_update_approvers on public.holidays for update to authenticated
  using (public.my_role() in ('chief','owner')
         or (public.can_edit_clinic_hours() and kind in ('지정휴일','단축')))
  with check (public.my_role() in ('chief','owner')
              or (public.can_edit_clinic_hours() and kind in ('지정휴일','단축')));

drop trigger if exists attendance_set_is_holiday on public.attendance;
drop function if exists public.attendance_set_is_holiday();

create or replace function public.gbp_special_hours_due(p_days int default 60)
returns table("date" date, closed boolean, open_time time, close_time time, name text, kind text, note text)
language plpgsql stable security invoker set search_path = pg_catalog, public as $$
#variable_conflict use_column
declare today_kst date := (now() at time zone 'Asia/Seoul')::date;
begin
  if current_user not in ('service_role','postgres','supabase_admin') then
    if coalesce(public.my_role(),'')<>'owner' or not coalesce(public.employee_hub_access_allowed(),false) then
      raise exception 'not allowed' using errcode='42501';
    end if;
  end if;
  return query
    select h.date, (coalesce(h.kind,'공휴일')<>'단축') as closed, h.open_time, h.close_time, h.name, h.kind, h.note
    from public.holidays h
    where h.sync_gbp
      and not (coalesce(h.kind,'공휴일')='단축' and (h.open_time is null or h.close_time is null or h.open_time>=h.close_time))
      and h.date between today_kst and today_kst + greatest(0, least(coalesce(p_days,60), 366))
    order by h.date;
end $$;
revoke all on function public.gbp_special_hours_due(int) from public, anon;
grant execute on function public.gbp_special_hours_due(int) to authenticated, service_role;
commit;
