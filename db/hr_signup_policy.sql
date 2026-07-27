-- 목적: 직원 셀프 회원가입 직후 자기 profiles 행 생성 허용
-- 실행 위치: 기공차트 프로젝트(texevhsxttfoqkrucfzl) SQL Editor
-- 기존 정책(profiles_select_authenticated, profiles_insert_owner,
-- profiles_update_owner, profiles_delete_owner)은 변경하지 않는다.

DROP POLICY IF EXISTS profiles_insert_self ON public.profiles;

CREATE POLICY profiles_insert_self
ON public.profiles
FOR INSERT
TO authenticated
WITH CHECK (
  user_id = auth.uid()
  AND role = 'staff'
);
