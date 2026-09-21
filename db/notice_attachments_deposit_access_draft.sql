-- Task 6: 공지 첨부와 예치금 조회를 분리한다. 기존 공지·입금 행은 변경하지 않는다.
-- 운영 적용 전 정책·버킷 설정·notices 행·notice-attachments 객체 수를 스냅샷하고 백업·롤백 경로와 역할별 시험을 확인한다.
-- 실제 첨부가 생긴 뒤에는 파괴적 롤백을 실행하지 말고 데이터 보존 판단을 먼저 받는다.
begin;
create table if not exists public.notice_attachments_migration_snapshot (bucket_id text primary key,bucket_existed boolean not null,public boolean,file_size_limit bigint,allowed_mime_types text[]);
create table if not exists public.notice_attachments_migration_policy_snapshot (schemaname text not null,tablename text not null,policyname text not null,permissive text not null,roles name[],cmd text not null,qual text,with_check text,primary key(schemaname,tablename,policyname));
create table if not exists public.notice_attachments_migration_rls_snapshot (schemaname text not null,tablename text not null,rls_enabled boolean not null,primary key(schemaname,tablename));
create table if not exists public.notice_attachments_migration_acl_snapshot (table_schema text not null,table_name text not null,grantee text not null,privilege_type text not null,primary key(table_schema,table_name,grantee,privilege_type));
revoke all on table public.notice_attachments_migration_snapshot from public, anon, authenticated;
revoke all on table public.notice_attachments_migration_policy_snapshot from public, anon, authenticated;
revoke all on table public.notice_attachments_migration_rls_snapshot from public, anon, authenticated;
revoke all on table public.notice_attachments_migration_acl_snapshot from public, anon, authenticated;
alter table public.notice_attachments_migration_snapshot enable row level security;
alter table public.notice_attachments_migration_policy_snapshot enable row level security;
alter table public.notice_attachments_migration_rls_snapshot enable row level security;
alter table public.notice_attachments_migration_acl_snapshot enable row level security;
insert into public.notice_attachments_migration_snapshot(bucket_id,bucket_existed,public,file_size_limit,allowed_mime_types) select 'notice-attachments',b.id is not null,b.public,b.file_size_limit,b.allowed_mime_types from (select 1) x left join storage.buckets b on b.id='notice-attachments' on conflict (bucket_id) do nothing;
insert into public.notice_attachments_migration_policy_snapshot(schemaname,tablename,policyname,permissive,roles,cmd,qual,with_check) select schemaname,tablename,policyname,permissive,roles,cmd,qual,with_check from pg_policies where (schemaname='public' and tablename='notices' and policyname in ('notices_insert_approvers','notices_insert_authenticated','notices_update_approvers','notices_update_authenticated')) or (schemaname='public' and tablename='deposits' and policyname in ('deposits_select_active','deposits_select_desk_lead')) or (schemaname='storage' and tablename='objects' and policyname in ('notice_attachments_select_authenticated','notice_attachments_insert_authenticated','notice_attachments_delete_own_tmp','notice_attachments_delete_published_guard')) on conflict do nothing;
insert into public.notice_attachments_migration_rls_snapshot(schemaname,tablename,rls_enabled) select n.nspname,c.relname,c.relrowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname='notices' on conflict do nothing;
insert into public.notice_attachments_migration_acl_snapshot(table_schema,table_name,grantee,privilege_type) select table_schema,table_name,grantee,privilege_type from information_schema.role_table_grants where grantee in ('PUBLIC','anon','authenticated') and ((table_schema='public' and table_name in ('notices','deposits')) or (table_schema='storage' and table_name='objects')) on conflict do nothing;
insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types) values ('notice-attachments','notice-attachments',false,10485760,array['application/pdf','image/jpeg','image/png','application/vnd.openxmlformats-officedocument.wordprocessingml.document','application/x-hwp','application/haansofthwp']) on conflict (id) do update set public=false,file_size_limit=10485760,allowed_mime_types=excluded.allowed_mime_types;
alter table public.notices add column if not exists author_id uuid references public.profiles(user_id);
alter table public.notices add column if not exists attachments jsonb not null default '[]'::jsonb;
alter table public.notices add column if not exists updated_at timestamptz not null default now();
do $$ begin if exists (select 1 from public.notices n where case when jsonb_typeof(n.attachments)='array' then exists (select 1 from jsonb_array_elements(n.attachments) a where jsonb_typeof(a)<>'object' or jsonb_typeof(a->'path')<>'string' or btrim(a->>'path')='') else true end) then raise exception 'existing notice attachments are invalid; preserve data and stop migration'; end if; end $$;
alter table public.notices enable row level security;
create or replace function public.guard_notice_immutable_fields() returns trigger language plpgsql security definer set search_path=public,pg_temp as $$ begin if jsonb_typeof(new.attachments)<>'array' or exists (select 1 from jsonb_array_elements(new.attachments) a where jsonb_typeof(a)<>'object' or jsonb_typeof(a->'path')<>'string' or btrim(a->>'path')='') then raise exception 'notice attachments must be an array of objects with non-empty paths'; end if; if tg_op='INSERT' then if new.author_id is distinct from auth.uid() then raise exception 'notice author must match authenticated user'; end if; select p.name into new.author from public.profiles p where p.user_id=auth.uid(); if new.author is null then raise exception 'notice author profile missing'; end if; new.created_at:=now(); new.updated_at:=now(); return new; end if; if new.author_id is distinct from old.author_id or new.author is distinct from old.author or new.created_at is distinct from old.created_at then raise exception 'notice author and created_at are immutable'; end if; new.updated_at:=now(); return new; end; $$;
revoke all on function public.guard_notice_immutable_fields() from public, anon, authenticated;
drop trigger if exists guard_notice_immutable_fields on public.notices;
create trigger guard_notice_immutable_fields before insert or update on public.notices for each row execute function public.guard_notice_immutable_fields();
-- PostgreSQL permissive policies are OR-combined: remove every prior INSERT/UPDATE policy before adding the single intended path.
drop policy if exists notices_insert_approvers on public.notices;
drop policy if exists notices_insert_authenticated on public.notices;
drop policy if exists notices_update_approvers on public.notices;
drop policy if exists notices_update_authenticated on public.notices;
create policy notices_insert_authenticated on public.notices for insert to authenticated with check (author_id=auth.uid() and exists (select 1 from public.profiles p where p.user_id=auth.uid() and p.active and p.approved));
create policy notices_update_approvers on public.notices for update to authenticated using (exists (select 1 from public.profiles p where p.user_id=auth.uid() and p.active and p.approved and p.role in ('chief','owner'))) with check (exists (select 1 from public.profiles p where p.user_id=auth.uid() and p.active and p.approved and p.role in ('chief','owner')));
drop policy if exists notice_attachments_select_authenticated on storage.objects;
create policy notice_attachments_select_authenticated on storage.objects for select to authenticated using (bucket_id='notice-attachments' and exists (select 1 from public.profiles p where p.user_id=auth.uid() and p.active and p.approved));
drop policy if exists notice_attachments_insert_authenticated on storage.objects;
create policy notice_attachments_insert_authenticated on storage.objects for insert to authenticated with check (bucket_id='notice-attachments' and exists (select 1 from public.profiles p where p.user_id=auth.uid() and p.active and p.approved) and (storage.foldername(name))[1]=auth.uid()::text and (storage.foldername(name))[2]='tmp' and array_length(storage.foldername(name),1)=2 and coalesce(metadata->>'mimetype','')=any(array['application/pdf','image/jpeg','image/png','application/vnd.openxmlformats-officedocument.wordprocessingml.document','application/x-hwp','application/haansofthwp']) and coalesce((metadata->>'size')::bigint,10485761)<=10485760);
drop policy if exists notice_attachments_delete_own_tmp on storage.objects;
create policy notice_attachments_delete_own_tmp on storage.objects for delete to authenticated using (bucket_id='notice-attachments' and exists (select 1 from public.profiles p where p.user_id=auth.uid() and p.active and p.approved) and (storage.foldername(name))[1]=auth.uid()::text and (storage.foldername(name))[2]='tmp' and array_length(storage.foldername(name),1)=2 and not exists (select 1 from public.notices n where n.attachments @> jsonb_build_array(jsonb_build_object('path',name))));
-- 운영 적용 전 pg_policies에서 storage.objects의 DELETE/ALL 정책과 대상 role을 전수 검토한다. 이 restrictive guard는 다른 permissive DELETE/ALL 정책과 함께도 notice-attachments의 게시 경로를 차단하며 다른 버킷에는 영향을 주지 않는다.
drop policy if exists notice_attachments_delete_published_guard on storage.objects;
create policy notice_attachments_delete_published_guard on storage.objects as restrictive for delete to authenticated using (bucket_id<>'notice-attachments' or not exists (select 1 from public.notices n where n.attachments @> jsonb_build_array(jsonb_build_object('path',name))));
alter table public.deposits enable row level security;
drop policy if exists deposits_select_active on public.deposits;
drop policy if exists deposits_select_desk_lead on public.deposits;
create policy deposits_select_desk_lead on public.deposits for select to authenticated using (exists (select 1 from public.profiles p where p.user_id=auth.uid() and p.active and p.approved and (p.dept='데스크' or p.role in ('chief','owner'))));
commit;
