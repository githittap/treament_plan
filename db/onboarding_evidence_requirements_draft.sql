-- Task 4 로컬 검토용 초안: 입사 공통 체크리스트의 완료 근거를 별도 보관한다.
-- 계좌번호 원문은 본인·owner만 보고, chief·manager는 완료 여부만 확인한다.
create table if not exists public.onboarding_evidence (
  user_id uuid primary key references public.profiles(user_id) on delete cascade,
  bank_name text,
  account_number text,
  notion_id text,
  notion_app_installed boolean not null default false,
  notion_workspace_logged_in boolean not null default false,
  updated_at timestamptz not null default now()
);

alter table public.onboarding_evidence enable row level security;
grant select,insert,update on public.onboarding_evidence to authenticated;

drop policy if exists onboarding_evidence_select_private on public.onboarding_evidence;
create policy onboarding_evidence_select_private on public.onboarding_evidence for select to authenticated
using (user_id=auth.uid() or public.my_role()='owner');

drop policy if exists onboarding_evidence_insert_self on public.onboarding_evidence;
create policy onboarding_evidence_insert_self on public.onboarding_evidence for insert to authenticated
with check (user_id=auth.uid());

drop policy if exists onboarding_evidence_update_self on public.onboarding_evidence;
create policy onboarding_evidence_update_self on public.onboarding_evidence for update to authenticated
using (user_id=auth.uid()) with check (user_id=auth.uid());

create or replace function public.onboarding_evidence_completion()
returns table(user_id uuid,bank_complete boolean,notion_complete boolean)
language sql stable security definer set search_path=public as $$
  select e.user_id,
    coalesce(nullif(btrim(e.bank_name),'') is not null and nullif(btrim(e.account_number),'') is not null,false),
    coalesce(nullif(btrim(e.notion_id),'') is not null and e.notion_app_installed and e.notion_workspace_logged_in,false)
  from public.onboarding_evidence e
  where e.user_id=auth.uid() or public.my_role() in ('manager','chief','owner')
$$;
revoke all on function public.onboarding_evidence_completion() from public;
grant execute on function public.onboarding_evidence_completion() to authenticated;
