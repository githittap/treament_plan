-- 로컬 검토 초안. 운영 적용 금지. 선행: contract_review_and_schedule.sql,
-- employee_signature_vault_draft.sql, contract_pdf_signing_production_snapshot.sql.
-- 기존 계약 행은 계약별 merged_html 스냅샷이므로 수정하지 않는다.
do $$
begin
  if not exists(select 1 from public.doc_templates where id=1 and body_html like '%data-sign-slot="employee"%') then
    raise exception 'standard contract template or employee signature slot differs; inspect before applying';
  end if;
end $$;

update public.doc_templates
set body_html=replace(body_html,'data-sign-slot="employee"','data-sign-slot="employment"') || $pledge$
<section class="contract-part" data-contract-part="medical" style="margin-top:32px;border-top:2px solid #156f72;padding-top:16px">
<h2>② 의료정보 보안 서약</h2>
<p>본인은 업무 중 알게 된 의원의 정보와 의료정보를 아래와 같이 보호할 것을 서약합니다.</p>
<ol>
<li>의원의 정보, 시스템 계정, 전산망은 업무 목적으로만 이용하고, 허가받지 않은 정보·시설에 접근하지 않습니다.</li>
<li>정당한 사유 없이 전자의무기록의 개인정보를 탐지·누출·변조·훼손하지 않습니다(원본 의료정보 보안 서약 제2항).</li>
<li>진료·간호 중 알게 된 다른 사람의 비밀을 누설하거나 발표하지 않습니다(원본 제3항).</li>
<li>업무 중 알게 된 타인의 비밀에 관한 의사·치과의사·직무상 보조자의 비밀유지 의무를 준수합니다. 원본 제4항에는 형법 제317조 위반 시 3년 이하 징역·금고, 10년 이하 자격정지 또는 700만원 이하 벌금이 명시되어 있습니다.</li>
<li>업무위탁에 따른 개인정보 처리 제한과 개인정보취급자 감독에 관한 의원의 규정을 준수합니다(원본 제5항).</li>
<li>재직 중 얻은 영업비밀·정보를 인터넷·USB·SNS로 게시·반출하지 않습니다(원본 제6항).</li>
<li>경제적 가치가 있는 비공개 기술·경영 정보의 보호 지침을 지키고, 연봉과 영업비밀을 승인받은 업무 외 목적으로 사용·공개하지 않습니다(비밀유지 및 정보보안 서약 제1·2항).</li>
<li>승인받지 않은 프로그램·저장매체·처리장치를 사용하지 않고, 문서·사진·PC·전자파일 등 정보자산을 변조·훼손·분실·유출·반출로부터 보호합니다(같은 서약 제3항).</li>
<li>의원 이메일 사용 규정을 지키고 승인 없는 외부 전달을 하지 않으며, 정보 유출 방지를 위한 이메일 관리를 따릅니다(같은 서약 제4항).</li>
<li>재직 중 사전 서면 동의 없이 영업비밀이 누설될 수 있는 동종·유사업체 업무·자문을 하지 않습니다(같은 서약 제5항).</li>
<li>퇴직 시 진료기록부·도표·명세서·파일 등 정보자산을 사본 없이 반납하고, 퇴직 후 1년간 영업비밀 보안유지 의무를 지키며 이를 이용해 이익을 취하지 않습니다(같은 서약 제6항).</li>
<li>위반 시 부정경쟁방지 및 영업비밀보호에 관한 법률, 정보통신망 이용촉진 및 정보보호 등에 관한 법률 등 관련 법령과 의원 규정에 따른 민·형사상·행정상 책임, 징계 및 손해 변상·복구 의무를 부담합니다(의료정보 서약 서문·같은 서약 제7항).</li>
</ol>
<p>서약자: {{성명}} &nbsp; <span data-sign-slot="medical">(의료정보 보안 서명)</span></p>
</section>
<section class="contract-part" data-contract-part="privacy" style="margin-top:32px;border-top:2px solid #156f72;padding-top:16px">
<h2>③ 개인정보 취급자 서약</h2>
<ol>
<li>재직 중 업무상 알게 된 의원 또는 제3자의 개인정보를 누설하지 않습니다.</li>
<li>허가받지 않은 정보·시설에 접근하지 않고 지정된 데이터 처리시설·설비만 이용합니다.</li>
<li>개인정보의 수집·생성·기록·저장·보유·가공·편집·검색·출력·정정·복구·이용·제공·공개·파기 등 처리 전 과정에서 의원 규정과 통제 절차를 지킵니다.</li>
<li>할당받은 ID·비밀번호·출입증·개인정보 처리시스템을 공동 사용하거나 관련 정보를 누설하지 않습니다.</li>
<li>서류·사진·영상·전자파일·저장매체 등 개인정보자산을 안전하게 관리하고 승인받지 않은 프로그램·외장 드라이브·CD·USB를 사용하지 않습니다.</li>
<li>퇴직 시 의원 소유 정보자산을 모두 반납하며, 퇴직 후에도 고객정보와 영업비밀을 누설하지 않습니다.</li>
</ol>
<p>본 서약이 재직 중과 퇴직 후에도 적용됨을 확인합니다.</p>
<p>서약자: {{성명}} &nbsp; <span data-sign-slot="privacy">(개인정보 취급자 서명)</span></p>
</section>
$pledge$,
    sign_slots='[{"who":"employee","part":"employment","signed":false},{"who":"employee","part":"medical","signed":false},{"who":"employee","part":"privacy","signed":false}]'::jsonb
