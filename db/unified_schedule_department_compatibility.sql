begin;

alter table public.schedule_people
  drop constraint if exists schedule_people_department_check;

alter table public.schedule_people
  add constraint schedule_people_department_check
  check (department in ('Dr.', '진료실', '데스크', '기공실', '미지정', '상담', '행정'));

commit;
