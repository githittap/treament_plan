-- 건의 댓글과 댓글 알림. 운영 반영은 DB → Edge → 화면 순서로 별도 수행함.
begin;
create table if not exists public.suggestion_comments (
  id bigint generated always as identity primary key,
  suggestion_id bigint not null references public.suggestions(id) on delete cascade,
  user_id uuid not null default auth.uid() references public.profiles(user_id) on delete cascade,
  body text not null check (char_length(body) between 1 and 1000 and body ~ '[^[:space:]]'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists suggestion_comments_suggestion_created_idx
  on public.suggestion_comments(suggestion_id,created_at,id);
alter table public.suggestion_comments enable row level security;
revoke all on public.suggestion_comments from public,anon,authenticated;
grant select,delete on public.suggestion_comments to authenticated;
grant insert(suggestion_id,user_id,body),update(body) on public.suggestion_comments to authenticated;
revoke all on sequence public.suggestion_comments_id_seq from public,anon,authenticated;
grant usage,select on sequence public.suggestion_comments_id_seq to authenticated;

-- 건의의 SELECT 정책을 그대로 거치며 차단·미승인 계정에는 허브 접근을 허용하지 않음.
drop policy if exists suggestion_comments_select on public.suggestion_comments;
create policy suggestion_comments_select on public.suggestion_comments for select to authenticated
using (public.employee_hub_access_allowed() and exists(select 1 from public.suggestions s where s.id=suggestion_id));
drop policy if exists suggestion_comments_insert on public.suggestion_comments;
create policy suggestion_comments_insert on public.suggestion_comments for insert to authenticated
with check (public.employee_hub_access_allowed() and user_id=(select auth.uid()) and exists(select 1 from public.suggestions s where s.id=suggestion_id));
drop policy if exists suggestion_comments_update on public.suggestion_comments;
create policy suggestion_comments_update on public.suggestion_comments for update to authenticated
using (public.employee_hub_access_allowed() and user_id=(select auth.uid()) and exists(select 1 from public.suggestions s where s.id=suggestion_id))
with check (public.employee_hub_access_allowed() and user_id=(select auth.uid()) and exists(select 1 from public.suggestions s where s.id=suggestion_id));
drop policy if exists suggestion_comments_delete on public.suggestion_comments;
create policy suggestion_comments_delete on public.suggestion_comments for delete to authenticated
using (public.employee_hub_access_allowed() and (user_id=(select auth.uid()) or (select public.my_role())='owner') and exists(select 1 from public.suggestions s where s.id=suggestion_id));

create or replace function public.touch_suggestion_comment() returns trigger
language plpgsql set search_path='' as $$
begin new.updated_at:=now();return new;end;
$$;
revoke all on function public.touch_suggestion_comment() from public,anon,authenticated,service_role;
drop trigger if exists touch_suggestion_comment on public.suggestion_comments;
create trigger touch_suggestion_comment before update on public.suggestion_comments
for each row execute function public.touch_suggestion_comment();

alter table public.push_events drop constraint if exists push_events_event_type_check;
alter table public.push_events add constraint push_events_event_type_check check(event_type=any(array[
  'leave_submitted','leave_status_changed','consultation_received','payment_pending','approval_submitted','notice_published','document_approved',
  'ai_billing_stop','ai_billing_low_balance','ai_billing_charge',
  'marketing_expense_recorded','marketing_expense_cancelled','marketing_expense_review','marketing_budget_alert','suggestion_commented']));

create or replace function public.queue_suggestion_comment_push_event() returns trigger
language plpgsql security definer set search_path='' as $$
declare
  suggestion record;recipient record;event_payload jsonb;
  author_enabled boolean;owner_enabled boolean;commenters_enabled boolean;
  notification_title text;notification_body text;
begin
  select s.user_id,s.title into suggestion from public.suggestions s where s.id=new.suggestion_id;
  author_enabled:=coalesce((select value='true' from public.app_settings where key='notify.suggestion_comment.author' and value in('true','false')),true);
  owner_enabled:=coalesce((select value='true' from public.app_settings where key='notify.suggestion_comment.owner' and value in('true','false')),true);
  commenters_enabled:=coalesce((select value='true' from public.app_settings where key='notify.suggestion_comment.commenters' and value in('true','false')),true);
  -- 문구는 기존 허브 설정 표에서 읽음. 새 댓글부터 고친 문구가 적용됨.
  select value into notification_title from public.hub_ui_texts where key='sug.cmt.push_title';
  select value into notification_body from public.hub_ui_texts where key='sug.cmt.push_body';
  event_payload:=jsonb_build_object(
    'suggestion_id',new.suggestion_id,'suggestion_title',left(suggestion.title,40),
    'commenter_name',coalesce((select name from public.profiles where user_id=new.user_id),''),
    'tab','suggestions','push_title',coalesce(notification_title,'💬 건의에 새 댓글'),
    'push_body_template',coalesce(notification_body,'「{title}」에 {name}님이 댓글을 달았어요'));
  for recipient in
    select distinct p.user_id from public.profiles p
    where p.active=true and p.approved=true and p.account_access_status is distinct from '차단'
      and p.user_id<>new.user_id
      and ((author_enabled and p.user_id=suggestion.user_id)
        or (owner_enabled and p.role='owner')
        or (commenters_enabled and exists(select 1 from public.suggestion_comments c
          where c.suggestion_id=new.suggestion_id and c.id<>new.id and c.user_id=p.user_id)))
  loop
    perform public.enqueue_push_event('suggestion-comment:'||new.id||':user:'||recipient.user_id,
      recipient.user_id,'suggestion_commented',event_payload);
  end loop;
  return new;
end;
$$;
revoke all on function public.queue_suggestion_comment_push_event() from public,anon,authenticated,service_role;
drop trigger if exists queue_suggestion_comment_push_event on public.suggestion_comments;
create trigger queue_suggestion_comment_push_event after insert on public.suggestion_comments
for each row execute function public.queue_suggestion_comment_push_event();
commit;
