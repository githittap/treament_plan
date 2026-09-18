-- 근로계약서: 작성 요청본 보관, 원장 수정 후 최종발송, 요일별 근무시간표
-- Supabase SQL Editor 또는 migration으로 한 번만 적용한다.

alter table public.contracts
  add column if not exists request_merged_html text,
  add column if not exists request_fields jsonb,
  add column if not exists reviewed_by text,
  add column if not exists reviewed_at timestamptz;

-- 현재 표준 서식의 근무시간 입력을 요일별 표로 교체한다.
-- 제17조상 변경 근로조건은 별도 서면 또는 전자문서로 명시하도록 문구를 정리한다.
with updated_fields as (
  select jsonb_agg(field order by sort_order) as fields
  from (
    select field, ordinality as sort_order
    from public.doc_templates t,
         jsonb_array_elements(t.fields) with ordinality as x(field, ordinality)
    where t.id = 1
      and field->>'key' not in ('근무요일', '시업', '종업', '휴게', '임금유형', '임금액')
    union all
    select jsonb_build_object('key','주민등록번호','type','text','label','주민등록번호'), 1000
    union all
    select jsonb_build_object('key','임금유형','type','select','label','임금 유형','options',jsonb_build_array('월급','시급'),'default','월급'), 1001
    union all
    select jsonb_build_object('key','월급세전','type','text','label','월 급여 (세전)'), 1002
    union all
    select jsonb_build_object('key','예상실수령액','type','text','label','예상 실수령액 (세후·참고)'), 1003
    union all
    select jsonb_build_object(
      'key','근무시간표','type','work_schedule','label','요일별 근무시간표',
      'default',jsonb_build_array(jsonb_build_object('days',jsonb_build_array('월','화','수','목','금'),'kind','주간','start','10:00','end','19:00','break_time','13:00 ~ 14:00','note',''))
    ), 1004
  ) f
)
update public.doc_templates t
set fields = updated_fields.fields,
    presets = coalesce(t.presets,'{}'::jsonb) || jsonb_build_object(
      '통역사',coalesce(t.presets->'통역사','{}'::jsonb) || jsonb_build_object('수행업무','외국환자 응대, 통역, 진료보조, 기타 전반적 치과 업무 보조 및 홍보'),
      '진료실',coalesce(t.presets->'진료실','{}'::jsonb) || jsonb_build_object('수행업무','진료보조, 기공물관리, 재료/환자관리, 전반적인 치과 업무 보조 및 사업주 지도하 홍보'),
      '리셉션',coalesce(t.presets->'리셉션','{}'::jsonb) || jsonb_build_object('수행업무','리셉션 업무, 응대, 청구, 수납, 리콜, 기타 전반적 치과 업무 전반(사업주 지도,감독하)'),
      '상담실장',coalesce(t.presets->'상담실장','{}'::jsonb) || jsonb_build_object('수행업무','상담, 전화업무(전화상담, 해피콜), 예약, 보험청구, 수입지출 통계, 수납 및 사업주 감독하 진료보조 및 직원교육, 기타 치과 업무 전반 및 홍보'),
      '마케터',coalesce(t.presets->'마케터','{}'::jsonb) || jsonb_build_object('수행업무','기획, 광고심의, 디자인, 매체별 최적화 세팅 및 광고 집행, 내부 사이니지 변경, 카피라이팅, 오프라인, 대외 계약체결 등 치과 업무 보조 전반(사업주 지도하)'),
      '부원장',(coalesce(t.presets->'부원장','{}'::jsonb) - '근무요일') || jsonb_build_object('수행업무','진료(부원장) 및 관련 제반 업무'),
      '기공소',coalesce(t.presets->'기공소','{}'::jsonb) || jsonb_build_object('수행업무','기공소 / 보철 제작 관련 제반 업무')
    ),
    body_html = $doc$
