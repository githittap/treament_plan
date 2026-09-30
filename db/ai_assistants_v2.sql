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
update public.ai_models set supports_images = provider in ('anthropic','openai','google') where supports_images is null;
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
