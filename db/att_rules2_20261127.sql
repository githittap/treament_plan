-- 2026-11-27 월말 근태 — 매니저 의견 2차(④ 휴게시간 차감) 설정 기본값.
-- 근거: 구현지시서_2차3차.md. 허브 설정 › 🕘 근태 기준에서 원장이 시간대를 고침.
-- 적용 순서: 이 파일 한 번(재실행 안전) → hr.html·hub-texts.js 배포. 코드에도 같은 기본값이 있어 이 줄이 없어도 같게 동작함.
-- 되돌리기: att_rules2_20261127_rollback.sql
insert into public.app_settings(key,value,label) values
  ('att.break.lunch_start','13:00','점심 휴게 시작'),
  ('att.break.lunch_end','14:00','점심 휴게 끝'),
  ('att.break.dinner_start','18:30','저녁 휴게 시작(야간조)'),
  ('att.break.dinner_end','19:00','저녁 휴게 끝(야간조)')
on conflict (key) do nothing;

-- 확인 쿼리(4줄이 나와야 함)
-- select key,value from public.app_settings where key like 'att.break.%' order by key;
