create table if not exists public.ortho_rescans (
  id bigint generated always as identity primary key,
  case_id uuid not null references public.ortho_cases(id) on delete cascade,
  rescan_date date not null,
  reason text,
  is_free boolean,
  cost integer,
  note text,
  author text,
  created_at timestamptz not null default now()
);

alter table public.ortho_rescans enable row level security;

drop policy if exists ortho_rescans_authenticated_select on public.ortho_rescans;
create policy ortho_rescans_authenticated_select on public.ortho_rescans for select to authenticated using (true);

drop policy if exists ortho_rescans_authenticated_insert on public.ortho_rescans;
create policy ortho_rescans_authenticated_insert on public.ortho_rescans for insert to authenticated with check (true);

drop policy if exists ortho_rescans_authenticated_update_same_day on public.ortho_rescans;
create policy ortho_rescans_authenticated_update_same_day on public.ortho_rescans for update to authenticated using (created_at::date = current_date) with check (created_at::date = current_date);

do $$
begin
  if not exists (
    select 1 from pg_catalog.pg_publication as p
    join pg_catalog.pg_publication_rel as pr on pr.prpubid = p.oid
    where p.pubname = 'supabase_realtime' and pr.prrelid = 'public.ortho_rescans'::regclass
  ) then
    begin
      alter publication supabase_realtime add table public.ortho_rescans;
    exception when duplicate_object then null;
    end;
  end if;
end;
$$;
