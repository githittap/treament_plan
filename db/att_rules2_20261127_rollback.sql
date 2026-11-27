-- att_rules2_20261127.sql 되돌리기 (2026-11-27) — 휴게시간 설정 4줄 삭제.
-- 지우면 코드 기본값(점심 13:00~14:00 · 저녁 18:30~19:00)이 그대로 적용됨. 휴게 차감을 끄려면 허브 설정에서 시작·끝을 같은 시각으로 맞춤.
delete from public.app_settings where key in ('att.break.lunch_start','att.break.lunch_end','att.break.dinner_start','att.break.dinner_end');
