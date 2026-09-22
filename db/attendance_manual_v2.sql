-- 5차 수기 출퇴근 추가형 migration. 기존 submit_manual_attendance와 기존 행은 변경하지 않는다.
-- 적용 전: attendance_issue_resolution_release.sql 및 owner/chief gate가 적용돼 있어야 한다.

alter table public.attendance_manual_entries
  add column if not exists lunch_overtime_raw_text text not null default '',
  add column if not exists clockout_overtime_raw_text text not null default '',
  add column if not exists lunch_overtime_min int not null default 0 check (lunch_overtime_min>=0),
  add column if not exists clockout_overtime_min int not null default 0 check (clockout_overtime_min>=0);

create or replace function public.submit_manual_attendance_v2(
  p_work_date date,p_clock_in time,p_clock_out time,p_late_min int,p_early_min int,
  p_lunch_overtime_raw_text text,p_lunch_overtime_min int,
  p_clockout_overtime_raw_text text,p_clockout_overtime_min int,
  p_reason text,p_reason_required boolean default false
)
returns public.attendance_manual_entries language plpgsql security definer set search_path='' as $$
declare r public.attendance_manual_entries; prior public.attendance_manual_entries; actor_name text;
  lunch_raw text:=pg_catalog.btrim(coalesce(p_lunch_overtime_raw_text,''));
  clockout_raw text:=pg_catalog.btrim(coalesce(p_clockout_overtime_raw_text,''));
  lunch_min int; clockout_min int; match text[];
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(auth.uid()::text||'|'||coalesce(p_work_date::text,''),0));
  if not exists(select 1 from public.profiles p where p.user_id=auth.uid() and p.active=true and p.approved=true)
    or public.my_role() not in ('staff','manager','chief','owner')
    or p_work_date is null or p_late_min is null or p_late_min<0 or p_early_min is null or p_early_min<0
    or p_lunch_overtime_min is null or p_clockout_overtime_min is null
    or (p_reason_required and coalesce(pg_catalog.btrim(p_reason),'')='') then
    raise exception 'invalid manual attendance submission';
  end if;
  if lunch_raw='' then lunch_min:=0; elsif lunch_raw~'^\d+$' then lunch_min:=lunch_raw::int; else match:=pg_catalog.regexp_match(lunch_raw,'^(\d{1,2}):(\d{2})$'); if match is null or match[2]::int>59 then raise exception 'invalid lunch overtime raw value'; end if; lunch_min:=match[1]::int*60+match[2]::int; end if;
  if clockout_raw='' then clockout_min:=0; elsif clockout_raw~'^\d+$' then clockout_min:=clockout_raw::int; else match:=pg_catalog.regexp_match(clockout_raw,'^(\d{1,2}):(\d{2})$'); if match is null or match[2]::int>59 then raise exception 'invalid clockout overtime raw value'; end if; clockout_min:=match[1]::int*60+match[2]::int; end if;
  lunch_min:=pg_catalog.floor(lunch_min/10.0)*10; clockout_min:=pg_catalog.floor(clockout_min/10.0)*10;
  if p_lunch_overtime_min<>lunch_min or p_clockout_overtime_min<>clockout_min then raise exception 'overtime value mismatch'; end if;
  select * into prior from public.attendance_manual_entries where user_id=auth.uid() and work_date=p_work_date and status in ('대기','실장승인') order by id desc limit 1 for update;
  select name into actor_name from public.profiles where user_id=auth.uid();
  if prior.id is not null then
    update public.attendance_manual_entries set status='대체' where id=prior.id;
    insert into public.manual_attendance_status_history(entry_id,from_status,to_status,actor_id,actor_name,reason) values(prior.id,prior.status,'대체',auth.uid(),actor_name,'새 수기 제출로 대체');
  end if;
  insert into public.attendance_manual_entries(user_id,work_date,clock_in,clock_out,late_min,early_min,overtime_raw_text,overtime_min,lunch_overtime_raw_text,clockout_overtime_raw_text,lunch_overtime_min,clockout_overtime_min,reason,reason_required,supersedes_id)
  values(auth.uid(),p_work_date,p_clock_in,p_clock_out,p_late_min,p_early_min,lunch_raw||case when lunch_raw<>'' and clockout_raw<>'' then ' + ' else '' end||clockout_raw,p_lunch_overtime_min+p_clockout_overtime_min,lunch_raw,clockout_raw,p_lunch_overtime_min,p_clockout_overtime_min,p_reason,coalesce(p_reason_required,false),prior.id) returning * into r;
  insert into public.attendance_manual_revisions(entry_id,user_id,work_date,payload,recorded_by) values(r.id,r.user_id,r.work_date,jsonb_build_object('lunch_overtime_raw_text',r.lunch_overtime_raw_text,'clockout_overtime_raw_text',r.clockout_overtime_raw_text,'lunch_overtime_min',r.lunch_overtime_min,'clockout_overtime_min',r.clockout_overtime_min,'overtime_min',r.overtime_min,'clock_in',r.clock_in,'clock_out',r.clock_out,'late_min',r.late_min,'early_min',r.early_min,'reason',r.reason),auth.uid());
  insert into public.manual_attendance_status_history(entry_id,from_status,to_status,actor_id,actor_name,reason) values(r.id,null,'대기',auth.uid(),actor_name,r.reason);
  return r;
end; $$;

revoke all on function public.submit_manual_attendance_v2(date,time,time,int,int,text,int,text,int,text,boolean) from public,anon,authenticated;
grant execute on function public.submit_manual_attendance_v2(date,time,time,int,int,text,int,text,int,text,boolean) to authenticated;
