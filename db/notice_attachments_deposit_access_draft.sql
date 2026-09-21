-- Task 6: 공지 첨부와 예치금 조회를 분리한다. 기존 공지·입금 행은 변경하지 않는다.
insert into storage.buckets (id,name,public) values ('notice-attachments','notice-attachments',false) on conflict (id) do update set public=false;
alter table public.notices add column if not exists author_id uuid references public.profiles(user_id);
alter table public.notices add column if not exists attachments jsonb not null default '[]'::jsonb;
alter table public.notices enable row level security;
drop policy if exists notices_insert_authenticated on public.notices;
create policy notices_insert_authenticated on public.notices for insert to authenticated with check (exists (select 1 from public.profiles p where p.user_id=auth.uid() and p.active and p.approved) and author_id=auth.uid());
drop policy if exists notice_attachments_select_authenticated on storage.objects;
create policy notice_attachments_select_authenticated on storage.objects for select to authenticated using (bucket_id='notice-attachments' and exists (select 1 from public.profiles p where p.user_id=auth.uid() and p.active and p.approved));
drop policy if exists notice_attachments_insert_authenticated on storage.objects;
create policy notice_attachments_insert_authenticated on storage.objects for insert to authenticated with check (bucket_id='notice-attachments' and exists (select 1 from public.profiles p where p.user_id=auth.uid() and p.active and p.approved) and (storage.foldername(name))[1]=auth.uid()::text);
alter table public.deposits enable row level security;
drop policy if exists deposits_select_active on public.deposits;
drop policy if exists deposits_select_desk_lead on public.deposits;
create policy deposits_select_desk_lead on public.deposits for select to authenticated using (exists (select 1 from public.profiles p where p.user_id=auth.uid() and p.active and p.approved and (p.dept='데스크' or p.role in ('chief','owner'))));