where id=1 and body_html like '%data-sign-slot="employee"%'
  and body_html not like '%data-sign-slot="medical"%';

-- 서로 다른 직원 계약의 날짜·임금·사직 통보기간은 공용 고정값으로 채우지 않는다.
-- 사직 통보기간은 원본 XLSX의 3주와 원본 PDF의 4주가 달라 계약마다 명시적으로 선택한다.
update public.doc_templates
set fields=coalesce(fields,'[]'::jsonb)||jsonb_build_array(
  jsonb_build_object('key','사직서제출기한','label','사직서 제출 기한 (원본별 확인)','type','select','options',jsonb_build_array('3주 전','4주 전'),'required',true),
  jsonb_build_object('key','퇴직임금지급기준','label','퇴직 시 임금 지급 기준 (원본별 확인)','type','select','options',jsonb_build_array('익월 임금지급일','퇴직일이 속한 달에 해당하는 정기급여일'),'required',true),
  jsonb_build_object('key','병원주소','label','사업장 주소','type','text','required',true),
  jsonb_build_object('key','직원이메일','label','직원 이메일 (해당 시)','type','text'),
  jsonb_build_object('key','최초입사일','label','최초 입사일 (해당 시)','type','date'),
  jsonb_build_object('key','주 소정근로시간','label','주 소정근로시간','type','text','required',true),
  jsonb_build_object('key','연봉세전','label','연봉 세전 (해당 계약만)','type','text'),
  jsonb_build_object('key','기본급산정시간','label','기본급 산정 기준/계산식 (해당 시)','type','text'),
  jsonb_build_object('key','기본급','label','기본급','type','text','required',true),
  jsonb_build_object('key','식대','label','식대 (해당 시)','type','text'),
  jsonb_build_object('key','포괄시간외근로수당','label','포괄시간외근로수당 (해당 시)','type','text'),
  jsonb_build_object('key','포괄시간외시간','label','포괄시간외 산정 기준/계산식 (해당 시)','type','text'),
  jsonb_build_object('key','포괄연차수당','label','포괄연차수당 (해당 시)','type','text'),
  jsonb_build_object('key','포괄연차시간','label','포괄연차 산정 기준/계산식 (해당 시)','type','text'),
  jsonb_build_object('key','포괄휴일수당','label','포괄휴일수당 (해당 시)','type','text'),
  jsonb_build_object('key','포괄휴일시간','label','포괄휴일 산정 기준/계산식 (해당 시)','type','text'),
  jsonb_build_object('key','육아수당','label','육아수당 (해당 시)','type','text'),
  jsonb_build_object('key','직책수당','label','직책수당 (해당 시)','type','text'),
  jsonb_build_object('key','포괄휴일연장수당','label','포괄휴일연장수당 (해당 시)','type','text'),
  jsonb_build_object('key','포괄휴일연장시간','label','포괄휴일연장 산정 기준/계산식 (해당 시)','type','text'),
  jsonb_build_object('key','기타수당','label','기타수당 (해당 시)','type','text'),
  jsonb_build_object('key','통상시급','label','통상시급 (해당 시)','type','text')
),
body_html=replace(
  replace(replace(body_html,'사직 희망일로부터 3주 전','사직 희망일로부터 <b>{{사직서제출기한}}</b>'),'익월 임금지급일','<b>{{퇴직임금지급기준}}</b>'),
  '<section class="contract-part" data-contract-part="medical"',
  $extra$
<section class="contract-part" data-contract-part="employment-addenda" style="margin-top:24px">
<h3>근로계약 추가 조건</h3>
<p>사업장 주소 <b>{{병원주소}}</b> · 직원 이메일(해당 시) <b>{{직원이메일}}</b> · 최초 입사일(해당 시) <b>{{최초입사일}}</b></p>
<p>{{기간계약종료문구}}</p>
<ol>
<li>사용자의 승인을 받고 외근할 때 발생한 경비·실비는 사용자가 부담한다.</li>
<li>1주 소정근로시간은 <b>{{주 소정근로시간}}</b> 이내로 한다. 직원은 근무 시작 시 업무에 착수할 수 있어야 하며, 업무 수행 중 지각·조퇴 또는 정당하지 않은 이탈 시 인사상 불이익을 받을 수 있다.</li>
<li>추가 근무는 사용자 명시 승인 후 인정하며 미승인 시간은 근로시간으로 인정하지 않는다. 근로 제공이 불가능할 때에는 사유를 미리 보고·승인받고 해당 시간은 무급으로 처리한다. 질병·경조사로 결근할 때에는 객관적인 증빙 서류를 제출하며, 제출하지 않으면 무단결근으로 본다.</li>
<li>연봉(세전, 해당 계약만) <b>{{연봉세전}}</b>, 기본급 산정 기준/계산식(해당 시) <b>{{기본급산정시간}}</b>, 통상시급(해당 시) <b>{{통상시급}}</b>. 임금 구성은 아래 표와 같으며 해당 없는 항목은 표에서 제외한다. 포괄시간외·연차·휴일·휴일연장 수당의 산정 기준과 가산율은 계약별 포괄내역과 임금 구성값에 따른다. {{임금구성표}}</li>
<li>계약 체결 뒤 변경되는 보험료·세금 등은 해당 근로자 부담분에 반영하며, 중도퇴사·연말정산으로 발생한 환급액은 근로자에게 귀속된다. 세금 변동에 따라 실수령액이 달라질 수 있다.</li>
<li>주휴일은 1주 소정근로일 개근 시 유급이며 사전 고지하여 다른 날로 변경될 수 있다. 근로자의 날과 관계 법령상의 공휴일을 적용하고 휴일이 겹치면 하나의 휴일로 본다. 주휴일·공휴일 근무 시 미리 다른 근무일로 대체 휴무할 수 있다. 1개월 개근 시 발생하는 연차와 휴가일 협의는 관계 법령·병원 사정을 따른다.</li>
<li>기존 계약해지 조항 외 종료 사유: 이력·경력을 위조해 허위 입사, 허락 없는 불법 집단행동의 주도·가담 또는 직장 내 성희롱·괴롭힘 등 물의, 음주 상태 근무 또는 근무 중 음주·병원 신용·명예 훼손, 업무시간 중 개인용무로 경고 2회 누적 또는 고객 컴플레인 3회 이상, 조직 폐지·축소·담당 업무 소멸 등 경영상 감원 불가피, 피성년후견인·피한정후견인·파산선고·자격정지 처분 또는 형사사건 고소·고발에 따른 입건·범죄사실 인정 조사. 사직 승인 없이 출근하지 않으면 수리일까지 무단결근으로 처리한다.</li>
<li>근무 중 업무상 지시 또는 동의를 받아 촬영한 홍보용 사진·영상·음성은 진료 안내·병원 홍보·내부 교육 등에 사용할 수 있다. 이미 제작·배포된 홍보물의 저작권·사용권은 병원에 귀속되며 퇴직 뒤 그 삭제 또는 사용 중지를 요구하지 않는다는 별도 조건을 확인한다.</li>
<li>계약 위반 또는 고의·과실로 병원에 손해를 끼친 경우 배상하며, 근로자의 귀책으로 환자 등 제3자에게 손해를 발생시켜 병원이 배상책임을 지게 되면 관련 민·형사상 책임을 부담한다.</li>
</ol>
</section>
<section class="contract-part" data-contract-part="medical"$extra$
)
where id=1 and body_html like '%data-sign-slot="medical"%'
  and body_html not like '%data-contract-part="employment-addenda"%';