<div class="contract" style="font-family:'Malgun Gothic',sans-serif;line-height:1.7;color:#1a1a1a;max-width:820px;margin:0 auto">
<h1 style="text-align:center;color:#156f72;letter-spacing:6px">근 로 계 약 서</h1>
<h3 style="color:#156f72;border-bottom:2px solid #156f72;padding-bottom:3px">제1조 (계약 당사자)</h3>
<p>병원명 <b>아산정플란트치과의원</b> · 대표자 <b>정용태</b><br>직원 성명 <b>{{성명}}</b> · 생년월일 <b>{{생년월일}}</b> · 주민등록번호 <b>{{주민등록번호}}</b><br>주소 <b>{{주소}}</b></p>
<h3 style="color:#156f72;border-bottom:2px solid #156f72;padding-bottom:3px">제2조 (계약기간)</h3>
<p>근로계약기간은 <b>{{계약시작}}</b> 부터 <b>{{계약종료}}</b> 까지로 한다.</p>
<h3 style="color:#156f72;border-bottom:2px solid #156f72;padding-bottom:3px">제3조 (장소·업무)</h3>
<p>1. 직원의 근무장소는 <b>{{근무장소}}</b>로 하고, 수행업무는 <b>{{수행업무}}</b>로 한다.<br>2. 근무장소 및 수행업무는 병원의 업무상 필요에 따라 변경될 수 있다.</p>
<h3 style="color:#156f72;border-bottom:2px solid #156f72;padding-bottom:3px">제4조 (근로시간·휴게)</h3>
<p>1. 직원의 근로시간 및 휴게시간은 다음과 같다.<br>{{근무시간표}}<br>■ 설·추석 등 공휴일 근무 포함<br>2. 구체적인 요일·시간은 위 시간표 및 별도 스케줄표에 따른다. 상기 근무일, 근로시간 및 휴게시간은 업무형편에 따라 변경될 수 있다.<br>3. 연장·휴일·야간근로는 사전 승인 절차로 관리한다.</p>
<h3 style="color:#156f72;border-bottom:2px solid #156f72;padding-bottom:3px">제5조 (임금)</h3>
<p>1. 임금 유형 <b>{{임금유형}}</b> · 월 급여(세전) <b>{{월급세전}}</b><br>예상 실수령액(세후·참고) <b>{{예상실수령액}}</b> — 세후 예상액은 공제에 따라 달라질 수 있다.<br>□ 상기 금액에는 <b>{{포괄내역}}</b>이 포괄되어 있다.<br>2. 임금은 매월 1일~말일을 산정기간으로 하여 <b>{{지급일}}</b>에 직원 본인 계좌로 입금하며, 지급일이 휴일이면 전일 또는 다음 영업일에 지급한다.<br>3. 의원은 세전 임금제를 운영하며, 노동법·세법에 맞게 제세공과금을 공제 후 지급한다.<br>4. 은혜적·호의적 인센티브는 부정기적 금품으로 통상임금 및 퇴직금에 포함되지 아니한다.<br>5. 지각·조퇴·결근 등 근무하지 못한 시간은 무급 반영되며, 중도 입·퇴사는 일할계산한다.</p>
<h3 style="color:#156f72;border-bottom:2px solid #156f72;padding-bottom:3px">제6조 (휴일)</h3>
<p>1. 주휴일은 <b>{{주휴일}}</b>로 한다(요일 변동 가능 / 개근 시 유급). 2. 기타 휴일은 관계법령에 따른다.</p>
<h3 style="color:#156f72;border-bottom:2px solid #156f72;padding-bottom:3px">제7조 (연차휴가)</h3>
<p>1. 연차휴가는 근로기준법에 따라 지급하고, 연차수당을 급여에 포괄하여 선지급한다. 재직기간 동안 자유로이 사용하고, 퇴사 시 또는 연차정산 시 선지급분을 포함하여 정산한다.<br>2. 연차 사용 시 연차신청서를 제출하여 휴가일을 협의한다.</p>
<h3 style="color:#156f72;border-bottom:2px solid #156f72;padding-bottom:3px">제8조 (퇴사)</h3>
<p>1. 1년 이상 근무 시 근로자퇴직급여보장법에 따라 퇴직급여(퇴직연금 등)를 지급한다.<br>2. 사직하고자 하는 경우 사직 희망일로부터 3주 전 사직서를 제출하고 인수인계를 철저히 한다. 이를 위반하여 병원에 손해가 발생한 경우 직원은 법적 조치에 이의를 제기하지 아니한다.</p>
<h3 style="color:#156f72;border-bottom:2px solid #156f72;padding-bottom:3px">제9조 (비밀유지)</h3>
<p>직원은 병원의 서면승인 없이 고용기간 중 또는 그 이후에도 병원의 모든 비밀정보·노하우·환자정보·본인 연봉·고용정책·운영관행 및 기타 정보를 타인에게 공개하거나 개인적·기타 목적에 이용할 수 없으며, 기밀정보를 누설할 수 없다. 소셜미디어 등 온라인 활동에도 동일하게 적용된다.</p>
<h3 style="color:#156f72;border-bottom:2px solid #156f72;padding-bottom:3px">제10조 (계약해지)</h3>
<p>다음 각 호 발생 시 의원은 본 계약을 해지할 수 있다.<br>1. 정당한 사유 없이 업무지시에 불복 2. 고의·과실로 경제적 손해 또는 명예·신뢰에 악영향 3. 불성실 근무·근무질서 문란 4. 무단결근 3회 이상(연락두절 시 자진퇴사 간주) 5. 직장 내 성희롱·괴롭힘 6. 환자 불친절·업무미숙 등 민원으로 근무가 어렵다고 판단 7. 의료관계법령 위반 또는 자격 상실 8. 시말서 1개월 3회 이상 제출 9. 기타 이에 준하는 사유로 근로계약관계 지속이 어려운 경우</p>
<h3 style="color:#156f72;border-bottom:2px solid #156f72;padding-bottom:3px">제11조 (기타)</h3>
<p>1. 본 계약서에 명시되지 않은 사항은 근로관계법령 및 당사 규정에 따른다.<br>2. 퇴사 시 병원에서 받은 물품은 원상복귀 후 반납하며, 미반납 시 마지막 월급에서 10만원 공제에 동의한다.<br>3. 중도퇴사 시 임금 등은 퇴사일 이후 돌아오는 익월 임금지급일에 지급하는 것에 동의한다.</p>
<h3 style="color:#156f72;border-bottom:2px solid #156f72;padding-bottom:3px">개인정보 수집·이용 동의</h3>
<p>· 수집·이용 목적: 당사의 인적자원관리<br>· 개인정보 항목: 1) 성명·주민번호·가족사항 2) 주소·이메일·휴대전화 등 연락처 3) 학력·근무경력 4) 기타 근로 관련 개인정보<br>· 보유·이용기간: 근로관계가 유지되는 기간<br>◇ 병원은 직원의 개인정보를 다른 목적으로 이용하거나 제3자에게 제공하지 않습니다.<br>◇ 직원은 개인정보 수집·이용에 동의하지 않을 권리가 있으며, 다만 거부 시 불이익이 있을 수 있습니다.</p>
<p style="text-align:center">위 내용을 충분히 숙지하고 개인정보의 수집 및 이용에 동의합니다. &nbsp;&nbsp; ☐ 동의 &nbsp;&nbsp; ☐ 동의하지 않음</p>
<p style="margin-top:10px;font-size:13px;color:#555">근로기준법 제17조에 따라 관련사항을 서면 명시하고 근로계약서 사본을 교부받았음을 확인함.</p>
<p style="text-align:center;margin-top:16px">{{계약일자}}</p>
<div class="signrow" style="display:flex;justify-content:space-around;margin-top:10px;gap:20px">
  <div><b>병 원</b><br>상호: 아산정플란트치과의원<br>대표: 정용태 <span data-stamp="owner">{{도장_원장}}</span></div>
  <div><b>직 원</b><br>성명: {{성명}}<br><span data-sign-slot="employee">(직원 서명)</span></div>
</div>
</div>
$doc$
from updated_fields
where t.id = 1;
