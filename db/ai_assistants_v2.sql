-- 직원허브 AI 도우미 2단계 스키마. 1단계 ai_assistants.sql 적용 후 실행한다.
-- 재실행 안전: provider 씨앗은 upsert, 제약은 이름 확인 후 교체한다.
create table if not exists public.ai_providers (
  id text primary key check (id ~ '^[a-z][a-z0-9_-]{1,30}$'),
  label text not null check (char_length(label) between 1 and 80),
  kind text not null check (kind in ('openai_compat','anthropic','google')),
  base_url text not null check (base_url ~ '^https://[^[:space:]]+$'),
  key_env text not null check (key_env ~ '^[A-Z][A-Z0-9_]{1,60}_API_KEY$' and key_env !~ '^SUPABASE'),
  enabled boolean not null default true,
  sort_order int not null default 0
);
alter table public.ai_providers enable row level security;
revoke all on table public.ai_providers from public, anon, authenticated;
grant select, insert, update, delete on table public.ai_providers to authenticated;
grant select on table public.ai_providers to service_role;
drop policy if exists ai_providers_owner_all on public.ai_providers;
create policy ai_providers_owner_all on public.ai_providers for all to authenticated
  using ((select public.my_role()) = 'owner') with check ((select public.my_role()) = 'owner');
insert into public.ai_providers(id,label,kind,base_url,key_env,sort_order) values
 ('anthropic','Anthropic (Claude)','anthropic','https://api.anthropic.com','ANTHROPIC_API_KEY',10),
 ('openai','OpenAI (GPT)','openai_compat','https://api.openai.com/v1','OPENAI_API_KEY',20),
 ('deepseek','DeepSeek','openai_compat','https://api.deepseek.com/v1','DEEPSEEK_API_KEY',30),
 ('stepfun','StepFun (Step)','openai_compat','https://api.stepfun.ai/v1','STEP_API_KEY',40),
 ('moonshot','Moonshot (Kimi)','openai_compat','https://api.moonshot.ai/v1','MOONSHOT_API_KEY',50),
 ('google','Google (Gemini)','google','https://generativelanguage.googleapis.com/v1beta','GEMINI_API_KEY',60),
 ('xai','xAI (Grok)','openai_compat','https://api.x.ai/v1','XAI_API_KEY',70)
on conflict(id) do update set label=excluded.label,kind=excluded.kind,base_url=excluded.base_url,key_env=excluded.key_env,sort_order=excluded.sort_order;

alter table public.ai_models add column if not exists supports_images boolean;
-- 사진 읽기 씨앗은 모델별로 「읽는 것이 확인된 모델」만 true다(근거는 허브AI2_구현보고.md 「supports_images 근거」 표).
-- 2026-10-01 작은 사진(96x96 빨간 네모)을 실제로 읽어 「Red」라고 답한 13개만 true — DeepSeek 2개는 답이 비어 미확인이라 false.
-- 이 목록에 없는 모델·앞으로 추가하는 모델은 false로 시작하고, 원장이 🧠 모델 목록에서 켜고 끈다.
update public.ai_models set supports_images = (provider, model_id) in (('anthropic','claude-fable-5-1'),('anthropic','claude-haiku-4-5'),('anthropic','claude-opus-5-5'),('anthropic','claude-sonnet-5-5'),('google','gemini-3.1-pro-preview'),('google','gemini-3.8-flash'),('moonshot','kimi-k2.6'),('moonshot','kimi-k3'),('openai','gpt-6-astra'),('openai','gpt-6-luna'),('openai','gpt-6-sol'),('stepfun','step-3.7-flash'),('stepfun','step-5-preview')) where supports_images is null;
alter table public.ai_models alter column supports_images set default false;
alter table public.ai_models alter column supports_images set not null;
alter table public.ai_models drop constraint if exists ai_models_provider_check;
alter table public.ai_models drop constraint if exists ai_models_provider_fkey;
alter table public.ai_models add constraint ai_models_provider_fkey foreign key(provider) references public.ai_providers(id);
alter table public.ai_assistants add column if not exists web_search boolean not null default false;
alter table public.ai_assistants add column if not exists starters text[] not null default '{}';
create or replace function public.ai_assistant_starters_valid(p_starters text[]) returns boolean
language sql immutable set search_path = '' as $$
  select coalesce(cardinality(p_starters),0) <= 4 and coalesce((select bool_and(char_length(x) <= 120) from unnest(p_starters) x),true);
