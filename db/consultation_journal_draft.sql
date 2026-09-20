-- 상담일지 운영 적용 SQL: `consultation_journal_rollback.sql`을 함께 확인한 뒤 SQL Editor에서 1회 실행한다.
create table if not exists public.consultation_journals (
  id uuid primary key default gen_random_uuid(),
  patient_name text not null check (char_length(trim(patient_name)) between 1 and 80),
  contact_phone text,
  source_sheet text not null check (source_sheet in ('교정', '확정', '미확정 및 부분확정', '홈페이지', '카카오,네이버예약,당근', '원본')),
  consulted_on date not null default current_date,
  status text not null default '대기' check (status in ('대기', '미확정', '부분확정', '확정', '종결')),
  consultation_note text not null check (char_length(trim(consultation_note)) between 1 and 4000),
  next_action text,
  quoted_amount numeric(14,2) check (quoted_amount is null or quoted_amount >= 0),
  instruction_note text check (instruction_note is null or char_length(trim(instruction_note)) <= 1000),
  special_note text check (special_note is null or char_length(trim(special_note)) <= 1000),
  author_id uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists consultation_journals_consulted_on_idx
  on public.consultation_journals (consulted_on desc, id desc);
create index if not exists consultation_journals_source_status_idx
  on public.consultation_journals (source_sheet, status, consulted_on desc);
create index if not exists consultation_journals_author_id_idx
  on public.consultation_journals (author_id);

create or replace function public.set_consultation_journals_updated_at()
returns trigger language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.id is distinct from old.id or new.author_id is distinct from old.author_id or new.created_at is distinct from old.created_at then
    raise exception 'consultation immutable audit field cannot be changed';
  end if;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists consultation_journals_set_updated_at on public.consultation_journals;
create trigger consultation_journals_set_updated_at
before update on public.consultation_journals
for each row execute function public.set_consultation_journals_updated_at();

alter table public.consultation_journals enable row level security;

revoke all privileges on table public.consultation_journals from anon;
revoke all privileges on table public.consultation_journals from authenticated;
grant select, insert, update on table public.consultation_journals to authenticated;

drop policy if exists consultation_journals_select on public.consultation_journals;
create policy consultation_journals_select on public.consultation_journals
for select to authenticated
using ((select public.my_role()) in ('manager', 'owner'));

drop policy if exists consultation_journals_insert on public.consultation_journals;
create policy consultation_journals_insert on public.consultation_journals
for insert to authenticated
with check ((select public.my_role()) in ('manager', 'owner') and author_id = (select auth.uid()));

drop policy if exists consultation_journals_update on public.consultation_journals;
create policy consultation_journals_update on public.consultation_journals
for update to authenticated
using ((select public.my_role()) in ('manager', 'owner'))
with check ((select public.my_role()) in ('manager', 'owner'));
