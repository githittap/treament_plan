-- v2 데이터가 하나라도 있으면 중단해 분리 연장 원자료를 보존한다. 먼저 export/검증 후 별도 rollback 계획을 수립한다.
do $$ begin
  if exists(select 1 from public.attendance_manual_entries where lunch_overtime_raw_text<>'' or clockout_overtime_raw_text<>'' or lunch_overtime_min<>0 or clockout_overtime_min<>0) then
    raise exception 'attendance manual v2 data exists; rollback stopped to preserve split overtime evidence';
  end if;
end $$;

revoke all on function public.submit_manual_attendance_v2(date,time,time,int,int,text,int,text,int,text,boolean) from public,anon,authenticated;
drop function public.submit_manual_attendance_v2(date,time,time,int,int,text,int,text,int,text,boolean);
alter table public.attendance_manual_entries
  drop column lunch_overtime_raw_text,
  drop column clockout_overtime_raw_text,
  drop column lunch_overtime_min,
  drop column clockout_overtime_min;
