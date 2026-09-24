-- 앱 롤백 시에는 이 migration을 실행하지 않고 새 컬럼을 보존한다.
-- 컬럼 제거 전에 로컬 백업과 기존 행 수·dept·department 값을 별도로 대조해야 한다.
BEGIN;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.profiles WHERE job_group IS NOT NULL)
     OR EXISTS (SELECT 1 FROM public.schedule_people WHERE job_group IS NOT NULL) THEN
    RAISE EXCEPTION 'employee_job_groups rollback refused: job_group data exists; preserve columns';
  END IF;
END
$$;

ALTER TABLE public.schedule_people
  DROP CONSTRAINT IF EXISTS schedule_people_job_group_check;
ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_job_group_check;
ALTER TABLE public.schedule_people
  DROP COLUMN IF EXISTS job_group;
ALTER TABLE public.profiles
  DROP COLUMN IF EXISTS job_group;

COMMIT;
