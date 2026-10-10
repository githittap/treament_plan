-- 업무매뉴얼 설명덱(직원허브 도구 탭 「📘 업무매뉴얼」) 초안 — 운영 DB에는 원장 승인 뒤에만 적용한다.
-- 표 public.manual_decks(덱 내용 jsonb) + 비공개 사진 보관함 manual-media(사진 경로 = <덱 id>/<파일>).
-- 접근: 모든 정책에 profiles 「active and approved」 확인(공지 첨부 관례). 대리(deputy) 계정은 제외.
--   읽기 = 승인 직원은 공개(published) 덱만, 원장·실장(owner·chief)은 전부.  쓰기 = 원장·실장만.
--   사진 읽기 = 원장·실장은 전부, 직원은 「공개 덱 폴더」의 사진만.  사진 올리기·지우기 = 원장·실장만.
-- ⚠️ 사진 정책 안에서 profiles(p)에도 name 칸이 있으므로 objects.name 으로 적는다.
-- 적용은 몇 번 해도 같은 결과(재실행 안전). 되돌리기: db/manual_decks_rollback.sql(자료가 있으면 멈춤).
-- 로컬 PGlite 시험: tests/sql/pglite-manual-decks.mjs
begin;

create table if not exists public.manual_decks (
  id uuid primary key default gen_random_uuid(),
  title text not null default '',
  category text null check (category is null or category in ('진료실','데스크','상담','행정','통역','기공실')),
  deck jsonb not null default '{"meta":{"title":""},"slides":[]}'::jsonb check (jsonb_typeof(deck)='object'),
  published boolean not null default false,
  sort int not null default 0,
  updated_by uuid,
  updated_at timestamptz not null default now()
);
create index if not exists manual_decks_list_idx on public.manual_decks (published, sort, updated_at desc);

-- 고친 사람·시각은 서버가 정한다(클라이언트가 위조 못 하게)
create or replace function public.manual_decks_stamp() returns trigger language plpgsql as $$
begin
  new.updated_by := auth.uid();
  new.updated_at := now();
  return new;
end $$;
revoke all on function public.manual_decks_stamp() from public, anon, authenticated;
drop trigger if exists manual_decks_stamp on public.manual_decks;
create trigger manual_decks_stamp before insert or update on public.manual_decks for each row execute function public.manual_decks_stamp();

alter table public.manual_decks enable row level security;
revoke all on table public.manual_decks from public, anon;
grant select, insert, update, delete on table public.manual_decks to authenticated;

drop policy if exists manual_decks_select on public.manual_decks;
create policy manual_decks_select on public.manual_decks for select to authenticated using (
  exists (select 1 from public.profiles p where p.user_id=auth.uid() and p.active and p.approved and coalesce(p.role,'staff')<>'deputy'
          and (manual_decks.published or p.role in ('owner','chief'))));
drop policy if exists manual_decks_insert on public.manual_decks;
create policy manual_decks_insert on public.manual_decks for insert to authenticated with check (
  exists (select 1 from public.profiles p where p.user_id=auth.uid() and p.active and p.approved and p.role in ('owner','chief')));
drop policy if exists manual_decks_update on public.manual_decks;
create policy manual_decks_update on public.manual_decks for update to authenticated
  using (exists (select 1 from public.profiles p where p.user_id=auth.uid() and p.active and p.approved and p.role in ('owner','chief')))
  with check (exists (select 1 from public.profiles p where p.user_id=auth.uid() and p.active and p.approved and p.role in ('owner','chief')));
drop policy if exists manual_decks_delete on public.manual_decks;
create policy manual_decks_delete on public.manual_decks for delete to authenticated using (
  exists (select 1 from public.profiles p where p.user_id=auth.uid() and p.active and p.approved and p.role in ('owner','chief')));

-- 사진 보관함: 비공개 · 이미지만 · 5MB 이하(보관함 설정 + 아래 정책 이중)
insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
values ('manual-media','manual-media',false,5242880,array['image/webp','image/jpeg','image/png'])
on conflict (id) do update set public=false,file_size_limit=5242880,allowed_mime_types=array['image/webp','image/jpeg','image/png'];

drop policy if exists manual_media_select on storage.objects;
create policy manual_media_select on storage.objects for select to authenticated using (
  bucket_id='manual-media'
  and exists (select 1 from public.profiles p where p.user_id=auth.uid() and p.active and p.approved and coalesce(p.role,'staff')<>'deputy'
              and (p.role in ('owner','chief')
                   or exists (select 1 from public.manual_decks d where d.published and d.id::text=(storage.foldername(objects.name))[1]))));
drop policy if exists manual_media_insert on storage.objects;
create policy manual_media_insert on storage.objects for insert to authenticated with check (
  bucket_id='manual-media'
  and exists (select 1 from public.profiles p where p.user_id=auth.uid() and p.active and p.approved and p.role in ('owner','chief'))
  and array_length(storage.foldername(name),1)=1
  and (storage.foldername(name))[1] ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  and name ~* '\.(webp|jpe?g|png)$'
  and coalesce(metadata->>'mimetype','image/webp') in ('image/webp','image/jpeg','image/png')
  and coalesce((metadata->>'size')::bigint,0)<=5242880);
drop policy if exists manual_media_delete on storage.objects;
create policy manual_media_delete on storage.objects for delete to authenticated using (
  bucket_id='manual-media'
  and exists (select 1 from public.profiles p where p.user_id=auth.uid() and p.active and p.approved and p.role in ('owner','chief')));

commit;
