-- 외부 AI(딥시크·스텝5 등) 사용 집계를 AI 사용량 현황판 스냅샷 표에 한 종류 더 둔다: kind 허용 목록에 'external_ai' 추가(기존 두 종류·RLS·저장 함수는 그대로).
-- ai_usage_snapshots.sql 뒤에 적용한다. 여러 번 적용해도 결과가 같다.
alter table public.ai_usage_snapshots drop constraint if exists ai_usage_snapshots_kind_check;
alter table public.ai_usage_snapshots add constraint ai_usage_snapshots_kind_check check(kind in('platform_cost','codex_sessions','external_ai'));
