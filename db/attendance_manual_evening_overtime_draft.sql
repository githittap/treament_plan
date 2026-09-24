-- D장 로컬 적용 초안: 기존 evening(야간조) 플래그와 저녁 추가근무 분을 분리한다.
-- 운영 DB·실데이터에는 자동 적용하지 않는다.
alter table public.attendance_manual_entries
  add column if not exists evening_overtime_raw_text text not null default '',
  add column if not exists evening_overtime_min int not null default 0 check (evening_overtime_min>=0),
  add column if not exists manual_note text,
  add column if not exists half_day text not null default '없음' check (half_day in ('없음','오전 반차','오후 반차'));

create or replace function public.submit_manual_attendance_d(
  p_work_date date,p_clock_in time,p_clock_out time,p_late_min int,p_early_min int,
  p_lunch_overtime_raw_text text,p_lunch_overtime_min int,
  p_clockout_overtime_raw_text text,p_clockout_overtime_min int,
  p_evening_overtime_raw_text text,p_evening_overtime_min int,
  p_reason text,p_reason_required boolean default false,
  p_manual_note text default null,p_half_day text default '없음'
)
returns public.attendance_manual_entries language plpgsql security definer set search_path='' as $$
declare r public.attendance_manual_entries; evening_raw text:=pg_catalog.btrim(coalesce(p_evening_overtime_raw_text,'')); evening_min int;
begin
  if p_evening_overtime_min is null or p_half_day not in ('없음','오전 반차','오후 반차') then raise exception 'invalid evening overtime or half-day'; end if;
  evening_min:=public.release_normalize_overtime(evening_raw);
  if p_evening_overtime_min<>evening_min then raise exception 'evening overtime value mismatch'; end if;
  select * into r from public.submit_manual_attendance_v2(p_work_date,p_clock_in,p_clock_out,p_late_min,p_early_min,p_lunch_overtime_raw_text,p_lunch_overtime_min,p_clockout_overtime_raw_text,p_clockout_overtime_min,p_reason,p_reason_required);
  update public.attendance_manual_entries set evening_overtime_raw_text=evening_raw,evening_overtime_min=evening_min,manual_note=nullif(pg_catalog.btrim(coalesce(p_manual_note,'')),''),half_day=p_half_day where id=r.id returning * into r;
  return r;
end; $$;

revoke all on function public.submit_manual_attendance_d(date,time,time,int,int,text,int,text,int,text,int,text,boolean,text,text) from public,anon,authenticated;
grant execute on function public.submit_manual_attendance_d(date,time,time,int,int,text,int,text,int,text,int,text,boolean,text,text) to authenticated;
