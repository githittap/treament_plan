-- 리뷰 요청 문자 보존형 롤백 — 표·기록·함수를 지우지 않고 화면·발송만 끈다. 재적용 안전.
begin;
insert into public.app_settings(key,value,label) values
 ('review_sms.enabled','false','리뷰 요청 문자 화면 사용'),
 ('review_sms.live_enabled','false','리뷰 요청 문자 — 환자에게 실제 발송(원장 승인 뒤 켬)')
on conflict(key) do update set value=excluded.value;
-- review_sms_access_allowed()가 false가 되어 review_sms_prepare·review_sms_recent가 모두 거절된다.
commit;
