-- 문의함 처리자 기록 되돌리기.
-- 주의: 되돌리면 handled_by·handled_at에 쌓인 「누가 언제 처리했는지」 기록이 모두 사라진다(복구 불가). 화면은 이 칸이 없으면 처리한 사람을 표시하지 않는다.
begin;
drop trigger if exists consultation_inbox_set_handled on public.consultation_inbox;
drop function if exists public.consultation_inbox_set_handled();
alter table public.consultation_inbox
  drop column if exists handled_by,
  drop column if exists handled_at;
commit;
