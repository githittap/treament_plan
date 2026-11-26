-- 되돌리기: 병원 PC 중계(review_sms_relay_20261127) — 보내는 길만 서버 함수(edge)로 돌린다. 기록·대기함 표는 보존.
-- 주의: 솔라피는 문자 발송을 고정 IP에서만 받아서, edge로 돌리면 서버 함수 발송은 솔라피에서 막힌다(허용 IP 정책이 바뀐 때만 씀).
-- 대기함에 남은 줄은 중계가 2시간 뒤 실패로 닫는다(중계를 끄면 다음 중계 실행 때 닫힘).
begin;
insert into public.app_settings(key,value,label) values('review_sms.transport','edge','리뷰 요청 문자 — 보내는 길(pc: 병원 PC 중계 · edge: 서버 함수가 바로)')
on conflict(key) do update set value=excluded.value;
commit;
