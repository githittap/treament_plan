-- 직원허브 AI 도우미 1단계: 모델 목록(ai_models) · 도우미(ai_assistants) · 사용 기록(ai_assistant_usage).
-- 설계서: Z:\09_claude-output\03_병원운영·전산\직원AI도우미\설계서_1단계.md (2장) — 이 파일이 그 계약의 구현이다.
-- 세 테이블 모두 owner만 직접 CRUD(RLS). 직원은 ai_assistants_for_me() RPC로만 읽는다. 대화 내용은 저장하지 않는다.
-- 재실행 안전: create table if not exists · create or replace function · drop policy/trigger if exists 뒤 재생성 · on conflict do nothing.

-- =====================================================================================
-- 2-1. public.ai_models — 원장이 관리하는 모델 목록
-- =====================================================================================
create table if not exists public.ai_models (
  id uuid primary key default gen_random_uuid(),
  provider text not null check (provider in ('anthropic','openai','deepseek','stepfun','moonshot','google')),
  model_id text not null check (char_length(model_id) between 1 and 100),
  label text not null check (char_length(label) between 1 and 100),
  enabled boolean not null default true,
  price_in_usd_per_mtok numeric null check (price_in_usd_per_mtok is null or price_in_usd_per_mtok >= 0),
  price_out_usd_per_mtok numeric null check (price_out_usd_per_mtok is null or price_out_usd_per_mtok >= 0),
  note text not null default '',
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ai_models_provider_model_id_key unique (provider, model_id)
);
alter table public.ai_models enable row level security;
revoke all on table public.ai_models from public, anon, authenticated;
grant select, insert, update, delete on table public.ai_models to authenticated;
grant select on table public.ai_models to service_role; -- Edge 함수(ai-assistant-chat)가 모델 값을 읽음(RLS는 bypassrls로 우회하지만 테이블 GRANT는 필요)

drop policy if exists ai_models_owner_all on public.ai_models;
create policy ai_models_owner_all on public.ai_models for all to authenticated
  using ((select public.my_role()) = 'owner')
  with check ((select public.my_role()) = 'owner');

create or replace function public.set_ai_models_updated_at() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
  new.updated_at := now();
  return new;
end$$;
revoke all on function public.set_ai_models_updated_at() from public, anon, authenticated;

drop trigger if exists ai_models_set_updated_at on public.ai_models;
create trigger ai_models_set_updated_at before update on public.ai_models
  for each row execute function public.set_ai_models_updated_at();

-- =====================================================================================
-- 2-2. public.ai_assistants — 도우미(맞춤 GPT)
-- =====================================================================================
create table if not exists public.ai_assistants (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 40),
  icon text not null default '🤖' check (char_length(icon) between 1 and 8),
  description text not null default '' check (char_length(description) <= 200),
  instructions text not null default '' check (char_length(instructions) <= 20000),
  knowledge text not null default '' check (char_length(knowledge) <= 60000),
  model_ref uuid null references public.ai_models(id) on delete set null,
  fallback_model_ref uuid null references public.ai_models(id) on delete set null,
  effort text null check (effort is null or effort in ('low','medium','high')),
  max_output_tokens int not null default 4000 check (max_output_tokens between 256 and 32000),
  visible_roles text[] not null default '{staff,manager,chief,owner}'
    check (visible_roles <@ array['staff','manager','chief','owner']::text[] and array_length(visible_roles,1) > 0),
  enabled boolean not null default true,
  sort_order int not null default 0,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.ai_assistants enable row level security;
revoke all on table public.ai_assistants from public, anon, authenticated;
grant select, insert, update, delete on table public.ai_assistants to authenticated;
grant select on table public.ai_assistants to service_role; -- Edge 함수가 지침서·참고자료·모델 배정을 읽음

drop policy if exists ai_assistants_owner_all on public.ai_assistants;
create policy ai_assistants_owner_all on public.ai_assistants for all to authenticated
  using ((select public.my_role()) = 'owner')
  with check ((select public.my_role()) = 'owner');