-- 기존 단일 서명 계약과 체결본은 원래 RPC로 처리한다. 신규 통합본만 거부한다.
create or replace function public.apply_employee_contract_signature(
  p_contract_id bigint,p_merged_html text,p_sign_slots jsonb,p_signed_at timestamptz,p_signature_id bigint default null
) returns bigint language plpgsql security definer set search_path=public,pg_temp as $$
declare v_use_id bigint:=null; r public.contracts;
begin
  select * into r from public.contracts where id=p_contract_id and user_id=auth.uid() and status='대기' for update;
  if not found then raise exception 'contract is not pending or not owned by current user'; end if;
  if r.merged_html like '%data-sign-slot="medical"%' then raise exception 'integrated contract requires three independent signatures'; end if;
  if p_signature_id is not null then
    if not exists(select 1 from public.employee_signature_vault v where v.id=p_signature_id and v.user_id=auth.uid() and v.revoked_at is null) then raise exception 'signature is not available to current user'; end if;
    insert into public.employee_signature_uses(contract_id,signature_id,document_kind,confirmed_at,used_by)
      values(p_contract_id,p_signature_id,'근로계약서',p_signed_at,auth.uid())
      on conflict (contract_id,signature_id,document_kind) where contract_id is not null do update set confirmed_at=excluded.confirmed_at,used_by=excluded.used_by returning id into v_use_id;
  end if;
  update public.contracts set merged_html=p_merged_html,sign_slots=p_sign_slots,signed_at=p_signed_at,status='서명완료'
    where id=p_contract_id and user_id=auth.uid() and status='대기';
  return coalesce(v_use_id,0);
