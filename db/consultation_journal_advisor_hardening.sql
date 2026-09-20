-- 운영 적용된 상담일지 객체의 Supabase Advisor 보완 migration.
-- 신규 테이블 생성이나 기존 데이터 변경 없이 함수, 인덱스, RLS 정책만 교체한다.
begin;

create index if not exists consultation_journals_author_id_idx
  on public.consultation_journals (author_id);

create or replace function public.set_consultation_journals_updated_at()
returns trigger language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.id is distinct from old.id or new.author_id is distinct from old.author_id or new.created_at is distinct from old.created_at then
    raise exception 'consultation immutable audit field cannot be changed';
  end if;
  new.updated_at := now();
  return new;
end;
$$;

drop policy if exists consultation_journals_select on public.consultation_journals;
create policy consultation_journals_select on public.consultation_journals
for select to authenticated
using ((select public.my_role()) in ('manager', 'owner'));

drop policy if exists consultation_journals_insert on public.consultation_journals;
create policy consultation_journals_insert on public.consultation_journals
for insert to authenticated
with check ((select public.my_role()) in ('manager', 'owner') and author_id = (select auth.uid()));

drop policy if exists consultation_journals_update on public.consultation_journals;
create policy consultation_journals_update on public.consultation_journals
for update to authenticated
using ((select public.my_role()) in ('manager', 'owner'))
with check ((select public.my_role()) in ('manager', 'owner'));

commit;
