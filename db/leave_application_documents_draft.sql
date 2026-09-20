-- Task 3 초안: 운영 적용 전 별도 migration으로 검토한다.
-- 연차 신청 증빙은 같은 직원 서류함에 저장하되 일반 직원서류와 화면에서 분리한다.
alter table public.employee_documents
  add column if not exists document_category text not null default '일반 직원서류';

alter table public.employee_documents
  drop constraint if exists leave_application_document_category_check;
alter table public.employee_documents
  add constraint leave_application_document_category_check
  check (document_category in ('일반 직원서류','연차 신청 증빙'));

create index if not exists employee_documents_category_created_at_idx
  on public.employee_documents (user_id, document_category, created_at desc);

-- 기존 직원서류 정책을 명시적으로 다시 고정한다. 본인 또는 관리 역할만 조회·등록한다.
drop policy if exists employee_documents_select_scoped on public.employee_documents;
create policy employee_documents_select_scoped on public.employee_documents for select to authenticated
using (user_id = auth.uid() or public.my_role() in ('manager','chief','owner'));

drop policy if exists employee_documents_insert_scoped on public.employee_documents;
create policy employee_documents_insert_scoped on public.employee_documents for insert to authenticated
with check ((user_id = auth.uid() or public.my_role() in ('manager','chief','owner')) and uploaded_by = auth.uid());
