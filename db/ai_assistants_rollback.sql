-- 직원허브 AI 도우미 1단계 되돌리기: db/ai_assistants.sql이 만든 3개 테이블·트리거 함수·RPC를 전부 지운다.
-- 대화 내용을 저장하지 않으므로 보존 게이트 없이 곧바로 지운다.
begin;
drop function if exists public.ai_assistants_for_me();
drop trigger if exists ai_assistants_set_updated_at on public.ai_assistants;
drop function if exists public.set_ai_assistants_updated_at();
drop trigger if exists ai_models_set_updated_at on public.ai_models;
drop function if exists public.set_ai_models_updated_at();
drop function if exists public.ai_usage_reserve(uuid, uuid, text, text, text, int);
drop table if exists public.ai_assistant_usage;
drop table if exists public.ai_assistants;
drop table if exists public.ai_models;
commit;
