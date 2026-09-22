-- db/signup_approval_gate_patch.sql 되돌리기: employee_hub_access_gate 와 profiles_insert_self 를
-- 패치 적용 전 정의로 정확히 복원한다.
-- ⚠️ 되돌리면 (A) 닭-달걀이 다시 살아나 신규 가입자가 자기 profiles 행을 만들 수 없다
--    (= 로그인 계정만 생기고 원장 화면에 안 보이는 상태로 되돌아간다). 그게 의도일 때만 실행한다.
-- 이미 되돌린 뒤 재실행도 안전하게 통과한다.
begin;

-- fail-closed preflight: 패치 적용 전/후 두 상태 중 하나와 정확히 같을 때만 되돌린다.
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
    raise exception 'public.profiles and public.employee_hub_access_allowed() are required; nothing to roll back';
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
    raise exception 'public.profiles policies drifted from the expected before/after state; preserve state and stop rollback (gate=%/%/%, gate_using=%, gate_check=%, insert_self=%, insert_owner=%, select=%, update_delete_policies=%)',
      v_gate_permissive, v_gate_cmd, v_gate_roles, v_gate_qual, v_gate_check, v_self_check, v_owner_check, v_select_qual, v_write_policies;
  end if;
end $$;

drop policy if exists employee_hub_access_gate on public.profiles;
create policy employee_hub_access_gate on public.profiles as restrictive for all to authenticated
  using (public.employee_hub_access_allowed())
  with check (public.employee_hub_access_allowed());

drop policy if exists profiles_insert_self on public.profiles;
create policy profiles_insert_self on public.profiles for insert to authenticated
  with check (user_id = auth.uid() and role = 'staff');

commit;
