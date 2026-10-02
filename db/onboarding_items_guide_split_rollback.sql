-- onboarding_items_guide_split.sql 되돌리기: 「신입 첫날 안내」 16문장을 다시 입사 제출물(active=true)로 올린다.
-- 적용 SQL은 16줄이 모두 켜져 있을 때만 바꾸므로, 16줄을 모두 켜면 적용 전 상태와 같다.
-- 그 사이 남은 제출 기록(onboarding_checks)은 손대지 않았으므로 그대로 다시 보인다.
-- 순번 101~116과 문장이 한 줄씩 정확히 짝지어 있을 때만 켠다(아니면 아무것도 안 바꾸고 멈춤).
do $$
declare
  v_expected constant text[]:=array[
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
    '치료 후 다음 계획 또는 정기검진·불편 시 내원 등 후속 계획을 기록한다.',
    '기본 도구와 오픈·마감 절차를 확인한다.',
    '상담 전 최신 수가표와 내부 설명 자료의 사용 범위를 담당자에게 확인한다.',
    '환자 앞에서 필요한 설명과 양해를 먼저 제공한다.'
  ];
  v_matched int;
  v_changed int;
begin
  select count(distinct i.id) into v_matched
    from unnest(v_expected) with ordinality as e(label,ord)
    join public.onboarding_items i on i.order_no=100+e.ord::int and i.label=e.label;
  if v_matched<>16 then
    raise exception 'onboarding guide split rollback: expected 16 exact (order_no, label) pairs, found % — nothing changed', v_matched;
  end if;
  update public.onboarding_items i set active=true
    from unnest(v_expected) with ordinality as e(label,ord)
   where i.order_no=100+e.ord::int and i.label=e.label and not i.active;
  get diagnostics v_changed=row_count;
  raise notice 'onboarding guide split rollback: % rows set active', v_changed;
end $$;
