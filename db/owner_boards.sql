-- 원장 전용 보기판의 읽기 전용 HTML 스냅샷. PC 업로더만 service_role RPC로 갱신한다.
create table if not exists public.owner_boards (
  slug text primary key check(slug in('busd_ledger','pin_board','wordbook')),
  html text not null check(octet_length(html) between 1 and 4194304),
  sha256 text not null check(sha256 ~ '^[0-9a-f]{64}$'),
  source_mtime timestamptz,
  synced_at timestamptz not null default now()
);
alter table public.owner_boards enable row level security;
revoke all on table public.owner_boards from public,anon,authenticated;
grant select on public.owner_boards to authenticated;
grant select,insert,update on public.owner_boards to service_role;
drop policy if exists owner_boards_owner_select on public.owner_boards;
create policy owner_boards_owner_select on public.owner_boards for select to authenticated using((select public.my_role())='owner');
create or replace function public.owner_board_put(p_slug text,p_html text,p_sha256 text,p_source_mtime timestamptz) returns void language sql security invoker set search_path='' as $$
  insert into public.owner_boards(slug,html,sha256,source_mtime,synced_at) values(p_slug,p_html,p_sha256,p_source_mtime,now())
  on conflict(slug) do update set html=excluded.html,sha256=excluded.sha256,source_mtime=excluded.source_mtime,synced_at=excluded.synced_at;
$$;
revoke all on function public.owner_board_put(text,text,text,timestamptz) from public,anon,authenticated;
grant execute on function public.owner_board_put(text,text,text,timestamptz) to service_role;
