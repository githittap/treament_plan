-- Editable defaults; existing owner edits are retained.
begin;
insert into public.hub_ui_texts(key,value) values
('pledge.body.title','비밀유지·의료정보 보안·개인정보 취급자 서약서'),
('pledge.body.rules','본인은 취업규칙 등 원내 규정이 근로기준법 제14조에 따라 원내에 게시되어 언제든지 자유롭게 열람할 수 있음을 안내받았으며, 이를 열람하지 않아 생기는 불이익은 본인이 감수함을 확인합니다.'),
('pledge.first','먼저 보안서약을 완료해 주세요'),
('pledge.contract_waiting','근로계약 서명 대기'),
('pledge.retry_pdf','서명 위치 확인 후 근로계약 완료'),
('pledge.pending','대기'),
('pledge.waiting','서약 서명 대기'),
('pledge.progress','서약 {pledge} · 계약 {n}곳 {contract}'),
('pledge.signature','보안서약 별도 서명'),
('pledge.signed_meta','서명 일시 {date} · 버전 {version}'),
('pledge.read','조항을 모두 읽었음'),
('pledge.submit','보안서약 서명 저장'),
('pledge.clear','서약 서명 지우기'),
('pledge.print','서약본 인쇄·PDF 저장'),
('pledge.open','보안서약 서명'),
('pledge.card_title','보안서약 서명'),
('pledge.overview','직원별 보안서약 서명 현황'),
('pledge.finish_pdf','완료본 인쇄·PDF 저장'),
('pledge.stage','근로계약 {n}곳 서명 후 완료'),
('pledge.stage_confirm','보안서약을 완료했습니다. 계약 {n}곳의 서명을 저장하고 근로계약을 완료합니다.'),
('pledge.failed','서약 처리 실패: {msg}'),
('pledge.coordinates','PDF 서명 위치를 확인하세요.'),
('phone.title','폰 알림'),
('phone.on','켬 (기기 {n}대 · 마지막 {date})'),
('phone.off','안 켬'),
('phone.unknown','확인 필요'),
('phone.guide','업무자료 탭 맨 아래 🔔 모바일 알림 → 이 기기에서 알림 받기'),
('pledge.body.clause.1','영업비밀 보호 — 공공연히 알려져 있지 않고 경제적 가치가 있으며 영업·기타 영업활동에 유용한 기술상·경영상 정보를 영업비밀로 보고, 회사의 보호 지침을 철저히 준수함.'),
('pledge.body.clause.2','연봉·영업비밀·개인정보 비밀 유지 — 자신의 연봉수준을 비밀로 지킴. 업무 중 또는 업무와 관계없이 얻은 영업비밀은 지정된 업무에만 사용함. 재직 중·퇴직 후 사적 이용, 개인 SNS 업로드, 회사 안팎 제3자에게 누설·공개하지 않음. 직무상 알게 된 의원·제3자의 개인정보와 진료·간호 중 알게 된 타인의 비밀을 누설·발표하지 않음. 원문 의료법 제19조의 다른 법령에 특별히 규정된 경우의 문구도 유지함.'),
('pledge.body.clause.3','업무 목적의 자원 사용 — 의원 정보·시스템계정·전산망 등의 자원은 업무 외 목적으로 이용하지 않음.'),
('pledge.body.clause.4','전자의무기록 보호 — 원문 의료법 제23조(전자의무기록) 문구: 정당한 사유 없이 전자의무기록에 저장된 개인정보를 탐지하거나 누출·변호·훼손하지 않음. 「변호」는 원문 추출 표기를 그대로 둠.'),
('pledge.body.clause.5','업무상 비밀누설 조항 — 원문 형법 제317조(업무상비밀누설): 의사·한의사·치과의사·약제사·약종상·조산사·변호사·변리사·공인회계사·공증인·대서업자, 그 직무상 보조자 또는 그 직에 있던 자의 업무 처리 중 알게 된 타인의 비밀누설에 관한 문구임. 원문의 3년 이하 징역이나 금고, 10년 이하 자격정지 또는 700만원 이하 벌금 문구를 유지함.'),
('pledge.body.clause.6','위탁 처리와 취급자 감독 — 원문의 개인정보보호법 제26조(업무위탁에 따른 개인정보의 처리제한) 및 제28조(개인정보취급자에 대한 감독) 항목을 유지함.'),
('pledge.body.clause.7','인터넷·USB·SNS 반출 금지 — 재직 중 알게 된 영업비밀·정보를 어떠한 이유로도 인터넷·SNS에 게시하거나 USB 등으로 가져가지 않음.'),
('pledge.body.clause.8','접근·장비·정보자산 보호 — 허가받지 않은 정보·시설에는 접근하지 않으며 원내 지정 데이터 처리시설·설비만 이용함. 승인받지 않은 프로그램, 외장하드·모뎀·녹음기·외장Drive·CD-ROM·비허가 USB 등 정보저장·처리장치를 원내에서 사용하지 않음. 제공받은 문서·서류·사진·영상·PC·전자파일·저장매체·전산장비·통신망 등 정보자산은 무단변조·복사·훼손·분실·유출·무단반출로부터 안전하게 관리하고 업무 외 개인 목적으로 사용하지 않음.'),
('pledge.body.clause.9','E-mail 규정과 관리 동의 — 회사 E-mail의 영업비밀·정보자산 보호, 오남용 방지 및 사용 규정을 준수함. 사전 승인 없이 회사 관련 정보를 개별적으로 외부에 전달·누설하지 않음. 경영정보 유출 방지, 정보통신망의 원활한 운영·유지, 전자메일 오남용 방지를 위한 회사의 관리에 동의함.'),
('pledge.body.clause.10','동종·유사업체 협력 — 재직 중 회사의 사전 서면동의 없이 영업비밀이 누설될 수 있는 동종·유사업체의 임직원을 겸직하거나 자문·고문·그 밖의 방법으로 협력하지 않음.'),
('pledge.body.clause.11','퇴직 때 반환·퇴직 후 비밀 유지 — 퇴직 때 관리하던 진료기록부·도표·명세서·파일·기타 기록매체 등 영업비밀 관련 일체의 정보자산과 의원 소유 정보자산을 모두 반납하고 어떠한 형태의 사본도 개인적으로 보유하지 않음. DOCX의 퇴직 후 1년 영업비밀 보안유지 의무 및 영업비밀을 이용한 이익 취득 금지 문구를 유지함. PDF의 퇴직 후에도 모든 고객정보·영업비밀·누설로 의원에 손해를 줄 수 있는 각종 정보를 일체 누설하지 않는 의무와 재직기간·퇴직 후 적용 문구도 함께 유지함.'),
('pledge.body.clause.12','개인정보 처리 전 과정 — 개인정보의 수집·생성·기록·저장·보유·가공·편집·검색·출력·정점·복구·이용·제공·공개·파기 및 이와 유사한 일체 행위에서 의원 규정·통제절차를 준수함. 「정점」은 원문 추출 표기를 그대로 둠.'),
('pledge.body.clause.13','계정·출입증 공동사용 금지 — 업무에 할당된 사용자 ID·패스워드·출입증·개인정보 처리시스템을 타인과 공동사용하거나 관련 정보를 누설하지 않음.'),
('pledge.body.clause.14','위반 때 책임·변상·복구 — DOCX의 「부정경쟁방지 및 영업비밀보호에 관한 법률」·「정보통신망이용촉진 및 정보보호등에 관한 법률」 등에 규정된 민형사상 책임, 회사 징계조치 및 손해의 지체 없는 변상·복구 서약을 유지함. PDF 머리말의 관련 법령에 따른 민·형사상·행정상 책임, 의원 내규·관련 규정의 징계조치 등 불이익 감수와 손해 변상·복구 문구도 유지함.')
on conflict(key) do nothing;
update public.hub_ui_texts set value='서약 {pledge} · 계약 {n}곳 {contract}' where key='pledge.progress' and value='계약 {n}곳 {contract} · 서약 {pledge}';
update public.hub_ui_texts set value='보안서약 서명 저장' where key='pledge.submit' and value='서약 서명·확인 후 완료';
update public.hub_ui_texts set value='근로계약 {n}곳 서명 후 완료' where key='pledge.stage' and value='계약 {n}서명 저장 후 보안서약으로';
update public.hub_ui_texts set value='보안서약을 완료했습니다. 계약 {n}곳의 서명을 저장하고 근로계약을 완료합니다.' where key='pledge.stage_confirm' and value='계약 {n}곳의 서명을 저장하고 별도 보안서약 서명으로 이어갑니다.';
update public.hub_ui_texts set value='완료본 인쇄·PDF 저장' where key='pledge.finish_pdf' and value='계약·서약 묶음 완료 PDF 만들기';
commit;
