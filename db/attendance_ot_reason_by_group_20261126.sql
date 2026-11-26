-- 2026-11-26 원장 지시(T0 총괄 7차 전달): 「오버타임 시간기입란에 사유 적어야 입력되도록 강제하는데, 기공실만 그렇게 하고 진료실은 그렇게 안 되도록」.
-- 연장 사유·실제 한 일 필수(attendance_manual_overtime_reason.sql, 11-23)를 직무별 설정으로 바꾼다.
-- 어느 직무에 필수인지는 app_settings 'att.ot_reason_required.<직무>' = 'true'/'false' — 원장이 허브 설정 › 숫자·기준 › 🕘 근태 기준에서 켜고 끈다.
-- 직무 = profiles.job_group(lab 기공실 · clinical_consult 진료실 · desk 데스크 · sterilization_admin 소독·행정).
--   job_group이 비면 부서(dept: 기공실·기공팀·진료실·데스크)로 보완하고, 그래도 없으면 none(직무 미지정 — 실장·원장 등).
-- 설정 줄이 없으면 기공실(lab)만 필수로 본다(화면 hr.html overtimeReasonRequired와 같은 기본값).
-- 재실행 안전. 되돌리기: attendance_ot_reason_by_group_20261126_rollback.sql

insert into public.app_settings(key,value,label) values
  ('att.ot_reason_required.lab','true','연장 사유 필수 — 기공실'),
  ('att.ot_reason_required.clinical_consult','false','연장 사유 필수 — 진료실'),
  ('att.ot_reason_required.desk','false','연장 사유 필수 — 데스크'),
  ('att.ot_reason_required.sterilization_admin','false','연장 사유 필수 — 소독·행정'),
  ('att.ot_reason_required.none','false','연장 사유 필수 — 직무 미지정(실장·원장 등)')
on conflict (key) do nothing;

-- 이 사람이 연장 사유·실제 한 일을 꼭 적어야 하는지(서버가 판정 — 화면을 거치지 않은 호출도 같은 규칙).
create or replace function public.attendance_ot_reason_required(p_user uuid)
returns boolean language sql stable security definer set search_path='' as $$
  with g as (
    select coalesce((
      select coalesce(nullif(pg_catalog.btrim(coalesce(p.job_group,'')),''),
        case pg_catalog.btrim(coalesce(p.dept,'')) when '기공실' then 'lab' when '기공팀' then 'lab'
          when '진료실' then 'clinical_consult' when '데스크' then 'desk' end)
      from public.profiles p where p.user_id=p_user),'none') as grp
  )
  select coalesce(
    (select s.value='true' from public.app_settings s, g where s.key='att.ot_reason_required.'||g.grp),
    (select g.grp='lab' from g))
$$;
revoke all on function public.attendance_ot_reason_required(uuid) from public,anon,authenticated;

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
    and public.attendance_ot_reason_required(auth.uid())
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
