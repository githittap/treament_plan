-- Task 6 롤백은 적용 전 정책·버킷 설정·행·객체 수 스냅샷과 백업을 확인한 경우에만 사용한다.
-- 실제 notice-attachments 객체나 공지 attachments 참조가 생성된 뒤에는 실행하지 말고 데이터 보존·이관 판단을 먼저 받는다.
begin;
drop policy if exists notice_attachments_insert_authenticated on storage.objects;
drop policy if exists notice_attachments_select_authenticated on storage.objects;
drop policy if exists notices_insert_authenticated on public.notices;
drop policy if exists notices_update_approvers on public.notices;
drop trigger if exists guard_notice_immutable_fields on public.notices;
drop function if exists public.guard_notice_immutable_fields();
-- 버킷과 기존 객체·공지 행·attachments/author_id 열은 보존한다. 적용 전 백업 정책 정의로만 복원한다.
commit;
