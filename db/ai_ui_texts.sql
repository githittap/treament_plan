-- 직원허브 「AI 도우미」 안내 문구 표. 원장이 허브 화면(📝 안내 문구 탭)에서 직접 고친다.
-- 화면(ai-assistants.js) 코드에 박힌 문구는 「기본값」으로 남고, 이 표에 같은 키의 행이 있으면 그 글이 기본값을 덮어쓴다.
-- 읽기: 허브에 로그인한 직원 전부(employee_hub_access_allowed) · 쓰기: 원장만(my_role()='owner') · anon 권한 없음.
-- 재실행 안전: create table if not exists · create or replace function · drop … if exists 뒤 다시 만듦. 기존 표·함수는 건드리지 않는다.
create table if not exists public.ai_ui_texts (
  key text primary key check (key ~ '^[a-z][a-z0-9_.]{1,80}$'),
  value text not null check (char_length(btrim(value)) between 1 and 20000),
  updated_at timestamptz not null default now(),
  updated_by uuid
);

-- 고친 시각·고친 사람은 화면이 보내지 않고 DB가 채운다(사칭 방지).
create or replace function public.set_ai_ui_texts_audit() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  new.updated_by := auth.uid();
  return new;
end;
$$;
revoke all on function public.set_ai_ui_texts_audit() from public, anon, authenticated;
drop trigger if exists ai_ui_texts_set_audit on public.ai_ui_texts;
create trigger ai_ui_texts_set_audit before insert or update on public.ai_ui_texts
  for each row execute function public.set_ai_ui_texts_audit();

alter table public.ai_ui_texts enable row level security;
revoke all on table public.ai_ui_texts from public, anon, authenticated;
grant select, insert, update, delete on table public.ai_ui_texts to authenticated;

drop policy if exists ai_ui_texts_hub_select on public.ai_ui_texts;
create policy ai_ui_texts_hub_select on public.ai_ui_texts for select to authenticated
  using (public.employee_hub_access_allowed());
drop policy if exists ai_ui_texts_owner_insert on public.ai_ui_texts;
create policy ai_ui_texts_owner_insert on public.ai_ui_texts for insert to authenticated
  with check ((select public.my_role()) = 'owner');
drop policy if exists ai_ui_texts_owner_update on public.ai_ui_texts;
create policy ai_ui_texts_owner_update on public.ai_ui_texts for update to authenticated
  using ((select public.my_role()) = 'owner') with check ((select public.my_role()) = 'owner');
drop policy if exists ai_ui_texts_owner_delete on public.ai_ui_texts;
create policy ai_ui_texts_owner_delete on public.ai_ui_texts for delete to authenticated
  using ((select public.my_role()) = 'owner');
