-- G장 로컬 rollback 초안: 실제 요청·확인 데이터가 있으면 중단한다.
do $$
begin
  if exists(select 1 from public.onboarding_checks c join public.onboarding_items i on i.id=c.item_id
    where i.label in ('기본 도구와 오픈·마감 절차를 확인한다.',
      '상담 전 최신 수가표와 내부 설명 자료의 사용 범위를 담당자에게 확인한다.',
      '환자 앞에서 필요한 설명과 양해를 먼저 제공한다.')) then
    raise exception 'rollback blocked: onboarding seed rows exist';
  end if;
end;
$$;
do $$
begin
  if to_regclass('public.fingerprint_registration_requests') is not null
     and exists(select 1 from public.fingerprint_registration_requests) then
    raise exception 'rollback blocked: fingerprint registration request data exists';
  end if;
  if to_regclass('public.onboarding_checks') is not null
     and to_regclass('public.onboarding_items') is not null
     and exists(select 1 from public.onboarding_checks c join public.onboarding_items i on i.id=c.item_id where i.label in (
       '병원 시설을 둘러보고 식당·출퇴근 기록 장치 등 기본 시설 사용법을 안내받는다.',
       '조직도, 호칭, 기본 예절, 업무 분장, 근로계약과 복리후생 설명을 듣는다.',
       '무전기를 지급받으면 담당자에게 사용법과 업무용 대화 범위를 확인한다.',
       '소속 부서의 담당자, 보고 라인, 당일 교육 항목을 확인한다.',
       '무전은 들었다는 뜻으로 최초 1회 응답한다.',
       '진료실·데스크에서 큰 소리의 사담을 피하고, 환자 앞에서 치료계획 변경이나 내부 판단을 논의하지 않는다.',
       '환자가 언제 어떻게 납부하기로 했는지, 비급여 차감 등 금액 관련 사항이 있으면 상담·데스크 기록을 일치시킨다.',
       '대기시간과 환자 동선을 안내하고 접수 후 어디에서 기다리는지 분명히 설명한다.',
       '컴플레인은 말을 끊지 않고 듣고, 담당자에게 즉시 보고한 뒤 단독으로 확정 약속하지 않는다.',
       '신환은 구강포토와 상담 차트를 준비하고 지정 위치에 기록·스캔한다.',
       '임플란트 식립 후 1차 내원은 s/o 또는 드레싱, 2차 내원은 3주 후, 3차 내원은 6주 후로 안내한다.',
       '사용한 기구와 재료는 원래 위치에 정리하고 오픈·마감 시 정리 항목을 체크한다.',
       '치료 후 다음 계획 또는 정기검진·불편 시 내원 등 후속 계획을 기록한다.'
     )) then
    raise exception 'rollback blocked: onboarding seed rows exist';
  end if;
end;
$$;
drop policy if exists fingerprint_registration_update_manager on public.fingerprint_registration_requests;
drop policy if exists fingerprint_registration_insert_self on public.fingerprint_registration_requests;
drop policy if exists fingerprint_registration_select_self_or_manager on public.fingerprint_registration_requests;
drop table if exists public.fingerprint_registration_requests;
delete from public.onboarding_items where label in (
  '병원 시설을 둘러보고 식당·출퇴근 기록 장치 등 기본 시설 사용법을 안내받는다.',
  '조직도, 호칭, 기본 예절, 업무 분장, 근로계약과 복리후생 설명을 듣는다.',
  '무전기를 지급받으면 담당자에게 사용법과 업무용 대화 범위를 확인한다.',
  '소속 부서의 담당자, 보고 라인, 당일 교육 항목을 확인한다.',
  '무전은 들었다는 뜻으로 최초 1회 응답한다.',
  '진료실·데스크에서 큰 소리의 사담을 피하고, 환자 앞에서 치료계획 변경이나 내부 판단을 논의하지 않는다.',
  '환자가 언제 어떻게 납부하기로 했는지, 비급여 차감 등 금액 관련 사항이 있으면 상담·데스크 기록을 일치시킨다.',
  '대기시간과 환자 동선을 안내하고 접수 후 어디에서 기다리는지 분명히 설명한다.',
  '컴플레인은 말을 끊지 않고 듣고, 담당자에게 즉시 보고한 뒤 단독으로 확정 약속하지 않는다.',
  '신환은 구강포토와 상담 차트를 준비하고 지정 위치에 기록·스캔한다.',
  '임플란트 식립 후 1차 내원은 s/o 또는 드레싱, 2차 내원은 3주 후, 3차 내원은 6주 후로 안내한다.',
  '사용한 기구와 재료는 원래 위치에 정리하고 오픈·마감 시 정리 항목을 체크한다.',
  '치료 후 다음 계획 또는 정기검진·불편 시 내원 등 후속 계획을 기록한다.'
);
delete from public.onboarding_items where label in (
  '기본 도구와 오픈·마감 절차를 확인한다.',
  '상담 전 최신 수가표와 내부 설명 자료의 사용 범위를 담당자에게 확인한다.',
  '환자 앞에서 필요한 설명과 양해를 먼저 제공한다.'
);
