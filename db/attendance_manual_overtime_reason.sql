-- 2026-11-23 원장 지시: 연장시간을 적으면 「연장하려던 사유」와 「연장 시간에 실제로 한 일」을 반드시 적어야 저장된다.
-- 점심·퇴근·저녁 추가근무 중 하나라도 10분 단위 계산 후 0분보다 크면 두 칸이 모두 필요하다(공백 제외 5자 이상).
-- 직원이 화면을 거치지 않고 옛 함수(submit_manual_attendance · _v2)를 직접 불러 우회하지 못하게 실행 권한도 거둔다.
alter table public.attendance_manual_entries
  add column if not exists overtime_plan_reason text,
  add column if not exists overtime_actual_work text;

drop function if exists public.submit_manual_attendance_d(date,time,time,int,int,text,int,text,int,text,int,text,boolean,text,text);

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

do $$ begin
  if to_regprocedure('public.submit_manual_attendance_v2(date,time,time,int,int,text,int,text,int,text,boolean)') is not null then
    revoke execute on function public.submit_manual_attendance_v2(date,time,time,int,int,text,int,text,int,text,boolean) from public,anon,authenticated;
  end if;
  if to_regprocedure('public.submit_manual_attendance(date,time,time,int,int,text,int,text,boolean)') is not null then
    revoke execute on function public.submit_manual_attendance(date,time,time,int,int,text,int,text,boolean) from public,anon,authenticated;
  end if;
end $$;
