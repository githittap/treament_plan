-- 퇴사자 로그인 계정 영구 삭제(하드 삭제) 초안 롤백.
-- 실제로 하드 삭제가 한 번이라도 일어났으면(profiles.auth_deleted_at 또는 이력에 '계정영구삭제'가 남아 있으면) 롤백을 막는다 —
-- auth.users FK를 되살리는 순간, 이미 지워진 로그인 계정을 가리키던 profiles 행이 그 제약을 위반하기 때문이다(의도된 안전장치).
begin;

do $$
declare
  def_action_check text;
begin
  if exists (select 1 from public.profiles where auth_deleted_at is not null)
     or exists (select 1 from public.profile_employment_history where account_action = '계정영구삭제')
  then
    raise exception 'account hard delete rollback blocked: 이미 하드 삭제가 실행됐다 — auth.users FK를 되살릴 수 없다; preserve state and stop';
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'profiles' and column_name = 'auth_deleted_at'
  ) or not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'profiles' and column_name = 'auth_deleted_by'
  ) then
    raise exception 'account hard delete rollback blocked: 마이그레이션이 적용되지 않은 상태다(auth_deleted_at/by 없음); preserve state and stop';
  end if;

  if exists (select 1 from pg_constraint where conrelid = 'public.profiles'::regclass and conname = 'profiles_user_id_fkey')
     or exists (select 1 from pg_constraint where conrelid = 'public.consultation_inbox'::regclass and conname = 'consultation_inbox_created_by_fkey')
     or exists (select 1 from pg_constraint where conrelid = 'public.consultation_journals'::regclass and conname = 'consultation_journals_author_id_fkey')
  then
    raise exception 'account hard delete rollback blocked: auth.users FK가 이미 존재한다(예상과 다른 상태); preserve state and stop';
  end if;

  if to_regprocedure('public.assert_can_hard_delete_account(uuid,text)') is null
     or to_regprocedure('public.record_account_hard_deleted(uuid)') is null
  then
    raise exception 'account hard delete rollback blocked: 되돌릴 함수가 없다; preserve state and stop';
  end if;

  select pg_get_constraintdef(oid) into def_action_check
    from pg_constraint
    where conrelid = 'public.profile_employment_history'::regclass and conname = 'profile_employment_history_account_action_check';
  if def_action_check is distinct from $chk$CHECK ((account_action = ANY (ARRAY['상태변경'::text, '계정차단'::text, '계정영구삭제'::text])))$chk$ then
    raise exception 'account hard delete rollback blocked: profile_employment_history_account_action_check 정의가 예상과 다르다 (%); preserve state and stop', coalesce(def_action_check, '<missing>');
  end if;
end $$;

revoke execute on function public.assert_can_hard_delete_account(uuid, text) from authenticated;
revoke execute on function public.record_account_hard_deleted(uuid) from authenticated;
drop function public.assert_can_hard_delete_account(uuid, text);
drop function public.record_account_hard_deleted(uuid);

alter table public.profile_employment_history drop constraint profile_employment_history_account_action_check;
alter table public.profile_employment_history add constraint profile_employment_history_account_action_check
  check (account_action in ('상태변경', '계정차단'));

alter table public.profiles
  drop column auth_deleted_by,
  drop column auth_deleted_at;

alter table public.profiles
  add constraint profiles_user_id_fkey foreign key (user_id) references auth.users(id) on delete cascade;
alter table public.consultation_inbox
  add constraint consultation_inbox_created_by_fkey foreign key (created_by) references auth.users(id);
alter table public.consultation_journals
  add constraint consultation_journals_author_id_fkey foreign key (author_id) references auth.users(id);

commit;
