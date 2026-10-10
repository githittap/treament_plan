-- 기존 wage_info 행은 보존하고 미입력은 NULL로 둔다. 운영 미적용.
begin;
alter table public.wage_info add column if not exists inclusive_overtime_hours numeric check(inclusive_overtime_hours>=0);
commit;