end $$;

-- 세 서명을 한 트랜잭션에서 독립적으로 검증·기록하고 나서만 완료한다.
create table if not exists public.contract_part_signatures (
  contract_id bigint not null references public.contracts(id),
  part text not null check(part in ('employment','medical','privacy')),
  user_id uuid not null references public.profiles(user_id),
  signature_hash text not null check(signature_hash ~ '^[0-9a-f]{32}$'),
  stored_signature_id bigint references public.employee_signature_vault(id),
  confirmed_at timestamptz not null,
  primary key(contract_id,part)
);
alter table public.contract_part_signatures enable row level security;
revoke all on public.contract_part_signatures from public,anon,authenticated;
grant select on public.contract_part_signatures to authenticated;
create policy contract_part_signatures_scoped on public.contract_part_signatures for select to authenticated
using (user_id=auth.uid() or public.my_role() in ('owner','chief','manager'));

create or replace function public.apply_integrated_contract_signatures(p_contract_id bigint,p_signatures jsonb)
returns bigint language plpgsql security definer set search_path=public,pg_temp as $$
declare r public.contracts; v_part text; v_item jsonb; v_png text; v_id bigint; v_html text; v_slot text; v_now timestamptz:=now(); v_bytes bytea;
begin
  select * into r from public.contracts where id=p_contract_id and user_id=auth.uid() and status='대기' for update;
  if not found or r.source_pdf_path is not null or r.due_at<now() then raise exception 'contract is not signable'; end if;
  if r.merged_html not like '%data-sign-slot="employment"%' or r.merged_html not like '%data-sign-slot="medical"%' or r.merged_html not like '%data-sign-slot="privacy"%' then raise exception 'three signature slots required'; end if;
  if jsonb_typeof(p_signatures) is distinct from 'array' or jsonb_array_length(p_signatures)<>3 then raise exception 'three signatures required'; end if;
  v_html:=r.merged_html;
  foreach v_part in array array['employment','medical','privacy'] loop
    select value into v_item from jsonb_array_elements(p_signatures) where value->>'part'=v_part;
    if not found or (select count(*) from jsonb_array_elements(p_signatures) where value->>'part'=v_part)<>1 then raise exception 'one signature per part required'; end if;
    v_png:=v_item->>'signature_png';
    if v_png is null or length(v_png)>1400000 or v_png !~ '^data:image/png;base64,[A-Za-z0-9+/]+={0,2}$' then raise exception 'invalid PNG signature'; end if;
    v_bytes:=decode(substr(v_png,23),'base64');
    if octet_length(v_bytes)<100 or octet_length(v_bytes)>1048576 or substring(v_bytes from 1 for 8)<>decode('89504e470d0a1a0a','hex') then raise exception 'invalid PNG bytes'; end if;
    v_id:=nullif(v_item->>'signature_id','')::bigint;
    if v_id is not null then
      if not exists(select 1 from public.employee_signature_vault where id=v_id and user_id=auth.uid() and revoked_at is null) then raise exception 'stored signature unavailable'; end if;
      insert into public.employee_signature_uses(contract_id,signature_id,document_kind,confirmed_at,used_by)
        values(p_contract_id,v_id,case v_part when 'employment' then '근로계약서' when 'medical' then '의료정보 보안 서약서' else '개인정보 취급자 서약서' end,v_now,auth.uid());
    end if;
    insert into public.contract_part_signatures(contract_id,part,user_id,signature_hash,stored_signature_id,confirmed_at)
      values(p_contract_id,v_part,auth.uid(),md5(v_png),v_id,v_now);
    v_slot:=case v_part when 'employment' then '<span data-sign-slot="employment">(직원 서명)</span>' when 'medical' then '<span data-sign-slot="medical">(의료정보 보안 서명)</span>' else '<span data-sign-slot="privacy">(개인정보 취급자 서명)</span>' end;
    if position(v_slot in v_html)=0 then raise exception 'signature position missing: %',v_part; end if;
    v_html:=replace(v_html,v_slot,format('<img src="%s" alt="%s 서명" style="height:60px;vertical-align:middle"> <span>%s</span>',v_png,v_part,to_char(v_now at time zone 'Asia/Seoul','YYYY-MM-DD')));
  end loop;
  update public.contracts set merged_html=v_html,signed_at=v_now,status='서명완료',
    sign_slots='[{"who":"employee","part":"employment","signed":true},{"who":"employee","part":"medical","signed":true},{"who":"employee","part":"privacy","signed":true}]'::jsonb
    where id=p_contract_id and user_id=auth.uid() and status='대기';
  return p_contract_id;
