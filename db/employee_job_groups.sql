-- 직무 분류 확장: 일반 직원만 backfill하고 원본 부서값은 보존한다.
BEGIN;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS job_group text;
ALTER TABLE public.schedule_people
  ADD COLUMN IF NOT EXISTS job_group text;

ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_job_group_check;
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_job_group_check
  CHECK (job_group IS NULL OR job_group IN ('clinical_consult', 'sterilization_admin', 'lab', 'desk'));

ALTER TABLE public.schedule_people
  DROP CONSTRAINT IF EXISTS schedule_people_job_group_check;
ALTER TABLE public.schedule_people
  ADD CONSTRAINT schedule_people_job_group_check
  CHECK (
    (job_group IS NULL OR job_group IN ('clinical_consult', 'sterilization_admin', 'lab', 'desk'))
    AND (department <> 'Dr.' OR job_group IS NULL)
  );

UPDATE public.profiles AS p
SET job_group = CASE p.dept
  WHEN '진료실' THEN 'clinical_consult'
  WHEN '데스크' THEN 'desk'
  WHEN '기공팀' THEN 'lab'
  ELSE NULL
END
WHERE p.job_group IS NULL
  AND NOT EXISTS (
    SELECT 1
    FROM public.schedule_people AS sp
    WHERE sp.profile_user_id = p.user_id
      AND sp.department = 'Dr.'
  );

UPDATE public.schedule_people AS sp
SET job_group = CASE sp.department
  WHEN '진료실' THEN 'clinical_consult'
  WHEN '상담' THEN 'clinical_consult'
  WHEN '행정' THEN 'sterilization_admin'
  WHEN '기공실' THEN 'lab'
  WHEN '데스크' THEN 'desk'
  ELSE NULL
END
WHERE sp.profile_user_id IS NULL
  AND sp.job_group IS NULL
  AND sp.department <> 'Dr.';

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.schedule_people
    WHERE department = 'Dr.' AND job_group IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'Dr. schedule people must not have job_group';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.schedule_people AS sp
    JOIN public.profiles AS p ON p.user_id = sp.profile_user_id
    WHERE sp.profile_user_id IS NOT NULL AND sp.department <> 'Dr.' AND sp.job_group IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'linked schedule people must use profiles.job_group';
  END IF;
END
$$;

COMMIT;
