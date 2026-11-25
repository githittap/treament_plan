-- db/holiday_editors_20261125.sql 되돌리기: 휴진·단축 입력을 다시 실장·원장만, 구글 목록 기본 범위 30일.
-- 매니저·데스크가 넣은 행은 지우지 않음(그대로 남고 실장·원장만 고칠 수 있게 됨). 알림 스위치 hgbp.remind_on 값도 남김.
begin;
do $off$
begin
  if to_regclass('public.app_settings') is not null then
    update public.app_settings set value='false' where key='gbp.sync_live';
    if not found then insert into public.app_settings(key,value) values('gbp.sync_live','false'); end if;
  end if;
end $off$;
drop policy if exists holidays_insert_approvers on public.holidays;
create policy holidays_insert_approvers on public.holidays for insert to authenticated
  with check (public.my_role() in ('chief','owner'));
drop policy if exists holidays_update_approvers on public.holidays;
create policy holidays_update_approvers on public.holidays for update to authenticated
  using (public.my_role() in ('chief','owner')) with check (public.my_role() in ('chief','owner'));
drop policy if exists holidays_delete_approvers on public.holidays;
create policy holidays_delete_approvers on public.holidays for delete to authenticated
  using (public.my_role() in ('chief','owner'));
do $l$
begin
  if to_regclass('public.gbp_special_hours_sync_log') is not null then
    drop policy if exists gbp_sync_log_select_lead on public.gbp_special_hours_sync_log;
    create policy gbp_sync_log_select_lead on public.gbp_special_hours_sync_log
      for select to authenticated using (public.my_role() in ('chief','owner'));
  end if;
end $l$;
-- 30일 기본값으로 다시 만듦(본문 동일).
create or replace function public.gbp_special_hours_due(p_days int default 30)
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
      and h.date between today_kst and today_kst + greatest(0, least(coalesce(p_days,30), 366))
    order by h.date;
end $$;
revoke all on function public.gbp_special_hours_due(int) from public, anon;
grant execute on function public.gbp_special_hours_due(int) to authenticated, service_role;
drop function if exists public.can_edit_clinic_hours();
commit;
