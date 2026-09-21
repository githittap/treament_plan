-- Task 7 초안: VAPID 발송키·실제 발송은 포함하지 않는다.
create table if not exists public.push_subscriptions (user_id uuid primary key references public.profiles(user_id) on delete cascade,endpoint text not null unique,subscription jsonb not null,created_at timestamptz not null default now(),updated_at timestamptz not null default now());
alter table public.push_subscriptions enable row level security;
revoke all on public.push_subscriptions from anon;
grant select,insert,update,delete on public.push_subscriptions to authenticated;
create policy push_subscriptions_select_own on public.push_subscriptions for select to authenticated using (user_id=auth.uid() and exists (select 1 from public.profiles p where p.user_id=auth.uid() and p.active and p.approved));
create policy push_subscriptions_insert_own on public.push_subscriptions for insert to authenticated with check (user_id=auth.uid() and exists (select 1 from public.profiles p where p.user_id=auth.uid() and p.active and p.approved));
create policy push_subscriptions_update_own on public.push_subscriptions for update to authenticated using (user_id=auth.uid()) with check (user_id=auth.uid());
create policy push_subscriptions_delete_own on public.push_subscriptions for delete to authenticated using (user_id=auth.uid());
-- 롤백: 실제 구독이 생긴 뒤에는 삭제하지 않는다. 적용 전 snapshot·복제환경 검증 뒤 정책 제거와 테이블 보존 판단을 별도 수행한다.