create or replace function public.set_ai_assistants_updated_at() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
  new.updated_at := now();
  return new;
end$$;
revoke all on function public.set_ai_assistants_updated_at() from public, anon, authenticated;

drop trigger if exists ai_assistants_set_updated_at on public.ai_assistants;
create trigger ai_assistants_set_updated_at before update on public.ai_assistants
  for each row execute function public.set_ai_assistants_updated_at();

-- 직원용: 자기 역할에 보이는 도우미만(대화 없이 카드 목록용). SECURITY DEFINER — 직원은 ai_assistants를 직접 못 읽으므로
-- 지침서·참고자료가 새지 않게 반환 칼럼에서 뺀다. 허브 접근이 막힌 사용자는 빈 결과(my_role()이 이미 'pending'이 되지만, 명시적으로도 gate한다).
create or replace function public.ai_assistants_for_me()
returns table (id uuid, name text, icon text, description text, ready boolean, sort_order int)
language sql stable security definer set search_path = '' as $$
  select a.id, a.name, a.icon, a.description,
    (a.model_ref is not null and coalesce(m.enabled, false)) as ready,
    a.sort_order
  from public.ai_assistants a
  left join public.ai_models m on m.id = a.model_ref
  where public.employee_hub_access_allowed()
    and a.enabled
    and ((select public.my_role()) = 'owner' or (select public.my_role()) = any(a.visible_roles))
  order by a.sort_order, a.name;
$$;
revoke all on function public.ai_assistants_for_me() from public, anon;
grant execute on function public.ai_assistants_for_me() to authenticated;

-- =====================================================================================
-- 2-3. public.ai_assistant_usage — 사용 기록(대화 내용은 저장하지 않음)
-- =====================================================================================
create table if not exists public.ai_assistant_usage (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  user_id uuid not null,
  assistant_id uuid null references public.ai_assistants(id) on delete set null,
  assistant_name text not null,
  provider text not null,
  model_id text not null,
  fallback_used boolean not null default false,
  status text not null check (status in ('ok','error','pending')), -- pending = 호출 전 예약(아직 결과 없음)
  error_kind text null,
  input_tokens int not null default 0 check (input_tokens >= 0),
  output_tokens int not null default 0 check (output_tokens >= 0),
  est_cost_usd numeric null check (est_cost_usd is null or est_cost_usd >= 0),
  latency_ms int null check (latency_ms is null or latency_ms >= 0)
);
alter table public.ai_assistant_usage enable row level security;
revoke all on table public.ai_assistant_usage from public, anon, authenticated;
grant select on table public.ai_assistant_usage to authenticated;
grant select, insert, update on table public.ai_assistant_usage to service_role; -- Edge 함수가 예약(insert) 뒤 결과를 update

drop policy if exists ai_assistant_usage_owner_select on public.ai_assistant_usage;
create policy ai_assistant_usage_owner_select on public.ai_assistant_usage for select to authenticated
  using ((select public.my_role()) = 'owner');
-- insert·update·delete 정책 없음 = authenticated는 못 씀(Edge 함수가 service role로만 기록).

-- 이미 status check가 옛 값(ok·error)으로 만들어진 DB에서도 재실행되게 제약을 다시 만든다.
alter table public.ai_assistant_usage drop constraint if exists ai_assistant_usage_status_check;
alter table public.ai_assistant_usage add constraint ai_assistant_usage_status_check check (status in ('ok','error','pending'));

create index if not exists ai_assistant_usage_created_at_idx on public.ai_assistant_usage (created_at desc);
create index if not exists ai_assistant_usage_user_created_idx on public.ai_assistant_usage (user_id, created_at desc);

