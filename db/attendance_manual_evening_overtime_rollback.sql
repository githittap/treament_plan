-- D장 로컬 초안 롤백. 기록이 있으면 보존을 위해 중단한다.
do $$ begin
  if exists(select 1 from public.attendance_manual_entries where evening_overtime_raw_text<>'' or evening_overtime_min<>0 or manual_note is not null or half_day<>'없음') then
    raise exception 'attendance manual D data exists; rollback stopped to preserve evidence';
  end if;
end $$;
revoke all on function public.submit_manual_attendance_d(date,time,time,int,int,text,int,text,int,text,int,text,boolean,text,text) from public,anon,authenticated;
drop function public.submit_manual_attendance_d(date,time,time,int,int,text,int,text,int,text,int,text,boolean,text,text);
alter table public.attendance_manual_entries drop column evening_overtime_raw_text,drop column evening_overtime_min,drop column manual_note,drop column half_day;
