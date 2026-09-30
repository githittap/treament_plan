-- 2단계 롤백 초안: 대화 기록 포함 2단계 객체를 제거하고 1단계 모델 제약을 복구한다.
drop table if exists public.ai_assistant_messages cascade;
drop table if exists public.ai_assistant_conversations cascade;
alter table public.ai_assistants drop column if exists web_search;
alter table public.ai_assistants drop column if exists starters;
alter table public.ai_models drop constraint if exists ai_models_provider_fkey;
alter table public.ai_models drop column if exists supports_images;
alter table public.ai_models add constraint ai_models_provider_check check (provider in ('anthropic','openai','deepseek','stepfun','moonshot','google'));
drop table if exists public.ai_providers cascade;
