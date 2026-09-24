-- H-3 deputy guard rollback. 기존 release 함수 본문에서 이번 guard만 제거한다.
begin;
do $$ declare fn regprocedure; src text; begin
  foreach fn in array array[
    'public.submit_attendance_issue(date,text,text,text)'::regprocedure,
    'public.submit_manual_attendance(date,time,time,integer,integer,text,integer,text,boolean)'::regprocedure,
    'public.submit_manual_attendance_v2(date,time,time,integer,integer,text,integer,text,integer,text,boolean)'::regprocedure
  ] loop
    if to_regprocedure(fn::text) is not null then
      select pg_get_functiondef(fn::oid) into src;
      src:=replace(src, 'if public.my_role()=''deputy'' then raise exception ''deputy cannot submit attendance issues''; end if;', '');
      src:=replace(src, 'if public.my_role()=''deputy'' then raise exception ''deputy cannot submit manual attendance''; end if;', '');
      execute src;
    end if;
  end loop;
end $$;
drop policy if exists deputy_attendance_manual_revision_block on public.attendance_manual_revisions;
drop policy if exists deputy_attendance_issue_resolution_block on public.attendance_issue_resolutions;
commit;
