-- 신규 상담일지 객체만 되돌린다.
-- 적용 뒤 실제 상담 기록이 생성된 경우에는 사용하지 말고, 먼저 승인된 데이터 보존 절차를 따른다.
begin;
drop table if exists public.consultation_journals;
drop function if exists public.set_consultation_journals_updated_at();
commit;