-- 호출 전 「예약」: 사용자별 잠금 아래에서 최근 1시간 건수(예약 포함)를 세어 한도를 넘으면 rate_limited 예외,
-- 아니면 status='pending' 행을 넣고 id를 돌려준다. Edge 함수가 시도마다(1차·예비 각각) 이 함수를 먼저 부르고,
-- 호출이 끝나면 같은 행을 ok/error·토큰·금액·지연으로 update한다. 동시 요청이 한도를 넘지 못하게 하는 유일한 관문이다.
-- service_role만 실행(직원이 직접 부르면 남의 건수를 채울 수 있음).
create or replace function public.ai_usage_reserve(
  p_user uuid, p_assistant uuid, p_assistant_name text, p_provider text, p_model_id text, p_limit int default 120
) returns bigint
language plpgsql security definer set search_path = '' as $$
declare
  v_count int;
  v_id bigint;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_user::text, 0));
  select count(*) into v_count from public.ai_assistant_usage
    where user_id = p_user and created_at >= now() - interval '1 hour';
  if v_count >= p_limit then
    raise exception using errcode = 'P0001', message = 'rate_limited';
  end if;
  insert into public.ai_assistant_usage (user_id, assistant_id, assistant_name, provider, model_id, status)
    values (p_user, p_assistant, p_assistant_name, p_provider, p_model_id, 'pending')
    returning id into v_id;
  return v_id;
end$$;
revoke all on function public.ai_usage_reserve(uuid, uuid, text, text, text, int) from public, anon, authenticated;
grant execute on function public.ai_usage_reserve(uuid, uuid, text, text, text, int) to service_role;

-- =====================================================================================
-- 2-4. 처음 넣을 자료
-- =====================================================================================
-- 가격(달러/100만 토큰): anthropic 4곳은 claude-api 스킬 shared/model-migration.md
-- (「Migrating to Claude Opus 5.5」·「Migrating to Claude Sonnet 5.5」 절)에 적힌 공식 가격.
-- claude-haiku-4-5·claude-fable-5-1 가격은 설계서 2-4절 그대로(원장 승인 원문 기준).
-- 나머지 5곳은 2026-09-29 웹 검색(WebSearch)으로 이름이 정확히 일치하고 단일가(변동·기간한정 없음)인
-- 것만 채우고, 이름이 다르거나(딥시크) 변동·프로모션 가격(제미나이 플래시)인 것은 null로 남긴다.
-- openai gpt-6-sol/luna/astra: OpenAI 공식 발표(openai.com/index/introducing-gpt-6-sol-and-luna)
--   + benchlm.ai/openai/api-pricing(2026-09) 교차 확인. sol 2/10, luna 0.10/0.50, astra 10/50.
-- deepseek: 공식 모델 이름이 「DeepSeek V4 Flash」로 설계서의 deepseek-flash와 다르고, 가격도
--   피크/비피크 시간대에 따라 달라(비피크 pro 0.66/1.98, 피크 1.32/3.96 — deepseek.ai/pricing,
--   benchlm.ai/deepseek/api-pricing) 단일가로 못 채움 -> null.
-- stepfun step-5-preview: aireiter.com·runtimewire.com(2026-09, 「$1 per million input tokens」)
--   확인, 1/2.70. step-3.7-flash는 가격 정보를 못 찾음 -> null.
-- moonshot kimi-k3: benchlm.ai/moonshot/api-pricing·morphllm.com/kimi-api(둘 다 "$3/$15") 확인,
--   3/15. kimi-k2.6: saygm.com(2026-09) 0.95/4.00 — 출처 1곳뿐이라 다소 낮은 확신.
-- google gemini-3.1-pro-preview: 검색 결과 표시 이름은 「Gemini 3.1 Pro」(-preview 접미사 없음,
--   설계서 model_id와 다를 수 있음) — 20만 토큰 이하 구간 기준 2/12(apidog.com 등). gemini-3.8-flash는
--   2026-12-31까지 한정 프로모션가(0.75/3.75, 2027-01-01부터 1.50/7.50로 오름)라 단일가로 못 채움 -> null.
insert into public.ai_models (provider, model_id, label, enabled, price_in_usd_per_mtok, price_out_usd_per_mtok, note, sort_order) values
  ('anthropic', 'claude-opus-5-5', 'Claude Opus 5.5', true, 4, 20, '', 10),
  ('anthropic', 'claude-sonnet-5-5', 'Claude Sonnet 5.5', true, 2, 10, '', 20),
  ('anthropic', 'claude-haiku-4-5', 'Claude Haiku 4.5', true, 1, 5, '', 30),
  ('anthropic', 'claude-fable-5-1', 'Claude Fable 5.1', true, 10, 50, '', 40),
  ('openai', 'gpt-6-sol', 'GPT-6 Sol', true, 2, 10, '', 50),
  ('openai', 'gpt-6-luna', 'GPT-6 Luna', true, 0.10, 0.50, '', 60),
  ('openai', 'gpt-6-astra', 'GPT-6 Astra', true, 10, 50, '', 70),
  ('deepseek', 'deepseek-flash', 'DeepSeek Flash', true, null, null, '이름·가격 확인 필요(공식 이름은 DeepSeek V4 Flash로 보임, 피크/비피크 변동가)', 80),
  ('deepseek', 'deepseek-v4-pro', 'DeepSeek V4 Pro', true, null, null, '피크/비피크 변동가라 단일가 미기재(비피크 0.66/1.98, 피크 1.32/3.96)', 90),
  ('stepfun', 'step-5-preview', 'Step 5 Preview', true, 1, 2.70, '', 100),
  ('stepfun', 'step-3.7-flash', 'Step 3.7 Flash', true, null, null, '', 110),
  ('moonshot', 'kimi-k3', 'Kimi K3', true, 3, 15, '', 120),
  ('moonshot', 'kimi-k2.6', 'Kimi K2.6', true, 0.95, 4.00, '출처 1곳뿐이라 확인 권장', 130),
  ('google', 'gemini-3.1-pro-preview', 'Gemini 3.1 Pro', true, 2, 12, '20만 토큰 이하 구간 기준(그 이상은 다른 단가일 수 있음)', 140),
  ('google', 'gemini-3.8-flash', 'Gemini 3.8 Flash', true, null, null, '2026-12-31까지 한정 프로모션가(0.75/3.75)라 미기재, 2027-01-01부터 1.50/7.50', 150)
