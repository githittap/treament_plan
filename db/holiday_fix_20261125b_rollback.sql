-- db/holiday_fix_20261125b.sql 되돌리기.
-- 되돌리는 것: 매니저·데스크의 공휴일 「진료 방식」 수정(정책·보호 트리거), 근태 휴일 표시 자동 트리거.
-- 그대로 두는 것(더 안전한 쪽이라): 시각 제약(공휴일 시각 허용은 옛 데이터도 통과), sync_gbp 기본값 false, 휴진 보호 트리거의 날짜 잠금.
-- 공휴일 행에 넣은 시각은 지우지 않음. 구글 자동 연동 스위치는 끔(되돌린 뒤 확인하고 다시 켬).
-- 전체를 되돌릴 땐 db/holiday_fix_20261125d_rollback.sql → 이 파일 → db/holiday_editors_20261125_rollback.sql → db/holiday_gbp_sync_rollback.sql 순서(기반 롤백만 돌려도 나머지를 함께 걷음).
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

-- 구글 목록 함수는 그대로 둠(시각 있으면 단축 · 없으면 휴진 — 옛 제약에서도 같은 결과라 되돌릴 필요 없음 · Sol 3차 B4).
commit;
