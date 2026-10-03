-- P7 계약 직무 → 직원 직무 초안. 운영에 적용하지 않음.
-- 최종 발송 직무를 고정하고, 서명 완료 때만 빈 profiles.job_group을 채움.
-- 별칭은 hub_ui_texts의 contract_job.alias_* 글로 원장이 고칠 수 있음(쉼표로 구분).
BEGIN;
ALTER TABLE public.contracts ADD COLUMN IF NOT EXISTS sent_job_group text;
-- 발송 기록 보호는 자동 전파를 되돌려도 남음. guard가 sync보다 먼저 실행됨.
CREATE OR REPLACE FUNCTION public.p7_contract_sent_job_group_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
  IF tg_op='INSERT' THEN
    IF new.sent_job_group IS NOT NULL THEN RAISE EXCEPTION 'frozen contract job group cannot be supplied'; END IF;
  ELSE
    IF new.sent_job_group IS DISTINCT FROM old.sent_job_group
      OR (old.sent_job_group IS NOT NULL AND new.user_id IS DISTINCT FROM old.user_id) THEN
      RAISE EXCEPTION 'frozen contract job group cannot be changed';
    END IF;
  END IF;
  RETURN new;
END $$;
DROP TRIGGER IF EXISTS p7_contract_job_group_guard ON public.contracts;
CREATE TRIGGER p7_contract_job_group_guard BEFORE INSERT OR UPDATE ON public.contracts
FOR EACH ROW EXECUTE FUNCTION public.p7_contract_sent_job_group_guard();
REVOKE ALL ON FUNCTION public.p7_contract_sent_job_group_guard() FROM public,anon,authenticated;
CREATE OR REPLACE FUNCTION public.p7_contract_job_group_sync()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_title text; v_code text; v_matches text[]:=ARRAY[]::text[]; v_aliases text; v_key text; v_default text;
  v_lead boolean:=coalesce(public.my_role() IN ('owner','chief'),false)
    OR (auth.uid() IS NULL AND session_user='postgres');
BEGIN
  -- 일반 fields 수정이나 직원의 상태 조작으로 발송 원본을 만들지 않음.
  IF new.status='대기' AND (tg_op='INSERT' OR old.status IS DISTINCT FROM '대기') THEN
    IF NOT v_lead THEN RAISE EXCEPTION 'contract final send requires owner or chief'; END IF;
    IF new.sent_job_group IS NULL THEN
      v_title:=coalesce(nullif(btrim(new.fields->>'job_group'),''),nullif(btrim(new.fields->>'직무'),''),
        nullif(btrim(new.fields->>'직무분류'),''),nullif(btrim(new.fields->>'직종'),''));
    END IF;
  END IF;
  IF EXISTS(SELECT 1 FROM public.profiles p WHERE p.user_id=new.user_id AND p.dept='Dr.')
    OR EXISTS(SELECT 1 FROM public.schedule_people s WHERE s.profile_user_id=new.user_id AND s.department='Dr.') THEN RETURN new; END IF;
  IF v_title IN ('clinical_consult','sterilization_admin','lab','desk') THEN v_matches:=ARRAY[v_title];
  ELSE
    FOR v_code,v_key,v_default IN SELECT * FROM (VALUES
      ('clinical_consult','contract_job.alias_clinical_consult','진료·상담,진료실,상담,치과위생사,위생사'),
      ('sterilization_admin','contract_job.alias_sterilization_admin','소독·행정,소독,소독실,행정'),
      ('lab','contract_job.alias_lab','기공,기공실,치과기공사,기공사'),
      ('desk','contract_job.alias_desk','데스크,코디,코디네이터')
    ) AS aliases(code,key,def) LOOP
      SELECT coalesce(nullif(btrim(value),''),v_default) INTO v_aliases FROM public.hub_ui_texts WHERE key=v_key;
      IF NOT FOUND THEN v_aliases:=v_default; END IF;
      IF EXISTS(SELECT 1 FROM unnest(string_to_array(v_aliases,',')) AS alias(title) WHERE btrim(title)=v_title) THEN
        v_matches:=array_append(v_matches,v_code);
      END IF;
    END LOOP;
  END IF;
  IF cardinality(v_matches)=1 THEN
    new.sent_job_group:=v_matches[1];
  END IF;
  IF new.status='서명완료' AND tg_op='UPDATE' AND old.status='대기'
    AND new.sent_job_group IN ('clinical_consult','sterilization_admin','lab','desk') THEN
    UPDATE public.profiles SET job_group=new.sent_job_group
      WHERE user_id=new.user_id AND nullif(btrim(job_group),'') IS NULL;
  END IF;
  RETURN new;
END $$;
DROP TRIGGER IF EXISTS p7_contract_job_group_sync ON public.contracts;
CREATE TRIGGER p7_contract_job_group_sync BEFORE INSERT OR UPDATE ON public.contracts
FOR EACH ROW EXECUTE FUNCTION public.p7_contract_job_group_sync();
REVOKE ALL ON FUNCTION public.p7_contract_job_group_sync() FROM public,anon,authenticated;
COMMIT;