on conflict (provider, model_id) do nothing;

-- 견본 도우미 1개(고정 id로 재실행해도 중복 삽입되지 않게 on conflict(id)) — model_ref는 원장이 허브에서 고름.
insert into public.ai_assistants
  (id, name, icon, description, instructions, knowledge, model_ref, fallback_model_ref, effort, max_output_tokens, visible_roles, enabled, sort_order)
values (
  '00000000-0000-0000-0000-0000000000a1',
  '리뷰 답글',
  '💬',
  '네이버·구글 등 환자 리뷰에 달 답글 초안을 만들어 줌',
  $INSTR$당신은 아산정플란트치과 직원이 환자 리뷰에 답글을 달 때 돕는 도우미입니다.
직원이 리뷰 원문을 붙여 넣으면 병원 이름으로 올릴 답글 초안을 만듭니다.

말투: 정중한 존댓말, 따뜻하고 진심 있게, 딱딱한 상투어는 줄입니다.
길이: 3~5문장. 이모지는 쓰지 않거나 1개까지.
좋은 리뷰: 리뷰에 나온 구체적인 내용을 짚어 감사하고, 다음 방문을 반갑게 청합니다.
아쉬운 리뷰: 불편을 드린 점을 먼저 사과하고, 개선하겠다는 뜻과 함께 병원으로 연락 주시면 자세히 듣겠다고 안내합니다.
리뷰에 없는 환자 개인 정보나 치료 내용은 새로 쓰지 않습니다.

답 형식:
[짧은 답글]
(2~3문장)

[조금 긴 답글]
(4~5문장)

직원이 「더 짧게」「더 부드럽게」처럼 고쳐 달라고 하면 그에 맞춰 다시 씁니다.$INSTR$,
  '',
  null,
  null,
  'low',
  4000,
  '{staff,manager,chief,owner}',
  true,
  10
)
on conflict (id) do nothing;
