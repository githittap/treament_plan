-- 결근/미기록 후보 판정의 안전 기본값. hr_settings.sql 적용 뒤에도 독립 재실행 가능.
-- 선행조건: public.app_settings 및 기존 owner RLS가 존재한다.
-- rollback을 위해 migration 전 두 키의 존재·값·표시명·갱신시각만 비공개 snapshot으로 보관한다.
begin;

create table if not exists public.absence_candidate_settings_migration_state (
  key text primary key check (key in ('absence_confirm_after_minutes','absence_exclude_pending_manual')),
  existed_before boolean not null,
  original_value text,
  original_label text,
  original_updated_at timestamptz
);
alter table public.absence_candidate_settings_migration_state enable row level security;
revoke all on table public.absence_candidate_settings_migration_state from public, authenticated;

insert into public.absence_candidate_settings_migration_state
  (key,existed_before,original_value,original_label,original_updated_at)
select wanted.key,(current.key is not null),current.value,current.label,current.updated_at
from (values
  ('absence_confirm_after_minutes'),
  ('absence_exclude_pending_manual')
) as wanted(key)
left join public.app_settings current on current.key=wanted.key
on conflict (key) do nothing;

-- 기존 설정은 덮어쓰지 않고, snapshot에 없던 두 키만 기본값으로 추가한다.
insert into public.app_settings (key,value,label) values
  ('absence_confirm_after_minutes','0','시업 뒤 결근/미기록 후보 확인 지연(분)'),
  ('absence_exclude_pending_manual','true','대기·실장승인·원장확정 수기근태를 후보에서 제외')
on conflict (key) do nothing;

commit;
