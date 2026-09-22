-- 퇴사자 로그인 계정 영구 삭제(하드 삭제) 초안 — 근무 기록은 보존한다.
-- 목적: auth.users에서 로그인 계정(이메일 포함)을 완전히 지우되, public.profiles와 그 아래 근태·연차·계약·급여·서명·감사이력은 그대로 남긴다.
-- 지금까지는 disable_employee_account_preserve_records(RPC)로 "차단"만 가능했다 — auth.users 행은 그대로 남아 있었다.
-- 선행조건: employment_status_access_block phase A/B(및 통합본)가 이미 적용돼 있어야 한다
--   (public.assert_employment_owner, public.employee_hub_access_allowed, public.profile_employment_history).
-- 후행검증:
--   1) public.profiles.user_id는 더 이상 auth.users를 FK로 참조하지 않는다(auth.users 행을 지워도 profiles 행은 그대로 남는다).
--   2) public.consultation_inbox.created_by / public.consultation_journals.author_id 도 더 이상 auth.users를 FK로 참조하지 않는다
--      (그렇지 않으면 그 두 표는 ON DELETE NO ACTION이라 삭제 자체가 막힌다).
--   3) public.assert_can_hard_delete_account(uuid,text) / public.record_account_hard_deleted(uuid)가 존재하고 authenticated만 실행할 수 있다.
-- 이 마이그레이션은 어떤 행도 지우지 않는다 — 제약조건·컬럼·함수만 바꾼다.
begin;

-- 사전 점검: 예상한 제약조건 정의와 정확히 같을 때만 진행한다(어긋나면 그대로 멈춘다 — Astra 검증 대상과 동일한 원칙).
do $$
declare
  def_profiles_fk text;
  def_inbox_fk text;
  def_journal_fk text;
  def_action_check text;
begin
  if to_regprocedure('public.assert_employment_owner(uuid)') is null
     or to_regprocedure('public.employee_hub_access_allowed()') is null
     or to_regclass('public.profile_employment_history') is null
  then
    raise exception 'account hard delete preflight: employment_status_access_block phase A/B가 먼저 적용돼 있어야 한다; preserve state and stop';
  end if;

  if to_regclass('public.consultation_inbox') is null or to_regclass('public.consultation_journals') is null then
    raise exception 'account hard delete preflight: consultation_inbox/consultation_journals가 없다; preserve state and stop';
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'profiles'
      and column_name in ('auth_deleted_at', 'auth_deleted_by')
  ) then
    raise exception 'account hard delete preflight: auth_deleted_at/auth_deleted_by가 이미 존재한다(중복 적용 의심); preserve state and stop';
  end if;

  select pg_get_constraintdef(oid) into def_profiles_fk
    from pg_constraint
    where conrelid = 'public.profiles'::regclass and conname = 'profiles_user_id_fkey';
  if def_profiles_fk is distinct from 'FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE' then
    raise exception 'account hard delete preflight: profiles_user_id_fkey 정의가 예상과 다르다 (%); preserve state and stop', coalesce(def_profiles_fk, '<missing>');
  end if;

  select pg_get_constraintdef(oid) into def_inbox_fk
    from pg_constraint
    where conrelid = 'public.consultation_inbox'::regclass and conname = 'consultation_inbox_created_by_fkey';
  if def_inbox_fk is distinct from 'FOREIGN KEY (created_by) REFERENCES auth.users(id)' then
    raise exception 'account hard delete preflight: consultation_inbox_created_by_fkey 정의가 예상과 다르다 (%); preserve state and stop', coalesce(def_inbox_fk, '<missing>');
  end if;

  select pg_get_constraintdef(oid) into def_journal_fk
    from pg_constraint
    where conrelid = 'public.consultation_journals'::regclass and conname = 'consultation_journals_author_id_fkey';
  if def_journal_fk is distinct from 'FOREIGN KEY (author_id) REFERENCES auth.users(id)' then
    raise exception 'account hard delete preflight: consultation_journals_author_id_fkey 정의가 예상과 다르다 (%); preserve state and stop', coalesce(def_journal_fk, '<missing>');
  end if;

  select pg_get_constraintdef(oid) into def_action_check
    from pg_constraint
    where conrelid = 'public.profile_employment_history'::regclass and conname = 'profile_employment_history_account_action_check';
  if def_action_check is distinct from $chk$CHECK ((account_action = ANY (ARRAY['상태변경'::text, '계정차단'::text])))$chk$ then
    raise exception 'account hard delete preflight: profile_employment_history_account_action_check 정의가 예상과 다르다 (%); preserve state and stop', coalesce(def_action_check, '<missing>');
  end if;
end $$;

