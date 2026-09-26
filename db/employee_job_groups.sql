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
  AND (p.name IS NULL OR p.name NOT IN (
    '권은영', '김수란', '김수연', '김지윤', '마주옥', '오진주', '임은숙',
    '이소연', '신동광', '이지훈', '김나현', '유혜민', 'bakirova'
  ))
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
  AND sp.department <> 'Dr.'
  AND (sp.name IS NULL OR sp.name NOT IN (
    '권은영', '김수란', '김수연', '김지윤', '마주옥', '오진주', '임은숙',
    '이소연', '신동광', '이지훈', '김나현', '유혜민', 'bakirova'
  ));

-- 원장 확정 명단은 정확한 이름만 사용한다. profile 연결·분류는 이름이 유일하고 Dr.가 아닌 경우에만 한다.
DO $$
DECLARE
  v_name text;
  v_group text;
  v_profile_count integer;
  v_profile_id uuid;
  v_profile_group text;
  v_roster_count integer;
  v_roster_id uuid;
  v_roster_profile uuid;
  v_roster_group text;
BEGIN
  FOR v_name, v_group IN
    SELECT * FROM (VALUES
      ('권은영', 'clinical_consult'), ('김수란', 'clinical_consult'),
      ('김수연', 'clinical_consult'), ('김지윤', 'clinical_consult'),
      ('마주옥', 'clinical_consult'), ('오진주', 'clinical_consult'),
      ('임은숙', 'clinical_consult'),
      ('이소연', 'sterilization_admin'), ('신동광', 'sterilization_admin'),
      ('이지훈', 'lab'), ('김나현', 'lab'),
      ('유혜민', 'desk'), ('bakirova', 'desk')
    ) AS confirmed(name, job_group)
  LOOP
    SELECT count(*)::integer INTO v_profile_count
    FROM public.profiles p WHERE p.name = v_name;

    SELECT count(*)::integer INTO v_roster_count
    FROM public.schedule_people sp WHERE sp.name = v_name;

    IF v_profile_count = 1 THEN
      SELECT p.user_id, p.job_group INTO v_profile_id, v_profile_group
      FROM public.profiles p WHERE p.name = v_name;

      IF EXISTS (
        SELECT 1 FROM public.schedule_people sp
        WHERE sp.profile_user_id = v_profile_id AND sp.department = 'Dr.'
      ) THEN
        CONTINUE;
      END IF;

      -- 기존 화면 분류 등 비어 있지 않은 실제 변경은 보존한다.
      IF v_profile_group IS NOT NULL AND v_profile_group <> v_group THEN
        CONTINUE;
      END IF;

      UPDATE public.profiles p
      SET job_group = v_group
      WHERE p.user_id = v_profile_id AND p.job_group IS NULL;

      IF EXISTS (
        SELECT 1 FROM public.schedule_people sp
        WHERE sp.profile_user_id = v_profile_id
      ) THEN
        CONTINUE;
      END IF;

      IF v_roster_count = 0 THEN
        INSERT INTO public.schedule_people (profile_user_id, name, department, job_group)
        VALUES (v_profile_id, v_name, '미지정', NULL);
      ELSIF v_roster_count = 1 THEN
        SELECT sp.id, sp.profile_user_id, sp.job_group
        INTO v_roster_id, v_roster_profile, v_roster_group
        FROM public.schedule_people sp WHERE sp.name = v_name;

        IF v_roster_profile IS NULL AND (v_roster_group IS NULL OR v_roster_group = v_group) THEN
          UPDATE public.schedule_people sp
          SET profile_user_id = v_profile_id, job_group = NULL
          WHERE sp.id = v_roster_id AND sp.profile_user_id IS NULL;
        END IF;
      END IF;
    ELSE
      -- profile이 없거나 동명이인이면 기존 미연결 명부만 재사용한다. 연결 행은 건드리지 않는다.
      IF v_roster_count = 0 THEN
        INSERT INTO public.schedule_people (name, department, job_group)
        VALUES (v_name, '미지정', v_group);
      ELSIF v_roster_count = 1 THEN
        SELECT sp.id, sp.profile_user_id, sp.job_group
        INTO v_roster_id, v_roster_profile, v_roster_group
        FROM public.schedule_people sp WHERE sp.name = v_name;

        IF v_roster_profile IS NULL AND v_roster_group IS NULL THEN
          UPDATE public.schedule_people sp
          SET job_group = v_group
          WHERE sp.id = v_roster_id AND sp.profile_user_id IS NULL AND sp.job_group IS NULL;
        END IF;
      END IF;
    END IF;
  END LOOP;
END
$$;

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
