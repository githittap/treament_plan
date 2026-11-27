-- 리뷰 요청 문자 — 환자 실제 발송 영구 중지(2026-11-27).
-- 근거: 원장 노션 「ㅇㅅㅇ」 A99 댓글(11-27 21:07) 「환자에게 리뷰 문자 보내기는 영구적으로 취소한다」 · T0 9차 전달.
-- 하는 일: ① review_sms.live_enabled를 false로 두고 설명을 「영구 중지」로 바꿈
--          ② app_settings에 live_enabled를 false가 아닌 값으로 쓰려 하면 DB가 거절(화면·서버 함수·손 SQL 모두)
--          ③ 병원 PC 중계 「솔라피 상태 새로 확인」 요청 칸(review_sms.relay_refresh_req) — 원장 화면 단추가 시각을 적고 중계가 읽음
-- 시험 발송(원장이 등록한 내부 번호)은 그대로 됨 — 병원 PC 중계 길 점검용.
-- 되돌리기: db/review_sms_stop_20261127_rollback.sql (원장이 다시 켜라고 할 때만)
begin;

insert into public.app_settings(key,value,label) values
 ('review_sms.live_enabled','false','리뷰 요청 문자 — 환자 실제 발송: 원장 결정(2026-11-27)으로 영구 중지 · 켤 수 없음'),
 ('review_sms.relay_refresh_req','','병원 PC 중계 — 솔라피 상태 새로 확인 요청 시각(원장 화면 단추가 적음 · 중계가 읽고 확인)')
on conflict (key) do update set value=excluded.value,label=excluded.label;

create or replace function public.review_sms_live_guard()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.key='review_sms.live_enabled' and coalesce(new.value,'false')<>'false' then
    raise exception 'review_sms_live_stopped: 환자 리뷰 문자는 원장 결정(2026-11-27)으로 영구 중지됨' using errcode='P0001';
  end if;
  return new;
end
$$;

drop trigger if exists review_sms_live_guard on public.app_settings;
create trigger review_sms_live_guard
  before insert or update on public.app_settings
  for each row execute function public.review_sms_live_guard();

commit;
