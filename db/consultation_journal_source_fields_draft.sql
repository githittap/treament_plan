-- 기존 상담일지 행을 변경하지 않고 시트별 원본 추가 칸을 받을 공간을 더한다.
-- 운영 DB에는 별도 승인과 백업 후 적용한다. 값이 생긴 뒤에는 열 삭제 롤백을 하지 않는다.
alter table public.consultation_journals
  add column if not exists source_fields jsonb not null default '{}'::jsonb;

do $$ begin
  if not exists (
    select 1 from pg_constraint
    where conrelid='public.consultation_journals'::regclass
      and conname='consultation_journals_source_fields_object_check'
  ) then
    alter table public.consultation_journals
      add constraint consultation_journals_source_fields_object_check
      check (jsonb_typeof(source_fields)='object');
  end if;
end $$;
