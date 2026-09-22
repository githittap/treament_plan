-- AI 사용량 현황판: PC의 ~/.claude/logs/codex_model_usage.json(날짜×모델 토큰)을 Edge Function ai-usage-sync(service-role)만 적재하고 원장만 읽는다.
-- 파생 기록(PC의 Codex 로그에서 다시 계산 가능)이며 대화 원문·비밀은 저장하지 않는다. 같은 날짜는 올릴 때마다 통째로 교체한다.
-- 모델명 규칙은 Edge 검사(payload.mjs)와 같다: 인쇄 가능한 ASCII 1~64자, 앞뒤 공백 없음.
create table if not exists public.ai_model_usage_daily (
  usage_date date not null,
  model text not null check(model~'^[!-~]([ -~]{0,62}[!-~])?$'),
  tokens bigint not null check(tokens between 0 and 1000000000000000),
  turns integer not null check(turns between 0 and 1000000000),
  synced_at timestamptz not null default now(),
  primary key(usage_date,model)
);
alter table public.ai_model_usage_daily enable row level security;
revoke all on table public.ai_model_usage_daily from public,anon,authenticated;
grant select on public.ai_model_usage_daily to authenticated;
grant select,insert,delete on public.ai_model_usage_daily to service_role;
drop policy if exists ai_model_usage_daily_owner_select on public.ai_model_usage_daily;
create policy ai_model_usage_daily_owner_select on public.ai_model_usage_daily for select to authenticated using((select public.my_role())='owner');
create or replace function public.ai_model_usage_replace(p_usage jsonb) returns integer language plpgsql security invoker set search_path='' as $$
declare v_count integer;
begin
  if p_usage is null or jsonb_typeof(p_usage)<>'object' or not exists(select 1 from jsonb_object_keys(p_usage))
    or exists(select 1 from jsonb_each(p_usage) d where d.key!~'^[0-9]{4}-[0-9]{2}-[0-9]{2}$' or jsonb_typeof(d.value)<>'object')
    or exists(select 1 from jsonb_each(p_usage) d cross join lateral jsonb_each(d.value) m where jsonb_typeof(m.value)<>'object' or jsonb_typeof(m.value->'tokens') is distinct from 'number' or jsonb_typeof(m.value->'turns') is distinct from 'number' or (select count(*) from jsonb_object_keys(m.value))<>2)
  then raise exception 'invalid ai usage payload';
  end if;
  delete from public.ai_model_usage_daily t where t.usage_date in(select d.key::date from jsonb_each(p_usage) d);
  insert into public.ai_model_usage_daily(usage_date,model,tokens,turns)
    select d.key::date,m.key,(m.value->>'tokens')::bigint,(m.value->>'turns')::integer from jsonb_each(p_usage) d cross join lateral jsonb_each(d.value) m;
  get diagnostics v_count=row_count;
  return v_count;
end$$;
revoke all on function public.ai_model_usage_replace(jsonb) from public,anon,authenticated;
grant execute on function public.ai_model_usage_replace(jsonb) to service_role;
