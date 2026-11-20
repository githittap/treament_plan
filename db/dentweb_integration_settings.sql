-- 덴트웹 업무함 설정 자리만 준비한다. 실제 값은 허브의 원장 설정에서 저장한다.
-- 카드 문구는 기존 public.hub_ui_texts의 dentweb.card.* 키로 저장한다.
insert into public.app_settings (key, value, label) values
  ('dentweb.operations_url', '', '덴트웹 업무함 주소'),
  ('dentweb.access.read_roles', '', '덴트웹 업무함 읽기 역할'),
  ('dentweb.access.owner_only', '', '덴트웹 진료비·등록·삭제 원장 전용')
on conflict (key) do nothing;
