-- 직원 허브 건의함 전용 정본
-- 기존 테이블과 데이터는 변경하지 않는다.

create table if not exists public.suggestion_campaigns (
  id bigint generated always as identity primary key,
  title text not null,
  starts_at date not null,
  ends_at date not null,
  prize_1 numeric(12,2) not null default 50000 check (prize_1 >= 0),
  prize_2 numeric(12,2) not null default 30000 check (prize_2 >= 0),
  prize_3 numeric(12,2) not null default 10000 check (prize_3 >= 0),
  created_by uuid references public.profiles(user_id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (starts_at <= ends_at)
);

create table if not exists public.suggestions (
  id bigint generated always as identity primary key,
  campaign_id bigint not null references public.suggestion_campaigns(id) on delete cascade,
  user_id uuid not null references public.profiles(user_id) on delete cascade,
  title text not null check (length(btrim(title)) between 1 and 120),
  body text not null check (length(btrim(body)) between 1 and 5000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (campaign_id, user_id)
);

create table if not exists public.suggestion_likes (
  suggestion_id bigint not null references public.suggestions(id) on delete cascade,
  user_id uuid not null references public.profiles(user_id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (suggestion_id, user_id)
);

create table if not exists public.suggestion_reviews (
  id bigint generated always as identity primary key,
  campaign_id bigint not null references public.suggestion_campaigns(id) on delete cascade,
  suggestion_id bigint not null references public.suggestions(id) on delete cascade,
  originality_score smallint check (originality_score between 1 and 5),
  review_note text,
  award_rank smallint check (award_rank between 1 and 3),
  reviewer_id uuid not null references public.profiles(user_id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (campaign_id, suggestion_id)
);

create index if not exists suggestion_campaigns_dates_idx
  on public.suggestion_campaigns (starts_at, ends_at);
create index if not exists suggestions_campaign_user_idx
  on public.suggestions (campaign_id, user_id);
create index if not exists suggestion_likes_suggestion_idx
  on public.suggestion_likes (suggestion_id);
create unique index if not exists suggestion_reviews_campaign_award_rank_uq
  on public.suggestion_reviews (campaign_id, award_rank)
  where award_rank is not null;

create table if not exists public.suggestion_awards_public_rows (
  campaign_id bigint not null references public.suggestion_campaigns(id) on delete cascade,
  suggestion_id bigint not null references public.suggestions(id) on delete cascade,
  award_rank smallint not null check (award_rank between 1 and 3),
  primary key (campaign_id, suggestion_id)
);

alter table public.suggestion_campaigns enable row level security;
alter table public.suggestions enable row level security;
alter table public.suggestion_likes enable row level security;
alter table public.suggestion_reviews enable row level security;
alter table public.suggestion_awards_public_rows enable row level security;

revoke all on table public.suggestion_campaigns from anon;
revoke all on table public.suggestions from anon;
revoke all on table public.suggestion_likes from anon;
revoke all on table public.suggestion_reviews from anon;
revoke all on table public.suggestion_campaigns from public;
revoke all on table public.suggestions from public;
revoke all on table public.suggestion_likes from public;
revoke all on table public.suggestion_reviews from public;
revoke all on table public.suggestion_awards_public_rows from public;
revoke all on table public.suggestion_campaigns from authenticated;
revoke all on table public.suggestions from authenticated;
revoke all on table public.suggestion_likes from authenticated;
revoke all on table public.suggestion_reviews from authenticated;
revoke all on table public.suggestion_awards_public_rows from authenticated;

grant select on table public.suggestion_campaigns to authenticated;
grant insert, update on table public.suggestion_campaigns to authenticated;
grant select on table public.suggestions to authenticated;
grant insert, delete on table public.suggestions to authenticated;
grant update (title, body, updated_at) on table public.suggestions to authenticated;
grant select, insert, delete on table public.suggestion_likes to authenticated;
grant select, insert, update, delete on table public.suggestion_reviews to authenticated;
grant select on table public.suggestion_awards_public_rows to authenticated;
grant usage, select on sequence public.suggestion_campaigns_id_seq to authenticated;
grant usage, select on sequence public.suggestions_id_seq to authenticated;
grant usage, select on sequence public.suggestion_reviews_id_seq to authenticated;
revoke all on sequence public.suggestion_campaigns_id_seq from public;
revoke all on sequence public.suggestions_id_seq from public;
revoke all on sequence public.suggestion_reviews_id_seq from public;

drop policy if exists suggestion_campaigns_select_authenticated on public.suggestion_campaigns;
create policy suggestion_campaigns_select_authenticated
on public.suggestion_campaigns for select to authenticated
using (true);

drop policy if exists suggestion_campaigns_insert_owner on public.suggestion_campaigns;
create policy suggestion_campaigns_insert_owner
on public.suggestion_campaigns for insert to authenticated
with check ((select public.my_role()) = 'owner');

drop policy if exists suggestion_campaigns_update_owner on public.suggestion_campaigns;
create policy suggestion_campaigns_update_owner
on public.suggestion_campaigns for update to authenticated
using ((select public.my_role()) = 'owner')
with check ((select public.my_role()) = 'owner');

drop policy if exists suggestions_select_authenticated on public.suggestions;
create policy suggestions_select_authenticated
on public.suggestions for select to authenticated
using (true);

drop policy if exists suggestions_insert_self_active on public.suggestions;
create policy suggestions_insert_self_active
on public.suggestions for insert to authenticated
with check (
  user_id = (select auth.uid())
  and exists (
    select 1 from public.suggestion_campaigns c
    where c.id = campaign_id
      and c.starts_at <= current_date
      and c.ends_at >= current_date
  )
);

drop policy if exists suggestions_update_self_active on public.suggestions;
create policy suggestions_update_self_active
on public.suggestions for update to authenticated
using (
  user_id = (select auth.uid())
  and exists (
    select 1 from public.suggestion_campaigns c
    where c.id = campaign_id
      and c.starts_at <= current_date
      and c.ends_at >= current_date
  )
)
with check (
  user_id = (select auth.uid())
  and exists (
    select 1 from public.suggestion_campaigns c
    where c.id = campaign_id
      and c.starts_at <= current_date
      and c.ends_at >= current_date
  )
);

drop policy if exists suggestions_delete_self_or_owner on public.suggestions;
create policy suggestions_delete_self_or_owner
on public.suggestions for delete to authenticated
using (user_id = (select auth.uid()) or (select public.my_role()) = 'owner');

drop policy if exists suggestion_likes_select_authenticated on public.suggestion_likes;
create policy suggestion_likes_select_authenticated
on public.suggestion_likes for select to authenticated
using (true);

drop policy if exists suggestion_likes_insert_other_active on public.suggestion_likes;
create policy suggestion_likes_insert_other_active
on public.suggestion_likes for insert to authenticated
with check (
  user_id = (select auth.uid())
  and exists (
    select 1
    from public.suggestions s
    join public.suggestion_campaigns c on c.id = s.campaign_id
    where s.id = suggestion_id
      and s.user_id <> (select auth.uid())
      and c.starts_at <= current_date
      and c.ends_at >= current_date
  )
);

drop policy if exists suggestion_likes_delete_self_active on public.suggestion_likes;
create policy suggestion_likes_delete_self_active
on public.suggestion_likes for delete to authenticated
using (
  user_id = (select auth.uid())
  and exists (
    select 1
    from public.suggestions s
    join public.suggestion_campaigns c on c.id = s.campaign_id
    where s.id = suggestion_id
      and c.starts_at <= current_date
      and c.ends_at >= current_date
  )
);

drop policy if exists suggestion_reviews_select_owner on public.suggestion_reviews;
create policy suggestion_reviews_select_owner
on public.suggestion_reviews for select to authenticated
using ((select public.my_role()) = 'owner');

drop policy if exists suggestion_reviews_insert_owner on public.suggestion_reviews;
create policy suggestion_reviews_insert_owner
on public.suggestion_reviews for insert to authenticated
with check ((select public.my_role()) = 'owner' and reviewer_id = (select auth.uid()));

drop policy if exists suggestion_reviews_update_owner on public.suggestion_reviews;
create policy suggestion_reviews_update_owner
on public.suggestion_reviews for update to authenticated
using ((select public.my_role()) = 'owner')
with check ((select public.my_role()) = 'owner' and reviewer_id = (select auth.uid()));

drop policy if exists suggestion_reviews_delete_owner on public.suggestion_reviews;
create policy suggestion_reviews_delete_owner
on public.suggestion_reviews for delete to authenticated
using ((select public.my_role()) = 'owner');

drop policy if exists suggestion_awards_public_rows_select_authenticated on public.suggestion_awards_public_rows;
create policy suggestion_awards_public_rows_select_authenticated
on public.suggestion_awards_public_rows for select to authenticated
using (true);

create or replace function public.sync_suggestion_award_public_rows()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op <> 'INSERT' then
    delete from public.suggestion_awards_public_rows
    where campaign_id = old.campaign_id and suggestion_id = old.suggestion_id;
  end if;
  if tg_op <> 'DELETE' and new.award_rank is not null then
    insert into public.suggestion_awards_public_rows (campaign_id, suggestion_id, award_rank)
    values (new.campaign_id, new.suggestion_id, new.award_rank)
    on conflict (campaign_id, suggestion_id) do update set award_rank = excluded.award_rank;
  end if;
  return coalesce(new, old);
end;
$$;

revoke all on function public.sync_suggestion_award_public_rows() from public, anon, authenticated;
drop trigger if exists suggestion_reviews_sync_public_awards on public.suggestion_reviews;
create trigger suggestion_reviews_sync_public_awards
after insert or update or delete on public.suggestion_reviews
for each row execute function public.sync_suggestion_award_public_rows();

drop view if exists public.suggestion_awards_public;
create view public.suggestion_awards_public
with (security_invoker = true) as
select
  p.campaign_id,
  p.suggestion_id,
  p.award_rank,
  s.title,
  s.user_id,
  c.ends_at,
  case p.award_rank
    when 1 then c.prize_1
    when 2 then c.prize_2
    when 3 then c.prize_3
  end as prize_amount
from public.suggestion_awards_public_rows p
join public.suggestion_campaigns c on c.id = p.campaign_id
join public.suggestions s on s.id = p.suggestion_id and s.campaign_id = p.campaign_id
where c.ends_at < current_date
  and p.award_rank is not null;

revoke all on table public.suggestion_awards_public from anon;
revoke all on table public.suggestion_awards_public from public;
revoke all on table public.suggestion_awards_public from authenticated;
grant select on table public.suggestion_awards_public to authenticated;

insert into public.suggestion_campaigns (title, starts_at, ends_at, prize_1, prize_2, prize_3)
select '월간 건의함', current_date, (current_date + interval '1 month - 1 day')::date, 50000, 30000, 10000
where not exists (select 1 from public.suggestion_campaigns);
