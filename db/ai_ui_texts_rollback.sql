-- 안내 문구 표 되돌리기: db/ai_ui_texts.sql이 만든 표·트리거 함수를 지운다.
-- 원장이 고쳐 둔 문구는 사라지고 화면은 코드에 들어 있는 기본 문구로 돌아간다(화면은 표를 못 읽으면 조용히 기본값을 씀).
begin;
drop trigger if exists ai_ui_texts_set_audit on public.ai_ui_texts;
drop function if exists public.set_ai_ui_texts_audit();
drop table if exists public.ai_ui_texts;
commit;
