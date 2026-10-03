-- 신규 자동 채움만 멈춤. 이미 확정된 직원 직무와 발송 직무 열은 보존함.
BEGIN;
DROP TRIGGER IF EXISTS p7_contract_job_group_sync ON public.contracts;
DROP FUNCTION IF EXISTS public.p7_contract_job_group_sync();
COMMIT;
