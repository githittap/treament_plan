-- 시급제만 중지함. 지문·기존 급여·시급 이력·정정 감사 기록·추가 컬럼은 삭제하지 않음.
-- 재적용: wage_hourly_20261004.sql 실행 후 owner로 wage_hourly_config/month 확인.
begin;
insert into public.app_settings(key,value) values('wage.hourly.enabled','false')
on conflict(key) do update set value=excluded.value;
commit;