end $$;
revoke all on function public.apply_integrated_contract_signatures(bigint,jsonb) from public,anon,authenticated;
grant execute on function public.apply_integrated_contract_signatures(bigint,jsonb) to authenticated;

-- Edge 함수가 세 서명 이미지를 PDF의 각 좌표에 그린 후, 완료와 세 기록을 원자적으로 저장한다.
create or replace function public.record_integrated_contract_pdf_signatures(
  p_contract_id bigint,p_user_id uuid,p_attempt_id uuid,p_source_sha256 text,p_signed_path text,
  p_signed_sha256 text,p_signature_sha256 text,p_page_no integer,p_x numeric,p_y numeric,p_width numeric,p_height numeric,
  p_signatures jsonb
) returns public.contracts language plpgsql security definer set search_path=public,pg_temp as $$
declare r public.contracts; v_part text; v_item jsonb; v_id bigint;
begin
  select * into r from public.contracts where id=p_contract_id for update;
  if not found or r.user_id is distinct from p_user_id or r.status<>'대기' or r.merged_html not like '%data-sign-slot="employment"%' or r.merged_html not like '%data-sign-slot="medical"%' or r.merged_html not like '%data-sign-slot="privacy"%' then raise exception 'integrated PDF contract unavailable'; end if;
  if jsonb_typeof(p_signatures) is distinct from 'array' or jsonb_array_length(p_signatures)<>3 then raise exception 'three signatures required'; end if;
  foreach v_part in array array['employment','medical','privacy'] loop
    select value into v_item from jsonb_array_elements(p_signatures) where value->>'part'=v_part;
    if not found or (select count(*) from jsonb_array_elements(p_signatures) where value->>'part'=v_part)<>1 or coalesce(v_item->>'signature_hash','') !~ '^[0-9a-f]{64}$' then raise exception 'one valid signature per part required'; end if;
    v_id:=nullif(v_item->>'signature_id','')::bigint;
    if v_id is not null and not exists(select 1 from public.employee_signature_vault where id=v_id and user_id=p_user_id and revoked_at is null) then raise exception 'stored signature unavailable'; end if;
  end loop;
  r:=public.record_contract_pdf_signature(p_contract_id,p_user_id,p_attempt_id,p_source_sha256,p_signed_path,p_signed_sha256,p_signature_sha256,p_page_no,p_x,p_y,p_width,p_height);
  foreach v_part in array array['employment','medical','privacy'] loop
    select value into v_item from jsonb_array_elements(p_signatures) where value->>'part'=v_part;
    v_id:=nullif(v_item->>'signature_id','')::bigint;
    insert into public.contract_part_signatures(contract_id,part,user_id,signature_hash,stored_signature_id,confirmed_at)
      values(p_contract_id,v_part,p_user_id,substr(v_item->>'signature_hash',1,32),v_id,now());
    if v_id is not null then
      insert into public.employee_signature_uses(contract_id,signature_id,document_kind,confirmed_at,used_by)
        values(p_contract_id,v_id,case v_part when 'employment' then '근로계약서' when 'medical' then '의료정보 보안 서약서' else '개인정보 취급자 서약서' end,now(),p_user_id);
    end if;
  end loop;
  update public.contracts set sign_slots='[{"who":"employee","part":"employment","signed":true},{"who":"employee","part":"medical","signed":true},{"who":"employee","part":"privacy","signed":true}]'::jsonb where id=p_contract_id;
  return r;
