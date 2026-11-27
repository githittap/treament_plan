-- 되돌리기: 리뷰 요청 문자 환자 발송 영구 중지(review_sms_stop_20261127). 원장이 다시 켜라고 할 때만 돌린다.
-- 이것만으로 환자 발송이 켜지지는 않음 — live_enabled는 false 그대로, 원장이 설정에서 다시 켜야 함(화면의 켜기 칸은 코드 되돌리기로 돌아옴).
begin;
drop trigger if exists review_sms_live_guard on public.app_settings;
drop function if exists public.review_sms_live_guard();
update public.app_settings set label='리뷰 요청 문자 — 환자에게 실제 발송(원장 승인 뒤 켬)' where key='review_sms.live_enabled';
delete from public.app_settings where key='review_sms.relay_refresh_req';
commit;
