-- 입사 제출물 정리(2026-10-02 원장 노션 20:00 「입사제출물에 그냥 일반적인 주의규칙이 나와잇따. 저런거는 없애야할거같다」).
-- G장 초안(onboarding_g_hardening_draft.sql)이 「신입 첫날 안내」 16문장을 onboarding_items(order_no 101~116)에 넣어
-- 「📋 내 입사 제출물」 표에 제출 항목처럼 보였다. 지우지 않고 active=false로만 내려 제출물 표·미제출 건수에서 뺀다.
-- 안내 문장은 내 서류함·홈의 「🧭 신입 첫날 안내」 카드(허브 설정 onbo.guide.items)에 그대로 보인다.
-- 이미 남은 제출 기록(onboarding_checks)은 그대로 둔다. 되돌리기: onboarding_items_guide_split_rollback.sql
-- 다시 돌려도 안전(이미 내려간 줄은 0줄). 16줄 중 일부만 맞으면(문장이 고쳐졌거나 순번이 바뀜) 아무것도 바꾸지 않고 멈춘다.
do $$
declare
  v_labels text[]:=array[
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
  v_found int;
  v_active int;
  v_changed int;
begin
  select count(*),count(*) filter(where active) into v_found,v_active
    from public.onboarding_items where order_no between 101 and 116 and label=any(v_labels);
  if v_found<>16 then
    raise exception 'onboarding guide split: expected 16 guide rows, found % — nothing changed', v_found;
  end if;
  update public.onboarding_items set active=false
   where active and order_no between 101 and 116 and label=any(v_labels);
  get diagnostics v_changed=row_count;
  if v_changed<>v_active then
    raise exception 'onboarding guide split: expected % rows to change, changed %', v_active, v_changed;
  end if;
  raise notice 'onboarding guide split: % rows set inactive (already inactive %)', v_changed, 16-v_active;
end $$;
