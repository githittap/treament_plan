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
