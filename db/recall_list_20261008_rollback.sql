-- 데이터·열·함수·정책을 삭제하지 않는 보존형 롤백. 재적용 안전.
begin;
insert into public.app_settings(key,value,label) values
 ('recall.enabled','false','리콜 명단 사용'),('recall.push_enabled','false','아침 9시 리콜 폰 알림')
on conflict(key) do update set value=excluded.value;
-- 이미 큐에 있는 리콜 알림도 can_dispatch_recall_push()에서 발송을 거절한다.
commit;
