-- P7 운영 직무 값 채우기 초안. 운영에서 실행하지 않음.
-- 정확한 이름이 각 표에 한 행만 있을 때 빈 값만 채움. 행 생성·연결·부서 변경 없음.
BEGIN;
LOCK TABLE public.profiles,public.schedule_people IN SHARE ROW EXCLUSIVE MODE;
CREATE TABLE IF NOT EXISTS public.p7_job_group_backup_20261003 (
  source_table text NOT NULL, row_id uuid NOT NULL, old_job_group text,
  applied_job_group text NOT NULL, PRIMARY KEY(source_table,row_id)
);
DO $$
DECLARE v_name text; v_group text; v_count integer; v_id uuid; v_old text;
BEGIN
  FOR v_name,v_group IN SELECT * FROM (VALUES
    ('권은영','clinical_consult'),('김수란','clinical_consult'),('김수연','clinical_consult'),
    ('김지윤','clinical_consult'),('마주옥','clinical_consult'),('오진주','clinical_consult'),('임은숙','clinical_consult'),
    ('이소연','sterilization_admin'),('신동광','sterilization_admin'),
    ('이지훈','lab'),('김나현','lab'),('유혜민','desk'),('Bakirova Meerim','desk')
  ) AS confirmed(name,job_group) LOOP
    SELECT count(*) INTO v_count FROM public.profiles WHERE name=v_name;
    IF v_count=1 THEN
      SELECT p.user_id,p.job_group INTO v_id,v_old FROM public.profiles p
      WHERE p.name=v_name AND coalesce(p.dept,'')<>'Dr.'
        AND NOT EXISTS(SELECT 1 FROM public.schedule_people s WHERE s.profile_user_id=p.user_id AND s.department='Dr.')
      FOR UPDATE;
      IF FOUND AND nullif(btrim(v_old),'') IS NULL THEN
        INSERT INTO public.p7_job_group_backup_20261003 VALUES('profiles',v_id,v_old,v_group) ON CONFLICT DO NOTHING;
        UPDATE public.profiles SET job_group=v_group WHERE user_id=v_id AND job_group IS NOT DISTINCT FROM v_old;
      END IF;
    ELSE
      RAISE NOTICE 'profiles 미일치/중복: % (%행)',v_name,v_count;
    END IF;
    SELECT count(*) INTO v_count FROM public.schedule_people WHERE name=v_name;
    IF v_count=1 THEN
      SELECT s.id,s.job_group INTO v_id,v_old FROM public.schedule_people s
      WHERE s.name=v_name AND coalesce(s.department,'')<>'Dr.'
        AND NOT EXISTS(SELECT 1 FROM public.profiles p WHERE p.user_id=s.profile_user_id AND p.dept='Dr.')
      FOR UPDATE;
      IF FOUND AND nullif(btrim(v_old),'') IS NULL THEN
        INSERT INTO public.p7_job_group_backup_20261003 VALUES('schedule_people',v_id,v_old,v_group) ON CONFLICT DO NOTHING;
        UPDATE public.schedule_people SET job_group=v_group WHERE id=v_id AND job_group IS NOT DISTINCT FROM v_old;
      END IF;
    ELSE
      RAISE NOTICE 'schedule_people 미일치/중복: % (%행)',v_name,v_count;
    END IF;
  END LOOP;
END $$;
-- 아래 두 조회 결과를 운영 적용 담당자가 결과 칸에 기록함. 확인하지 않은 이름을 추측하지 않음.
WITH confirmed(name,job_group) AS (VALUES
  ('권은영','clinical_consult'),('김수란','clinical_consult'),('김수연','clinical_consult'),
  ('김지윤','clinical_consult'),('마주옥','clinical_consult'),('오진주','clinical_consult'),('임은숙','clinical_consult'),
  ('이소연','sterilization_admin'),('신동광','sterilization_admin'),
  ('이지훈','lab'),('김나현','lab'),('유혜민','desk'),('Bakirova Meerim','desk')
), reports AS (
  SELECT 'profiles' AS source_table,c.name,c.job_group AS expected_group,
    count(p.user_id)::int AS exact_matches, max(p.job_group) AS actual_group
  FROM confirmed c LEFT JOIN public.profiles p ON p.name=c.name GROUP BY c.name,c.job_group
  UNION ALL
  SELECT 'schedule_people',c.name,c.job_group,count(s.id)::int,max(s.job_group)
  FROM confirmed c LEFT JOIN public.schedule_people s ON s.name=c.name GROUP BY c.name,c.job_group
)
SELECT * FROM reports WHERE exact_matches<>1 OR actual_group IS DISTINCT FROM expected_group ORDER BY source_table,name;
SELECT id,name,department,profile_user_id FROM public.schedule_people
WHERE coalesce(department,'')<>'Dr.' AND nullif(btrim(job_group),'') IS NULL ORDER BY name,id;
COMMIT;
