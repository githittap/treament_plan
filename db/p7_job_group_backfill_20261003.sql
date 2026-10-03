-- P7 운영 직무 값 채우기 초안. 운영에서 실행하지 않음.
-- 재직 profile이 정확히 한 행일 때 빈 값만 채움. 명부는 연결 행 우선·없으면 미지정 아닌 유일 이름 행.
-- 퇴사 행·시험 계정·Dr.·기존 직무·부서는 건드리지 않음.
BEGIN;
SET LOCAL lock_timeout = '5s';
LOCK TABLE public.profiles,public.schedule_people IN SHARE ROW EXCLUSIVE MODE;
CREATE TABLE IF NOT EXISTS public.p7_job_group_backup_20261003 (
  source_table text NOT NULL, row_id uuid NOT NULL, old_job_group text,
  applied_job_group text NOT NULL, PRIMARY KEY(source_table,row_id)
);
ALTER TABLE public.p7_job_group_backup_20261003 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.p7_job_group_backup_20261003 FROM public,anon,authenticated;
DO $$
DECLARE v_name text; v_group text; v_count integer; v_id uuid; v_old text; v_profile_id uuid; v_link_count integer;
BEGIN
  FOR v_name,v_group IN SELECT * FROM (VALUES
    ('권은영','clinical_consult'),('김수란','clinical_consult'),('김수연','clinical_consult'),
    ('김지윤','clinical_consult'),('마주옥','clinical_consult'),('오진주','clinical_consult'),('임은숙','clinical_consult'),
    ('이소연','sterilization_admin'),('신동광','sterilization_admin'),
    ('이지훈','lab'),('김나현','lab'),('유혜민','desk'),('Bakirova Meerim','desk'),('이채연','desk'),('전채연','desk')
  ) AS confirmed(name,job_group) LOOP
    v_profile_id:=NULL;
    SELECT count(*) INTO v_count FROM public.profiles WHERE name=v_name AND active=true AND coalesce(employment_status,'재직')='재직';
    IF v_count=1 THEN
      SELECT user_id INTO v_profile_id FROM public.profiles WHERE name=v_name AND active=true AND coalesce(employment_status,'재직')='재직';
      SELECT p.user_id,p.job_group INTO v_id,v_old FROM public.profiles p
      WHERE p.user_id=v_profile_id AND coalesce(p.dept,'')<>'Dr.'
        AND NOT EXISTS(SELECT 1 FROM public.schedule_people s WHERE s.profile_user_id=p.user_id AND s.department='Dr.')
      FOR UPDATE;
      IF FOUND AND nullif(btrim(v_old),'') IS NULL THEN
        INSERT INTO public.p7_job_group_backup_20261003 VALUES('profiles',v_id,v_old,v_group) ON CONFLICT DO NOTHING;
        UPDATE public.profiles SET job_group=v_group WHERE user_id=v_id AND job_group IS NOT DISTINCT FROM v_old;
      END IF;
    ELSE
      RAISE NOTICE 'profiles 미일치/중복: % (%행)',v_name,v_count;
    END IF;
    SELECT count(*) INTO v_link_count FROM public.schedule_people WHERE profile_user_id=v_profile_id AND active=true;
    IF v_link_count>0 THEN
      v_count:=v_link_count;
    ELSE
      SELECT count(*) INTO v_count FROM public.schedule_people s
        WHERE s.active=true AND s.name=v_name AND coalesce(s.department,'미지정') NOT IN ('','미지정')
          AND NOT EXISTS(SELECT 1 FROM public.profiles p WHERE p.user_id=s.profile_user_id
            AND (p.active IS NOT TRUE OR coalesce(p.employment_status,'재직')<>'재직'));
    END IF;
    IF v_count=1 THEN
      SELECT s.id,s.job_group INTO v_id,v_old FROM public.schedule_people s
      WHERE ((v_link_count=1 AND s.profile_user_id=v_profile_id)
        OR (v_link_count=0 AND s.name=v_name AND coalesce(s.department,'미지정') NOT IN ('','미지정')
          AND NOT EXISTS(SELECT 1 FROM public.profiles p WHERE p.user_id=s.profile_user_id
            AND (p.active IS NOT TRUE OR coalesce(p.employment_status,'재직')<>'재직'))))
        AND s.active=true AND coalesce(s.department,'')<>'Dr.'
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
  ('이지훈','lab'),('김나현','lab'),('유혜민','desk'),('Bakirova Meerim','desk'),('이채연','desk'),('전채연','desk')
), active_profiles AS (
  SELECT p.* FROM public.profiles p WHERE p.active=true AND coalesce(p.employment_status,'재직')='재직'
), unique_profiles AS (
  SELECT name,(array_agg(user_id))[1] user_id FROM active_profiles GROUP BY name HAVING count(*)=1
), roster_choices AS (
  SELECT s.* FROM public.schedule_people s LEFT JOIN unique_profiles p ON p.name=s.name
  WHERE s.active=true AND ((s.profile_user_id=p.user_id)
    OR (NOT EXISTS(SELECT 1 FROM public.schedule_people linked WHERE linked.profile_user_id=p.user_id AND linked.active=true)
      AND coalesce(s.department,'미지정') NOT IN ('','미지정')
      AND NOT EXISTS(SELECT 1 FROM public.profiles retired WHERE retired.user_id=s.profile_user_id
        AND (retired.active IS NOT TRUE OR coalesce(retired.employment_status,'재직')<>'재직'))))
), reports AS (
  SELECT 'profiles' AS source_table,c.name,c.job_group AS expected_group,
    count(p.user_id)::int AS exact_matches, max(p.job_group) AS actual_group
  FROM confirmed c LEFT JOIN active_profiles p ON p.name=c.name GROUP BY c.name,c.job_group
  UNION ALL
  SELECT 'schedule_people',c.name,c.job_group,count(s.id)::int,max(s.job_group)
  FROM confirmed c LEFT JOIN roster_choices s ON s.name=c.name GROUP BY c.name,c.job_group
)
SELECT * FROM reports WHERE exact_matches<>1 OR actual_group IS DISTINCT FROM expected_group ORDER BY source_table,name;
SELECT id,name,department,profile_user_id FROM public.schedule_people
WHERE active=true AND coalesce(department,'')<>'Dr.' AND nullif(btrim(job_group),'') IS NULL ORDER BY name,id;
COMMIT;
