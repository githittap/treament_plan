-- 외부 AI 사용 집계 되돌리기: 파생 스냅샷 한 줄(external_ai)만 지우고 kind 허용 목록을 원래 두 종류로 되돌린다(다른 스냅샷·표·함수는 건드리지 않는다).
begin;
delete from public.ai_usage_snapshots where kind='external_ai';
alter table public.ai_usage_snapshots drop constraint if exists ai_usage_snapshots_kind_check;
alter table public.ai_usage_snapshots add constraint ai_usage_snapshots_kind_check check(kind in('platform_cost','codex_sessions'));
commit;
