/* hub-texts.js — 직원허브 「⚙️ 허브 설정」(원장 전용) + 허브 전체 글·숫자·목록 덮어쓰기 엔진 (차례 1)
   설계서: Z:\09_claude-output\03_병원운영·전산\직원AI도우미\설계서_허브문구전체.md
   원리(AI 도우미 「📝 안내 문구」와 같음): 화면 코드에 지금 글을 「기본값」으로 남기고, 표에 같은 키가 있으면 그 값으로 바꿔 보여 준다.
   표를 못 읽으면 기본값 그대로(화면이 깨지지 않음). 「기본으로 되돌리기」 = 표의 그 행을 지움(app_settings는 지울 수 없어 기본값을 다시 적음).
   · 글  → 표 hub_ui_texts(db/hub_ui_texts.sql) · 숫자·목록 → 이미 있는 표 app_settings(키만 더함, 표·정책은 안 고침)
   hr.html은 이 파일을 main 스크립트보다 먼저 <script src="hub-texts.js?v=…"> 로 불러온다(함수는 전역 hubText·hubSetting·hubList·HubUi).
   로그인 전 화면 글은 표를 읽을 수 없어 이 엔진을 쓰지 않는다(설계서 5장).
   차례 2: 내 서류함·업무자료 글(hubTextDefsChapter2) + 서류 종류·상태 이름 목록 + 업무자료 카드(app_settings cards.work_materials, 링크는 http(s)만).
   © 2026 Jung · 아산정플란트치과 */
