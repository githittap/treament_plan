-- Z③-06 로컬 초안. consultation_access_widen.sql 뒤에 적용한다.
alter table public.consultation_inbox drop constraint if exists consultation_inbox_status_check;
alter table public.consultation_inbox add constraint consultation_inbox_status_check
  check(status in ('new','in_progress','recall_1','recall_2','recall_3','closed','converted'));

drop policy if exists consultation_inbox_update on public.consultation_inbox;
create policy consultation_inbox_update on public.consultation_inbox for update to authenticated
using (public.employee_hub_access_allowed() and public.my_role() in ('manager','chief','owner'))
with check (public.employee_hub_access_allowed() and public.my_role() in ('manager','chief','owner')
  and status in ('new','in_progress','recall_1','recall_2','recall_3','closed')
  and journal_id is null and (assigned_to is null or public.consultation_inbox_assignee_allowed(assigned_to)));

create table if not exists public.consultation_inbox_views (
  id bigint generated always as identity primary key,
  inbox_id uuid not null references public.consultation_inbox(id),
  viewer_id uuid not null references auth.users(id),
  viewed_at timestamptz not null default now()
);
create index if not exists consultation_inbox_views_inbox_idx on public.consultation_inbox_views(inbox_id,viewed_at desc);
alter table public.consultation_inbox_views enable row level security;
revoke all on public.consultation_inbox_views from public,anon,authenticated;
grant select on public.consultation_inbox_views to authenticated;
create policy consultation_inbox_views_owner_select on public.consultation_inbox_views for select to authenticated
using(public.employee_hub_access_allowed() and public.my_role()='owner');

create table if not exists public.consultation_inbox_replies (
  id bigint generated always as identity primary key,
  inbox_id uuid not null references public.consultation_inbox(id),
  author_id uuid not null references auth.users(id),
  reply text not null check (char_length(btrim(reply)) between 1 and 4000),
  created_at timestamptz not null default now()
);
create index if not exists consultation_inbox_replies_inbox_idx on public.consultation_inbox_replies(inbox_id,created_at);
alter table public.consultation_inbox_replies enable row level security;
revoke all on public.consultation_inbox_replies from public,anon,authenticated;
grant select on public.consultation_inbox_replies to authenticated;
create policy consultation_inbox_replies_reader on public.consultation_inbox_replies for select to authenticated
using(public.employee_hub_access_allowed() and public.my_role() in ('manager','chief','owner'));

create or replace function public.consultation_inbox_record_view(p_inbox_id uuid)
returns void language plpgsql security definer set search_path='' as $$
begin
  if auth.uid() is null or not public.employee_hub_access_allowed()
    or public.my_role() not in ('staff','manager','chief','owner') then raise exception 'inbox access required'; end if;
  if not exists(select 1 from public.consultation_inbox where id=p_inbox_id) then raise exception 'inbox not found'; end if;
  insert into public.consultation_inbox_views(inbox_id,viewer_id) values(p_inbox_id,auth.uid());
end$$;
revoke all on function public.consultation_inbox_record_view(uuid) from public,anon,authenticated;
grant execute on function public.consultation_inbox_record_view(uuid) to authenticated;

create or replace function public.consultation_inbox_record_reply(p_inbox_id uuid,p_reply text)
returns void language plpgsql security definer set search_path='' as $$
begin
  if auth.uid() is null or not public.employee_hub_access_allowed()
    or public.my_role() not in ('manager','chief','owner') then raise exception 'inbox write access required'; end if;
  if char_length(btrim(coalesce(p_reply,''))) not between 1 and 4000 then raise exception 'invalid reply'; end if;
  if not exists(select 1 from public.consultation_inbox where id=p_inbox_id and status<>'converted') then raise exception 'inbox not writable'; end if;
  insert into public.consultation_inbox_replies(inbox_id,author_id,reply) values(p_inbox_id,auth.uid(),btrim(p_reply));
end$$;
revoke all on function public.consultation_inbox_record_reply(uuid,text) from public,anon,authenticated;
grant execute on function public.consultation_inbox_record_reply(uuid,text) to authenticated;
