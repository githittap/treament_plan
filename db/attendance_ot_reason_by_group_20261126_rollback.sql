-- 되돌리기: attendance_ot_reason_by_group_20261126.sql 이전(2026-11-23)처럼 모든 직원에게 연장 사유·실제 한 일 필수.
-- 저장된 수기 기록은 건드리지 않음. 직무별 설정 줄(att.ot_reason_required.*)은 지움.
create or replace function public.submit_manual_attendance_d(
  p_work_date date,p_clock_in time,p_clock_out time,p_late_min int,p_early_min int,
  p_lunch_overtime_raw_text text,p_lunch_overtime_min int,
  p_clockout_overtime_raw_text text,p_clockout_overtime_min int,
  p_evening_overtime_raw_text text,p_evening_overtime_min int,
  p_reason text,p_reason_required boolean default false,
  p_manual_note text default null,p_half_day text default '없음',
  p_overtime_plan_reason text default null,p_overtime_actual_work text default null
)
returns public.attendance_manual_entries language plpgsql security definer set search_path='' as $$
declare r public.attendance_manual_entries; evening_raw text:=pg_catalog.btrim(coalesce(p_evening_overtime_raw_text,'')); evening_min int;
  plan_reason text:=nullif(pg_catalog.btrim(coalesce(p_overtime_plan_reason,'')),'');
  actual_work text:=nullif(pg_catalog.btrim(coalesce(p_overtime_actual_work,'')),'');
begin
  if p_evening_overtime_min is null or p_half_day not in ('없음','오전 반차','오후 반차') then raise exception 'invalid evening overtime or half-day'; end if;
  evening_min:=public.release_normalize_overtime(evening_raw);
  if p_evening_overtime_min<>evening_min then raise exception 'evening overtime value mismatch'; end if;
  if coalesce(p_lunch_overtime_min,0)+coalesce(p_clockout_overtime_min,0)+evening_min>0
    and (pg_catalog.char_length(pg_catalog.regexp_replace(coalesce(plan_reason,''),'\s','','g'))<5
      or pg_catalog.char_length(pg_catalog.regexp_replace(coalesce(actual_work,''),'\s','','g'))<5) then
    raise exception 'overtime reason and actual work required';
  end if;
  select * into r from public.submit_manual_attendance_v2(p_work_date,p_clock_in,p_clock_out,p_late_min,p_early_min,p_lunch_overtime_raw_text,p_lunch_overtime_min,p_clockout_overtime_raw_text,p_clockout_overtime_min,p_reason,p_reason_required);
  if r.overtime_min+evening_min=0 then plan_reason:=null; actual_work:=null; end if;
  update public.attendance_manual_entries set evening_overtime_raw_text=evening_raw,evening_overtime_min=evening_min,manual_note=nullif(pg_catalog.btrim(coalesce(p_manual_note,'')),''),half_day=p_half_day,
    overtime_plan_reason=plan_reason,overtime_actual_work=actual_work where id=r.id returning * into r;
  return r;
end; $$;
revoke all on function public.submit_manual_attendance_d(date,time,time,int,int,text,int,text,int,text,int,text,boolean,text,text,text,text) from public,anon,authenticated;
grant execute on function public.submit_manual_attendance_d(date,time,time,int,int,text,int,text,int,text,int,text,boolean,text,text,text,text) to authenticated;
drop function if exists public.attendance_ot_reason_required(uuid);
delete from public.app_settings where key like 'att.ot_reason_required.%';
