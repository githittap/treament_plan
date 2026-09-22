-- AI 사용량 현황판 통합분: PC 상황판의 정가 환산 비용(ai_usage_data.json)과 Codex 대화 점검(codex_session_health.json)을 종류별 최신 1건으로 둔다.
-- Edge Function ai-usage-sync(service-role)만 저장하고 원장만 읽는다. 파생 기록이며, PC 파일 경로·세션 ID는 Edge에서 버린 뒤 저장한다.
-- 크기 한도 128KB: Edge가 문자열(NUL·짝 없는 서로게이트 제거, 길이 제한)과 금액(소수 6자리)을 정리한 뒤 JSON 64KB 이하만 넘기므로,
-- jsonb 표기로 공백이 늘어도 이 한도를 넘지 않는다(tests/sql/pglite-ai-usage-snapshots.mjs의 저장 일치 시험).
create table if not exists public.ai_usage_snapshots (
  kind text primary key check(kind in('platform_cost','codex_sessions')),
  payload jsonb not null check(jsonb_typeof(payload)='object' and octet_length(payload::text)<=131072),
  synced_at timestamptz not null default now()
);
alter table public.ai_usage_snapshots enable row level security;
revoke all on table public.ai_usage_snapshots from public,anon,authenticated;
grant select on public.ai_usage_snapshots to authenticated;
grant select,insert,update on public.ai_usage_snapshots to service_role;
drop policy if exists ai_usage_snapshots_owner_select on public.ai_usage_snapshots;
create policy ai_usage_snapshots_owner_select on public.ai_usage_snapshots for select to authenticated using((select public.my_role())='owner');
create or replace function public.ai_usage_snapshot_put(p_kind text,p_payload jsonb) returns void language sql security invoker set search_path='' as $$
  insert into public.ai_usage_snapshots(kind,payload,synced_at) values(p_kind,p_payload,now())
  on conflict(kind) do update set payload=excluded.payload,synced_at=excluded.synced_at;
$$;
revoke all on function public.ai_usage_snapshot_put(text,jsonb) from public,anon,authenticated;
grant execute on function public.ai_usage_snapshot_put(text,jsonb) to service_role;
