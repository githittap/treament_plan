-- payslip_issue_audit_draft.sql이 추가한 issued_by 컬럼만 되돌린다.
-- public.payslips 표 자체·기존 RLS·이미 발행된 명세서 데이터는 그대로 둔다.
begin;
alter table public.payslips drop column if exists issued_by;
commit;