-- 1) auth.users를 직접 참조하는 FK 세 개를 끊는다.
--    profiles.user_id는 CASCADE였다 — 그대로 두면 auth.users 행 삭제가 profiles와 그 아래 전부(근태·연차·계약·급여·서명·온보딩·제안 등)를 지워버린다.
--    consultation_inbox.created_by / consultation_journals.author_id는 NO ACTION이었다 — 그대로 두면
--    상담이력을 한 번이라도 남긴 직원은 auth.users 삭제 자체가 막힌다(외래키 위반으로 실패).
--    세 경우 모두 "auth.users 삭제는 성공하고, public 쪽 기록은 그대로 남아야 한다"는 목적과 맞지 않아 FK 자체를 없앤다.
--    (다른 테이블은 전부 public.profiles(user_id)를 참조하며 profiles 행 자체는 절대 지우지 않으므로 영향이 없다.)
alter table public.profiles drop constraint profiles_user_id_fkey;
alter table public.consultation_inbox drop constraint consultation_inbox_created_by_fkey;
alter table public.consultation_journals drop constraint consultation_journals_author_id_fkey;

-- 2) 삭제 기록 칼럼. auth.users를 다시 참조하지 않는다(위와 같은 이유) — 값은 아래 RPC가 auth.uid()로 채운다.
alter table public.profiles
  add column if not exists auth_deleted_at timestamptz,
  add column if not exists auth_deleted_by uuid;

-- 3) 계정 하드 삭제도 profile_employment_history에 남긴다(감사이력 보존) — 기존 두 값에 하나를 더한다.
alter table public.profile_employment_history drop constraint profile_employment_history_account_action_check;
alter table public.profile_employment_history add constraint profile_employment_history_account_action_check
  check (account_action in ('상태변경', '계정차단', '계정영구삭제'));

-- 4) 사전 검증 RPC — Edge Function(supabase/functions/account-delete)이 auth.admin.deleteUser()를 부르기 전에 반드시 먼저 호출한다.
--    assert_employment_owner를 그대로 재사용해 "활성 승인된 원장만" "본인 아닌 대상만" 다룰 수 있게 하고,
--    여기서는 그 위에 "차단된 계정만" "원장 계정은 절대 대상 아님" "확인 문구가 이름과 정확히 같아야 함"을 추가로 확인한다.
--    행을 바꾸지 않는다 — 통과하면 caller uid만 돌려준다.
create or replace function public.assert_can_hard_delete_account(p_user_id uuid, p_confirm_name text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  a uuid;
  t public.profiles%rowtype;
begin
  a := public.assert_employment_owner(p_user_id);
  select * into t from public.profiles where user_id = p_user_id for update;
  if t.role = 'owner' then
    raise exception 'owner account cannot be hard-deleted';
  end if;
  if t.account_access_status <> '차단' then
    raise exception 'account must be blocked before hard delete';
  end if;
  if t.auth_deleted_at is not null then
    raise exception 'account already hard-deleted';
  end if;
  if p_confirm_name is null or btrim(p_confirm_name) <> t.name then
    raise exception 'confirmation name mismatch';
  end if;
  return a;
end;
$$;

-- 5) 기록 RPC — Edge Function이 auth.admin.deleteUser() 성공 뒤에만 호출한다. 재검증 후 profiles·이력에 "기록만" 남긴다(행 삭제 없음).
--    auth.users에 그 행이 실제로 없을 때만 통과한다 — Edge Function이 순서를 지키지 않고 먼저 불러도(또는 잘못 재호출해도)
--    로그인 계정이 진짜 지워지기 전에는 "삭제됐다"는 기록이 남지 않는다.
create or replace function public.record_account_hard_deleted(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  a uuid;
  t public.profiles%rowtype;
begin
  a := public.assert_employment_owner(p_user_id);
  select * into t from public.profiles where user_id = p_user_id for update;
  if t.role = 'owner' then
    raise exception 'owner account cannot be hard-deleted';
  end if;
  if t.account_access_status <> '차단' then
    raise exception 'account must be blocked before hard delete';
  end if;
  if t.auth_deleted_at is not null then
    raise exception 'account already hard-deleted';
  end if;
  if exists (select 1 from auth.users where id = p_user_id) then
    raise exception 'auth user still exists; delete the login first';
  end if;
  update public.profiles set auth_deleted_at = now(), auth_deleted_by = a where user_id = p_user_id;
  insert into public.profile_employment_history(user_id, from_status, to_status, effective_date, reason, account_action, acted_by)
    values (p_user_id, t.employment_status, t.employment_status, current_date, null, '계정영구삭제', a);
end;
$$;

revoke all on function public.assert_can_hard_delete_account(uuid, text) from public, anon;
revoke all on function public.record_account_hard_deleted(uuid) from public, anon;
grant execute on function public.assert_can_hard_delete_account(uuid, text) to authenticated;
grant execute on function public.record_account_hard_deleted(uuid) to authenticated;

commit;
