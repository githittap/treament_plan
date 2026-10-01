-- 허브 글 표 되돌리기: db/hub_ui_texts.sql이 만든 표·트리거 함수를 지운다.
-- 원장이 고쳐 둔 글은 사라지고 화면은 코드에 들어 있는 기본 글로 돌아간다(화면은 표를 못 읽으면 조용히 기본값을 씀).
-- app_settings에 더한 목록·숫자 키는 이 파일이 건드리지 않는다(지우려면 해당 키 행만 따로 지움 — 지우면 기본값).
begin;
drop trigger if exists hub_ui_texts_set_audit on public.hub_ui_texts;
drop function if exists public.set_hub_ui_texts_audit();
drop table if exists public.hub_ui_texts;
commit;