$$;
revoke all on function public.ai_assistant_starters_valid(text[]) from public, anon, authenticated;
grant execute on function public.ai_assistant_starters_valid(text[]) to authenticated, service_role;
alter table public.ai_assistants drop constraint if exists ai_assistants_starters_check;
alter table public.ai_assistants add constraint ai_assistants_starters_check check (public.ai_assistant_starters_valid(starters));

create table if not exists public.ai_assistant_conversations (
  id uuid primary key,
  user_id uuid not null,
  assistant_id uuid references public.ai_assistants(id) on delete set null,
  assistant_name text not null,
  started_at timestamptz not null default now(),
  last_at timestamptz not null default now()
);
create index if not exists ai_assistant_conversations_last_at_idx on public.ai_assistant_conversations(last_at desc);
create table if not exists public.ai_assistant_messages (
  id bigint generated always as identity primary key,
  conversation_id uuid not null references public.ai_assistant_conversations(id) on delete cascade,
  role text not null check (role in ('user','assistant')),
  content text not null,
  image_count int not null default 0 check (image_count between 0 and 4),
  provider text,
  model_id text,
  fallback_used boolean not null default false,
  status text not null default 'ok' check (status in ('ok','error')),
  usage_id bigint references public.ai_assistant_usage(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists ai_assistant_messages_conversation_idx on public.ai_assistant_messages(conversation_id,created_at);
alter table public.ai_assistant_conversations enable row level security;
alter table public.ai_assistant_messages enable row level security;
revoke all on table public.ai_assistant_conversations, public.ai_assistant_messages from public, anon, authenticated;
grant select on table public.ai_assistant_conversations, public.ai_assistant_messages to authenticated;
grant select, insert, update on table public.ai_assistant_conversations to service_role;
grant select, insert on table public.ai_assistant_messages to service_role;
drop policy if exists ai_assistant_conversations_owner_select on public.ai_assistant_conversations;
create policy ai_assistant_conversations_owner_select on public.ai_assistant_conversations for select to authenticated
  using ((select public.my_role()) = 'owner');
drop policy if exists ai_assistant_messages_owner_select on public.ai_assistant_messages;
create policy ai_assistant_messages_owner_select on public.ai_assistant_messages for select to authenticated
  using ((select public.my_role()) = 'owner');

-- Edge에서도 같은 검사를 수행한다. DB 제약은 관리 화면/API 직접 요청의 우회도 막는다.
alter table public.ai_providers drop constraint if exists ai_providers_safe_config_check;
alter table public.ai_providers add constraint ai_providers_safe_config_check
  check (key_env ~ '^[A-Z][A-Z0-9_]{1,60}_API_KEY$' and key_env !~ '^SUPABASE' and base_url ~ '^https://[^[:space:]]+$');

-- 직원 화면이 쓰는 도우미 카드 목록. 시작 문장·웹검색·사진 읽기 가능 여부를 더해 다시 만든다(반환 칼럼이 달라져 create or replace로는 안 됨).
-- 지침서(instructions)·참고자료(knowledge)·모델 배정 id는 여전히 돌려주지 않는다.
-- images_ok: 기본 모델이 켜져 있고 사진을 읽으면 true. fallback_images_ok: 켜진 예비 모델이 있을 때만 그 모델의 사진 지원(예비가 없으면 null).
drop function if exists public.ai_assistants_for_me();
create function public.ai_assistants_for_me()
returns table (id uuid, name text, icon text, description text, ready boolean, sort_order int,
  starters text[], web_search boolean, images_ok boolean, fallback_images_ok boolean)
language sql stable security definer set search_path = '' as $$
  select a.id, a.name, a.icon, a.description,
    (a.model_ref is not null and coalesce(m.enabled, false)) as ready,
    a.sort_order,
    a.starters,
    a.web_search,
    (coalesce(m.enabled, false) and coalesce(m.supports_images, false)) as images_ok,
    case when fm.id is null or not fm.enabled then null else fm.supports_images end as fallback_images_ok
  from public.ai_assistants a
  left join public.ai_models m on m.id = a.model_ref
  left join public.ai_models fm on fm.id = a.fallback_model_ref
  where public.employee_hub_access_allowed()
    and a.enabled
    and ((select public.my_role()) = 'owner' or (select public.my_role()) = any(a.visible_roles))
  order by a.sort_order, a.name;
$$;
revoke all on function public.ai_assistants_for_me() from public, anon;
grant execute on function public.ai_assistants_for_me() to authenticated;
