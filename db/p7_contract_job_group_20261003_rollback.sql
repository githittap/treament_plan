-- 신규 자동 채움만 멈춤. 이미 확정된 직원 직무와 발송 직무 열은 보존함.
-- p7_contract_job_group_guard 트리거와 p7_contract_sent_job_group_guard 함수는
-- 발송 직무·대상 직원 변조 방지를 위해 계속 남김.
BEGIN;
DROP TRIGGER IF EXISTS p7_contract_job_group_sync ON public.contracts;
DROP FUNCTION IF EXISTS public.p7_contract_job_group_sync();
COMMIT;
