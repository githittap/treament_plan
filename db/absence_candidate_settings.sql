-- 결근/미기록 후보 판정의 안전 기본값. hr_settings.sql 적용 뒤에도 독립 재실행 가능.
-- 선행조건: public.app_settings 및 기존 owner RLS가 존재한다.
-- 검증: 기존 설정은 덮어쓰지 않고 두 키만 기본값으로 추가한다.
insert into public.app_settings (key,value,label) values
  ('absence_confirm_after_minutes','0','시업 뒤 결근/미기록 후보 확인 지연(분)'),
  ('absence_exclude_pending_manual','true','대기·실장승인·원장확정 수기근태를 후보에서 제외')
on conflict (key) do nothing;
