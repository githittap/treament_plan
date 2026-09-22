-- 직원허브 회원가입이 "승인제"로 동작하지 않는 보안 버그 패치(public.profiles 전용).
--
-- (A) 닭-달걀: RESTRICTIVE 게이트 employee_hub_access_gate 의 check 가 INSERT 에도 걸리는데
--     employee_hub_access_allowed() 는 "이미 승인된 프로필이 있어야" true 다. 그래서 신규 가입자는
--     자기 profiles 행을 만들 수 없고, 로그인 계정만 생기고 원장 화면에 보이지 않았다.
-- (B) 보안 구멍: profiles_insert_self 의 check 가 (user_id = auth.uid()) AND (role = 'staff') 뿐이어서,
--     (A) 를 풀면 가입자가 approved=true 로 자기 행을 넣어 원장 승인 없이 접근할 수 있다.
--     로컬 재현: 게이트 check 만 풀면 approved=true 행이 그대로 들어가고 employee_hub_access_allowed() 가 true 가 된다.
--
-- 고친 방법(두 겹으로 닫는다):
--   1. 게이트의 with check 에 "가입 직후 자기 미승인 staff 행" 분기만 더한다. using 은 건드리지 않으므로
--      미승인자는 여전히 profiles 를 0행으로 보고, UPDATE/DELETE 도 할 수 없다(UPDATE 는 using 을 먼저 통과해야 한다).
--      ⚠️ 게이트를 'for select, update, delete' 로 다시 만드는 방법은 쓰지 않았다 — PostgreSQL 의 CREATE POLICY 는
--      FOR 에 명령 하나만 받으므로 정책 3개로 쪼개야 하고, 그러면 INSERT 에 RESTRICTIVE 방어가 아예 사라져
--      (B) 를 permissive 정책 하나에만 의존하게 된다.
--   2. profiles_insert_self 의 check 에 approved is not true 와 account_access_status = '활성'(기본값)을 더한다.
--      즉 가입자는 "미승인 · staff · 활성" 자기 행만 만들 수 있다.
--
-- profiles 외 다른 표의 employee_hub_access_gate 는 건드리지 않는다. UPDATE/DELETE 정책은 새로 만들지 않는다
-- (profiles 의 UPDATE/DELETE 는 phase C 에서 권한까지 회수돼 SECURITY DEFINER 함수 경로로만 바뀐다).
--
-- 운영 적용 순서: db/employment_status_access_block_phase_c.sql 다음(= 현재 운영 상태 위에 바로).
-- 되돌리기: db/signup_approval_gate_patch_rollback.sql
-- 로컬 PGlite 시험만 마쳤고 운영 DB 에는 아직 반영하지 않았다(tests/sql/pglite-signup-approval-gate.mjs).
begin;

-- fail-closed preflight: 이 패치가 바꾸지 않는 정책(profiles_insert_owner, profiles_select_authenticated)은
-- 예상값과 정확히 같아야 하고, 바꾸는 두 정책은 "적용 전" 또는 "적용 후" 정의와 정확히 같아야 진행한다.
-- 그 밖이면(운영에서 다른 변경이 있었다면) 멈추고 보존한다. 이미 적용된 뒤 재실행도 안전하게 통과한다.
-- 값이 없으면(정책 누락) is distinct from 이 true 를 돌려주므로 fail-closed 로 멈춘다.
do $$
declare
  v_gate_permissive text; v_gate_cmd text; v_gate_roles text; v_gate_qual text; v_gate_check text;
  v_self_check text; v_owner_check text; v_select_qual text; v_write_policies int;
  c_gate_qual         constant text := 'employee_hub_access_allowed()';
  c_gate_check_before constant text := 'employee_hub_access_allowed()';
  c_gate_check_after  constant text := '(employee_hub_access_allowed() OR ((user_id = auth.uid()) AND (approved IS NOT TRUE) AND (role = ''staff''::text)))';
  c_self_before       constant text := '((user_id = auth.uid()) AND (role = ''staff''::text))';
  c_self_after        constant text := '((user_id = auth.uid()) AND (role = ''staff''::text) AND (approved IS NOT TRUE) AND (account_access_status = ''활성''::text))';
  c_owner_check       constant text := '(my_role() = ''owner''::text)';
  c_select_qual       constant text := 'true';
begin
  if to_regclass('public.profiles') is null or to_regprocedure('public.employee_hub_access_allowed()') is null then
    raise exception 'public.profiles and public.employee_hub_access_allowed() are required; apply db/employment_status_access_block_phase_b.sql first';
  end if;
  select permissive, cmd, array_to_string(roles, ','), replace(qual, 'public.', ''), replace(with_check, 'public.', '')
    into v_gate_permissive, v_gate_cmd, v_gate_roles, v_gate_qual, v_gate_check
    from pg_policies where schemaname = 'public' and tablename = 'profiles' and policyname = 'employee_hub_access_gate';
  select replace(with_check, 'public.', '') into v_self_check
    from pg_policies where schemaname = 'public' and tablename = 'profiles' and policyname = 'profiles_insert_self';
  select replace(with_check, 'public.', '') into v_owner_check
    from pg_policies where schemaname = 'public' and tablename = 'profiles' and policyname = 'profiles_insert_owner';
  select replace(qual, 'public.', '') into v_select_qual
    from pg_policies where schemaname = 'public' and tablename = 'profiles' and policyname = 'profiles_select_authenticated';
  select count(*)::int into v_write_policies
    from pg_policies where schemaname = 'public' and tablename = 'profiles' and cmd in ('UPDATE', 'DELETE');
  if v_gate_permissive is distinct from 'RESTRICTIVE'
     or v_gate_cmd is distinct from 'ALL'
     or v_gate_roles is distinct from 'authenticated'
     or v_gate_qual is distinct from c_gate_qual
     or (v_gate_check is distinct from c_gate_check_before and v_gate_check is distinct from c_gate_check_after)
     or (v_self_check is distinct from c_self_before and v_self_check is distinct from c_self_after)
     or v_owner_check is distinct from c_owner_check
     or v_select_qual is distinct from c_select_qual
     or v_write_policies is distinct from 0
  then
    raise exception 'public.profiles policies drifted from the expected before/after state; preserve state and stop apply (gate=%/%/%, gate_using=%, gate_check=%, insert_self=%, insert_owner=%, select=%, update_delete_policies=%)',
      v_gate_permissive, v_gate_cmd, v_gate_roles, v_gate_qual, v_gate_check, v_self_check, v_owner_check, v_select_qual, v_write_policies;
  end if;
end $$;

-- 1. 게이트: using 은 그대로, check 에만 "가입 직후 자기 미승인 staff 행" 분기를 더한다.
drop policy if exists employee_hub_access_gate on public.profiles;
create policy employee_hub_access_gate on public.profiles as restrictive for all to authenticated
  using (public.employee_hub_access_allowed())
  with check (public.employee_hub_access_allowed() or (user_id = auth.uid() and approved is not true and role = 'staff'));

-- 2. 자기 프로필 INSERT: 가입자는 미승인 · staff · 활성 자기 행만 만들 수 있다.
drop policy if exists profiles_insert_self on public.profiles;
create policy profiles_insert_self on public.profiles for insert to authenticated
  with check (user_id = auth.uid() and role = 'staff' and approved is not true and account_access_status = '활성');

commit;
