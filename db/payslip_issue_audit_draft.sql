-- M3 급여 2단계: 명세서 발행 감사 컬럼만 추가한다 (누가 발행했는지).
-- public.payslips 표·기존 RLS(payslips_select_scoped/insert_owner/update_owner)는
-- hr_schema.sql·hr_policies.sql에 이미 있고 이 파일에서는 건드리지 않는다.
-- payroll_rows.imported_by / wage_info.updated_by / att_months.closed_by 와 같은
-- 기존 "누가·언제" 감사 컬럼 관례를 payslips에도 맞춘다.
--
-- 선행조건(fail-closed): public.payslips 표와 issued/issued_at 컬럼이 이미 있어야 한다.
-- 없으면 즉시 실패 — 잘못된 환경(phase1 미적용)에 조용히 반쪽짜리 상태로 적용되는 것을 막는다.
-- 운영 적용 전 payslip_issue_audit_rollback.sql을 함께 확인할 것. 프로덕션에는 아직 적용하지 않는다.
begin;

do $$
begin
  if to_regclass('public.payslips') is null then
    raise exception 'payslip issue audit requires public.payslips (hr_schema.sql) first';
  end if;
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'payslips' and column_name = 'issued'
  ) or not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'payslips' and column_name = 'issued_at'
  ) then
    raise exception 'payslip issue audit requires public.payslips(issued, issued_at) from hr_schema.sql first';
  end if;
end $$;

alter table public.payslips add column if not exists issued_by text;

commit;
