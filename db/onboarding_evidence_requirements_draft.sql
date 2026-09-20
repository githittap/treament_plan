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
revoke all on table public.onboarding_evidence from anon,authenticated;
grant select,insert,update on table public.onboarding_evidence to authenticated;

drop policy if exists onboarding_evidence_select_private on public.onboarding_evidence;
create policy onboarding_evidence_select_private on public.onboarding_evidence for select to authenticated
using (user_id=auth.uid() or public.my_role()='owner');

drop policy if exists onboarding_evidence_insert_self on public.onboarding_evidence;
create policy onboarding_evidence_insert_self on public.onboarding_evidence for insert to authenticated
with check (user_id=auth.uid());

drop policy if exists onboarding_evidence_update_self on public.onboarding_evidence;
create policy onboarding_evidence_update_self on public.onboarding_evidence for update to authenticated
using (user_id=auth.uid()) with check (user_id=auth.uid());

-- 관리자에게 원문 대신 완료 여부만 제공하는 별도 표를 트리거로 동기화한다.
create table if not exists public.onboarding_evidence_completion (
  user_id uuid primary key references public.profiles(user_id) on delete cascade,
  bank_complete boolean not null default false,
  notion_complete boolean not null default false,
  updated_at timestamptz not null default now()
);
alter table public.onboarding_evidence_completion enable row level security;
revoke all on table public.onboarding_evidence_completion from anon,authenticated;
grant select on table public.onboarding_evidence_completion to authenticated;

drop policy if exists onboarding_evidence_completion_select_scoped on public.onboarding_evidence_completion;
create policy onboarding_evidence_completion_select_scoped on public.onboarding_evidence_completion for select to authenticated
using (
  user_id=auth.uid()
  or exists (
    select 1 from public.profiles p
    where p.user_id=auth.uid() and p.active is true and p.approved is true
      and p.role in ('manager','chief','owner')
  )
);

create schema if not exists employee_private;
revoke all on schema employee_private from public,anon,authenticated;
create or replace function employee_private.sync_onboarding_evidence_completion()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if tg_op='DELETE' then
    delete from public.onboarding_evidence_completion where user_id=old.user_id;
    return old;
  end if;
  insert into public.onboarding_evidence_completion(user_id,bank_complete,notion_complete,updated_at)
  values (
    new.user_id,
    coalesce(nullif(btrim(new.bank_name),'') is not null and nullif(btrim(new.account_number),'') is not null,false),
    coalesce(nullif(btrim(new.notion_id),'') is not null and new.notion_app_installed and new.notion_workspace_logged_in,false),
    now()
  )
  on conflict (user_id) do update set
    bank_complete=excluded.bank_complete,
    notion_complete=excluded.notion_complete,
    updated_at=excluded.updated_at;
  return new;
end;
$$;
revoke all on function employee_private.sync_onboarding_evidence_completion() from public,anon,authenticated;
drop trigger if exists onboarding_evidence_completion_sync on public.onboarding_evidence;
create trigger onboarding_evidence_completion_sync
after insert or update or delete on public.onboarding_evidence
for each row execute function employee_private.sync_onboarding_evidence_completion();

insert into public.onboarding_evidence_completion(user_id,bank_complete,notion_complete,updated_at)
select e.user_id,
  coalesce(nullif(btrim(e.bank_name),'') is not null and nullif(btrim(e.account_number),'') is not null,false),
  coalesce(nullif(btrim(e.notion_id),'') is not null and e.notion_app_installed and e.notion_workspace_logged_in,false),
  now()
from public.onboarding_evidence e
on conflict (user_id) do update set
  bank_complete=excluded.bank_complete,
  notion_complete=excluded.notion_complete,
  updated_at=excluded.updated_at;
