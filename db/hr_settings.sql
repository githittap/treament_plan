-- 직원 허브 설정 표 (원장이 SQL Editor에서 값만 고치는 곳)
-- 재실행 안전. 기존 객체 변경 없음.

create table if not exists public.app_settings (
  key text primary key,
  value text not null,
  label text,
  updated_at timestamptz default now()
);

-- 기본값 (이미 있으면 유지 — 값 수정은 update 문으로)
insert into public.app_settings (key, value, label) values
  ('late_cut',        '09:40', '지각 판정 시각 (이 시각 초과 출근 = 지각)'),
  ('siueop',          '10:00', '시업(공식 출근) 시각 — 표시용'),
  ('jongeop_weekday_evening', '20:00', '평일 야간조 종업 시각'),
  ('jongeop_weekday_day',     '18:30', '평일 비야간 종업 시각'),
  ('jongeop_sat',     '17:00', '토요일 종업 시각'),
  ('jongeop_sun',     '14:00', '일요일 종업 시각'),
  ('ot_unit_min',     '10',    '연장근로 인정 단위(분) — 이 단위로 버림(예: 10이면 9분→0, 11분→10)')
on conflict (key) do nothing;

alter table public.app_settings enable row level security;

drop policy if exists app_settings_select_all on public.app_settings;
create policy app_settings_select_all
on public.app_settings for select to authenticated
using (true);

drop policy if exists app_settings_insert_owner on public.app_settings;
create policy app_settings_insert_owner
on public.app_settings for insert to authenticated
with check (public.my_role() = 'owner');

drop policy if exists app_settings_update_owner on public.app_settings;
create policy app_settings_update_owner
on public.app_settings for update to authenticated
using (public.my_role() = 'owner')
with check (public.my_role() = 'owner');
