begin;
do $$begin if exists(select 1 from public.wage_info where inclusive_overtime_hours is not null) then raise exception 'inclusive overtime values exist; rollback stopped without deleting data';end if;end;$$;
alter table public.wage_info drop column inclusive_overtime_hours;
commit;