(function(root){
'use strict';

/* hub-texts:test-start */
/* 아래 블록은 DOM·네트워크에 의존하지 않는 순수 함수와 기본값 목록만 둔다(hr.html의 test-start/end 패턴과 동일).
   tests/hub-ui-texts.test.js 가 이 블록만 vm으로 불러 시험한다. */

const HUB_KEY_RE=/^[a-z][a-z0-9_.]{1,80}$/;
const HUB_TEXT_MAX=20000;

function hubEsc(s){return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}

/* ── 글(표 hub_ui_texts) ── */
let HUB_TEXT_OVERRIDES={};
function hubTextSetOverrides(rows){
  const next={};
  (Array.isArray(rows)?rows:[]).forEach(function(r){
    if(r&&typeof r.key==='string'&&typeof r.value==='string'&&r.value.trim()!=='')next[r.key]=r.value;
  });
  HUB_TEXT_OVERRIDES=next;
}
function hubTextOverride(key){
  const has=Object.prototype.hasOwnProperty.call(HUB_TEXT_OVERRIDES,key);
  const v=has?HUB_TEXT_OVERRIDES[key]:null;
  return (typeof v==='string'&&v.trim()!=='')?v:null;
}
function hubTextPutOverride(key,value){const next=Object.assign({},HUB_TEXT_OVERRIDES);next[key]=value;HUB_TEXT_OVERRIDES=next;}
function hubTextDropOverride(key){const next=Object.assign({},HUB_TEXT_OVERRIDES);delete next[key];HUB_TEXT_OVERRIDES=next;}
// {이름} 자리표시자를 값으로 바꾼다. vars에 없는 자리표시자는 그대로 둔다.
function hubFill(text,vars){
  if(!vars)return String(text);
  return String(text).replace(/\{([a-z_]+)\}/g,function(m,k){return Object.prototype.hasOwnProperty.call(vars,k)?String(vars[k]):m;});
}
// 화면 글: 표에 값이 있으면 그 글, 없으면(또는 읽기 실패) 코드의 기본값.
function hubText(key,def,vars){const v=hubTextOverride(key);return hubFill(v==null?def:v,vars);}
// HTML 안에 줄바꿈이 있는 긴 글을 넣을 때: 글자는 이스케이프하고 줄바꿈만 <br>로.
function hubTextHtml(key,def,vars){return hubEsc(hubText(key,def,vars)).replace(/\r?\n/g,'<br>');}

/* ── 숫자·목록(표 app_settings) — 호스트(hr.html)의 SETTINGS 객체를 그대로 가리킨다 ── */
let HUB_SETTING_VALUES={};
function hubSettingSetValues(obj){HUB_SETTING_VALUES=(obj&&typeof obj==='object')?obj:{};}
function hubSetting(key,def){
  const v=HUB_SETTING_VALUES[key];
  return (typeof v==='string'&&v.trim()!=='')?v:def;
}
function hubSettingNumber(key,def){
  const n=Number(hubSetting(key,String(def)));
  return Number.isFinite(n)?n:def;
}
// 목록: [{code,label}]. 코드는 고정이고 보이는 이름(label)만 고친다. 모양이 틀리면 기본 목록.
function hubListParse(raw){
  let a;
  try{a=JSON.parse(raw);}catch(e){return null;}
  if(!Array.isArray(a)||!a.length)return null;
  const seen={},out=[];
  for(let i=0;i<a.length;i++){
    const it=a[i];
    if(!it||typeof it.code!=='string'||typeof it.label!=='string')return null;
    const code=it.code.trim(),label=it.label.trim();
    if(!code||!label||code.length>40||label.length>40||seen[code])return null;
    seen[code]=true;out.push({code:code,label:label});
  }
  return out;
}
function hubList(key,defItems){
  const def=(defItems||[]).map(function(i){return {code:i.code,label:i.label};});
  const raw=HUB_SETTING_VALUES[key];
  if(typeof raw!=='string'||raw.trim()==='')return def;
  const stored=hubListParse(raw);
  if(!stored)return def;
  const byCode={};stored.forEach(function(i){byCode[i.code]=i;});
  const out=def.map(function(d){return {code:d.code,label:byCode[d.code]?byCode[d.code].label:d.label};});
  const defCodes={};def.forEach(function(d){defCodes[d.code]=true;});
  stored.forEach(function(i){if(!defCodes[i.code])out.push({code:i.code,label:i.label});});
  return out;
}

/* ── 기본값 목록: 키·어디에 보이는지·기본 글. 화면 코드(hr.html)의 기본값과 같아야 한다(시험이 대조). ── */
const HUB_TAB_DEFAULTS=[
  ['home','홈'],['ai','🤖 AI 도우미'],['att','출퇴근'],['deposit','입금'],['sched','근무표'],['leave','연차'],['appr','결재함'],['notice','공지'],
  ['workdocs','📚 업무자료'],['calendar','📅 캘린더'],['suggestions','💡 건의함'],['onbo','내 서류함'],['confid','진료기록'],['inbox','📥 문의함'],
  ['consult','🗂 상담일지'],['contract','근로계약서'],['pay','💰 급여'],['aicost','💰 AI비용'],['owner','🛡️ 계정·권한 관리'],['ownerboards','📒 원장 보기판'],['hubset','⚙️ 허브 설정']
];
const HUB_MENU_DEFAULTS=[['g_work','🕘 근무'],['g_owner','🔒 원장 전용'],['g_care','🩺 환자관리·진료'],['g_docs','🏖 연차·결재·서류']];
const HUB_INVITE_DEFAULT='아산정플란트치과 직원허브 가입 안내입니다.\n\n1) 아래 링크로 접속해 회원가입 해주세요.\nhttps://jung-plant.com/hr.html\n2) 회원가입 후 원장 승인을 기다려 주세요.\n3) 승인되면 같은 링크에서 로그인하시면 됩니다.';
const HUB_NEXT_BODY_DEFAULT='M2 근무표·계약서 자동생성 · M3 급여 대시보드/명세서 발행·월말 평가·휴일근로 계산기 · M4 채용·입금피드·기공차트 통합\n— 백엔드(표)는 이미 준비됨. 화면만 순차 추가.';
// ── 차례 2: 내 서류함 + 업무자료 글(기본 글은 hr.html의 글과 같아야 함 — 시험이 대조) ──
function hubTextDefsChapter2(add){
  const S1='📚 업무자료';
  const S2='📚 업무자료 › 직원 허브 사용 설명서';
  const S3='📚 업무자료 › 모바일 알림';
  const S4='📎 내 서류함 › 신입 첫날 안내';
  const S5='📎 내 서류함 › 입사 제출물';
  const S6='📎 내 서류함 › 공통 입사 체크리스트';
  const S7='📎 내 서류함 › 서류함(올리기·목록)';
  const S8='📎 내 서류함 › 결제 요청';
  const S9='📎 내 서류함 › 개인서명 보관함';
  const S10='📎 내 서류함 › 지문 등록 확인';
  const S11='📎 내 서류함 › 입사 체크 현황(실장·매니저)';
  add('workdoc.title',S1,'화면 맨 위 큰 제목','📚 업무자료');
  add('workdoc.hint',S1,'제목 아래 설명','직원 업무에 필요한 공개 자료를 한곳에서 확인합니다.');
  add('workdoc.guide_card.label',S1,'「사용 설명서」 카드 맨 위 작은 이름','직원용 안내');
  add('workdoc.guide_card.title',S1,'「사용 설명서」 카드 제목','직원 허브 사용 설명서');
  add('workdoc.guide_card.desc',S1,'「사용 설명서」 카드 설명','홈·근무표·연차·결재·서류함을 처음 사용하는 방법을 확인합니다.');
  add('workdoc.guide_card.button',S1,'「사용 설명서」 카드 단추 글','업무자료 설명서 열기');
  add('workdoc.search.placeholder',S1,'자료 검색칸 안에 흐리게 보이는 안내 글','자료 검색');
  add('workdoc.open',S1,'자료 카드 아래 「열기」 링크 글(카드 목록은 📋 목록 탭에서 고침)','열기 ↗');
  add('workdoc.empty',S1,'검색했는데 맞는 자료가 없을 때 뜨는 글','검색 결과가 없습니다.');
  add('workdoc.guide.breadcrumb',S2,'설명서 맨 위 현재 위치 표시','업무자료 | 직원 허브 사용 설명서');
  add('workdoc.guide.title',S2,'설명서 큰 제목','직원 허브 사용 설명서');
  add('workdoc.guide.lead',S2,'설명서 큰 제목 아래 한 줄 안내','매일 필요한 메뉴를 짧게 따라가 보세요. 보이는 메뉴만 사용하면 됩니다.');
  add('workdoc.guide.close',S2,'설명서 오른쪽 위 「돌아가기」 단추','← 업무자료로 돌아가기');
  add('workdoc.guide.flow_label',S2,'4칸 동선 띠의 화면 읽기용 이름(눈에는 안 보임)','직원 허브 기본 동선');
  add('workdoc.guide.flow1',S2,'4칸 동선 띠 — 1번 칸','홈');
  add('workdoc.guide.flow2',S2,'4칸 동선 띠 — 2번 칸','근무표·연차');
  add('workdoc.guide.flow3',S2,'4칸 동선 띠 — 3번 칸','결재·공지');
  add('workdoc.guide.flow4',S2,'4칸 동선 띠 — 4번 칸','자료·서류');
  add('workdoc.guide.caption',S2,'동선 띠 아래 안내 글','위쪽 메뉴에서 원하는 화면을 고르고, 카드 안의 버튼을 누르면 해당 작업으로 이동합니다. 아래 사진은 실제 직원 허브 화면입니다.');
  add('workdoc.guide.s1.title',S2,'1번 단계(홈) 제목','🏠 홈에서 할 일 확인');
  add('workdoc.guide.s1.body',S2,'1번 단계(홈) 설명','홈에서 오늘 확인할 공지, 남은 연차, 미제출 서류를 먼저 봅니다.');
  add('workdoc.guide.s1.cap',S2,'1번 단계 사진 아래 설명','실제 화면: 홈');
  add('workdoc.guide.s2.title',S2,'2번 단계(근무표) 제목','🗓 근무표 확인');
  add('workdoc.guide.s2.body',S2,'2번 단계(근무표) 설명','근무표에서 내 근무일과 시간을 확인합니다. 날짜를 누르면 자세한 내용이 보입니다.');
  add('workdoc.guide.s2.cap',S2,'2번 단계 사진 아래 설명','실제 화면: 근무표');
  add('workdoc.guide.s3.title',S2,'3번 단계(연차) 제목','🌿 연차 신청·확인');
  add('workdoc.guide.s3.body',S2,'3번 단계(연차) 설명 — 한 줄이 목록 한 칸(줄바꿈으로 나눔)','연차 화면에서 종류와 날짜를 입력해 신청합니다.\n승인된 연차는 캘린더 안의 연차 보기에서 확인합니다.\n공휴일 표시는 병원 휴무 의미가 아닐 수 있습니다.');
  add('workdoc.guide.s3.cap',S2,'3번 단계 사진 아래 설명','실제 화면: 연차');
  add('workdoc.guide.s4.title',S2,'4번 단계(결재) 제목','🖊 결재 문서 올리기·상태 확인');
  add('workdoc.guide.s4.body',S2,'4번 단계(결재) 설명','결재에서 제목과 내용을 입력해 문서를 올립니다. 내가 올린 문서의 진행·완결·반려 상태를 확인할 수 있습니다.');
  add('workdoc.guide.s4.cap',S2,'4번 단계 사진 아래 설명','실제 화면: 결재함');
  add('workdoc.guide.s5.title',S2,'5번 단계(공지) 제목','📢 공지 확인');
  add('workdoc.guide.s5.body',S2,'5번 단계(공지) 설명','공지에서 병원 안내와 새 소식을 확인합니다. 제목과 본문을 읽고 필요한 경우 전문 링크를 엽니다.');
  add('workdoc.guide.s5.cap',S2,'5번 단계 사진 아래 설명','실제 화면: 공지');
  add('workdoc.guide.s6.title',S2,'6번 단계(업무자료) 제목','📚 업무자료 보기');
  add('workdoc.guide.s6.body',S2,'6번 단계(업무자료) 설명','업무자료에서 매뉴얼과 필요물품 요청·구매현황을 검색해 엽니다. 이 설명서도 업무자료 안에서 다시 열 수 있습니다.');
  add('workdoc.guide.s6.cap',S2,'6번 단계 사진 아래 설명','실제 화면: 업무자료');
  add('workdoc.guide.s7.title',S2,'7번 단계(건의함) 제목','💡 건의함 사용');
  add('workdoc.guide.s7.body',S2,'7번 단계(건의함) 설명','건의함에서 글을 쓰고 다른 글에 좋아요를 누릅니다. 월간 시상은 캠페인 종료 후 공개되는 안내를 확인합니다.');
  add('workdoc.guide.s8.title',S2,'8번 단계(내 서류함) 제목','📎 내 서류함·계약서 열람');
  add('workdoc.guide.s8.body',S2,'8번 단계(내 서류함) 설명','내 서류함에서 필요한 서류를 제출합니다. 직원 서류함에서는 올린 서류와 체결된 근로계약서를 열람할 수 있습니다.');
  add('workdoc.guide.footer',S2,'설명서 맨 아래 작은 안내','ℹ️ 본인에게 보이지 않는 메뉴는 권한 차이입니다. 필요한 메뉴가 보이지 않으면 관리자에게 문의하세요.');
  add('workdoc.push.title',S3,'카드 제목','🔔 모바일 알림');
  add('workdoc.push.subscribe',S3,'「알림 받기」 단추 글','이 기기에서 알림 받기');
  add('workdoc.push.not_ready',S3,'알림 준비가 안 됐을 때 카드 안에 보이는 글','🔧 발송키 준비 중입니다. 준비되면 이 카드에서 등록할 수 있습니다.');
  add('workdoc.push.unsubscribe',S3,'「구독 해제」 단추 글','내 구독 해제');
  add('workdoc.push.m_not_ready',S3,'알림 받기를 눌렀는데 아직 준비 전일 때 뜨는 글','발송키 준비 중입니다. 준비되면 다시 시도하세요.');
  add('workdoc.push.m_unsupported',S3,'브라우저가 알림을 지원하지 않을 때 뜨는 글','이 브라우저는 알림을 지원하지 않습니다.');
  add('workdoc.push.m_denied',S3,'알림 권한을 거부했을 때 뜨는 글','알림 권한이 거부되어 등록할 수 없습니다.');
  add('workdoc.push.m_reg_fail',S3,'등록에 실패했을 때 — {detail}은 실패 이유','등록 실패: {detail}',['detail']);
  add('workdoc.push.m_registered',S3,'등록에 성공했을 때 뜨는 글','이 기기에서 알림을 받도록 등록했습니다.');
  add('workdoc.push.m_reg_error',S3,'등록 중 예상 못 한 오류 — {detail}은 오류 이유','등록 중 오류: {detail}',['detail']);
  add('workdoc.push.m_un_unsupported',S3,'해제를 지원하지 않는 브라우저일 때 뜨는 글','이 브라우저는 Push 해제를 지원하지 않습니다.');
  add('workdoc.push.m_un_none',S3,'이 브라우저에 구독이 없을 때 뜨는 글','이 브라우저의 구독이 없어 저장 기록을 일괄 삭제하지 않았습니다.');
  add('workdoc.push.m_un_db_fail',S3,'해제 중 저장 기록 삭제에 실패했을 때 — {detail}은 이유','해당 저장 기록 삭제 실패: {detail}; 브라우저 구독은 유지됐으니 다시 시도하세요.',['detail']);
  add('workdoc.push.m_un_browser_fail',S3,'저장 기록은 지웠는데 브라우저 해제에 실패했을 때','저장 기록은 삭제됐지만 브라우저 구독 해제에 실패했습니다. 이 버튼을 다시 눌러 해제를 재시도하세요.');
  add('workdoc.push.m_un_done',S3,'해제에 성공했을 때 뜨는 글','이 브라우저의 구독과 해당 저장 기록을 해제했습니다.');
  add('workdoc.push.m_un_error',S3,'해제 중 예상 못 한 오류 — {detail}은 오류 이유','구독 해제 중 오류: {detail}',['detail']);
  add('onbo.guide.title',S4,'「신입 첫날 안내」 접힌 제목 — {n}은 항목 수(홈 화면에도 같은 제목)','🧭 신입 첫날 안내 ({n}개)',['n']);
  add('onbo.guide.hint',S4,'제목 아래 설명(홈 화면에도 같은 글)','가입 직후 확인하는 공통 안내입니다. 실장·매니저도 신규 직원에게 같은 내용을 안내합니다.');
  add('onbo.guide.items',S4,'★ 신입 첫날 안내 항목들 — 한 줄이 항목 하나(번호는 화면이 붙임). 줄을 지우거나 더해도 됨(홈 화면에도 같은 글)','병원 시설을 둘러보고 식당·출퇴근 기록 장치 등 기본 시설 사용법을 안내받는다.\n조직도, 호칭, 기본 예절, 업무 분장, 근로계약과 복리후생 설명을 듣는다.\n무전기를 지급받으면 담당자에게 사용법과 업무용 대화 범위를 확인한다.\n소속 부서의 담당자, 보고 라인, 당일 교육 항목을 확인한다.\n기본 도구와 오픈·마감 절차를 확인한다.\n무전은 들었다는 뜻으로 최초 1회 응답한다.\n진료실·데스크에서 큰 소리의 사담을 피하고, 환자 앞에서 치료계획 변경이나 내부 판단을 논의하지 않으며 필요한 설명과 양해를 먼저 제공한다.\n환자가 언제 어떻게 납부하기로 했는지, 비급여 차감 등 금액 관련 사항이 있으면 상담·데스크 기록을 일치시킨다.\n대기시간과 환자 동선을 안내하고 접수 후 어디에서 기다리는지 분명히 설명한다.\n컴플레인은 말을 끊지 않고 듣고, 담당자에게 즉시 보고한 뒤 단독으로 확정 약속하지 않는다.\n상담 전 최신 수가표와 내부 설명 자료의 사용 범위를 담당자에게 확인한다.\n신환은 구강포토와 상담 차트를 준비하고 지정 위치에 기록·스캔한다.\n임플란트 식립 후 1차 내원은 s/o 또는 드레싱, 2차 내원은 3주 후, 3차 내원은 6주 후로 안내한다.\n사용한 기구와 재료는 원래 위치에 정리하고 오픈·마감 시 정리 항목을 체크한다.\n치료 후 다음 계획 또는 정기검진·불편 시 내원 등 후속 계획을 기록한다.');
  add('onbo.items.title',S5,'카드 제목','📋 내 입사 제출물');
  add('onbo.items.th_item',S5,'표 머리 — 첫 칸','항목');
  add('onbo.items.th_status',S5,'표 머리 — 둘째 칸','상태');
  add('onbo.items.required',S5,'필수 항목 옆 작은 글','(필수)');
  add('onbo.items.btn_submit',S5,'「제출함」 단추 글','제출함');
  add('onbo.items.btn_confirm',S5,'실장·매니저가 보는 「확인」 단추 글','확인');
  add('onbo.items.new_placeholder',S5,'새 제출 항목 입력칸 안내 글(실장·매니저에게만 보임)','새 제출 항목');
  add('onbo.items.btn_add',S5,'「항목 추가」 단추 글(실장·매니저에게만 보임)','항목 추가');
  add('onbo.check.title',S6,'카드 제목','✅ 공통 입사 체크리스트');
  add('onbo.check.hint',S6,'제목 아래 설명','계좌번호는 은행명과 계좌번호가 모두 있어야 완료입니다. Notion은 ID, 앱 설치, 워크스페이스 로그인 확인이 모두 있어야 완료입니다. 잠복결핵·자격증·보안서약은 파일을 올리면 완료됩니다.');
  add('onbo.check.th_item',S6,'표 머리 — 항목','항목');
  add('onbo.check.th_rule',S6,'표 머리 — 완료 기준','완료 기준');
  add('onbo.check.th_state',S6,'표 머리 — 상태','상태');
  add('onbo.check.row1.label',S6,'1번 줄(계좌) 항목 이름','급여 계좌');
  add('onbo.check.row1.rule',S6,'1번 줄(계좌) 완료 기준','은행명과 계좌번호');
  add('onbo.check.row2.label',S6,'2번 줄(Notion) 항목 이름','Notion');
  add('onbo.check.row2.rule',S6,'2번 줄(Notion) 완료 기준','ID·앱 설치·워크스페이스 로그인');
  add('onbo.check.row3.label',S6,'3번 줄(자격증) 항목 이름','자격증');
  add('onbo.check.row3.rule',S6,'3번 줄(자격증) 완료 기준','파일');
  add('onbo.check.row4.label',S6,'4번 줄(잠복결핵) 항목 이름','잠복결핵');
  add('onbo.check.row4.rule',S6,'4번 줄(잠복결핵) 완료 기준','파일');
  add('onbo.check.row5.label',S6,'5번 줄(보안서약) 항목 이름','보안서약');
  add('onbo.check.row5.rule',S6,'5번 줄(보안서약) 완료 기준','파일 또는 허브 서명');
  add('onbo.check.state_done',S6,'상태 칸 — 끝난 것(입사 체크 현황에도 같은 글)','완료');
  add('onbo.check.state_need',S6,'상태 칸 — 아직인 것(입사 체크 현황에도 같은 글)','확인 필요');
  add('onbo.check.f_bank',S6,'입력칸 이름 — 은행','은행명');
  add('onbo.check.f_account',S6,'입력칸 이름 — 계좌번호','계좌번호');
  add('onbo.check.f_notion',S6,'입력칸 이름 — Notion ID','Notion ID');
  add('onbo.check.f_app',S6,'체크칸 이름 — 앱 설치','앱 설치 확인');
  add('onbo.check.f_workspace',S6,'체크칸 이름 — 워크스페이스 로그인','워크스페이스 로그인 확인');
  add('onbo.check.btn_save',S6,'저장 단추 글','체크리스트 정보 저장');
  add('onbo.check.m_save_fail',S6,'저장에 실패했을 때 — {detail}은 이유','체크리스트 저장 실패: {detail}',['detail']);
  add('onbo.docs.title',S7,'카드 제목','📎 서류함');
  add('onbo.docs.hint',S7,'제목 아래 설명','어떤 서류든 여기로 올리시면 됩니다. 직원서류와 연차증빙, 결재 요청을 종류별로 한 화면에서 확인합니다.');
  add('onbo.docs.filter_label',S7,'필터 단추 줄의 화면 읽기용 이름(눈에는 안 보임)','서류함 필터');
  add('onbo.docs.filter_all',S7,'필터 단추 — 전체','전체 문서');
  add('onbo.docs.filter_staff',S7,'필터 단추 · 올릴 종류 고르는 칸 · 표의 종류 칸 — 직원서류','직원서류');
  add('onbo.docs.filter_leave',S7,'필터 단추 · 올릴 종류 고르는 칸 · 표의 종류 칸 — 연차증빙','연차증빙');
  add('onbo.docs.filter_approval',S7,'필터 단추 — 결재 요청','결재 요청');
  add('onbo.docs.btn_leave',S7,'「연차 신청」 단추 글','연차 신청');
  add('onbo.docs.btn_approval',S7,'「결재 올리기」 단추 글','결재 올리기');
  add('onbo.docs.err_docs',S7,'서류 목록을 못 불러왔을 때 — {detail}은 이유','서류함을 불러오지 못했습니다: {detail}',['detail']);
  add('onbo.docs.err_contracts',S7,'계약서 목록을 못 불러왔을 때 — {detail}은 이유','체결된 근로계약서를 불러오지 못했습니다: {detail}',['detail']);
  add('onbo.docs.err_leave',S7,'연차 증빙을 못 불러왔을 때 — {detail}은 이유','연차 증빙을 불러오지 못했습니다: {detail}',['detail']);
  add('onbo.docs.err_approval',S7,'결재 요청을 못 불러왔을 때 — {detail}은 이유','결재 요청을 불러오지 못했습니다: {detail}',['detail']);
  add('onbo.docs.th_staff',S7,'표 머리 — 직원(실장·매니저에게만 보임)','직원');
  add('onbo.docs.th_kind',S7,'표 머리 — 종류','종류');
  add('onbo.docs.th_doc',S7,'표 머리 — 문서','문서');
  add('onbo.docs.th_date',S7,'표 머리 — 날짜','날짜');
  add('onbo.docs.th_state',S7,'표 머리 — 상태·열기','상태·열기');
  add('onbo.docs.open',S7,'표의 「열기」 단추 글','열기');
  add('onbo.docs.open_issued',S7,'재직증명서가 발급된 줄의 단추 글','발급본 열기');
  add('onbo.docs.approval_row',S7,'표의 종류 칸 — 결재 요청 줄. {kind}은 결재 종류 이름','결재 요청 · {kind}',['kind']);
  add('onbo.docs.empty_filter',S7,'고른 종류의 문서가 없을 때 표 안에 뜨는 글','해당 종류의 문서가 없습니다.');
  add('onbo.docs.empty_all',S7,'올린 서류가 하나도 없을 때 뜨는 글','올린 서류가 없습니다.');
  add('onbo.docs.f_scope',S7,'올리기 칸 이름 — 올릴 종류','올릴 종류');
  add('onbo.docs.f_staff',S7,'올리기 칸 이름 — 직원(실장·매니저에게만 보임)','직원');
  add('onbo.docs.f_type',S7,'올리기 칸 이름 — 서류 종류(고르는 항목은 📋 목록 탭에서 고침)','서류 종류');
  add('onbo.docs.f_leave_req',S7,'올리기 칸 이름 — 내 연차 신청','내 연차 신청');
  add('onbo.docs.f_file',S7,'올리기 칸 이름 — 파일','파일');
  add('onbo.docs.btn_upload',S7,'올리기 단추 글','서류 올리기');
  add('onbo.docs.btn_upload_leave',S7,'「연차증빙」을 골랐을 때 올리기 단추 글','연차 증빙 올리기');
  add('onbo.docs.m_uploading',S7,'올리는 중에 뜨는 글','업로드 중…');
  add('onbo.docs.m_upload_fail',S7,'파일 올리기에 실패했을 때 — {detail}은 이유','파일 업로드 실패: {detail}',['detail']);
  add('onbo.docs.m_save_fail',S7,'서류 목록 저장에 실패했을 때 — {detail}은 이유','서류 목록 저장 실패: {detail}',['detail']);
  add('onbo.docs.m_leave_pick',S7,'연차 신청을 안 골랐을 때 뜨는 글','내 연차 신청을 먼저 선택하세요.');
  add('onbo.docs.m_leave_save_fail',S7,'연차 증빙 저장에 실패했을 때 — {detail}은 이유','연차 신청 증빙 저장 실패: {detail}',['detail']);
  add('onbo.docs.a_not_found',S7,'서류를 못 찾았을 때 뜨는 알림','서류를 찾지 못했습니다.');
  add('onbo.docs.a_leave_not_found',S7,'연차 증빙을 못 찾았을 때 뜨는 알림','연차 신청 증빙을 찾지 못했습니다.');
  add('onbo.docs.a_open_fail',S7,'파일을 못 열었을 때 뜨는 알림 — {detail}은 이유','파일을 열지 못했습니다: {detail}',['detail']);
  add('onbo.docs.v_pick',S7,'올릴 파일을 안 골랐을 때 뜨는 글','파일을 선택하세요.');
  add('onbo.docs.v_empty',S7,'내용이 없는(0바이트) 파일을 골랐을 때 뜨는 글','0바이트 파일은 올릴 수 없습니다.');
  add('onbo.docs.v_size',S7,'파일이 너무 클 때 뜨는 글(실제 한도는 10MB로 고정이라 숫자를 바꿔도 한도는 안 바뀜)','파일은 10MB 이하만 올릴 수 있습니다.');
  add('onbo.docs.v_blocked',S7,'실행 파일·압축 파일을 골랐을 때 뜨는 글','실행 파일·압축 파일은 올릴 수 없습니다.');
  add('onbo.docs.v_tb',S7,'잠복결핵 검사서에 PDF·이미지가 아닌 파일을 골랐을 때 뜨는 글','잠복결핵 검사서는 PDF 또는 이미지(PNG/JPG/GIF) 파일만 올릴 수 있습니다.');
  add('onbo.pay.title',S8,'카드 제목','💳 결제 요청');
  add('onbo.pay.hint',S8,'제목 아래 설명','금액·계좌·영수증은 요청자와 결재선(실장 → 원장)만 볼 수 있습니다.');
  add('onbo.pay.err',S8,'결제 요청 목록을 못 불러왔을 때 — {detail}은 이유','결제 요청 연결 대기: {detail}',['detail']);
  add('onbo.pay.th_item',S8,'표 머리 — 결제건','결제건');
  add('onbo.pay.th_amount',S8,'표 머리 — 금액','금액');
  add('onbo.pay.th_status',S8,'표 머리 — 상태','상태');
  add('onbo.pay.th_receipt',S8,'표 머리 — 영수증','영수증');
  add('onbo.pay.th_act',S8,'표 머리 — 결재','결재');
  add('onbo.pay.none',S8,'영수증이 없을 때 표 안 글','없음');
  add('onbo.pay.btn_approve',S8,'결재선에게 보이는 「승인」 단추 글','승인');
  add('onbo.pay.btn_reject',S8,'결재선에게 보이는 「반려」 단추 글','반려');
  add('onbo.pay.empty',S8,'결제 요청이 없을 때 뜨는 글','내 결제 요청이 없습니다.');
  add('onbo.pay.f_item',S8,'입력칸 이름 — 결제건(사유)','결제건(사유) *');
  add('onbo.pay.f_amount',S8,'입력칸 이름 — 결제금액','결제금액 *');
  add('onbo.pay.f_deadline',S8,'입력칸 이름 — 결제마감일','결제마감일');
  add('onbo.pay.f_bank',S8,'입력칸 이름 — 결제은행','결제은행 *');
  add('onbo.pay.f_holder',S8,'입력칸 이름 — 예금주','예금주 *');
  add('onbo.pay.f_account',S8,'입력칸 이름 — 계좌번호','계좌번호 *');
  add('onbo.pay.f_files',S8,'입력칸 이름 — 영수증·파일','영수증·파일');
  add('onbo.pay.btn_submit',S8,'요청 단추 글','실장·원장에게 결제 요청');
  add('onbo.pay.m_missing',S8,'빠진 칸이 있을 때 뜨는 글','결제건·금액·은행·예금주·계좌번호를 입력하세요.');
  add('onbo.pay.m_saving',S8,'저장하는 중에 뜨는 글','결제 요청 저장 중…');
  add('onbo.pay.m_fail',S8,'요청에 실패했을 때 — {detail}은 이유','결제 요청 실패: {detail}',['detail']);
  add('onbo.pay.m_receipt_up_fail',S8,'영수증 올리기에 실패했을 때 — {detail}은 이유','영수증 업로드 실패: {detail}',['detail']);
  add('onbo.pay.m_receipt_link_fail',S8,'영수증 연결에 실패했을 때 — {detail}은 이유','영수증 연결 실패: {detail}',['detail']);
  add('onbo.pay.p_reject_reason',S8,'반려를 누르면 뜨는 사유 입력창 안내','반려 사유를 입력하세요.');
  add('onbo.pay.a_act_fail',S8,'승인·반려에 실패했을 때 뜨는 알림 — {detail}은 이유','결재 처리 실패: {detail}',['detail']);
  add('onbo.pay.status_unknown',S8,'상태 이름을 모르는 값일 때 표 안 글(상태 이름 자체는 📋 목록 탭에서 고침)','알 수 없음');
  add('onbo.sign.title',S9,'카드 제목','✍ 개인서명 보관함');
  add('onbo.sign.not_connected',S9,'보관함이 아직 연결되지 않았을 때 뜨는 글','개인서명 보관함이 아직 연결되지 않았습니다.');
  add('onbo.sign.hint',S9,'제목 아래 설명','개인서명은 일반 직원서류와 분리된 비공개 보관함에 저장됩니다. 문서에 복사할 때는 문서별 명시적 확인과 감사기록이 필요합니다.');
  add('onbo.sign.count',S9,'저장된 개인서명이 있을 때 — {n}은 개수','저장된 개인서명 {n}개',['n']);
  add('onbo.sign.none',S9,'저장된 개인서명이 없을 때 뜨는 글','저장된 개인서명이 없습니다.');
  add('onbo.sign.f_file',S9,'파일 칸 이름','PNG 서명 파일');
  add('onbo.sign.btn',S9,'보관 단추 글','개인서명 보관');
  add('onbo.sign.m_bad',S9,'파일이 PNG가 아니거나 1MB를 넘을 때 뜨는 글','1MB 이하 PNG 서명 파일만 보관할 수 있습니다.');
  add('onbo.sign.m_up_fail',S9,'올리기에 실패했을 때 — {detail}은 이유','개인서명 업로드 실패: {detail}',['detail']);
  add('onbo.sign.m_save_fail',S9,'목록 저장에 실패했을 때 — {detail}은 이유','개인서명 목록 저장 실패: {detail}',['detail']);
  add('onbo.fp.title',S10,'카드 제목','🖐 지문 등록 확인');
  add('onbo.fp.hint',S10,'제목 아래 설명','직원이 등록을 보고하면 매니저가 확인·승인해야 완료됩니다.');
  add('onbo.fp.status_done',S10,'내 상태 표시 — 완료','완료');
  add('onbo.fp.status_rejected',S10,'내 상태 표시 — 반려','반려');
  add('onbo.fp.status_pending',S10,'내 상태 표시 — 승인 기다리는 중','매니저 승인 대기');
  add('onbo.fp.btn_report',S10,'「등록 완료 보고」 단추 글','지문 등록 완료 보고');
  add('onbo.fp.pending_count',S10,'승인할 사람에게 보이는 줄 — {n}은 건수','승인 대기 {n}건',['n']);
  add('onbo.fp.btn_approve',S10,'승인할 사람에게 보이는 「매니저 승인」 단추 글','매니저 승인');
  add('onbo.fp.m_reported',S10,'보고를 마쳤을 때 뜨는 글','매니저에게 보고했습니다. 승인 후 완료됩니다.');
  add('onbo.fp.m_fail',S10,'보고에 실패했을 때 — {detail}은 이유','지문 등록 보고 실패: {detail}',['detail']);
  add('onbo.over.title',S11,'카드 제목','👀 입사 체크 현황');
  add('onbo.over.sub',S11,'제목 옆 작은 글','(chief·manager)');
  add('onbo.over.th_name',S11,'표 머리 — 직원','직원');
  add('onbo.over.th_common',S11,'표 머리 — 공통 체크','공통 체크');
  add('onbo.over.th_miss',S11,'표 머리 — 미제출','미제출');
  add('onbo.over.common',S11,'공통 체크 칸 글 — {bank}·{notion}은 완료/확인 필요 글로 채워짐','계좌 {bank} · Notion {notion}',['bank','notion']);
  add('onbo.over.all_done',S11,'전원이 제출했을 때 뜨는 글','전원 제출 완료');
  add('onbo.over.hint',S11,'카드 맨 아래 설명','chief·manager는 완료 여부를 안내·점검하며 계좌번호 원문은 보지 않습니다.');
}
let HUB_TEXT_DEFS_CACHE=null;
function hubTextDefs(){
  if(HUB_TEXT_DEFS_CACHE)return HUB_TEXT_DEFS_CACHE;
  const defs=[];
  const add=function(key,screen,where,def,vars){defs.push({key:key,screen:screen,where:where,def:String(def),vars:vars||null});};
  HUB_TAB_DEFAULTS.forEach(function(t){add('tab.'+t[0],'공통 · 탭 이름','허브 맨 위·아래 메뉴 단추 — 「'+t[1]+'」 탭 이름',t[1]);});
  HUB_MENU_DEFAULTS.forEach(function(g){add('menu.'+g[0],'공통 · 메뉴 묶음 이름','허브 맨 위 메뉴 — 「'+g[1]+'」 묶음 이름',g[1]);});
  const S='🛡️ 계정·권한 관리';
  add('owner.title',S,'화면 맨 위 큰 제목','🛡️ 계정·권한 관리');
  add('owner.roster.label',S,'맨 위 칸 — 직원 명부 인원 위 작은 이름','직원 명부');
  add('owner.pending.title',S,'「미가입자·승인 대기」 묶음 제목','🧩 미가입자·승인 대기');
  add('owner.pending.hint',S,'「미가입자·승인 대기」 묶음 제목 아래 설명','근무명부에는 있지만 계정이 없는 사람과, 가입 후 원장 승인을 기다리는 사람을 모았습니다.');
  add('owner.invite.button',S,'「가입 안내 문구 복사」 단추 글','가입 안내 문구 복사');
  add('owner.invite.message',S,'★ 가입 안내 카톡 글 — 위 단추를 누르면 복사되는 글(새 직원에게 그대로 보냄)',HUB_INVITE_DEFAULT);
  add('owner.invite.copied',S,'가입 안내 문구를 복사한 뒤 뜨는 알림','안내 문구를 복사했습니다.');
  add('owner.unlinked.title',S,'계정 없는 근무명부 표 제목 — {n}은 인원 수','계정 없는 근무명부 ({n}명)',['n']);
  add('owner.approval.title',S,'가입 승인 대기 표 제목 — {n}은 인원 수','🆕 가입 승인 대기 ({n}명)',['n']);
  add('owner.members.title',S,'「직원 권한 관리」 묶음 제목','직원 권한 관리');
  add('owner.members.sub',S,'「직원 권한 관리」 제목 옆 작은 글','(입퇴사·승진 시 여기서 변경)');
  add('owner.confid.title',S,'케이스노트 접근 명단 제목','🔒 케이스노트 접근 명단');
  add('owner.tabs.title',S,'탭 노출 설정 제목','🧭 탭 노출 설정');
  add('owner.tabs.sub',S,'탭 노출 설정 제목 옆 작은 글','(역할별 · 즉시 반영)');
  add('owner.override.title',S,'사람별 탭 예외 제목','👤 사람별 탭 예외');
  add('owner.override.sub',S,'사람별 탭 예외 제목 옆 작은 글','(역할 기본을 개인별로 덮어씀 · 즉시 반영)');
  add('owner.next.title',S,'맨 아래 「다음 설계 예정」 카드 제목','다음 설계 예정/혹은 할일');
  add('owner.next.sub',S,'맨 아래 카드 제목 옆 작은 글','(설계 완료·구현 예정)');
  add('owner.next.body',S,'맨 아래 카드 본문(줄바꿈 그대로 보임)',HUB_NEXT_BODY_DEFAULT);
  hubTextDefsChapter2(add);
  HUB_TEXT_DEFS_CACHE=defs;
  return defs;
}
function hubTextDefByKey(key){
  const defs=hubTextDefs();
  for(let i=0;i<defs.length;i++)if(defs[i].key===key)return defs[i];
  return null;
}
// 검색칸: 키·어디에 보이는지·기본 글·지금 글 어디에든 들어 있으면 보인다(대소문자 무시, 띄어쓰기로 나눈 낱말을 모두 포함).
function hubTextMatches(def,query,current){
  const q=String(query==null?'':query).trim().toLowerCase();
  if(!q)return true;
  const hay=(def.key+' '+def.screen+' '+def.where+' '+def.def+' '+(current==null?'':current)).toLowerCase();
  return q.split(/\s+/).every(function(w){return hay.indexOf(w)>=0;});
}

/* 숫자 기준(app_settings 키) — 지금은 SQL로만 고치던 근태 기준 7개 */
const HUB_SETTING_DEFS=[
  {key:'late_cut',screen:'🕘 근태 기준',label:'지각 판정 시각',where:'출퇴근 — 이 시각을 넘겨 출근하면 지각으로 계산(예 09:40이면 09:41부터 지각)',def:'09:40',kind:'time'},
  {key:'siueop',screen:'🕘 근태 기준',label:'시업(공식 출근) 시각',where:'출퇴근 — 화면에 보여 주는 공식 출근 시각',def:'10:00',kind:'time'},
  {key:'jongeop_weekday_evening',screen:'🕘 근태 기준',label:'평일 야간조 종업 시각',where:'출퇴근 — 월~금 야간조의 종업 시각(연장근무 계산 기준)',def:'20:00',kind:'time'},
  {key:'jongeop_weekday_day',screen:'🕘 근태 기준',label:'평일 비야간 종업 시각',where:'출퇴근 — 월~금 야간조가 아닌 사람의 종업 시각',def:'18:30',kind:'time'},
  {key:'jongeop_sat',screen:'🕘 근태 기준',label:'토요일 종업 시각',where:'출퇴근 — 토요일 종업 시각',def:'17:00',kind:'time'},
  {key:'jongeop_sun',screen:'🕘 근태 기준',label:'일요일 종업 시각',where:'출퇴근 — 일요일 종업 시각',def:'14:00',kind:'time'},
  {key:'ot_unit_min',screen:'🕘 근태 기준',label:'연장근로 인정 단위(분)',where:'출퇴근 — 이 단위로 버림(예 10이면 9분→0분, 11분→10분)',def:'10',kind:'int',min:1,max:60,unit:'분'}
];
function hubSettingDefByKey(key){
  for(let i=0;i<HUB_SETTING_DEFS.length;i++)if(HUB_SETTING_DEFS[i].key===key)return HUB_SETTING_DEFS[i];
  return null;
}
// 값 검사: 화면에서 막고, 읽을 때는 모양이 틀리면 기본값을 쓴다. 통과하면 {ok:true,value}, 아니면 {ok:false,reason}.
function hubSettingValidate(def,raw){
  const v=String(raw==null?'':raw).trim();
  if(def.kind==='time'){
    if(!/^([01]\d|2[0-3]):[0-5]\d$/.test(v))return {ok:false,reason:'시각은 09:40 처럼 시:분(24시간)으로 적어 주세요.'};
    return {ok:true,value:v};
  }
  if(def.kind==='int'){
    if(!/^\d{1,4}$/.test(v))return {ok:false,reason:'숫자만 적어 주세요.'};
    const n=Number(v);
    if(n<def.min||n>def.max)return {ok:false,reason:def.min+'부터 '+def.max+'까지만 쓸 수 있어요.'};
    return {ok:true,value:String(n)};
  }
  return v?{ok:true,value:v}:{ok:false,reason:'비워 둘 수 없어요.'};
}

/* 목록(app_settings 키) — 코드 고정 · 이름만 수정. addable=새 항목 추가 허용(흐름이 걸리지 않은 안전한 목록만). */
const HUB_LIST_DEFS=[
  {key:'list.profile_depts',screen:'🛡️ 계정·권한 관리',label:'직원 부서',addable:true,
   where:'계정·권한 관리 › 직원 권한 관리 표의 「부서」 고르는 칸',
   note:'「데스크」는 입금 열람 권한이 이 코드로 확인하므로 코드(왼쪽 회색)는 못 바꾸고 보이는 이름만 고칠 수 있어요. 새 부서는 ＋ 추가로 늘려요.',
   def:[{code:'진료실',label:'진료실'},{code:'데스크',label:'데스크'},{code:'기공팀',label:'기공팀'},{code:'기타',label:'기타'}]},
  {key:'list.doc_kinds',screen:'📎 내 서류함',label:'서류 종류',addable:true,
   where:'내 서류함 › 서류함 › 「올릴 종류」가 직원서류일 때 고르는 「서류 종류」 칸 · 서류 표의 종류 칸',
   note:'왼쪽 회색 코드는 서버에 저장되는 값이라 못 바꾸고 보이는 이름만 고칠 수 있어요. 「잠복결핵 검사서」·「자격증」·「보안서약서」는 입사 체크리스트가 이 코드로 완료 여부를 확인해요. 새 서류 종류는 ＋ 추가로 늘려요.',
   def:[{code:'잠복결핵 검사서',label:'잠복결핵 검사서'},{code:'자격증',label:'자격증'},{code:'보안서약서',label:'보안서약서'},{code:'면허증',label:'면허증'},{code:'신분증 사본',label:'신분증 사본'},{code:'기타',label:'기타'}]},
  {key:'list.onbo_status',screen:'📎 내 서류함',label:'입사 제출물 상태 이름',addable:false,
   where:'내 서류함 › 내 입사 제출물 표의 「상태」 칸에 보이는 이름',
   note:'결재·제출 흐름이 이 코드로 움직여서 코드는 못 바꾸고 새 항목도 못 늘려요. 보이는 이름만 고칠 수 있어요.',
   def:[{code:'미제출',label:'미제출'},{code:'제출',label:'제출'},{code:'확인',label:'확인'}]},
  {key:'list.payment_status',screen:'📎 내 서류함',label:'결제 요청 상태 이름',addable:false,
   where:'내 서류함 › 결제 요청 표의 「상태」 칸에 보이는 이름',
   note:'결재 단계(실장 → 원장)가 이 코드로 움직여서 코드는 못 바꾸고 새 항목도 못 늘려요. 보이는 이름만 고칠 수 있어요.',
   def:[{code:'chief_pending',label:'실장 검토 대기'},{code:'owner_pending',label:'원장 결재 대기'},{code:'approved',label:'승인'},{code:'rejected',label:'반려'}]}
];
// 카드 목록(app_settings의 JSON). 기본 카드는 hr.html의 workDocuments와 같아야 한다(시험이 대조).
const HUB_CARD_DEFS=[
  {key:'cards.work_materials',screen:'📚 업무자료',label:'업무자료 카드',
   where:'업무자료 화면 › 검색칸 아래 자료 카드들(맨 위 「직원 허브 사용 설명서」 카드는 따로 있어 여기 없어요)',
   note:'카드마다 제목·설명·링크를 고치고, 순서를 바꾸고, 새 카드를 더하거나 뺄 수 있어요. 링크는 http:// 또는 https:// 로 시작하는 주소만 돼요. 「특정 부서에만 보이기」를 켜면 아래 부서 이름(진료실·상담 등)에 속한 직원에게만 보여요. 카드 안의 「열기 ↗」·검색 안내 글은 📝 글 고치기에서 고쳐요.',
   def:[{icon:'🩺',category:'진료 매뉴얼',title:'진료 매뉴얼',description:'진료실·상담 직무에 필요한 업무 안내를 확인합니다.',depts:['진료실','상담'],manual:true,url:'https://app.notion.com/p/1f7ba489f082806e9761e748524994bc?source=copy_link'}]}
];
function hubListDefByKey(key){
  for(let i=0;i<HUB_LIST_DEFS.length;i++)if(HUB_LIST_DEFS[i].key===key)return HUB_LIST_DEFS[i];
  return null;
}
// 목록 저장 전 검사: 기본 코드는 모두 있어야 하고(코드 고정), 새 항목은 addable일 때만, 이름은 1~20자·중복 없음.
function hubListValidate(def,items){
  if(!Array.isArray(items)||!items.length)return {ok:false,reason:'목록이 비어 있어요.'};
  const defCodes={};def.def.forEach(function(d){defCodes[d.code]=true;});
  const seenCode={},seenLabel={},out=[];
  for(let i=0;i<items.length;i++){
    const code=String(items[i]&&items[i].code==null?'':items[i].code).trim(),label=String(items[i]&&items[i].label==null?'':items[i].label).trim();
    if(!code)return {ok:false,reason:'코드가 빈 항목이 있어요.'};
    if(!label)return {ok:false,reason:'이름이 빈 항목이 있어요.'};
    if(label.length>20)return {ok:false,reason:'이름은 20자 이하로 적어 주세요.'};
    if(/[<>"'&\\\u0000-\u001f]/.test(code+label))return {ok:false,reason:'이름에 쓸 수 없는 글자(< > " \' & \\)가 있어요.'};
    if(seenCode[code])return {ok:false,reason:'같은 코드가 두 번 들어 있어요.'};
    if(seenLabel[label])return {ok:false,reason:'같은 이름이 두 번 들어 있어요: '+label};
    if(!defCodes[code]&&!def.addable)return {ok:false,reason:'이 목록은 새 항목을 늘릴 수 없어요.'};
    seenCode[code]=true;seenLabel[label]=true;out.push({code:code,label:label});
  }
  for(const c in defCodes)if(!seenCode[c])return {ok:false,reason:'기본 항목은 지울 수 없어요: '+c};
  return {ok:true,value:JSON.stringify(out),items:out};
}

/* ── 카드 목록(app_settings의 JSON) — 업무자료 카드: 원장이 추가·고치기·지우기·순서를 바꿈. 링크는 http(s)만 ── */
const HUB_CARDS_MAX=30;
// 링크 검사: http(s)로 시작하고 공백·따옴표·꺾쇠·역슬래시·@(사용자 정보)가 없어야 한다. javascript:·data: 등은 모두 거절.
function hubCardUrlOk(u){
  const t=String(u==null?'':u).trim();
  if(!t||t.length>1000)return false;
  return /^https?:\/\/[^\s\/?#<>"'\\`@:]+(?::\d{1,5})?(?:[\/?#][^\s<>"'\\`]*)?$/i.test(t);
}
function hubCardTextOk(s,max){return typeof s==='string'&&s.length<=max&&!/[\u0000-\u001f\u007f]/.test(s);}
// 카드 1장 정리: 통과하면 {ok:true,card}, 아니면 {ok:false,reason}. 칸 순서·모양을 고정한다.
function hubCardNormalize(it){
  if(!it||typeof it!=='object'||Array.isArray(it))return {ok:false,reason:'카드 모양이 틀려요.'};
  const icon=String(it.icon==null?'':it.icon).trim()||'📄',category=String(it.category==null?'':it.category).trim(),title=String(it.title==null?'':it.title).trim(),description=String(it.description==null?'':it.description).trim(),url=String(it.url==null?'':it.url).trim();
  if(!title)return {ok:false,reason:'제목이 빈 카드가 있어요.'};
  if(!hubCardTextOk(title,40))return {ok:false,reason:'제목은 40자 이하로, 줄바꿈 없이 적어 주세요.'};
  if(!hubCardTextOk(icon,12))return {ok:false,reason:'아이콘은 이모지 한두 개(12자 이하)로 적어 주세요.'};
  if(!hubCardTextOk(category,20))return {ok:false,reason:'종류는 20자 이하로, 줄바꿈 없이 적어 주세요.'};
  if(!hubCardTextOk(description,200))return {ok:false,reason:'설명은 200자 이하로, 줄바꿈 없이 적어 주세요.'};
  if(!hubCardUrlOk(url))return {ok:false,reason:'「'+title+'」 링크는 http:// 또는 https:// 로 시작하는 주소만 쓸 수 있어요.'};
  const manual=it.manual===true;
  let depts=[];
  if(it.depts!=null){
    if(!Array.isArray(it.depts))return {ok:false,reason:'보이는 부서 모양이 틀려요.'};
    const seen={};
    for(let i=0;i<it.depts.length;i++){
      const d=String(it.depts[i]==null?'':it.depts[i]).trim();
      if(!d)continue;
      if(!hubCardTextOk(d,20))return {ok:false,reason:'부서 이름은 20자 이하로 적어 주세요.'};
      if(!seen[d]){seen[d]=true;depts.push(d);}
    }
    if(depts.length>12)return {ok:false,reason:'보이는 부서는 12개까지만 쓸 수 있어요.'};
  }
  if(!manual)depts=[];
  return {ok:true,card:{icon:icon,category:category,title:title,description:description,depts:depts,manual:manual,url:url}};
}
// 목록 전체 검사. 빈 목록도 허용(카드를 전부 지우는 경우). 통과하면 {ok:true,items,value(JSON)}.
function hubCardsValidate(items){
  if(!Array.isArray(items))return {ok:false,reason:'목록 모양이 틀려요.'};
  if(items.length>HUB_CARDS_MAX)return {ok:false,reason:'카드는 '+HUB_CARDS_MAX+'장까지만 둘 수 있어요.'};
  const out=[];
  for(let i=0;i<items.length;i++){
    const r=hubCardNormalize(items[i]);
    if(!r.ok)return {ok:false,reason:r.reason};
    out.push(r.card);
  }
  return {ok:true,items:out,value:JSON.stringify(out)};
}
function hubCardsParse(raw){
  let a;
  try{a=JSON.parse(raw);}catch(e){return null;}
  const r=hubCardsValidate(a);
  return r.ok?r.items:null;
}
function hubCardsClone(items){return JSON.parse(JSON.stringify(items||[]));}
// 화면이 읽는 입구: 값이 없거나 모양이 틀리면(링크 검사 포함) 코드의 기본 카드.
function hubCards(key,defItems){
  const def=hubCardsClone(defItems);
  const raw=HUB_SETTING_VALUES[key];
  if(typeof raw!=='string'||raw.trim()==='')return def;
  const parsed=hubCardsParse(raw);
  return parsed||def;
}
function hubCardsCanon(items){const r=hubCardsValidate(items);return r.ok?r.value:JSON.stringify(items);}
function hubCardDefByKey(key){
  for(let i=0;i<HUB_CARD_DEFS.length;i++)if(HUB_CARD_DEFS[i].key===key)return HUB_CARD_DEFS[i];
  return null;
}

/* ── 표 읽기·쓰기(sb = supabase 클라이언트) ── */
async function hubTextsFetch(sb){
  if(!sb||typeof sb.from!=='function')throw new Error('연결 정보가 없습니다.');
  const res=await sb.from('hub_ui_texts').select('key,value');
  if(res.error)throw res.error;
  return res.data||[];
}
// 허브를 열 때 한 번: 있는 키는 덮어쓰고, 읽기에 실패하면 덮어쓰기 없이 기본값으로 조용히 쓴다.
async function hubTextsLoadInto(sb){
  try{hubTextSetOverrides(await hubTextsFetch(sb));return true;}
  catch(e){hubTextSetOverrides([]);return false;}
}
function hubTextNorm(v){return String(v==null?'':v).replace(/\r\n/g,'\n').trim();}
// 저장 1건. 빈 글이거나 기본 글과 같으면 행을 지워 기본으로 돌리고, 다르면 저장한다. 결과 {ok,action:'saved'|'reset'} 또는 {ok:false,reason,error}.
async function hubTextsSave(sb,key,value){
  const def=hubTextDefByKey(key);
  if(!def)return {ok:false,reason:'unknown_key',error:null};
  const v=String(value==null?'':value).replace(/\r\n/g,'\n');
  if(v.length>HUB_TEXT_MAX)return {ok:false,reason:'too_long',error:null};
  const same=v.trim()===''||hubTextNorm(v)===hubTextNorm(def.def);
  try{
    if(same){
      const r=await sb.from('hub_ui_texts').delete().eq('key',key);
      if(r&&r.error)throw r.error;
      hubTextDropOverride(key);
      return {ok:true,action:'reset'};
    }
    const r=await sb.from('hub_ui_texts').upsert({key:key,value:v},{onConflict:'key'});
    if(r&&r.error)throw r.error;
    hubTextPutOverride(key,v);
    return {ok:true,action:'saved'};
  }catch(e){return {ok:false,reason:'write_failed',error:e};}
}
async function hubTextsReset(sb,key){
  if(!hubTextDefByKey(key))return {ok:false,reason:'unknown_key',error:null};
  try{
    const r=await sb.from('hub_ui_texts').delete().eq('key',key);
    if(r&&r.error)throw r.error;
    hubTextDropOverride(key);
    return {ok:true,action:'reset'};
  }catch(e){return {ok:false,reason:'write_failed',error:e};}
}
// app_settings 한 줄 쓰기(원장만 통과 — DB 정책). 성공하면 메모리(=호스트 SETTINGS)에도 바로 넣는다.
async function hubSettingWrite(sb,key,value){
  try{
    const r=await sb.from('app_settings').upsert({key:key,value:value},{onConflict:'key'});
    if(r&&r.error)throw r.error;
    HUB_SETTING_VALUES[key]=value;
    return {ok:true};
  }catch(e){return {ok:false,reason:'write_failed',error:e};}
}
async function hubSettingSave(sb,key,raw){
  const def=hubSettingDefByKey(key);
  if(!def)return {ok:false,reason:'unknown_key',error:null};
  const chk=hubSettingValidate(def,raw);
  if(!chk.ok)return {ok:false,reason:'invalid',error:null,message:chk.reason};
  const w=await hubSettingWrite(sb,key,chk.value);
  return w.ok?{ok:true,action:'saved',value:chk.value}:w;
}
// app_settings는 지울 수 없으므로(정책: 읽기·넣기·고치기만) 기본값을 다시 적는다.
async function hubSettingReset(sb,key){
  const def=hubSettingDefByKey(key);
  if(!def)return {ok:false,reason:'unknown_key',error:null};
  const w=await hubSettingWrite(sb,key,def.def);
  return w.ok?{ok:true,action:'reset',value:def.def}:w;
}
async function hubListSave(sb,key,items){
  const def=hubListDefByKey(key);
  if(!def)return {ok:false,reason:'unknown_key',error:null};
  const chk=hubListValidate(def,items);
  if(!chk.ok)return {ok:false,reason:'invalid',error:null,message:chk.reason};
  const w=await hubSettingWrite(sb,key,chk.value);
  return w.ok?{ok:true,action:'saved',items:chk.items}:w;
}
async function hubListReset(sb,key){
  const def=hubListDefByKey(key);
  if(!def)return {ok:false,reason:'unknown_key',error:null};
  const w=await hubSettingWrite(sb,key,JSON.stringify(def.def));
  return w.ok?{ok:true,action:'reset',items:def.def.map(function(d){return {code:d.code,label:d.label};})}:w;
}
async function hubCardsSave(sb,key,items){
  const def=hubCardDefByKey(key);
  if(!def)return {ok:false,reason:'unknown_key',error:null};
  const chk=hubCardsValidate(items);
  if(!chk.ok)return {ok:false,reason:'invalid',error:null,message:chk.reason};
  const w=await hubSettingWrite(sb,key,chk.value);
  return w.ok?{ok:true,action:'saved',items:chk.items}:w;
}
async function hubCardsReset(sb,key){
  const def=hubCardDefByKey(key);
  if(!def)return {ok:false,reason:'unknown_key',error:null};
  const chk=hubCardsValidate(def.def);
  const w=await hubSettingWrite(sb,key,chk.value);
  return w.ok?{ok:true,action:'reset',items:chk.items}:w;
}
// 쓰기 실패를 직원이 알아듣게(권한 없음 등)
function hubWriteErrorMessage(what,error){
  const code=error&&error.code,msg=(error&&error.message)||'';
  if(code==='42501'||/row-level security|permission denied/i.test(msg))return what+'하지 못했어요 — 원장 계정으로 로그인했는지 확인해 주세요.';
  return what+'하지 못했어요'+(msg?': '+msg:'.');
}
/* hub-texts:test-end */

/* ── 화면: 「⚙️ 허브 설정」 탭(원장 전용) — 📝 글 고치기 · 🔢 숫자·기준 · 📋 목록 ── */
let HUB_SB=null,HUB_ME={},HUB_ROOT=null,HUB_SUBTAB='texts',HUB_STYLE_INJECTED=false,HUB_LIST_DRAFT={};

function hubEnsureStyle(){
  if(HUB_STYLE_INJECTED||typeof document==='undefined')return;
  HUB_STYLE_INJECTED=true;
  const css=
    '.hub-subnav{margin-bottom:10px}'+
    '.hub-subnav .mini.on{background:var(--mint-dk);border-color:var(--mint);color:var(--mint)}'+
    '.hub-grp{border:1px solid var(--line);border-radius:10px;margin:8px 0;padding:8px 10px}'+
    '.hub-grp>summary{font-weight:700;cursor:pointer;font-size:14px}'+
    '.hub-row{border-top:1px solid var(--line);margin-top:10px;padding-top:10px}'+
    '.hub-where{font-size:13px;line-height:1.5}'+
    '.hub-def{white-space:pre-wrap;overflow-wrap:anywhere;font-size:12px;line-height:1.55;background:var(--bg);border:1px solid var(--line);border-radius:8px;padding:8px;margin:4px 0;font-family:inherit;max-width:100%}'+
    '.hub-row textarea{width:100%;box-sizing:border-box;min-height:48px;font-size:13px;line-height:1.55}'+
    '.hub-search{width:100%;box-sizing:border-box;margin:6px 0 4px}'+
    '.hub-code{display:inline-block;min-width:84px;padding:4px 8px;border-radius:8px;background:var(--bg);border:1px solid var(--line);color:var(--gray);font-size:12.5px}'+
    '.hub-list-row{display:flex;gap:8px;align-items:center;margin:6px 0;flex-wrap:wrap}'+
    '.hub-list-row input{flex:1;min-width:120px}';
  const style=document.createElement('style');
  style.id='hub-texts-style';
  style.textContent=css;
  document.head.appendChild(style);
}
function hubBadge(isEdited){return isEdited?'<span class="b ok">고침</span>':'';}
function hubRowsFor(def){return Math.min(14,Math.max(2,String(def.def).split('\n').length+1));}

async function hubSettingsRefresh(sb){
  // 설정 표를 다시 읽어 메모리(=호스트 SETTINGS)에 합친다. 실패하면 던진다.
  const res=await sb.from('app_settings').select('key,value');
  if(res.error)throw res.error;
  (res.data||[]).forEach(function(r){if(r&&typeof r.key==='string'&&typeof r.value==='string')HUB_SETTING_VALUES[r.key]=r.value;});
}

function hubShellHtml(){
  const tabs=[{key:'texts',label:'📝 글 고치기'},{key:'settings',label:'🔢 숫자·기준'},{key:'lists',label:'📋 목록'}];
  const nav='<div class="rowflex hub-subnav">'+tabs.map(function(t){return '<button class="mini'+(HUB_SUBTAB===t.key?' on':'')+'" data-hub-subtab="'+t.key+'">'+t.label+'</button>';}).join('')+'</div>';
  return '<div class="card"><h2>'+hubEsc(hubText('tab.hubset','⚙️ 허브 설정'))+'</h2>'+
    '<div class="sub">직원 화면에 뜨는 글·숫자 기준·목록을 여기서 직접 고쳐요(원장만 보이는 화면). 고치고 「저장」을 누르면 직원이 허브를 다음에 열 때부터 바뀐 값이 보여요. 「기본으로 되돌리기」를 누르면 처음 값으로 돌아가요. 🤖 AI 도우미 안내 문구는 「🤖 AI 도우미」 탭의 「📝 안내 문구」에서 고쳐요.</div>'+
    nav+'<div id="hubSection"></div></div>';
}

async function renderHubSettings(m,ctx){
  HUB_SB=(ctx&&ctx.sb)||null;
  HUB_ME=(ctx&&ctx.me)||{};
  HUB_ROOT=m;
  if(!m)return;
  // 원장이 아니면 아무것도 그리지 않는다(탭도 숨기지만 한 번 더 막는다). DB도 쓰기는 원장만 허용한다.
  if(HUB_ME.role!=='owner'){m.innerHTML='<div class="card"><div class="empty">원장만 볼 수 있는 화면입니다.</div></div>';return;}
  hubEnsureStyle();
  m.innerHTML=hubShellHtml();
  Array.prototype.forEach.call(m.querySelectorAll('[data-hub-subtab]'),function(btn){
    btn.addEventListener('click',function(){HUB_SUBTAB=btn.getAttribute('data-hub-subtab');return renderHubSettings(HUB_ROOT,{sb:HUB_SB,me:HUB_ME});});
  });
  const sec=m.querySelector('#hubSection');
  if(!sec)return;
  if(HUB_SUBTAB==='settings')await hubRenderSettingsSection(sec);
  else if(HUB_SUBTAB==='lists')await hubRenderListsSection(sec);
  else await hubRenderTextsSection(sec);
}

/* ── 📝 글 고치기 ── */
async function hubRenderTextsSection(sec){
  sec.innerHTML='<div class="empty">불러오는 중…</div>';
  try{hubTextSetOverrides(await hubTextsFetch(HUB_SB));} // 탭을 열 때마다 최신 값으로
  catch(e){sec.innerHTML='<div class="empty">불러오지 못했습니다: '+hubEsc((e&&e.message)||'')+' · 표(hub_ui_texts)가 아직 없으면 원장이 SQL을 먼저 적용해야 해요.</div>';return;}
  hubDrawTextsSection(sec);
}
function hubDrawTextsSection(sec){
  const defs=hubTextDefs(),groups=[];
  defs.forEach(function(d,i){
    let g=groups.find(function(x){return x.name===d.screen;});
    if(!g){g={name:d.screen,items:[]};groups.push(g);}
    g.items.push({d:d,i:i});
  });
  sec.innerHTML='<div class="sub">화면별로 접어 두었어요. 찾는 글이 있으면 아래 검색칸에 낱말을 쳐 보세요(탭 이름·「가입 안내」·「승인」 등).</div>'+
    '<input id="hubTxtSearch" class="hub-search" type="search" placeholder="검색 — 키·화면 위치·글 어디든" autocomplete="off">'+
    '<div id="hubTxtList">'+groups.map(function(g){
      const edited=g.items.filter(function(x){return hubTextOverride(x.d.key)!=null;}).length;
      return '<details class="hub-grp" data-hub-group="'+hubEsc(g.name)+'"><summary>'+hubEsc(g.name)+' <span class="sub">('+g.items.length+'개'+(edited?' · 고친 것 '+edited+'개':'')+')</span></summary>'+
        g.items.map(function(x){
          const d=x.d,i=x.i,cur=hubText(d.key,d.def);
          return '<div class="hub-row" data-hub-text-row="'+i+'">'+
            '<div class="hub-where"><b>'+hubEsc(d.where)+'</b> <span id="hubTxtBadge_'+i+'">'+hubBadge(hubTextOverride(d.key)!=null)+'</span></div>'+
            '<div class="sub">이름표: '+hubEsc(d.key)+(d.vars?' · 글 안의 '+d.vars.map(function(v){return '{'+v+'}';}).join(' ')+'은 화면이 채워 넣는 자리라 지우지 마세요':'')+'</div>'+
            '<div class="sub">기본 글</div><pre class="hub-def">'+hubEsc(d.def)+'</pre>'+
            '<label class="sub" for="hubTxtIn_'+i+'">지금 글 (여기서 고쳐요)</label>'+
            '<textarea id="hubTxtIn_'+i+'" rows="'+hubRowsFor(d)+'">'+hubEsc(cur)+'</textarea>'+
            '<div class="rowflex"><button class="mini stamp" data-hub-text-save="'+i+'">저장</button><button class="mini" data-hub-text-reset="'+i+'">기본으로 되돌리기</button><span class="hint" id="hubTxtMsg_'+i+'"></span></div>'+
            '</div>';
        }).join('')+'</details>';
    }).join('')+'</div>';
  Array.prototype.forEach.call(sec.querySelectorAll('[data-hub-text-save]'),function(b){b.addEventListener('click',function(){return hubSaveTextRow(sec,Number(b.getAttribute('data-hub-text-save')));});});
  Array.prototype.forEach.call(sec.querySelectorAll('[data-hub-text-reset]'),function(b){b.addEventListener('click',function(){return hubResetTextRow(sec,Number(b.getAttribute('data-hub-text-reset')));});});
  const box=sec.querySelector('#hubTxtSearch');
  if(box)box.addEventListener('input',function(){hubApplyTextFilter(sec,box.value);});
}
// 검색: 맞는 줄만 보이고, 맞는 줄이 없는 화면 묶음은 숨기며, 검색어가 있으면 묶음을 펼친다(진짜 화면에서만 동작).
function hubApplyTextFilter(sec,query){
  const defs=hubTextDefs(),q=String(query||'').trim();
  Array.prototype.forEach.call(sec.querySelectorAll('[data-hub-group]'),function(g){
    let shown=0;
    Array.prototype.forEach.call(g.querySelectorAll('[data-hub-text-row]'),function(row){
      const d=defs[Number(row.getAttribute('data-hub-text-row'))];
      const ok=!!d&&hubTextMatches(d,q,hubText(d.key,d.def));
      row.hidden=!ok;if(ok)shown++;
    });
    g.hidden=shown===0;
    if(q)g.open=shown>0;
  });
}
function hubAfterTextWrite(sec,i,r,okMsg){
  const d=hubTextDefs()[i];
  const msg=sec.querySelector('#hubTxtMsg_'+i),inp=sec.querySelector('#hubTxtIn_'+i),badge=sec.querySelector('#hubTxtBadge_'+i);
  if(!r.ok){
    if(msg)msg.textContent=r.reason==='too_long'?'저장하지 못했어요 — 20,000자 이하로 적어 주세요.':hubWriteErrorMessage('저장',r.error);
    return;
  }
  if(inp)inp.value=hubText(d.key,d.def); // 저장이면 저장한 글, 되돌리기면 기본 글
  if(badge)badge.innerHTML=hubBadge(hubTextOverride(d.key)!=null);
  if(msg)msg.textContent=okMsg||(r.action==='reset'?'기본 글로 돌렸어요.':'저장했어요.');
  // 탭·메뉴 이름을 고쳤으면 위쪽 메뉴를 바로 다시 그린다. 그 밖의 글은 그 화면을 다음에 열 때 바뀐다.
  if(/^(tab|menu)\./.test(d.key)&&typeof root.renderNav==='function'){try{root.renderNav();}catch(e){}}
}
async function hubSaveTextRow(sec,i){
  const d=hubTextDefs()[i],inp=sec.querySelector('#hubTxtIn_'+i);
  if(!d||!inp)return;
  const r=await hubTextsSave(HUB_SB,d.key,inp.value);
  hubAfterTextWrite(sec,i,r,r.ok&&r.action==='reset'?'기본 글과 같거나 비어 있어서 기본 글로 돌렸어요.':'');
}
async function hubResetTextRow(sec,i){
  const d=hubTextDefs()[i];
  if(!d)return;
  const r=await hubTextsReset(HUB_SB,d.key);
  hubAfterTextWrite(sec,i,r,'');
}

/* ── 🔢 숫자·기준 ── */
async function hubRenderSettingsSection(sec){
  sec.innerHTML='<div class="empty">불러오는 중…</div>';
  try{await hubSettingsRefresh(HUB_SB);}
  catch(e){sec.innerHTML='<div class="empty">불러오지 못했습니다: '+hubEsc((e&&e.message)||'')+'</div>';return;}
  hubDrawSettingsSection(sec);
}
function hubDrawSettingsSection(sec){
  const groups=[];
  HUB_SETTING_DEFS.forEach(function(d,i){
    let g=groups.find(function(x){return x.name===d.screen;});
    if(!g){g={name:d.screen,items:[]};groups.push(g);}
    g.items.push({d:d,i:i});
  });
  sec.innerHTML='<div class="sub">출퇴근 계산이 쓰는 기준이에요. 지금까지는 SQL로만 고쳤는데 여기서 바로 고쳐요. 저장하면 출퇴근 화면이 다음에 열릴 때부터 새 기준으로 계산해요(이미 저장된 지난 기록은 안 바뀌어요).</div>'+
    groups.map(function(g){
      return '<details class="hub-grp" open><summary>'+hubEsc(g.name)+' <span class="sub">('+g.items.length+'개)</span></summary>'+
        g.items.map(function(x){
          const d=x.d,i=x.i,cur=hubSetting(d.key,d.def);
          const input=d.kind==='time'
            ?'<input id="hubSetIn_'+i+'" type="time" value="'+hubEsc(cur)+'">'
            :'<input id="hubSetIn_'+i+'" type="number" inputmode="numeric" min="'+d.min+'" max="'+d.max+'" value="'+hubEsc(cur)+'"> '+hubEsc(d.unit||'');
          return '<div class="hub-row" data-hub-set-row="'+i+'">'+
            '<div class="hub-where"><b>'+hubEsc(d.label)+'</b> <span id="hubSetBadge_'+i+'">'+hubBadge(cur!==d.def)+'</span></div>'+
            '<div class="sub">'+hubEsc(d.where)+' · 이름표: '+hubEsc(d.key)+'</div>'+
            '<div class="sub">처음 값 '+hubEsc(d.def)+(d.kind==='int'?' · '+d.min+'~'+d.max+' 사이':'')+'</div>'+
            '<div class="rowflex">'+input+'<button class="mini stamp" data-hub-set-save="'+i+'">저장</button><button class="mini" data-hub-set-reset="'+i+'">기본으로 되돌리기</button><span class="hint" id="hubSetMsg_'+i+'"></span></div>'+
            '</div>';
        }).join('')+'</details>';
    }).join('');
  Array.prototype.forEach.call(sec.querySelectorAll('[data-hub-set-save]'),function(b){b.addEventListener('click',function(){return hubSaveSettingRow(sec,Number(b.getAttribute('data-hub-set-save')));});});
  Array.prototype.forEach.call(sec.querySelectorAll('[data-hub-set-reset]'),function(b){b.addEventListener('click',function(){return hubResetSettingRow(sec,Number(b.getAttribute('data-hub-set-reset')));});});
}
function hubAfterSettingWrite(sec,i,r){
  const d=HUB_SETTING_DEFS[i];
  const msg=sec.querySelector('#hubSetMsg_'+i),inp=sec.querySelector('#hubSetIn_'+i),badge=sec.querySelector('#hubSetBadge_'+i);
  if(!r.ok){
    if(msg)msg.textContent=r.reason==='invalid'?('저장하지 못했어요 — '+r.message):hubWriteErrorMessage('저장',r.error);
    return;
  }
  const cur=hubSetting(d.key,d.def);
  if(inp)inp.value=cur;
  if(badge)badge.innerHTML=hubBadge(cur!==d.def);
  if(msg)msg.textContent=r.action==='reset'?'처음 값으로 돌렸어요.':'저장했어요.';
}
async function hubSaveSettingRow(sec,i){
  const d=HUB_SETTING_DEFS[i],inp=sec.querySelector('#hubSetIn_'+i);
  if(!d||!inp)return;
  hubAfterSettingWrite(sec,i,await hubSettingSave(HUB_SB,d.key,inp.value));
}
async function hubResetSettingRow(sec,i){
  const d=HUB_SETTING_DEFS[i];
  if(!d)return;
  hubAfterSettingWrite(sec,i,await hubSettingReset(HUB_SB,d.key));
}

/* ── 📋 목록 ── */
async function hubRenderListsSection(sec){
  sec.innerHTML='<div class="empty">불러오는 중…</div>';
  try{await hubSettingsRefresh(HUB_SB);}
  catch(e){sec.innerHTML='<div class="empty">불러오지 못했습니다: '+hubEsc((e&&e.message)||'')+'</div>';return;}
  HUB_LIST_DRAFT={};HUB_CARD_DRAFT={};
  hubDrawListsSection(sec);
}
function hubListItemsFor(def){return HUB_LIST_DRAFT[def.key]||hubList(def.key,def.def);}
function hubDrawListsSection(sec){
  sec.innerHTML='<div class="sub">선택지에 나오는 이름이에요. 왼쪽 회색 글은 화면 뒤에서 쓰는 이름표(코드)라 못 바꾸고, 오른쪽 이름만 고칠 수 있어요. 새 항목을 늘려도 되는 목록에만 「＋ 추가」가 있어요.</div>'+
    HUB_LIST_DEFS.map(function(def,di){
      const items=hubListItemsFor(def),defCodes={};def.def.forEach(function(d){defCodes[d.code]=true;});
      const edited=JSON.stringify(hubList(def.key,def.def))!==JSON.stringify(def.def); // 저장된 값 기준(아직 저장 안 한 초안은 표시 안 함)
      return '<details class="hub-grp" open><summary>'+hubEsc(def.screen)+' › '+hubEsc(def.label)+' <span class="sub">('+items.length+'개)</span></summary>'+
        '<div class="hub-where"><b>'+hubEsc(def.where)+'</b> <span id="hubLstBadge_'+di+'">'+hubBadge(edited)+'</span></div>'+
        '<div class="sub">이름표: '+hubEsc(def.key)+'</div>'+
        (def.note?'<div class="sub">'+hubEsc(def.note)+'</div>':'')+
        items.map(function(it,ri){
          return '<div class="hub-list-row"><span class="hub-code">'+hubEsc(it.code)+'</span>'+
            '<input id="hubLstLbl_'+di+'_'+ri+'" type="text" maxlength="20" value="'+hubEsc(it.label)+'" aria-label="'+hubEsc(it.code)+' 보이는 이름">'+
            (defCodes[it.code]?'':'<button class="mini rej" data-hub-list-del="'+di+':'+ri+'">빼기</button>')+'</div>';
        }).join('')+
        (def.addable?'<div class="hub-list-row"><input id="hubLstNew_'+di+'" type="text" maxlength="20" placeholder="새 항목 이름" aria-label="새 항목 이름"><button class="mini" data-hub-list-add="'+di+'">＋ 추가</button></div>':'')+
        '<div class="rowflex"><button class="mini stamp" data-hub-list-save="'+di+'">저장</button><button class="mini" data-hub-list-reset="'+di+'">기본으로 되돌리기</button><span class="hint" id="hubLstMsg_'+di+'"></span></div>'+
        '</details>';
    }).join('')+hubCardsHtml();
  Array.prototype.forEach.call(sec.querySelectorAll('[data-hub-list-save]'),function(b){b.addEventListener('click',function(){return hubSaveList(sec,Number(b.getAttribute('data-hub-list-save')));});});
  Array.prototype.forEach.call(sec.querySelectorAll('[data-hub-list-reset]'),function(b){b.addEventListener('click',function(){return hubResetList(sec,Number(b.getAttribute('data-hub-list-reset')));});});
  Array.prototype.forEach.call(sec.querySelectorAll('[data-hub-list-add]'),function(b){b.addEventListener('click',function(){return hubAddListItem(sec,Number(b.getAttribute('data-hub-list-add')));});});
  Array.prototype.forEach.call(sec.querySelectorAll('[data-hub-list-del]'),function(b){b.addEventListener('click',function(){const p=String(b.getAttribute('data-hub-list-del')).split(':');return hubDelListItem(sec,Number(p[0]),Number(p[1]));});});
  hubBindCards(sec);
}
// 화면에 적힌 이름들을 초안(draft)에 모은다.
function hubCollectListDraft(sec,di){
  const def=HUB_LIST_DEFS[di],items=hubListItemsFor(def);
  const next=items.map(function(it,ri){const el=sec.querySelector('#hubLstLbl_'+di+'_'+ri);return {code:it.code,label:el&&typeof el.value==='string'?el.value:it.label};});
  HUB_LIST_DRAFT[def.key]=next;
  return next;
}
function hubAddListItem(sec,di){
  const def=HUB_LIST_DEFS[di],box=sec.querySelector('#hubLstNew_'+di),name=String(box&&box.value||'').trim();
  const draft=hubCollectListDraft(sec,di);
  if(!def.addable)return;
  if(!name){const m=sec.querySelector('#hubLstMsg_'+di);if(m)m.textContent='추가할 이름을 적어 주세요.';return;}
  const next=draft.concat([{code:name,label:name}]);
  const chk=hubListValidate(def,next);
  if(!chk.ok){const m=sec.querySelector('#hubLstMsg_'+di);if(m)m.textContent=chk.reason;return;}
  HUB_LIST_DRAFT[def.key]=next;
  hubDrawListsSection(sec);
  const m2=sec.querySelector('#hubLstMsg_'+di);if(m2)m2.textContent='목록에 넣었어요. 「저장」을 눌러야 직원 화면에 반영돼요.';
}
function hubDelListItem(sec,di,ri){
  const def=HUB_LIST_DEFS[di],draft=hubCollectListDraft(sec,di),defCodes={};def.def.forEach(function(d){defCodes[d.code]=true;});
  if(!draft[ri]||defCodes[draft[ri].code])return; // 기본 항목은 뺄 수 없다
  HUB_LIST_DRAFT[def.key]=draft.filter(function(_,i){return i!==ri;});
  hubDrawListsSection(sec);
  const m=sec.querySelector('#hubLstMsg_'+di);if(m)m.textContent='목록에서 뺐어요. 「저장」을 눌러야 직원 화면에 반영돼요.';
}
async function hubSaveList(sec,di){
  const def=HUB_LIST_DEFS[di];
  const draft=hubCollectListDraft(sec,di);
  const r=await hubListSave(HUB_SB,def.key,draft);
  const msg=sec.querySelector('#hubLstMsg_'+di);
  if(!r.ok){if(msg)msg.textContent=r.reason==='invalid'?('저장하지 못했어요 — '+r.message):hubWriteErrorMessage('저장',r.error);return;}
  delete HUB_LIST_DRAFT[def.key];
  hubDrawListsSection(sec);
  const m2=sec.querySelector('#hubLstMsg_'+di);if(m2)m2.textContent='저장했어요.';
}
async function hubResetList(sec,di){
  const def=HUB_LIST_DEFS[di];
  const r=await hubListReset(HUB_SB,def.key);
  const msg=sec.querySelector('#hubLstMsg_'+di);
  if(!r.ok){if(msg)msg.textContent=hubWriteErrorMessage('되돌리',r.error);return;}
  delete HUB_LIST_DRAFT[def.key];
  hubDrawListsSection(sec);
  const m2=sec.querySelector('#hubLstMsg_'+di);if(m2)m2.textContent='처음 목록으로 돌렸어요.';
}

/* ── 📋 목록 안의 카드 목록(업무자료 카드) ── */
let HUB_CARD_DRAFT={};
function hubCardItemsFor(def){return HUB_CARD_DRAFT[def.key]||hubCards(def.key,def.def);}
function hubCardRowHtml(di,ri,it){
  const id=function(f){return 'hubCrd_'+di+'_'+ri+'_'+f;};
  return '<div class="hub-row" data-hub-card-row="'+di+':'+ri+'">'+
    '<div class="sub"><b>카드 '+(ri+1)+'</b></div>'+
    '<div class="hub-list-row"><input id="'+id('icon')+'" type="text" maxlength="12" value="'+hubEsc(it.icon)+'" aria-label="아이콘" style="max-width:72px;flex:none">'+
    '<input id="'+id('category')+'" type="text" maxlength="20" value="'+hubEsc(it.category)+'" placeholder="종류(카드 위 작은 글)" aria-label="종류">'+
    '<input id="'+id('title')+'" type="text" maxlength="40" value="'+hubEsc(it.title)+'" placeholder="제목 *" aria-label="제목"></div>'+
    '<input id="'+id('description')+'" class="hub-search" type="text" maxlength="200" value="'+hubEsc(it.description)+'" placeholder="설명" aria-label="설명">'+
    '<input id="'+id('url')+'" class="hub-search" type="url" value="'+hubEsc(it.url)+'" placeholder="https://… 링크 *(http·https만)" aria-label="링크">'+
    '<div class="hub-list-row"><label class="sub"><input id="'+id('manual')+'" type="checkbox"'+(it.manual?' checked':'')+'> 특정 부서에만 보이기</label>'+
    '<input id="'+id('depts')+'" type="text" maxlength="120" value="'+hubEsc((it.depts||[]).join(','))+'" placeholder="보이는 부서(쉼표로 나눔) 예: 진료실,상담" aria-label="보이는 부서"></div>'+
    '<div class="rowflex"><button class="mini" data-hub-card-up="'+di+':'+ri+'">▲ 위로</button><button class="mini" data-hub-card-down="'+di+':'+ri+'">▼ 아래로</button><button class="mini rej" data-hub-card-del="'+di+':'+ri+'">빼기</button></div>'+
    '</div>';
}
function hubCardsHtml(){
  return HUB_CARD_DEFS.map(function(def,di){
    const items=hubCardItemsFor(def);
    const edited=hubCardsCanon(hubCards(def.key,def.def))!==hubCardsCanon(def.def); // 저장된 값 기준(아직 저장 안 한 초안은 표시 안 함)
    return '<details class="hub-grp" open><summary>'+hubEsc(def.screen)+' › '+hubEsc(def.label)+' <span class="sub">('+items.length+'장)</span></summary>'+
      '<div class="hub-where"><b>'+hubEsc(def.where)+'</b> <span id="hubCrdBadge_'+di+'">'+hubBadge(edited)+'</span></div>'+
      '<div class="sub">이름표: '+hubEsc(def.key)+'</div>'+
      (def.note?'<div class="sub">'+hubEsc(def.note)+'</div>':'')+
      items.map(function(it,ri){return hubCardRowHtml(di,ri,it);}).join('')+
      '<div class="hub-list-row"><button class="mini" data-hub-card-add="'+di+'">＋ 카드 추가</button></div>'+
      '<div class="rowflex"><button class="mini stamp" data-hub-card-save="'+di+'">저장</button><button class="mini" data-hub-card-reset="'+di+'">기본으로 되돌리기</button><span class="hint" id="hubCrdMsg_'+di+'"></span></div>'+
      '</details>';
  }).join('');
}
// 화면에 적힌 값들을 초안에 모은다(저장 전 상태라 검사는 안 함).
function hubCollectCardDraft(sec,di){
  const def=HUB_CARD_DEFS[di],items=hubCardItemsFor(def);
  const next=items.map(function(it,ri){
    const el=function(f){return sec.querySelector('#hubCrd_'+di+'_'+ri+'_'+f);};
    const val=function(f,d){const e=el(f);return e&&typeof e.value==='string'?e.value:d;};
    const man=el('manual');
    return {icon:val('icon',it.icon),category:val('category',it.category),title:val('title',it.title),description:val('description',it.description),url:val('url',it.url),
      manual:man&&typeof man.checked==='boolean'?man.checked:it.manual===true,
      depts:String(val('depts',(it.depts||[]).join(','))).split(/[,，]/).map(function(x){return x.trim();}).filter(Boolean)};
  });
  HUB_CARD_DRAFT[def.key]=next;
  return next;
}
function hubCardMsg(sec,di,text){const m=sec.querySelector('#hubCrdMsg_'+di);if(m)m.textContent=text;}
function hubAddCard(sec,di){
  const def=HUB_CARD_DEFS[di],draft=hubCollectCardDraft(sec,di);
  if(draft.length>=HUB_CARDS_MAX){hubCardMsg(sec,di,'카드는 '+HUB_CARDS_MAX+'장까지만 둘 수 있어요.');return;}
  HUB_CARD_DRAFT[def.key]=draft.concat([{icon:'📄',category:'',title:'',description:'',depts:[],manual:false,url:''}]);
  hubDrawListsSection(sec);
  hubCardMsg(sec,di,'빈 카드를 넣었어요. 제목·링크를 적고 「저장」을 눌러야 직원 화면에 반영돼요.');
}
function hubMoveCard(sec,di,ri,step){
  const def=HUB_CARD_DEFS[di],draft=hubCollectCardDraft(sec,di),to=ri+step;
  if(!draft[ri]||to<0||to>=draft.length)return;
  const next=draft.slice();const t=next[ri];next[ri]=next[to];next[to]=t;
  HUB_CARD_DRAFT[def.key]=next;
  hubDrawListsSection(sec);
  hubCardMsg(sec,di,'순서를 바꿨어요. 「저장」을 눌러야 직원 화면에 반영돼요.');
}
function hubDelCard(sec,di,ri){
  const def=HUB_CARD_DEFS[di],draft=hubCollectCardDraft(sec,di);
  if(!draft[ri])return;
  HUB_CARD_DRAFT[def.key]=draft.filter(function(_,i){return i!==ri;});
  hubDrawListsSection(sec);
  hubCardMsg(sec,di,'카드를 뺐어요. 「저장」을 눌러야 직원 화면에 반영돼요.');
}
async function hubSaveCards(sec,di){
  const def=HUB_CARD_DEFS[di],draft=hubCollectCardDraft(sec,di);
  const r=await hubCardsSave(HUB_SB,def.key,draft);
  if(!r.ok){hubCardMsg(sec,di,r.reason==='invalid'?('저장하지 못했어요 — '+r.message):hubWriteErrorMessage('저장',r.error));return;}
  delete HUB_CARD_DRAFT[def.key];
  hubDrawListsSection(sec);
  hubCardMsg(sec,di,'저장했어요.');
}
async function hubResetCards(sec,di){
  const def=HUB_CARD_DEFS[di];
  const r=await hubCardsReset(HUB_SB,def.key);
  if(!r.ok){hubCardMsg(sec,di,hubWriteErrorMessage('되돌리',r.error));return;}
  delete HUB_CARD_DRAFT[def.key];
  hubDrawListsSection(sec);
  hubCardMsg(sec,di,'처음 카드로 돌렸어요.');
}
function hubBindCards(sec){
  const on=function(attr,fn){Array.prototype.forEach.call(sec.querySelectorAll('['+attr+']'),function(b){b.addEventListener('click',function(){return fn(String(b.getAttribute(attr)));});});};
  const pair=function(v){const p=v.split(':');return [Number(p[0]),Number(p[1])];};
  on('data-hub-card-save',function(v){return hubSaveCards(sec,Number(v));});
  on('data-hub-card-reset',function(v){return hubResetCards(sec,Number(v));});
  on('data-hub-card-add',function(v){return hubAddCard(sec,Number(v));});
  on('data-hub-card-up',function(v){const p=pair(v);return hubMoveCard(sec,p[0],p[1],-1);});
  on('data-hub-card-down',function(v){const p=pair(v);return hubMoveCard(sec,p[0],p[1],1);});
  on('data-hub-card-del',function(v){const p=pair(v);return hubDelCard(sec,p[0],p[1]);});
}

/* ── 호스트(hr.html)가 쓰는 입구 ── */
const HubUi={
  // 허브를 열 때 한 번: 글 표를 읽어 메모리에 둔다(실패하면 기본값만 씀). 숫자·목록은 호스트 SETTINGS를 그대로 쓴다.
  load:function(sb){return hubTextsLoadInto(sb);},
  setSettings:hubSettingSetValues,
  renderSettings:renderHubSettings,
  applyTextFilter:hubApplyTextFilter, // 검색칸 동작(시험용으로도 공개)
  helpers:{hubText:hubText,hubSetting:hubSetting,hubList:hubList,hubCards:hubCards}
};
root.hubText=hubText;
root.hubTextHtml=hubTextHtml;
root.hubSetting=hubSetting;
root.hubSettingNumber=hubSettingNumber;
root.hubList=hubList;
root.hubCards=hubCards;
root.HubUi=HubUi;
})(typeof window!=='undefined'?window:globalThis);