end $$;
revoke all on function public.record_integrated_contract_pdf_signatures(bigint,uuid,uuid,text,text,text,text,integer,numeric,numeric,numeric,numeric,jsonb) from public,anon,authenticated;
grant execute on function public.record_integrated_contract_pdf_signatures(bigint,uuid,uuid,text,text,text,text,integer,numeric,numeric,numeric,numeric,jsonb) to service_role;

-- 다른 완료 경로가 신규 통합 계약의 일부 서명만으로 끝내지 못하도록 커밋 시 검사한다.
create or replace function public.require_integrated_contract_part_signatures()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if new.status='서명완료' and old.status is distinct from '서명완료'
    and old.merged_html like '%data-sign-slot="employment"%'
    and old.merged_html like '%data-sign-slot="medical"%'
    and old.merged_html like '%data-sign-slot="privacy"%'
    and (select count(*) from public.contract_part_signatures where contract_id=new.id)<>3 then
    raise exception 'integrated contract requires all three recorded signatures';
  end if;
  return new;
end $$;
revoke all on function public.require_integrated_contract_part_signatures() from public,anon,authenticated;
drop trigger if exists integrated_contract_parts_complete on public.contracts;
create constraint trigger integrated_contract_parts_complete after update on public.contracts
deferrable initially deferred for each row execute function public.require_integrated_contract_part_signatures();
