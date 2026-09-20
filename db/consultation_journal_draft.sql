-- 상담일지 기능 초안: 운영 DB에는 별도 검증 후 적용한다.
create table if not exists public.consultation_journals (
  id bigint generated always as identity primary key,
  patient_name text not null check (char_length(trim(patient_name)) between 1 and 80),
  contact_phone text,
  source_sheet text not null check (source_sheet in ('교정', '확정', '미확정 및 부분확정', '홈페이지', '카카오,네이버예약,당근', '원본')),
  consulted_on date not null default current_date,
  status text not null default '대기' check (status in ('대기', '미확정', '부분확정', '확정', '종결')),
  consultation_note text not null check (char_length(trim(consultation_note)) between 1 and 4000),
  next_action text,
  author_id uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists consultation_journals_consulted_on_idx
  on public.consultation_journals (consulted_on desc, id desc);
create index if not exists consultation_journals_source_status_idx
  on public.consultation_journals (source_sheet, status, consulted_on desc);

create or replace function public.set_consultation_journals_updated_at()
returns trigger language plpgsql as $$
begin
  if new.author_id is distinct from old.author_id then
    raise exception 'consultation author cannot be changed';
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
revoke all privileges on sequence public.consultation_journals_id_seq from anon;
revoke all privileges on sequence public.consultation_journals_id_seq from authenticated;
grant select, insert, update on table public.consultation_journals to authenticated;
grant usage, select on sequence public.consultation_journals_id_seq to authenticated;

drop policy if exists consultation_journals_select on public.consultation_journals;
create policy consultation_journals_select on public.consultation_journals
for select to authenticated
using (public.my_role() in ('manager', 'owner'));

drop policy if exists consultation_journals_insert on public.consultation_journals;
create policy consultation_journals_insert on public.consultation_journals
for insert to authenticated
with check (public.my_role() in ('manager', 'owner') and author_id = auth.uid());

drop policy if exists consultation_journals_update on public.consultation_journals;
create policy consultation_journals_update on public.consultation_journals
for update to authenticated
using (public.my_role() in ('manager', 'owner'))
with check (public.my_role() in ('manager', 'owner'));
