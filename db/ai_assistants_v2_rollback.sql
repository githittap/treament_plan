-- 2단계 롤백 초안: 대화 기록 포함 2단계 객체를 제거하고 1단계 모델 제약·직원 카드 함수를 복구한다.
begin;

-- 1단계 회사 6곳 밖의 회사(xai·원장이 추가한 회사)를 쓰는 모델이 남아 있으면, 1단계 제약을 되돌릴 수 없으므로 여기서 멈춘다.
do $$
declare
  v_models int;
  v_assistants int;
  v_providers text;
begin
  select count(*), string_agg(distinct m.provider, ', ' order by m.provider)
    into v_models, v_providers
    from public.ai_models m
    where m.provider not in ('anthropic','openai','deepseek','stepfun','moonshot','google');
  if v_models > 0 then
    select count(*) into v_assistants
      from public.ai_assistants a
      where a.model_ref in (select m.id from public.ai_models m where m.provider not in ('anthropic','openai','deepseek','stepfun','moonshot','google'))
         or a.fallback_model_ref in (select m.id from public.ai_models m where m.provider not in ('anthropic','openai','deepseek','stepfun','moonshot','google'));
    raise exception '롤백을 멈췄어요: 1단계에 없던 회사(%)의 모델이 %개 있고, 그 모델을 쓰는 도우미가 %개예요. 먼저 그 도우미들의 기본·예비 모델을 1단계 회사(Anthropic·OpenAI·DeepSeek·StepFun·Moonshot·Google)의 모델로 바꾸고, 그 회사의 모델 행을 삭제한 뒤 다시 실행하세요.',
      v_providers, v_models, v_assistants;
  end if;
end $$;

-- 1단계 직원 카드 함수로 정확히 되돌린다(2단계 칼럼을 지우기 전에).
drop function if exists public.ai_assistants_for_me();
create function public.ai_assistants_for_me()
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

drop table if exists public.ai_assistant_messages cascade;
drop table if exists public.ai_assistant_conversations cascade;
alter table public.ai_assistants drop constraint if exists ai_assistants_starters_check;
alter table public.ai_assistants drop column if exists web_search;
alter table public.ai_assistants drop column if exists starters;
drop function if exists public.ai_assistant_starters_valid(text[]);
alter table public.ai_models drop constraint if exists ai_models_provider_fkey;
alter table public.ai_models drop column if exists supports_images;
alter table public.ai_models drop constraint if exists ai_models_provider_check;
alter table public.ai_models add constraint ai_models_provider_check check (provider in ('anthropic','openai','deepseek','stepfun','moonshot','google'));
drop table if exists public.ai_providers cascade;
drop trigger if exists ai_assistants_set_updated_at on public.ai_assistants;
create trigger ai_assistants_set_updated_at before update on public.ai_assistants
  for each row execute function public.set_ai_assistants_updated_at();

commit;
