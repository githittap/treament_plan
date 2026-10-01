/* hub-texts.js — 직원허브 「⚙️ 허브 설정」(원장 전용) + 허브 전체 글·숫자·목록 덮어쓰기 엔진 (차례 1)
   설계서: Z:\09_claude-output\03_병원운영·전산\직원AI도우미\설계서_허브문구전체.md
   원리(AI 도우미 「📝 안내 문구」와 같음): 화면 코드에 지금 글을 「기본값」으로 남기고, 표에 같은 키가 있으면 그 값으로 바꿔 보여 준다.
   표를 못 읽으면 기본값 그대로(화면이 깨지지 않음). 「기본으로 되돌리기」 = 표의 그 행을 지움(app_settings는 지울 수 없어 기본값을 다시 적음).
   · 글  → 표 hub_ui_texts(db/hub_ui_texts.sql) · 숫자·목록 → 이미 있는 표 app_settings(키만 더함, 표·정책은 안 고침)
   hr.html은 이 파일을 main 스크립트보다 먼저 <script src="hub-texts.js?v=…"> 로 불러온다(함수는 전역 hubText·hubSetting·hubList·HubUi).
   로그인 전 화면 글은 표를 읽을 수 없어 이 엔진을 쓰지 않는다(설계서 5장).
   차례 5: 문의함·상담일지 글(hubTextDefsChapter5) + 문의 출처·문의 상태·상담 구분·상담 상태 이름 목록(코드는 DB 허락값이라 이름만) + 문의함·상담일지 숫자 기준 5개 — 광고 알림 기준 금액 100,000원은 DB 함수에도 있어 안 옮김.
   차례 4: 결재함·공지·캘린더·건의함 글(hubTextDefsChapter4) + 결재 종류·일정 종류 이름 목록 + 결재 목록 건수(hubSettingChecked) — 첨부 한도·건의 점수·순위는 DB가 같은 값을 쥐고 있어 안 옮김.
   차례 3: 출퇴근·근무표·연차 글(hubTextDefsChapter3) + 연차 유형·근무부서 이름 목록 + 연차·소명 숫자 기준(hubSettingChecked).
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
// 숫자 읽기(차례 3): 허브 설정이 정한 범위 안의 숫자만 쓰고, 값이 없거나 숫자가 아니거나 범위 밖이면 기본값.
function hubSettingChecked(key,defNum){
  const d=hubSettingDefByKey(key);
  const raw=hubSetting(key,d?d.def:String(defNum));
  if(!d){const n=Number(raw);return Number.isFinite(n)?n:defNum;}
  const chk=hubSettingValidate(d,raw);
  return chk.ok?Number(chk.value):Number(d.def);
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
// ── 차례 3: 출퇴근·근무표·연차 글(기본 글은 hr.html의 글과 같아야 함 — 시험이 대조) ──
function hubTextDefsChapter3(add){
  add('att.my.err','🕘 출퇴근 › 내 출퇴근(직원 화면)','내 출퇴근 — 수기 근태 조회 실패 앞 글(뒤에 오류 내용이 붙음)','수기 근태 조회 실패:');
  add('att.my.err_draft','🕘 출퇴근 › 내 출퇴근(직원 화면)','내 출퇴근 — 수기 조회 실패인데 오류 내용이 없을 때','DB 초안이 아직 적용되지 않았습니다.');
  add('att.my.title','🕘 출퇴근 › 내 출퇴근(직원 화면)','내 출퇴근 카드 제목','🕘 내 출퇴근');
  add('att.my.th_in','🕘 출퇴근 › 내 출퇴근(직원 화면)','내 출퇴근 표 머리 — 출근','출근');
  add('att.my.th_out','🕘 출퇴근 › 내 출퇴근(직원 화면)','내 출퇴근 표 머리 — 퇴근','퇴근');
  add('att.my.th_late','🕘 출퇴근 › 내 출퇴근(직원 화면)','내 출퇴근 표 머리 — 지각','지각');
  add('att.my.th_ot','🕘 출퇴근 › 내 출퇴근(직원 화면)','내 출퇴근 표 머리 — 연장','연장');
  add('att.my.th_basis','🕘 출퇴근 › 내 출퇴근(직원 화면)','내 출퇴근 표 머리 — 기준(지문·수기·승인 보정 표시)','기준');
  add('att.my.orig','🕘 출퇴근 › 내 출퇴근(직원 화면)','내 출퇴근 — 승인 보정된 칸의 「원래 값」 표시({v}는 원래 출근·퇴근 시각)','원 {v}',['v']);
  add('att.my.late','🕘 출퇴근 › 내 출퇴근(직원 화면)','내 출퇴근 — 지각한 날 칸 글({n}은 지각 분)','지각 {n}분',['n']);
  add('att.my.orig_min','🕘 출퇴근 › 내 출퇴근(직원 화면)','내 출퇴근 — 승인 보정된 지각·연장 칸의 「원래 값」 표시({v}는 원래 분)','원 {v}분',['v']);
  add('att.my.basis_adj','🕘 출퇴근 › 내 출퇴근(직원 화면)','내 출퇴근 기준 칸 — 승인 보정','승인 보정');
  add('att.my.basis_manual','🕘 출퇴근 › 내 출퇴근(직원 화면)','내 출퇴근 기준 칸 — 수기 기록','수기 기록');
  add('att.my.basis_fp','🕘 출퇴근 › 내 출퇴근(직원 화면)','내 출퇴근 기준 칸 — 지문 기록','지문 기록');
  add('att.my.empty','🕘 출퇴근 › 내 출퇴근(직원 화면)','내 출퇴근 — 이번 달 기록이 없을 때','이번 달 기록 없음 (지문은 월말 일괄 입력)');
  add('att.my.manual_list','🕘 출퇴근 › 내 출퇴근(직원 화면)','내 출퇴근 — 수기 제출 내역 앞 글(뒤에 날짜·상태가 이어 붙음)','수기 제출 내역:');
  add('att.my.fix_a','🕘 출퇴근 › 내 출퇴근(직원 화면)','내 출퇴근 아래 안내 앞부분','기록이 실제와 다르면 관리자에게');
  add('att.my.fix_b','🕘 출퇴근 › 내 출퇴근(직원 화면)','내 출퇴근 아래 안내 — 굵게 보이는 말','지문누락 소명');
  add('att.my.fix_c','🕘 출퇴근 › 내 출퇴근(직원 화면)','내 출퇴근 아래 안내 뒷부분','을 요청하세요.');
  add('att.my.fix_btn','🕘 출퇴근 › 내 출퇴근(직원 화면)','내 출퇴근 — 소명 올리기 단추','소명 올리기');
  add('att.manual.reason_prefix','🕘 출퇴근 › 수기 출퇴근 입력','선택한 날짜 상세 — 「정정 사유」 앞 글(뒤에 사유가 이어 붙음)','정정 사유:');
  add('att.manual.note_prefix','🕘 출퇴근 › 수기 출퇴근 입력','선택한 날짜 상세 — 「비고」 앞 글(뒤에 비고가 이어 붙음)','비고:');
  add('att.manual.minutes_line','🕘 출퇴근 › 수기 출퇴근 입력','선택한 날짜 상세 — 점심·퇴근·저녁 추가근무 분 줄({lunch}·{clockout}·{evening}은 화면이 채우는 분 수)','{lunch}분 점심 · {clockout}분 퇴근 · {evening}분 저녁',['lunch','clockout','evening']);
  add('att.manual.no_notes','🕘 출퇴근 › 수기 출퇴근 입력','선택한 날짜 상세 — 사유·비고가 하나도 없을 때','사유·비고 없음');
  add('att.manual.pick_hour','🕘 출퇴근 › 수기 출퇴근 입력','시·분 고르는 칸의 맨 위 안내(출근·퇴근 「시」 칸)','시 선택');
  add('att.manual.pick_min','🕘 출퇴근 › 수기 출퇴근 입력','시·분 고르는 칸의 맨 위 안내(출근·퇴근 「분」 칸)','분 선택');
  add('att.manual.title','🕘 출퇴근 › 수기 출퇴근 입력','수기 입력 카드 맨 위 제목','📝 수기 출퇴근 입력');
  add('att.manual.title_sub','🕘 출퇴근 › 수기 출퇴근 입력','수기 입력 제목 옆 작은 글(괄호는 화면이 붙임)','지문 기록과 별도 대조 원장');
  add('att.manual.f_date','🕘 출퇴근 › 수기 출퇴근 입력','수기 입력 칸 이름 — 근무일','근무일');
  add('att.manual.f_in','🕘 출퇴근 › 수기 출퇴근 입력','수기 입력 칸 이름 — 출근','출근');
  add('att.manual.f_out','🕘 출퇴근 › 수기 출퇴근 입력','수기 입력 칸 이름 — 퇴근','퇴근');
  add('att.manual.f_weekday','🕘 출퇴근 › 수기 출퇴근 입력','수기 입력 칸 이름 — 요일','요일');
  add('att.manual.f_late','🕘 출퇴근 › 수기 출퇴근 입력','수기 입력 칸 이름 — 지각 분','지각(분)');
  add('att.manual.f_early','🕘 출퇴근 › 수기 출퇴근 입력','수기 입력 칸 이름 — 조퇴 분','조퇴(분)');
  add('att.manual.f_lunch','🕘 출퇴근 › 수기 출퇴근 입력','수기 입력 칸 이름 — 점심 추가근무','점심 추가근무');
  add('att.manual.ph_ot','🕘 출퇴근 › 수기 출퇴근 입력','점심·퇴근 추가근무 칸 안에 흐리게 보이는 예시','예: 9, 20 또는 01:09');
  add('att.manual.f_clockout_ot','🕘 출퇴근 › 수기 출퇴근 입력','수기 입력 칸 이름 — 퇴근 추가근무','퇴근 추가근무');
  add('att.manual.f_evening_ot','🕘 출퇴근 › 수기 출퇴근 입력','수기 입력 칸 이름 — 저녁 추가근무','저녁 추가근무');
  add('att.manual.ph_evening','🕘 출퇴근 › 수기 출퇴근 입력','저녁 추가근무 칸 안에 흐리게 보이는 예시','분 또는 01:09');
  add('att.manual.f_total','🕘 출퇴근 › 수기 출퇴근 입력','수기 입력 칸 이름 — 추가근무 합계','추가근무 합계');
  add('att.manual.f_half','🕘 출퇴근 › 수기 출퇴근 입력','수기 입력 칸 이름 — 반차(고르는 칸 안의 값은 못 바꿈)','반차');
  add('att.manual.f_correct','🕘 출퇴근 › 수기 출퇴근 입력','수기 입력 — 정정·예외 체크 칸 글','정정·예외 입력');
  add('att.manual.ph_reason','🕘 출퇴근 › 수기 출퇴근 입력','수기 입력 — 사유 칸 안에 흐리게 보이는 글','정정·예외일 때 사유 필수');
  add('att.manual.ph_note','🕘 출퇴근 › 수기 출퇴근 입력','수기 입력 — 비고 칸 안에 흐리게 보이는 글','비고');
  add('att.manual.detail_close','🕘 출퇴근 › 수기 출퇴근 입력','수기 입력 — 선택 날짜 상세를 열어 둔 상태의 단추 글','선택 날짜 상세 닫기');
  add('att.manual.detail_open','🕘 출퇴근 › 수기 출퇴근 입력','수기 입력 — 선택 날짜 상세를 닫아 둔 상태의 단추 글','선택 날짜 상세 열기');
  add('att.manual.no_note','🕘 출퇴근 › 수기 출퇴근 입력','선택한 날짜 상세(첫 화면) — 비고가 하나도 없을 때','비고 없음');
  add('att.manual.submit','🕘 출퇴근 › 수기 출퇴근 입력','수기 입력 아래 제출 단추','수기 입력 제출');
  add('att.manual.m_format','🕘 출퇴근 › 수기 출퇴근 입력','수기 입력 제출 — 연장 형식이나 정정 사유가 빠졌을 때 뜨는 글','출퇴근·연장 원자료 형식 또는 정정 사유를 확인하세요.');
  add('att.manual.m_fail','🕘 출퇴근 › 수기 출퇴근 입력','수기 입력 제출 실패 — 뒤에 서버 오류가 붙음({msg})','실패: {msg}',['msg']);
  add('att.manual.m_ok','🕘 출퇴근 › 수기 출퇴근 입력','수기 입력을 제출했을 때 뜨는 글','제출했습니다. 승인 대기 중입니다.');
  add('att.review.m_fail','🕘 출퇴근 › 월 마감·인정 근태·수기 검토(실장·원장)','수기 출퇴근 검토 — 승인·반려 처리가 실패했을 때({msg}는 서버 오류)','처리 실패: {msg}',['msg']);
  add('att.btn.chief_ok','🕘 출퇴근 › 월 마감·인정 근태·수기 검토(실장·원장)','출퇴근 — 실장이 누르는 승인 단추(수기·소명 공통)','실장 승인');
  add('att.btn.owner_ok','🕘 출퇴근 › 월 마감·인정 근태·수기 검토(실장·원장)','출퇴근 — 원장이 누르는 확정 단추(수기·소명 공통)','원장 확정');
  add('att.btn.reject','🕘 출퇴근 › 월 마감·인정 근태·수기 검토(실장·원장)','출퇴근 — 반려 단추(수기·소명 공통)','반려');
  add('att.close.title','🕘 출퇴근 › 월 마감·인정 근태·수기 검토(실장·원장)','월 마감 카드 제목(실장·원장·매니저 화면)','🗂 지문 근태 — 월 마감');
  add('att.close.hint','🕘 출퇴근 › 월 마감·인정 근태·수기 검토(실장·원장)','월 마감 카드 설명','지문인식기 엑셀(.xls/.xlsx)을 올리면 출근·퇴근·지각·연장을 자동 판정합니다. (하루 최초 인식=출근, 최후=퇴근)');
  add('att.close.state','🕘 출퇴근 › 월 마감·인정 근태·수기 검토(실장·원장)','월 마감 카드 — 이번 달 상태 앞 글','이번 달 상태:');
  add('att.close.state_none','🕘 출퇴근 › 월 마감·인정 근태·수기 검토(실장·원장)','월 마감 카드 — 아직 집계 전일 때 상태 글','미집계');
  add('att.close.btn','🕘 출퇴근 › 월 마감·인정 근태·수기 검토(실장·원장)','월 마감 카드 — 원장 전용 확정 단추','이번 달 확정');
  add('att.resol.title','🕘 출퇴근 › 월 마감·인정 근태·수기 검토(실장·원장)','인정 근태 카드 제목','🧾 지문 오류 승인 인정 근태');
  add('att.resol.th_time','🕘 출퇴근 › 월 마감·인정 근태·수기 검토(실장·원장)','인정 근태 표 머리 — 인정 출퇴근','인정 출퇴근');
  add('att.resol.th_at','🕘 출퇴근 › 월 마감·인정 근태·수기 검토(실장·원장)','인정 근태 표 머리 — 승인일','승인일');
  add('att.resol.empty','🕘 출퇴근 › 월 마감·인정 근태·수기 검토(실장·원장)','인정 근태 카드 — 아직 하나도 없을 때','별도 인정 근태 없음');
  add('att.review.title','🕘 출퇴근 › 월 마감·인정 근태·수기 검토(실장·원장)','수기 출퇴근 검토 카드 제목(실장·원장)','📝 수기 출퇴근 검토');
  add('att.review.th_manual','🕘 출퇴근 › 월 마감·인정 근태·수기 검토(실장·원장)','수기 검토 표 머리 — 수기 기록','수기');
  add('att.review.th_fp','🕘 출퇴근 › 월 마감·인정 근태·수기 검토(실장·원장)','수기 검토 표 머리 — 지문 기록','지문');
  add('att.review.empty','🕘 출퇴근 › 월 마감·인정 근태·수기 검토(실장·원장)','수기 검토 카드 — 수기 입력이 하나도 없을 때','수기 입력 없음');
  add('att.review.err','🕘 출퇴근 › 월 마감·인정 근태·수기 검토(실장·원장)','수기 검토 카드 — 조회 실패 앞 글(뒤에 오류 내용이 붙음)','수기 근태 조회 실패:');
  add('att.review.err_draft','🕘 출퇴근 › 월 마감·인정 근태·수기 검토(실장·원장)','수기 검토 조회 실패인데 오류 내용이 없을 때','DB 초안이 아직 적용되지 않았습니다.');
  add('att.close.confirm','🕘 출퇴근 › 월 마감·인정 근태·수기 검토(실장·원장)','월 확정 누르면 뜨는 확인창({month}는 해당 달)','{month} 근태를 확정할까요? (이후 수정은 소명/정정으로)',['month']);
  add('att.absset.title','🕘 출퇴근 › 결근 후보·지문누락 소명','결근 후보 기준 카드 제목(원장만 보임)','⚙ 결근/미기록 후보 기준');
  add('att.absset.title_sub','🕘 출퇴근 › 결근 후보·지문누락 소명','결근 후보 기준 제목 옆 작은 글','원장');
  add('att.absset.f_siueop','🕘 출퇴근 › 결근 후보·지문누락 소명','결근 후보 기준 — 시업 시각 칸','시업 시각');
  add('att.absset.f_delay','🕘 출퇴근 › 결근 후보·지문누락 소명','결근 후보 기준 — 확인 지연 칸','확인 지연(분)');
  add('att.absset.f_days','🕘 출퇴근 › 결근 후보·지문누락 소명','결근 후보 기준 — 무단결근 일수 칸','무단결근 기준 일수');
  add('att.absset.f_exclude','🕘 출퇴근 › 결근 후보·지문누락 소명','결근 후보 기준 — 수기근태 제외 체크 칸 글','대기·실장승인·원장확정 수기근태는 후보에서 제외');
  add('att.absset.save','🕘 출퇴근 › 결근 후보·지문누락 소명','결근 후보 기준 저장 단추','기준 저장');
  add('att.absset.m_check','🕘 출퇴근 › 결근 후보·지문누락 소명','결근 후보 기준 저장 — 값이 틀렸을 때','시업 시각·지연 분·무단결근 일수를 확인하세요.');
  add('att.absset.m_fail','🕘 출퇴근 › 결근 후보·지문누락 소명','결근 후보 기준 저장 실패({msg}는 서버 오류)','저장 실패: {msg}',['msg']);
  add('att.absset.m_ok','🕘 출퇴근 › 결근 후보·지문누락 소명','결근 후보 기준 저장 성공','저장했습니다.');
  add('att.th.person','🕘 출퇴근 › 결근 후보·지문누락 소명','출퇴근 화면 표 머리 — 직원(여러 표 공통)','직원');
  add('att.th.date','🕘 출퇴근 › 결근 후보·지문누락 소명','출퇴근 화면 표 머리 — 날짜(여러 표 공통)','날짜');
  add('att.th.status','🕘 출퇴근 › 결근 후보·지문누락 소명','출퇴근 화면 표 머리 — 상태(여러 표 공통)','상태');
  add('att.absent.title','🕘 출퇴근 › 결근 후보·지문누락 소명','결근/미기록 후보 카드 제목','🚫 결근/미기록 후보');
  add('att.absent.btn','🕘 출퇴근 › 결근 후보·지문누락 소명','결근/미기록 후보 카드 — 확인하기 단추','확인하기');
  add('att.absent.hint','🕘 출퇴근 › 결근 후보·지문누락 소명','결근/미기록 후보 카드 — 누르기 전 안내','근무표와 기록을 대조해 확인이 필요한 후보만 보여줍니다.');
  add('att.issue.title','🕘 출퇴근 › 결근 후보·지문누락 소명','지문누락 소명 카드 제목(실장·원장)','🙋 지문누락 소명');
  add('att.issue.title_sub','🕘 출퇴근 › 결근 후보·지문누락 소명','지문누락 소명 제목 옆 작은 글','실장·원장 승인');
  add('att.issue.th_type','🕘 출퇴근 › 결근 후보·지문누락 소명','소명 표 머리 — 유형','유형');
  add('att.issue.th_reason','🕘 출퇴근 › 결근 후보·지문누락 소명','소명 표 머리 — 사유','사유');
  add('att.issue.empty','🕘 출퇴근 › 결근 후보·지문누락 소명','지문누락 소명 카드 — 소명이 하나도 없을 때','소명 없음');
  add('att.issue.m_act_fail','🕘 출퇴근 › 결근 후보·지문누락 소명','지문누락 소명 승인·반려 실패({msg}는 서버 오류)','소명 처리 실패: {msg}',['msg']);
  add('att.issue.p_date','🕘 출퇴근 › 결근 후보·지문누락 소명','소명 올리기 — 근무일을 묻는 창','소명할 근무일 (YYYY-MM-DD):');
  add('att.issue.p_type','🕘 출퇴근 › 결근 후보·지문누락 소명','소명 올리기 — 오류 유형을 묻는 창(고르는 값 3개는 서버 규칙이라 못 바꿈)','오류 유형을 입력하세요: 지문인식오류 / 입력오류 / 기타');
  add('att.issue.m_type','🕘 출퇴근 › 결근 후보·지문누락 소명','소명 올리기 — 오류 유형을 잘못 적었을 때','오류 유형은 지문인식오류, 입력오류, 기타 중 하나여야 합니다.');
  add('att.issue.p_reason','🕘 출퇴근 › 결근 후보·지문누락 소명','소명 올리기 — 사유를 묻는 창','사유 (예: 지문 찍었으나 인식 누락):');
  add('att.issue.m_save_fail','🕘 출퇴근 › 결근 후보·지문누락 소명','소명 올리기 실패({msg}는 서버 오류)','소명 저장 실패: {msg}',['msg']);
  add('att.issue.m_saved','🕘 출퇴근 › 결근 후보·지문누락 소명','소명을 올렸을 때 뜨는 글','소명을 올렸습니다. 실장 승인 후 반영됩니다.');
  add('att.absent.loading','🕘 출퇴근 › 결근 후보·지문누락 소명','결근 후보 확인 중 글','확인 중…');
  add('att.absent.err','🕘 출퇴근 › 결근 후보·지문누락 소명','결근 후보 확인 실패 앞 글(뒤에 오류 내용이 붙음)','후보 확인 실패:');
  add('att.absent.set_warn','🕘 출퇴근 › 결근 후보·지문누락 소명','결근 후보 — 설정을 못 불러왔을 때 경고','설정 불러오기 오류: 오늘 후보는 표시하지 않습니다.');
  add('att.absent.th_sched','🕘 출퇴근 › 결근 후보·지문누락 소명','결근 후보 표 머리 — 근무표','근무표');
  add('att.absent.found','🕘 출퇴근 › 결근 후보·지문누락 소명','결근 후보 — 후보가 있을 때 표 아래 안내','결근/미기록 후보입니다. 소명 또는 수기근태를 확인하세요.');
  add('att.absent.none','🕘 출퇴근 › 결근 후보·지문누락 소명','결근 후보 — 후보가 없을 때','결근/미기록 후보 없음 ✓');
  add('att.xl.m_read_fail','🕘 출퇴근 › 지문 엑셀 올리기 창','지문 엑셀 올리기 — 파일을 못 읽었을 때({msg}는 오류 내용)','엑셀을 읽지 못했습니다: {msg}',['msg']);
  add('att.xl.m_no_col','🕘 출퇴근 › 지문 엑셀 올리기 창','지문 엑셀 올리기 — 필요한 열이 없을 때','열을 찾지 못했습니다(직원 식별/발생일). 지문기 원본을 그대로 올려보세요.');
  add('att.xl.sum_a','🕘 출퇴근 › 지문 엑셀 올리기 창','엑셀 미리보기 요약 — 「총 ○행」의 앞 글','총');
  add('att.xl.sum_b','🕘 출퇴근 › 지문 엑셀 올리기 창','엑셀 미리보기 요약 — 「행」 뒤 글','행 · 직원 매핑');
  add('att.xl.sum_c','🕘 출퇴근 › 지문 엑셀 올리기 창','엑셀 미리보기 요약 — 「/ 미매핑」','/ 미매핑');
  add('att.xl.unmapped_a','🕘 출퇴근 › 지문 엑셀 올리기 창','엑셀 미리보기 — 직원 명부에 없는 이름 안내(처음 올릴 때)','미매핑 (직원 명부에 없음):');
  add('att.xl.map_pick','🕘 출퇴근 › 지문 엑셀 올리기 창','엑셀 미리보기 — 미매핑 이름 옆 고르는 칸 첫 글','이 직원으로');
  add('att.xl.unmapped_b','🕘 출퇴근 › 지문 엑셀 올리기 창','엑셀 미리보기 — 이름을 매핑한 뒤 남은 미매핑 안내','미매핑:');
  add('att.xl.all_mapped','🕘 출퇴근 › 지문 엑셀 올리기 창','엑셀 미리보기 — 전원 매핑됐을 때','전원 매핑됨');
  add('att.xl.th_sched','🕘 출퇴근 › 지문 엑셀 올리기 창','엑셀 미리보기 표 머리 — 근무표','근무표');
  add('att.xl.th_early','🕘 출퇴근 › 지문 엑셀 올리기 창','엑셀 미리보기 표 머리 — 조퇴','조퇴');
  add('att.xl.th_evening','🕘 출퇴근 › 지문 엑셀 올리기 창','엑셀 미리보기 표 머리 — 야간 체크','야간');
  add('att.xl.th_note','🕘 출퇴근 › 지문 엑셀 올리기 창','엑셀 미리보기 표 머리 — 비고','비고');
  add('att.xl.b_unmapped','🕘 출퇴근 › 지문 엑셀 올리기 창','엑셀 미리보기 비고 — 직원 못 찾음','미매핑');
  add('att.xl.b_single','🕘 출퇴근 › 지문 엑셀 올리기 창','엑셀 미리보기 비고 — 한 번만 인식됨','단일인식(누락?)');
  add('att.xl.b_off','🕘 출퇴근 › 지문 엑셀 올리기 창','엑셀 미리보기 비고 — 쉬는 날 출근','휴무 출근');
  add('att.xl.m_no_rows','🕘 출퇴근 › 지문 엑셀 올리기 창','지문 엑셀 저장 — 매핑된 행이 없을 때','매핑된 행이 없습니다.');
  add('att.xl.m_saving','🕘 출퇴근 › 지문 엑셀 올리기 창','지문 엑셀 저장 중 글','저장 중…');
  add('att.xl.m_fail','🕘 출퇴근 › 지문 엑셀 올리기 창','지문 엑셀 저장 실패({msg}는 서버 오류)','실패: {msg}',['msg']);
  add('att.xl.auto_reason','🕘 출퇴근 › 지문 엑셀 올리기 창','지문이 한 번만 찍힌 날 자동으로 올라가는 소명의 사유 글','지문 단일 인식(자동 감지)');
  add('att.xl.m_issue_fail','🕘 출퇴근 › 지문 엑셀 올리기 창','지문 엑셀 저장 — 일부 소명 생성 실패({saved}=저장한 건수 · {fail}=실패 건수 · {total}=전체 소명 대상 · {detail}=실패 내용)','근태 {saved}건 저장됨 · 누락 issue {fail}/{total}건 실패: {detail}',['saved','fail','total','detail']);
  add('att.xl.m_done','🕘 출퇴근 › 지문 엑셀 올리기 창','지문 엑셀 저장 성공({n}은 저장 건수)','저장 완료: {n}건',['n']);
  add('att.xl.m_done_miss','🕘 출퇴근 › 지문 엑셀 올리기 창','지문 엑셀 저장 성공 뒤 누락 의심이 있을 때 덧붙는 글(앞의 \' · \'는 화면이 붙임, {n}은 건수)','누락 의심 {n}건 소명 대기 생성',['n']);
  add('att.xl.modal_title','🕘 출퇴근 › 지문 엑셀 올리기 창','지문 엑셀 올리기 창 맨 위 제목','🗂 지문 근태 업로드 — 미리보기');
  add('att.xl.hint_a','🕘 출퇴근 › 지문 엑셀 올리기 창','지문 엑셀 올리기 창 아래 안내 — 앞부분','야간·조퇴는');
  add('att.xl.hint_b','🕘 출퇴근 › 지문 엑셀 올리기 창','지문 엑셀 올리기 창 아래 안내 — 굵게 보이는 말','공표된 근무표');
  add('att.xl.hint_c','🕘 출퇴근 › 지문 엑셀 올리기 창','지문 엑셀 올리기 창 아래 안내 — 뒷부분','가 기준(야간=자동 체크). 지각 컷·연장 단위는 설정 표 값 적용. 저장하면 해당 월 attendance에 기록됩니다. (조퇴 공제는 급여 단계에서)');
  add('att.xl.btn_save','🕘 출퇴근 › 지문 엑셀 올리기 창','지문 엑셀 올리기 창 아래 저장 단추','저장');
  add('sched.title','🗓 근무표 › 주간·월간 화면','근무표 화면 맨 위 제목(월간·주간·오류 카드 공통)','🗓 근무표');
  add('sched.err_month','🗓 근무표 › 주간·월간 화면','월간 근무표를 못 불러왔을 때 앞 글(뒤에 오류 내용이 붙음)','월간 근무표를 불러오지 못했습니다:');
  add('sched.err_unknown','🗓 근무표 › 주간·월간 화면','근무표를 못 불러왔을 때 오류 내용이 없으면 쓰는 글','알 수 없는 오류');
  add('sched.btn_week','🗓 근무표 › 주간·월간 화면','근무표 단추 — 주간 편집(주간·월간 화면 공통)','주간 편집');
  add('sched.btn_month_role','🗓 근무표 › 주간·월간 화면','월간 화면의 단추 — 월간 직무표','월간 직무표');
  add('sched.btn_pdf','🗓 근무표 › 주간·월간 화면','근무표 단추 — PDF 저장(주간·월간 공통)','PDF 저장');
  add('sched.btn_print','🗓 근무표 › 주간·월간 화면','근무표 단추 — 인쇄(주간·월간 공통)','인쇄');
  add('sched.f_month','🗓 근무표 › 주간·월간 화면','월간 화면 — 대상 월 고르는 칸 이름','대상 월');
  add('sched.st_confirmed','🗓 근무표 › 주간·월간 화면','월간 화면 주차 제목 옆 — 공표된 주차 표시','확정');
  add('sched.st_writing','🗓 근무표 › 주간·월간 화면','월간 화면 주차 제목 옆 — 아직 공표 전인 주차 표시','작성 중');
  add('sched.th_role','🗓 근무표 › 주간·월간 화면','근무표 표 맨 왼쪽 머리(주간·월간 공통)','직무·상태');
  add('sched.hint','🗓 근무표 › 주간·월간 화면','근무표 맨 아래 안내(주간·월간 공통)','직무·상태 셀을 열어 여러 명을 선택합니다. 승인 연차자는 근무·야간 선택이 잠깁니다. 모든 승인 직원은 초안을 편집할 수 있고, 공표는 실장·원장만 가능합니다.');
  add('sched.err_week','🗓 근무표 › 주간·월간 화면','주간 근무표 — 주차 정보를 못 불러왔을 때 앞 글(뒤에 오류 내용이 붙음)','근무표 주차 정보를 불러오지 못했습니다:');
  add('sched.err_rows','🗓 근무표 › 주간·월간 화면','주간 근무표 — 근무표 내용을 못 불러왔을 때 앞 글(뒤에 오류 내용이 붙음)','근무표를 불러오지 못했습니다:');
  add('sched.err_leave','🗓 근무표 › 주간·월간 화면','주간 근무표 — 연차 정보를 못 불러왔을 때 앞 글(뒤에 오류 내용이 붙음)','연차 정보를 불러오지 못했습니다:');
  add('sched.wk_published','🗓 근무표 › 주간·월간 화면','주간 화면 제목 옆 — 공표된 주','공표됨');
  add('sched.wk_draft','🗓 근무표 › 주간·월간 화면','주간 화면 제목 옆 — 공표 전인 주','초안');
  add('sched.btn_month_edit','🗓 근무표 › 주간·월간 화면','주간 화면의 단추 — 월간 편집','월간 편집');
  add('sched.btn_prev','🗓 근무표 › 주간·월간 화면','주간 화면 — 지난주로 이동하는 단추','◀ 지난주');
  add('sched.btn_next','🗓 근무표 › 주간·월간 화면','주간 화면 — 다음주로 이동하는 단추','다음주 ▶');
  add('sched.btn_copy','🗓 근무표 › 주간·월간 화면','주간 화면 — 지난주 복사 단추','지난주 복사');
  add('sched.btn_publish','🗓 근무표 › 주간·월간 화면','주간 화면 — 공표(확정) 단추(실장·원장)','공표(확정)');
  add('sched.empty','🗓 근무표 › 주간·월간 화면','근무표 — 포함된 인원이 하나도 없을 때','근무표에 포함된 인원이 아직 없습니다.');
  add('sched.m_no_prev','🗓 근무표 › 주간·월간 화면','지난주 복사 — 지난주 근무표가 비어 있을 때','지난주 근무표가 없습니다.');
  add('sched.m_copy_fail','🗓 근무표 › 주간·월간 화면','지난주 복사 실패({msg}는 서버 오류)','지난주 근무표 복사 실패: {msg}',['msg']);
  add('sched.cell.past','🗓 근무표 › 주간·월간 화면','근무표 칸 안 — 과거 기록으로만 남은 사람 이름 뒤에 붙는 말(앞의 \' · \'는 화면이 붙임)','과거 기록');
  add('sched.rt.src_login','🗓 근무표 › 근무명부 관리','근무명부 표 — 구분 칸: 로그인 계정이 있는 사람','로그인 계정');
  add('sched.rt.src_none','🗓 근무표 › 근무명부 관리','근무명부 표 — 구분 칸: 로그인 계정이 없는 사람','비로그인 명부');
  add('sched.rt.included','🗓 근무표 › 근무명부 관리','근무명부 표 — 근무표·집계 포함 체크 칸 글','포함');
  add('sched.rt.active','🗓 근무표 › 근무명부 관리','근무명부 표 — 재직 중인 사람 표시','재직');
  add('sched.rt.inactive','🗓 근무표 › 근무명부 관리','근무명부 표 — 비활성인 사람 표시','비활성');
  add('sched.rt.btn_off','🗓 근무표 › 근무명부 관리','근무명부 표 — 비활성화 단추','비활성화');
  add('sched.rt.btn_on','🗓 근무표 › 근무명부 관리','근무명부 표 — 재활성화 단추','재활성화');
  add('sched.rt.title','🗓 근무표 › 근무명부 관리','근무명부 관리 카드 제목(눌러서 펼침)','👥 근무명부 관리');
  add('sched.rt.hint','🗓 근무표 › 근무명부 관리','근무명부 관리 카드 설명','로그인 계정과 비로그인 명부를 함께 관리합니다. 근무표·집계 포함 여부는 계정 로그인·승인과 별개입니다.');
  add('sched.rt.ph_name','🗓 근무표 › 근무명부 관리','근무명부 — 이름 칸 안에 흐리게 보이는 글','이름');
  add('sched.rt.pick_dept','🗓 근무표 › 근무명부 관리','근무명부 — 근무부서 고르는 칸 첫 글','근무부서 선택');
  add('sched.rt.btn_add','🗓 근무표 › 근무명부 관리','근무명부 — 로그인 없는 근무자 추가 단추','비로그인 근무자 추가');
  add('sched.rt.th_name','🗓 근무표 › 근무명부 관리','근무명부 표 머리 — 이름','이름');
  add('sched.rt.th_kind','🗓 근무표 › 근무명부 관리','근무명부 표 머리 — 구분','구분');
  add('sched.rt.th_dept','🗓 근무표 › 근무명부 관리','근무명부 표 머리 — 근무부서','근무부서');
  add('sched.rt.th_incl','🗓 근무표 › 근무명부 관리','근무명부 표 머리 — 근무표·집계 포함','근무표·집계 포함');
  add('sched.rt.th_state','🗓 근무표 › 근무명부 관리','근무명부 표 머리 — 재직 상태','재직 상태');
  add('sched.rt.empty','🗓 근무표 › 근무명부 관리','근무명부 — 등록된 사람이 없을 때','등록된 근무명부가 없습니다.');
  add('sched.rt.m_no_perm','🗓 근무표 › 근무명부 관리','근무명부 관리 — 권한이 없을 때','근무명부 관리 권한이 없습니다.');
  add('sched.rt.m_fail','🗓 근무표 › 근무명부 관리','근무명부 관리 — 추가·저장 실패({label}은 한 일 이름 · {msg}는 서버 오류)','{label} 실패: {msg}',['label','msg']);
  add('sched.rt.m_reload_fail','🗓 근무표 › 근무명부 관리','근무명부 관리 — 저장 뒤 새로고침 실패({msg}는 오류 내용)','근무명부 새로고침 실패: {msg}',['msg']);
  add('sched.rt.m_need_both','🗓 근무표 › 근무명부 관리','근무명부 — 이름이나 근무부서를 비우고 추가했을 때','이름과 근무부서를 모두 입력하세요.');
  add('sched.rt.act_add','🗓 근무표 › 근무명부 관리','근무명부 — 추가 실패 메시지 앞에 붙는 일 이름','근무자 추가');
  add('sched.rt.m_bad_dept','🗓 근무표 › 근무명부 관리','근무명부 — 근무부서가 올바르지 않을 때','올바른 근무부서를 선택하세요.');
  add('sched.rt.act_dept','🗓 근무표 › 근무명부 관리','근무명부 — 부서 저장 실패 메시지 앞에 붙는 일 이름','근무부서 저장');
  add('sched.rt.act_incl','🗓 근무표 › 근무명부 관리','근무명부 — 포함 여부 저장 실패 메시지 앞에 붙는 일 이름','근무표·집계 포함 저장');
  add('sched.rt.confirm_off','🗓 근무표 › 근무명부 관리','근무자 비활성화 누르면 뜨는 확인창','이 근무자를 비활성화할까요? 기존 근무 기록은 삭제되지 않으며 같은 행에서 재활성화할 수 있습니다.');
  add('sched.rt.act_react','🗓 근무표 › 근무명부 관리','근무명부 — 재활성화 실패 메시지 앞에 붙는 일 이름','재활성화');
  add('sched.rt.act_deact','🗓 근무표 › 근무명부 관리','근무명부 — 비활성화 실패 메시지 앞에 붙는 일 이름','비활성화');
  add('leave.th.person','🌿 연차 › 내 연차·신청 내역·승인','연차 화면 표 머리 — 직원(여러 표 공통)','직원');
  add('leave.th.type','🌿 연차 › 내 연차·신청 내역·승인','연차 화면 표 머리 — 유형(여러 표 공통)','유형');
  add('leave.th.period','🌿 연차 › 내 연차·신청 내역·승인','연차 화면 표 머리 — 기간(여러 표 공통)','기간');
  add('leave.th.days','🌿 연차 › 내 연차·신청 내역·승인','연차 화면 표 머리 — 일수(여러 표 공통)','일수');
  add('leave.th.status','🌿 연차 › 내 연차·신청 내역·승인','연차 화면 표 머리 — 상태(여러 표 공통)','상태');
  add('leave.btn.form','🌿 연차 › 내 연차·신청 내역·승인','연차 화면 — 신청서 열기 단추(여러 표 공통)','📄 신청서');
  add('leave.btn.reject','🌿 연차 › 내 연차·신청 내역·승인','연차 화면 — 반려 단추','반려');
  add('leave.f_month','🌿 연차 › 내 연차·신청 내역·승인','연차 화면 — 대상 월 고르는 칸 이름','대상 월');
  add('leave.pend.title','🌿 연차 › 내 연차·신청 내역·승인','승인 대기 카드 제목(실장·원장)','✅ 승인 대기');
  add('leave.pend.sub_chief','🌿 연차 › 내 연차·신청 내역·승인','승인 대기 제목 옆 — 실장이 볼 때','실장 최종');
  add('leave.pend.sub_owner','🌿 연차 › 내 연차·신청 내역·승인','승인 대기 제목 옆 — 원장이 볼 때','원장 사전 반려');
  add('leave.pend.th_reason','🌿 연차 › 내 연차·신청 내역·승인','승인 대기 표 머리 — 사유','사유');
  add('leave.pend.special','🌿 연차 › 내 연차·신청 내역·승인','승인 대기 표 — 특별사정으로 신청한 건의 표시','특별사정');
  add('leave.pend.btn_ok','🌿 연차 › 내 연차·신청 내역·승인','승인 대기 표 — 실장 최종 승인 단추','실장 최종 승인');
  add('leave.pend.empty','🌿 연차 › 내 연차·신청 내역·승인','승인 대기 카드 — 대기 건이 없을 때','대기 없음');
  add('leave.arch.title','🌿 연차 › 내 연차·신청 내역·승인','승인 내역 카드 제목(실장·원장)','📚 승인 내역');
  add('leave.arch.th_approver','🌿 연차 › 내 연차·신청 내역·승인','승인 내역 표 머리 — 승인자·승인일','승인자·승인일');
  add('leave.arch.th_canceler','🌿 연차 › 내 연차·신청 내역·승인','승인 내역 표 머리 — 취소자·취소일','취소자·취소일');
  add('leave.arch.th_action','🌿 연차 › 내 연차·신청 내역·승인','승인 내역 표 머리 — 액션','액션');
  add('leave.arch.btn_cancel','🌿 연차 › 내 연차·신청 내역·승인','승인 내역 표 — 원장의 승인 취소·복구 단추','승인 취소·복구');
  add('leave.arch.done','🌿 연차 › 내 연차·신청 내역·승인','승인 내역 표 — 이미 승인된 건의 표시','승인완료');
  add('leave.arch.empty','🌿 연차 › 내 연차·신청 내역·승인','승인 내역 카드 — 그 달 내역이 없을 때','선택한 달의 승인·취소 내역 없음');
  add('leave.my.title','🌿 연차 › 내 연차·신청 내역·승인','내 연차 카드 제목','📅 내 연차');
  add('leave.my.balance','🌿 연차 › 내 연차·신청 내역·승인','내 연차 카드 — 잔여 일수 위 작은 글','잔여');
  add('leave.my.btn_edit','🌿 연차 › 내 연차·신청 내역·승인','내 연차 표 — 대기 중인 내 신청의 수정 단추','수정');
  add('leave.my.btn_cancel','🌿 연차 › 내 연차·신청 내역·승인','내 연차 표 — 대기 중인 내 신청의 취소 단추','취소');
  add('leave.my.empty','🌿 연차 › 내 연차·신청 내역·승인','내 연차 카드 — 신청 내역이 없을 때','신청 내역 없음');
  add('leave.m_cancel_confirm','🌿 연차 › 내 연차·신청 내역·승인','내 대기 신청 취소 누르면 뜨는 확인창','아직 승인 전인 연차 신청을 취소할까요?');
  add('leave.m_cancel_fail','🌿 연차 › 내 연차·신청 내역·승인','내 대기 신청 취소 실패({msg}는 서버 오류)','취소 실패: {msg}',['msg']);
  add('leave.m_cancel_unknown','🌿 연차 › 내 연차·신청 내역·승인','내 대기 신청 취소 — 결과를 확인 못 했을 때','취소 결과를 확인하지 못했습니다.');
  add('leave.m_ok_confirm','🌿 연차 › 내 연차·신청 내역·승인','실장 최종 승인 누르면 뜨는 확인창','실장 최종 승인하시겠습니까?');
  add('leave.m_rej_confirm','🌿 연차 › 내 연차·신청 내역·승인','연차 반려 누르면 뜨는 확인창','이 연차 신청을 반려하시겠습니까?');
  add('leave.m_act_fail','🌿 연차 › 내 연차·신청 내역·승인','연차 승인·반려 처리 실패({msg}는 서버 오류)','처리 실패: {msg}',['msg']);
  add('leave.m_act_unknown','🌿 연차 › 내 연차·신청 내역·승인','연차 승인·반려 — 결과를 확인 못 했을 때','처리 결과를 확인하지 못했습니다. 새로고침 후 확인하세요.');
  add('leave.m_cancelok_state','🌿 연차 › 내 연차·신청 내역·승인','승인 취소·복구 — 승인 상태가 아닐 때','취소할 수 없는 상태입니다.');
  add('leave.m_cancelok_confirm','🌿 연차 › 내 연차·신청 내역·승인','승인 취소·복구 누르면 뜨는 확인창({name}=직원 이름 · {from}~{to}=휴가 기간)','{name}님의 {from}~{to} 연차 승인을 취소하고 사용일수를 복구합니다. 계속하시겠습니까?',['name','from','to']);
  add('leave.m_cancelok_fail','🌿 연차 › 내 연차·신청 내역·승인','승인 취소·복구 실패({msg}는 서버 오류)','승인 취소·복구 실패: {msg}',['msg']);
  add('leave.m_cancelok_unknown','🌿 연차 › 내 연차·신청 내역·승인','승인 취소·복구 — 결과를 확인 못 했을 때','취소·복구 결과를 확인하지 못했습니다. 새로고침 후 확인하세요.');
  add('leave.my.btn_apply','🌿 연차 › 내 연차·신청 내역·승인','내 연차 카드 — 연차 신청 단추','연차 신청');
  add('leave.my.list_title','🌿 연차 › 내 연차·신청 내역·승인','내 연차 카드 — 신청 내역 소제목','내 신청 내역');
  add('leave.m_edit_only','🌿 연차 › 연차 신청 창','연차 신청 수정 — 대기 중이 아니거나 내 신청이 아닐 때','대기 중인 본인 신청만 수정할 수 있습니다.');
  add('leave.m_edit_hint','🌿 연차 › 연차 신청 창','연차 신청 창 — 수정하려고 열었을 때 안내','수정 후 저장하세요.');
  add('leave.m_overlap','🌿 연차 › 연차 신청 창','연차 신청 창 — 같은 날 이미 신청한 사람 안내({names}는 이름들)','이미 신청됨: {names}',['names']);
  add('leave.m_clash','🌿 연차 › 연차 신청 창','연차 신청 창 — 같은 날 휴가 인원이 가득 차서 신청 못 할 때({n}은 허브 설정의 동시 휴가 한도)','그 날 이미 {n}명이 휴가입니다. 신청할 수 없습니다',['n']);
  add('leave.m_need_period','🌿 연차 › 연차 신청 창','연차 신청 — 기간을 안 넣고 신청했을 때','기간을 입력하세요.');
  add('leave.m_bad_period','🌿 연차 › 연차 신청 창','연차 신청 — 종료일이 시작일보다 빠를 때','종료일이 시작일보다 빠릅니다.');
  add('leave.m_bad_time','🌿 연차 › 연차 신청 창','연차 신청 — 반차·조퇴 시간 범위가 틀렸을 때','반차·조퇴의 시간 범위를 확인하세요.');
  add('leave.m_full','🌿 연차 › 연차 신청 창','연차 신청 — 같은 날 휴가 인원이 가득 차서 신청이 안 됐을 때({n}은 허브 설정의 동시 휴가 한도)','⚠ 신청되지 않았습니다 — 그 날 이미 {n}명이 휴가입니다.',['n']);
  add('leave.m_need_reason','🌿 연차 › 연차 신청 창','연차 신청 — 같은 날 이미 휴가자가 있는데 특별사정 사유를 안 적었을 때','⚠ 신청되지 않았습니다 — 그날 이미 휴가자가 있어 특별사정 사유를 적어야 신청됩니다.');
  add('leave.m_save_unknown','🌿 연차 › 연차 신청 창','연차 신청 — 저장 결과를 확인 못 했을 때','신청 저장 결과를 확인하지 못했습니다.');
  add('leave.m_fail','🌿 연차 › 연차 신청 창','연차 신청 실패({msg}는 서버 오류)','실패: {msg}',['msg']);
  add('leave.apply.title','🌿 연차 › 연차 신청 창','연차 신청 창 맨 위 제목','📅 연차 신청');
  add('leave.apply.f_type','🌿 연차 › 연차 신청 창','연차 신청 창 칸 이름 — 유형(고르는 값의 이름은 📋 목록에서 고침)','유형');
  add('leave.apply.f_time','🌿 연차 › 연차 신청 창','연차 신청 창 칸 이름 — 반차·조퇴 시간 범위','시간 범위');
  add('leave.apply.f_note','🌿 연차 › 연차 신청 창','연차 신청 창 칸 이름 — 유형이 「기타」일 때 사유','기타 사유(타이핑)');
  add('leave.apply.f_from','🌿 연차 › 연차 신청 창','연차 신청 창 칸 이름 — 시작일','시작일');
  add('leave.apply.f_to','🌿 연차 › 연차 신청 창','연차 신청 창 칸 이름 — 종료일','종료일');
  add('leave.apply.f_reason','🌿 연차 › 연차 신청 창','연차 신청 창 칸 이름 — 사유','사유(선택)');
  add('leave.apply.f_contact','🌿 연차 › 연차 신청 창','연차 신청 창 칸 이름 — 연락처','연락처(선택)');
  add('leave.apply.ph_contact','🌿 연차 › 연차 신청 창','연차 신청 창 — 연락처 칸 안에 흐리게 보이는 글','연락처(선택)');
  add('leave.apply.special','🌿 연차 › 연차 신청 창','연차 신청 창 — 같은 날 이미 휴가자가 있을 때 뜨는 특별사정 안내(몇 명부터인지는 🔢 숫자·기준에서 고침)','⚠ 그날 이미 휴가자가 있습니다. 특별사정이면 사유를 적고 신청하세요.');
  add('leave.apply.ph_special','🌿 연차 › 연차 신청 창','연차 신청 창 — 특별사정 칸 안에 흐리게 보이는 글','특별사정 사유');
  add('leave.apply.btn','🌿 연차 › 연차 신청 창','연차 신청 창 아래 신청 단추','신청');
  add('leave.form.title','🌿 연차 › 휴가 신청서','휴가 신청서 인쇄물 맨 위 큰 제목(글자 사이 띄어쓰기도 그대로)','휴 가 신 청 서');
  add('leave.form.sign_a','🌿 연차 › 휴가 신청서','휴가 신청서 오른쪽 위 결재칸 — 첫째 칸 이름','중간관리자');
  add('leave.form.sign_b','🌿 연차 › 휴가 신청서','휴가 신청서 오른쪽 위 결재칸 — 둘째 칸 이름','대표원장');
  add('leave.form.f_name','🌿 연차 › 휴가 신청서','휴가 신청서 칸 이름 — 성명','성명');
  add('leave.form.f_dept','🌿 연차 › 휴가 신청서','휴가 신청서 칸 이름 — 소속','소속');
  add('leave.form.lead','🌿 연차 › 휴가 신청서','휴가 신청서 본문 첫 문장','아래와 같이 휴가를 실시하고자 하오니 승인하여 주시기 바랍니다.');
  add('leave.form.f_type','🌿 연차 › 휴가 신청서','휴가 신청서 칸 이름 — 휴가종류','휴가종류');
  add('leave.form.f_period','🌿 연차 › 휴가 신청서','휴가 신청서 칸 이름 — 기간','기간');
  add('leave.form.f_reason','🌿 연차 › 휴가 신청서','휴가 신청서 칸 이름 — 사유','사유');
  add('leave.form.f_contact','🌿 연차 › 휴가 신청서','휴가 신청서 칸 이름 — 연락처','연락처');
  add('leave.form.f_etc','🌿 연차 › 휴가 신청서','휴가 신청서 칸 이름 — 기타','기타');
  add('leave.form.special','🌿 연차 › 휴가 신청서','휴가 신청서 기타 칸 — 특별사정으로 신청한 건 앞 글(뒤에 사유가 이어 붙음)','특별사정:');
  add('leave.form.applied_on','🌿 연차 › 휴가 신청서','휴가 신청서 — 신청일 앞 글(뒤에 날짜가 붙음)','신청일:');
  add('leave.form.applicant','🌿 연차 › 휴가 신청서','휴가 신청서 — 신청인 서명줄 앞 글(뒤에 이름이 붙음)','위 신청인');
  add('leave.form.stamp_apply','🌿 연차 › 휴가 신청서','휴가 신청서 — 신청인 도장 위에 찍히는 말','신청');
  add('leave.form.to','🌿 연차 › 휴가 신청서','휴가 신청서 맨 아래 받는 곳(병원 이름)','아산정플란트치과의원 대표자 귀하');
  add('leave.form.modal_title','🌿 연차 › 휴가 신청서','휴가 신청서 창 맨 위 제목(인쇄물 제목과 별개)','📄 휴가 신청서');
  add('leave.form.btn_print','🌿 연차 › 휴가 신청서','휴가 신청서 창 — 1장 인쇄 단추','🖨️ 1장 인쇄');
  add('leave.form.stamp_ok','🌿 연차 › 휴가 신청서','휴가 신청서 오른쪽 위 결재칸 도장 위에 찍히는 말(실장·원장 승인 도장)','승인');
  add('leave.form.total','🌿 연차 › 휴가 신청서','휴가 신청서 기간 칸 — 총 일수 글({n}은 일수)','총 {n}일',['n']);
  add('leave.grant.title','🌿 연차 › 연차 부여·자동 적립(원장)','연차 부여 카드 제목(원장)','➕ 연차 부여/절대 잔액 설정');
  add('leave.owner_tag','🌿 연차 › 연차 부여·자동 적립(원장)','원장 전용 카드 제목 옆 작은 글(부여·자동 적립 공통)','원장');
  add('leave.grant.th_name','🌿 연차 › 연차 부여·자동 적립(원장)','연차 부여 표 머리 — 이름','이름');
  add('leave.grant.th_hire','🌿 연차 › 연차 부여·자동 적립(원장)','연차 부여 표 머리 — 입사일','입사일');
  add('leave.grant.th_suggest','🌿 연차 › 연차 부여·자동 적립(원장)','연차 부여 표 머리 — 제안일수','제안일수');
  add('leave.grant.btn_fill','🌿 연차 › 연차 부여·자동 적립(원장)','연차 부여 표 — 제안 일수 채우기 단추','이 값으로 채우기');
  add('leave.grant.ph_days','🌿 연차 › 연차 부여·자동 적립(원장)','연차 부여 — 일수 칸 안에 흐리게 보이는 글','일수');
  add('leave.grant.ph_note','🌿 연차 › 연차 부여·자동 적립(원장)','연차 부여 — 메모 칸 안에 흐리게 보이는 글','메모(예: 2026년 정기부여)');
  add('leave.grant.hint','🌿 연차 › 연차 부여·자동 적립(원장)','연차 부여 카드 아래 안내','정기 부여는 아래 발생일별 미리보기에서 개근·재직을 확인한 뒤 적용합니다. 이 화면의 ‘부여’는 해당 확인 화면으로 이동합니다. ‘조정’은 목표 잔액을 설정합니다.');
  add('leave.acc.title','🌿 연차 › 연차 부여·자동 적립(원장)','자동 연차 적립 카드 제목(원장)','📆 자동 연차 적립 확인');
  add('leave.acc.hint','🌿 연차 › 연차 부여·자동 적립(원장)','자동 연차 적립 카드 설명','먼저 발생 예정 내역을 확인하고, 각 기간의 개근·재직을 원장이 확인한 뒤 적용합니다. 기존 수기 지급분은 중복 지급하지 않도록 반영됩니다.');
  add('leave.acc.f_asof','🌿 연차 › 연차 부여·자동 적립(원장)','자동 연차 적립 — 기준일 칸 이름','기준일');
  add('leave.acc.btn_preview','🌿 연차 › 연차 부여·자동 적립(원장)','자동 연차 적립 — 미리보기 단추','미리보기');
  add('leave.acc.btn_apply','🌿 연차 › 연차 부여·자동 적립(원장)','자동 연차 적립 — 확인한 항목 적용 단추','확인한 항목 적용');
  add('leave.acc.need_preview','🌿 연차 › 연차 부여·자동 적립(원장)','자동 연차 적립 — 미리보기를 누르기 전 안내','적용 전 미리보기가 필요합니다.');
  add('leave.m_grant_pick','🌿 연차 › 연차 부여·자동 적립(원장)','연차 부여 — 「부여」를 눌렀을 때 아래 적립 확인 화면 안내','해당 직원·발생일을 확인해 선택하세요. 이미 수기로 준 일수는 미리보기에서 상계됩니다.');
  add('leave.m_grant_days','🌿 연차 › 연차 부여·자동 적립(원장)','연차 부여 — 일수를 잘못 넣었을 때','일수는 0 이상으로 입력하세요. 0일도 절대 잔액 조정값으로 기록할 수 있습니다.');
  add('leave.m_grant_fail','🌿 연차 › 연차 부여·자동 적립(원장)','연차 부여·잔액 설정 실패({msg}는 서버 오류)','연차 기록 실패: {msg}',['msg']);
  add('leave.m_grant_unknown','🌿 연차 › 연차 부여·자동 적립(원장)','연차 잔액 설정 — 결과를 확인 못 했을 때','잔액 설정 결과를 확인하지 못했습니다.');
  add('leave.acc.m_bad_date','🌿 연차 › 연차 부여·자동 적립(원장)','자동 연차 적립 — 기준일이 틀렸을 때','오늘 이전의 올바른 기준일을 선택하세요.');
  add('leave.acc.m_loading','🌿 연차 › 연차 부여·자동 적립(원장)','자동 연차 적립 — 미리보기 불러오는 중','미리보기 불러오는 중…');
  add('leave.acc.m_prev_fail','🌿 연차 › 연차 부여·자동 적립(원장)','자동 연차 적립 — 미리보기 실패({msg}는 서버 오류)','연차 미리보기 실패: {msg}',['msg']);
  add('leave.acc.th_check','🌿 연차 › 연차 부여·자동 적립(원장)','자동 연차 적립 표 머리 — 개근·재직 확인','개근·재직 확인');
  add('leave.acc.th_hire','🌿 연차 › 연차 부여·자동 적립(원장)','자동 연차 적립 표 머리 — 입사일','입사일');
  add('leave.acc.th_due','🌿 연차 › 연차 부여·자동 적립(원장)','자동 연차 적립 표 머리 — 발생일','발생일');
  add('leave.acc.th_kind','🌿 연차 › 연차 부여·자동 적립(원장)','자동 연차 적립 표 머리 — 구분','구분');
  add('leave.acc.th_step','🌿 연차 › 연차 부여·자동 적립(원장)','자동 연차 적립 표 머리 — 단계','단계');
  add('leave.acc.th_exist','🌿 연차 › 연차 부여·자동 적립(원장)','자동 연차 적립 표 머리 — 기존 수기 포함','기존 수기 포함');
  add('leave.acc.th_grant','🌿 연차 › 연차 부여·자동 적립(원장)','자동 연차 적립 표 머리 — 이번 지급','이번 지급');
  add('leave.acc.recorded','🌿 연차 › 연차 부여·자동 적립(원장)','자동 연차 적립 표 — 이미 기록된 건 표시','기록됨');
  add('leave.acc.kind_annual','🌿 연차 › 연차 부여·자동 적립(원장)','자동 연차 적립 표 구분 칸 — 입사 1년째 연차','1년 15일');
  add('leave.acc.kind_month','🌿 연차 › 연차 부여·자동 적립(원장)','자동 연차 적립 표 구분 칸 — 월차','월차');
  add('leave.acc.empty','🌿 연차 › 연차 부여·자동 적립(원장)','자동 연차 적립 — 기준일까지 내역이 하나도 없을 때','기준일까지 발생한 내역이 없습니다.');
  add('leave.acc.m_check_hint','🌿 연차 › 연차 부여·자동 적립(원장)','자동 연차 적립 — 미리보기를 불러온 뒤 안내','적용할 발생일마다 개근·재직을 확인해 체크하세요. 0일도 수기 지급 충족 기록을 남길 수 있습니다.');
  add('leave.acc.m_redo_preview','🌿 연차 › 연차 부여·자동 적립(원장)','자동 연차 적용 — 기준일을 바꾼 뒤 적용하려 할 때','기준일을 다시 미리보기로 확인하세요.');
  add('leave.acc.m_pick_one','🌿 연차 › 연차 부여·자동 적립(원장)','자동 연차 적용 — 체크한 항목이 없을 때','개근·재직을 확인한 항목을 선택하세요.');
  add('leave.acc.m_confirm','🌿 연차 › 연차 부여·자동 적립(원장)','자동 연차 적용 누르면 뜨는 확인창({n}=선택한 발생일 수 · {days}=지급될 일수)','{n}개 발생일의 개근·재직을 확인하고, 미리보기 기준 {days}일을 연차 장부에 적용할까요?',['n','days']);
  add('leave.acc.m_applying','🌿 연차 › 연차 부여·자동 적립(원장)','자동 연차 적용 중 글','적용 중…');
  add('leave.acc.m_apply_fail','🌿 연차 › 연차 부여·자동 적립(원장)','자동 연차 적용 실패({msg}는 서버 오류)','적용 실패: {msg}',['msg']);
  add('leave.acc.m_done','🌿 연차 › 연차 부여·자동 적립(원장)','자동 연차 적용 성공({created}=기록 건수 · {granted}=실제 지급 일수)','적용 완료: {created}건 기록, 실제 {granted}일 지급. 기록 상태를 확인하세요.',['created','granted']);
  add('leave.acc.m_none','🌿 연차 › 연차 부여·자동 적립(원장)','자동 연차 적용 — 새로 적용된 기록이 없을 때','새로 적용된 기록이 없습니다. 이미 기록된 발생일인지 확인하세요.');
  add('leave.acc.m_recheck_fail','🌿 연차 › 연차 부여·자동 적립(원장)','자동 연차 적용 — 적용은 됐는데 다시 불러오기가 실패했을 때(뒤에 위 메시지가 붙음)','적용 응답은 성공했으나 재조회 실패 — {msg}',['msg']);
}
// ── 차례 4: 결재함·공지·캘린더·건의함 글(기본 글은 hr.html의 글과 같아야 함 — 시험이 대조) ──
function hubTextDefsChapter4(add){
  const A1='🖊 결재함 › 결재함 화면';
  const A2='🖊 결재함 › 문서 카드·결재 처리';
  const A3='🖊 결재함 › 결재 올리기 창';
  const A4='🖊 결재함 › 재직증명서 창';
  add('appr.title',A1,'결재함 화면 맨 위 큰 제목','🖊 결재');
  add('appr.hint',A1,'결재함 제목 아래 설명(결재선이 바뀌면 이 글도 같이 고쳐 주세요)','직원은 문서를 올리고 진행 상태를 확인합니다. 실장은 올라온 문서를 먼저 검토하고, 원장이 최종 결재합니다.');
  add('appr.btn_new',A1,'결재함 맨 위 「결재 올리기」 단추 글','결재 올리기');
  add('appr.inbox.title',A1,'「내 결재 대기」 묶음 제목(실장·원장 화면)','📥 내 결재 대기');
  add('appr.inbox.empty',A1,'내 결재 대기가 하나도 없을 때 뜨는 글','대기 없음');
  add('appr.archive.title',A1,'「완결된 결재 문서」 묶음 제목(실장·원장 화면)','🗂 완결된 결재 문서');
  add('appr.archive.empty',A1,'완결된 결재 문서가 하나도 없을 때 뜨는 글','없음');
  add('appr.btn_cancel',A1,'완결된 결재 문서 아래 「취소」 단추 글(완결 처리를 되돌리는 단추)','취소');
  add('appr.mine.title',A1,'「내가 올린 문서」 묶음 제목','📄 내가 올린 문서');
  add('appr.mine.empty',A1,'내가 올린 문서가 하나도 없을 때 뜨는 글','없음');
  add('appr.card.open_cert',A2,'재직증명서가 발급된 문서 카드의 「발급본 열기」 단추 글','발급본 열기');
  add('appr.card.btn_ok',A2,'결재 대기 문서 카드의 승인 단추 글','🔴 도장(승인)');
  add('appr.card.btn_rej',A2,'결재 대기 문서 카드의 반려 단추 글','반려');
  add('appr.steps.label',A2,'문서 카드의 결재선 줄 맨 앞 글(뒤에 단계가 이어 붙음)','결재선:');
  add('appr.steps.chief',A2,'결재선 줄에 보이는 실장 단계 이름','실장');
  add('appr.steps.owner',A2,'결재선 줄에 보이는 원장 단계 이름','원장');
  add('appr.m_cancel_state',A2,'완결이 아닌 문서의 완결 취소를 눌렀을 때 알림창','취소할 수 없는 상태입니다.');
  add('appr.cancel.confirm',A2,'완결 취소를 누르면 뜨는 확인창({kind}=결재 종류 · {title}=문서 제목)','[{kind}] {title} 문서의 완결 처리를 취소합니다. 계속하시겠습니까?',['kind','title']);
  add('appr.act.m_req_fail',A2,'승인·반려를 눌렀는데 결재 요청을 못 읽었을 때 알림창','결재 요청을 확인하지 못했습니다.');
  add('appr.act.m_cert_fail',A2,'재직증명서 발급 승인이 실패했을 때 알림창({msg}는 서버 오류)','재직증명서 발급 실패: {msg}',['msg']);
  add('appr.act.m_no_step',A2,'내 차례가 아닌 단계를 처리하려 했을 때 알림창','현재 단계가 아닙니다.');
  add('appr.modal.title',A3,'결재 올리기 창 맨 위 제목','🖊 결재 올리기');
  add('appr.modal.f_kind',A3,'결재 올리기 창 칸 이름 — 종류(고르는 종류 이름은 📋 목록 탭에서 고침)','종류');
  add('appr.modal.f_title',A3,'결재 올리기 창 칸 이름 — 제목','제목');
  add('appr.modal.f_body',A3,'결재 올리기 창 칸 이름 — 내용','내용');
  add('appr.modal.hint',A3,'결재 올리기 창 아래 안내(결재선·재직증명서 발급 안내)','결재선: 나 → 실장 → 원장 (각 단계 도장). 재직증명서는 최종 승인 시 재직 정보를 확인해 발급되며, 필수 정보가 없으면 발급되지 않습니다.');
  add('appr.modal.btn_submit',A3,'결재 올리기 창 아래 올리기 단추','올리기');
  add('appr.m_title_required',A3,'결재 올리기 — 제목을 안 적었을 때 창 안에 뜨는 글','제목을 입력하세요.');
  add('appr.m_fail',A3,'결재 올리기 저장 실패({msg}는 서버 오류)','실패: {msg}',['msg']);
  add('appr.cert.title',A4,'재직증명서 보기 창 맨 위 제목','📄 재직증명서');
  add('appr.cert.btn_download',A4,'재직증명서 보기 창 — 내려받기 단추','⬇️ 발급본 다운로드');
  add('appr.cert.btn_print',A4,'재직증명서 보기 창 — 인쇄·PDF 저장 단추','🖨️ 인쇄·PDF 저장');
  add('appr.cert.m_no_html',A4,'보관된 발급본을 못 열 때 알림창','보관된 발급본을 열 수 없습니다.');
  const N1='📢 공지 › 공지 화면';
  const N2='📢 공지 › 공지 작성 창';
  const N3='📢 공지 › 첨부 미리보기';
  add('notice.title',N1,'공지 화면 맨 위 큰 제목','📢 공지');
  add('notice.btn_new',N1,'공지 화면 맨 위 「공지 작성」 단추 글','공지 작성');
  add('notice.empty',N1,'공지가 하나도 없을 때 뜨는 글','공지 없음');
  add('notice.link_full',N1,'노션 링크가 있는 공지의 「전문」 링크 글','전문 ↗');
  add('notice.btn_del',N1,'공지 아래 삭제 단추 글(실장·원장 화면)','삭제');
  add('notice.attach_none',N1,'첨부가 없는 공지에 뜨는 글','첨부 없음');
  add('notice.attach_label',N1,'첨부가 있는 공지의 첨부 줄 맨 앞 글(뒤에 파일 이름 단추가 이어 붙음)','첨부:');
  add('notice.attach_default_name',N1,'이름이 없는 첨부 파일 단추에 대신 보이는 글','첨부파일');
  add('notice.del.confirm',N1,'공지 삭제를 누르면 뜨는 확인창','삭제할까요?');
  add('notice.modal.title',N2,'공지 작성 창 맨 위 제목','📢 공지 작성');
  add('notice.modal.f_title',N2,'공지 작성 창 칸 이름 — 제목','제목');
  add('notice.modal.f_body',N2,'공지 작성 창 칸 이름 — 내용','내용(짧게)');
  add('notice.modal.paste_hint',N2,'공지 작성 창 내용 칸 아래 안내(캡처 붙여넣기)','화면을 캡처한 뒤 Ctrl+V로 본문에 붙여넣을 수 있습니다.');
  add('notice.modal.f_url',N2,'공지 작성 창 칸 이름 — 노션 링크','긴 글은 노션 링크(선택)');
  add('notice.modal.f_files',N2,'공지 작성 창 칸 이름 — 파일 첨부','업무파일 첨부');
  add('notice.modal.files_hint',N2,'공지 작성 창 파일 칸 아래 안내(글만 고침 — 허용·차단 파일 형식과 10MB 한도는 서버 규칙이라 그대로예요)','일반 문서를 허용하며 압축·실행 파일은 거부됩니다.');
  add('notice.modal.f_pin',N2,'공지 작성 창 — 상단 고정 체크 칸 글','상단 고정');
  add('notice.modal.btn_submit',N2,'공지 작성 창 아래 게시 단추','게시');
  add('notice.m_title_required',N2,'공지 작성 — 제목을 안 적었을 때 창 안에 뜨는 글','제목을 입력하세요.');
  add('notice.m_bad_file',N2,'공지 작성 — 허용 안 되는 파일이나 큰 파일을 골랐을 때 뜨는 글(글만 고침 — 실제 한도는 그대로예요)','허용되지 않은 파일 형식 또는 10MB 초과 파일이 있습니다.');
  add('notice.capture_name',N2,'붙여넣은 캡처 이미지에 이름이 없을 때 대신 보이는 이름({n}은 몇 번째)','캡처 이미지 {n}',['n']);
  add('notice.preview.title',N3,'첨부 미리보기 창 맨 위 제목(내 서류함에서 서류를 미리 볼 때도 같은 창)','📎 첨부 미리보기');
  add('notice.preview_unsupported',N3,'미리보기가 안 되는 형식의 파일을 열었을 때 뜨는 글(내 서류함 미리보기도 같음)','이 형식은 미리보기를 지원하지 않습니다. 다운로드하여 확인하세요.');
  add('notice.m_open_fail',N3,'첨부 파일을 못 열었을 때 알림창({msg}는 서버 오류)','첨부 열기 실패: {msg}',['msg']);
  const C1='📅 캘린더 › 월·주간 화면';
  const C2='📅 캘린더 › 날짜 상세·일정 추가';
  const C3='📅 캘린더 › 연차 캘린더 보기';
  add('cal.title',C1,'캘린더 화면 맨 위 큰 제목(불러오기 실패 화면 제목도 같음)','📅 캘린더');
  add('cal.view_all',C1,'보기 고르는 단추 — 전체','전체');
  add('cal.view_work',C1,'보기 고르는 단추 — 근무','근무');
  add('cal.view_leave',C1,'보기 고르는 단추 — 연차(누르면 연차 캘린더로 바뀜)','연차');
  add('cal.period_week',C1,'기간 고르는 단추 — 주간','주간');
  add('cal.period_month',C1,'기간 고르는 단추 — 월간','월간');
  add('cal.prev_week',C1,'주간 보기 — 지난주 단추','◀ 지난주');
  add('cal.next_week',C1,'주간 보기 — 다음주 단추','다음주 ▶');
  add('cal.f_date',C1,'주간 보기 — 날짜 고르는 칸 이름','날짜');
  add('cal.prev_month',C1,'월간 보기 — 지난달 단추','◀ 지난달');
  add('cal.f_month',C1,'월간 보기 — 대상 월 고르는 칸 이름(연차 캘린더의 같은 칸도 같은 글)','대상 월');
  add('cal.next_month',C1,'월간 보기 — 다음달 단추','다음달 ▶');
  add('cal.btn_png',C1,'캘린더 이미지로 저장 단추','PNG로 저장');
  add('cal.btn_pdf',C1,'캘린더 PDF로 저장(인쇄) 단추','PDF로 저장');
  add('cal.err_load',C1,'캘린더를 못 불러왔을 때 뜨는 글','캘린더 정보를 불러오지 못했습니다. 잠시 후 다시 시도하세요.');
  add('cal.btn_retry',C1,'캘린더·연차 캘린더 불러오기 실패 화면의 다시 시도 단추','다시 시도');
  add('cal.status_pub',C1,'근무표가 확정된 주의 표시(날짜 칸 아래·주간 표 머리)','확정');
  add('cal.status_draft',C1,'근무표가 작성 중인 주의 표시(날짜 칸 아래·주간 표 머리)','작성 중');
  add('cal.week.th_role',C1,'주간 보기 표 맨 왼쪽 위 머리 글','직무');
  add('cal.week.aria_count',C1,'주간 보기 숫자 단추에 붙는 화면 읽기용 글({n}=인원 수)','{n}명 상세 보기',['n']);
  add('cal.roster_count',C1,'날짜 칸의 부서별 인원 글({label}=부서 이름 · {n}=인원 수)','{label} {n}명',['label','n']);
  add('cal.m_png_fail',C1,'PNG 저장을 못 준비했을 때 알림창','PNG 저장을 준비하지 못했습니다. 브라우저에서 다시 시도하세요.');
  add('cal.day.label',C2,'오른쪽 날짜 패널 맨 위 작은 글','선택 날짜');
  add('cal.day.pick',C2,'날짜를 아직 안 골랐을 때 패널 제목 자리에 뜨는 글','날짜를 선택하세요');
  add('cal.day.empty',C2,'고른 날짜에 근무·연차가 하나도 없을 때 패널에 뜨는 글','등록된 근무·연차가 없습니다.');
  add('cal.detail.title',C2,'날짜 상세 창 제목({date}=고른 날짜)','{date} 상세',['date']);
  add('cal.detail.aria_close',C2,'날짜 상세 창 닫기 단추에 붙는 화면 읽기용 글','날짜 상세 닫기');
  add('cal.detail.close',C2,'날짜 상세 창 닫기 단추 글','닫기');
  add('cal.detail.empty',C2,'날짜 상세 창에 근무·OFF·연차가 하나도 없을 때 뜨는 글','등록된 근무·OFF·연차가 없습니다.');
  add('cal.ph_title',C2,'일정 추가 줄 — 제목 칸 안에 흐리게 보이는 글(실장·원장 화면)','제목');
  add('cal.btn_add',C2,'일정 추가 줄 — 추가 단추 글(일정 종류 이름은 📋 목록 탭에서 고침)','추가');
  add('cal.del.confirm',C2,'일정(✕)을 지우려 할 때 뜨는 확인창','삭제할까요?');
  add('lvs.title',C3,'연차 캘린더 화면 제목','🏖 연차 캘린더');
  add('lvs.title_err',C3,'연차 정보를 못 불러왔을 때 화면 제목(띄어쓰기 없는 옛 글 그대로)','🏖 연차캘린더');
  add('lvs.err_load',C3,'연차 정보를 못 불러왔을 때 뜨는 글({msg}는 서버 오류)','연차 정보를 불러오지 못했습니다: {msg}',['msg']);
  add('lvs.unknown_error',C3,'서버 오류 내용이 없을 때 {msg} 자리에 대신 들어가는 글','알 수 없는 오류');
  add('lvs.btn_work',C3,'연차 캘린더 맨 위 — 근무 캘린더로 돌아가는 단추','근무 캘린더');
  add('lvs.btn_leave',C3,'연차 캘린더 맨 위 — 연차 캘린더 단추','연차 캘린더');
  add('lvs.btn_cal',C3,'연차 캘린더 — 달력 보기 단추','달력 보기');
  add('lvs.btn_list',C3,'연차 캘린더 — 목록 보기 단추','목록 보기');
  add('lvs.hint',C3,'연차 캘린더 단추 아래 안내','승인된 연차만 표시합니다.');
  add('lvs.empty',C3,'선택한 달에 승인된 연차가 하나도 없을 때 뜨는 글','선택한 달의 승인 연차가 없습니다.');
  add('lvs.th_name',C3,'목록 보기 표 머리 — 이름','이름');
  add('lvs.th_type',C3,'목록 보기 표 머리 — 종류(원장 화면)','종류');
  add('lvs.th_period',C3,'목록 보기 표 머리 — 기간','기간');
  add('lvs.th_days',C3,'목록 보기 표 머리 — 일수','일수');
  add('lvs.th_applied',C3,'목록 보기 표 머리 — 신청 시각(원장 화면)','신청 시각');
  add('lvs.th_approved',C3,'목록 보기 표 머리 — 승인 시각(원장 화면)','승인 시각');
  const G1='💡 건의함 › 건의함 화면';
  const G2='💡 건의함 › 평가·수상·알림창';
  add('sug.title',G1,'건의함 화면 맨 위 제목(캠페인이 없거나 불러오기 실패일 때. 캠페인이 있을 땐 캠페인 제목이 보임)','💡 건의함');
  add('sug.none',G1,'진행 중인 건의 캠페인이 하나도 없을 때 뜨는 글','진행 중인 건의함이 없습니다.');
  add('sug.err_load',G1,'건의함 정보를 못 불러왔을 때 뜨는 글({msg}는 서버 오류)','건의함 정보를 불러오지 못했습니다: {msg}',['msg']);
  add('sug.err_like',G1,'좋아요 정보를 못 불러왔을 때 뜨는 글({msg}는 서버 오류)','좋아요 정보를 불러오지 못했습니다: {msg}',['msg']);
  add('sug.err_review',G1,'평가 정보를 못 불러왔을 때 뜨는 글(원장 화면 · {msg}는 서버 오류)','평가 정보를 불러오지 못했습니다: {msg}',['msg']);
  add('sug.err_award',G1,'수상 정보를 못 불러왔을 때 뜨는 글({msg}는 서버 오류)','수상 정보를 불러오지 못했습니다: {msg}',['msg']);
  add('sug.unknown_error',G1,'서버 오류 내용이 없을 때 {msg} 자리에 대신 들어가는 글','알 수 없는 오류');
  add('sug.state_active',G1,'캠페인 기간 줄 — 진행 중일 때 표시','진행 중');
  add('sug.state_ended',G1,'캠페인 기간 줄 — 끝났을 때 표시','종료');
  add('sug.prize_line',G1,'캠페인 기간 줄의 상금 글({a}·{b}·{c}=1·2·3위 상금 숫자. 상금 금액 자체는 「캠페인 설정」에서 고쳐요)','1위 {a}원 / 2위 {b}원 / 3위 {c}원',['a','b','c']);
  add('sug.campaign.title',G1,'캠페인 설정 칸 제목(원장 화면)','owner 캠페인 설정');
  add('sug.campaign.btn_save',G1,'캠페인 설정 칸 저장 단추(원장 화면)','저장');
  add('sug.new.title',G1,'새 건의 쓰는 칸 제목(캠페인 기간 중에만 보임)','새 건의 작성');
  add('sug.new.ph_title',G1,'새 건의 — 제목 칸 안에 흐리게 보이는 글','제목');
  add('sug.new.ph_body',G1,'새 건의 — 내용 칸 안에 흐리게 보이는 글','건의 내용을 입력하세요.');
  add('sug.new.btn_submit',G1,'새 건의 — 등록 단추','건의 등록');
  add('sug.people_line',G1,'맨 위 사람별 줄({name}=이름 · {posts}=게시글 수 · {likes}=받은 좋아요 수)','{name} · 게시글 {posts}개 · 받은 좋아요 {likes}개',['name','posts','likes']);
  add('sug.btn_like',G1,'건의 카드 좋아요 단추 글(뒤에 숫자가 붙음)','좋아요');
  add('sug.btn_unlike',G1,'이미 좋아요를 눌렀을 때 단추 글(뒤에 숫자가 붙음)','좋아요 취소');
  add('sug.btn_edit',G1,'건의 카드 수정 단추(내 글)','수정');
  add('sug.btn_del',G1,'건의 카드 삭제 단추(내 글·원장)','삭제');
  add('sug.btn_edit_save',G1,'건의 수정 칸 저장 단추','수정 저장');
  add('sug.btn_cancel',G1,'건의 수정 칸 취소 단추','취소');
  add('sug.empty',G1,'등록된 건의가 하나도 없을 때 뜨는 글','등록된 건의가 없습니다.');
  add('sug.review.ph_score',G2,'평가 칸(원장) — 점수 칸 안에 흐리게 보이는 글(글만 고침 — 점수는 1~5만 저장돼요)','점수 1~5');
  add('sug.review.ph_rank',G2,'평가 칸(원장) — 순위 칸 안에 흐리게 보이는 글(글만 고침 — 순위는 1~3만 저장돼요)','순위 1~3');
  add('sug.review.ph_note',G2,'평가 칸(원장) — 메모 칸 안에 흐리게 보이는 글','평가 메모');
  add('sug.review.btn_save',G2,'평가 칸(원장) — 저장 단추','평가 저장');
  add('sug.win.title',G2,'캠페인이 끝난 뒤 수상 결과 칸 제목','수상 결과');
  add('sug.win.row',G2,'수상 결과 한 줄({rank}=순위 · {name}=이름 · {title}=건의 제목 · {amount}=상금 숫자)','{rank}위 · {name} · {title} · {amount}원',['rank','name','title','amount']);
  add('sug.win.none',G2,'수상 결과가 하나도 없을 때 뜨는 글','수상 결과가 없습니다.');
  add('sug.win.note',G2,'수상 결과 칸 맨 아래 작은 글','지급 기능 없음');
  add('sug.m_need_both',G2,'건의 저장 — 제목이나 내용이 비었을 때 알림창','제목과 내용을 입력하세요.');
  add('sug.m_save_fail',G2,'건의 저장 실패 알림창({msg}는 서버 오류)','건의를 저장하지 못했습니다: {msg}',['msg']);
  add('sug.del.confirm',G2,'건의 삭제를 누르면 뜨는 확인창','이 건의를 삭제할까요?');
  add('sug.m_del_fail',G2,'건의 삭제 실패 알림창({msg}는 서버 오류)','건의를 삭제하지 못했습니다: {msg}',['msg']);
  add('sug.m_like_fail',G2,'좋아요 변경 실패 알림창({msg}는 서버 오류)','좋아요를 변경하지 못했습니다: {msg}',['msg']);
  add('sug.m_review_fail',G2,'평가 저장 실패 알림창(원장 · {msg}는 서버 오류)','평가를 저장하지 못했습니다: {msg}',['msg']);
  add('sug.m_campaign_check',G2,'캠페인 설정 저장 — 제목·기간·상금이 잘못됐을 때 알림창(원장)','캠페인 설정을 확인하세요.');
  add('sug.m_campaign_fail',G2,'캠페인 설정 저장 실패 알림창(원장 · {msg}는 서버 오류)','캠페인 설정을 저장하지 못했습니다: {msg}',['msg']);
}
// ── 차례 5: 문의함·상담일지 글(기본 글은 hr.html의 글과 같아야 함 — 시험이 대조) ──
function hubTextDefsChapter5(add){
  const I1='📥 문의함 › 문의함 화면';
  const I2='📥 문의함 › 문의 목록·상태 글';
  const I3='📥 문의함 › 문의 상세·답변';
  const I4='📥 문의함 › 카카오 예약';
  const I5='📥 문의함 › 빠른 수기 접수';
  const I6='📥 문의함 › 네이버 광고 알림';
  add('inbox.title',I1,'문의함 화면 맨 위 큰 제목','📥 통합 문의함');
  add('inbox.hint',I1,'문의함 제목 아래 설명(자동 접수 경로가 늘거나 줄면 이 글도 같이 고쳐 주세요)','네이버 톡톡·당근·카카오·네이버메일·홈페이지·전화 문의를 한곳에서 확인합니다. 네이버 톡톡·홈페이지·카카오·당근은 자동 접수되고, 전화·기타 문의는 수기로 접수할 수 있습니다.');
  add('inbox.btn_consult',I1,'문의함 제목 옆 「상담일지 열기」 단추 글(상담일지를 볼 수 있는 직원 화면)','상담일지 열기');
  add('inbox.f_all_source',I1,'문의 목록 맨 위 — 출처 고르는 칸의 맨 위 항목(전체 보기)','전체 출처');
  add('inbox.f_all_status',I1,'문의 목록 맨 위 — 상태 고르는 칸의 맨 위 항목(전체 보기). 상태 이름 자체는 📋 목록 탭에서 고쳐요','전체 상태');
  add('inbox.btn_reservation',I1,'문의 목록 맨 위 — 카카오 예약만 보는 단추({n}=덴트웹에 아직 안 넣은 예약 건수)','📅 예약 · 미입력 {n}건',['n']);
  add('inbox.btn_filter',I1,'문의 목록 맨 위 — 출처·상태를 적용하는 「필터」 단추','필터');
  add('inbox.no_access',I1,'문의함을 볼 수 없는 직원이 문의함에 들어갔을 때 뜨는 글','통합 문의함 접근 권한이 없습니다.');
  add('inbox.err_load',I1,'문의 목록을 못 불러왔을 때 뜨는 글({msg}는 서버 오류)','문의함 불러오기 실패: {msg}',['msg']);
  add('inbox.th_time',I2,'문의 목록 표 머리 — 받은 시각(컴퓨터 화면)','수신');
  add('inbox.th_source',I2,'문의 목록 표 머리 — 출처','출처');
  add('inbox.th_sender',I2,'문의 목록 표 머리 — 문의한 사람','문의자');
  add('inbox.th_subject',I2,'문의 목록 표 머리 — 제목','제목');
  add('inbox.th_status',I2,'문의 목록 표 머리 — 상태','상태');
  add('inbox.th_assignee',I2,'문의 목록 표 머리 — 담당자','담당');
  add('inbox.btn_detail',I2,'문의 한 줄 끝 「상세」 단추 글(카카오 예약 줄도 같음)','상세');
  add('inbox.unknown_time',I2,'받은 시각을 알 수 없을 때 대신 보이는 글(상세 화면도 같음)','미상');
  add('inbox.neg_kw',I2,'불만·환불 같은 말이 들어 있는 문의 앞에 붙는 표시(어떤 말을 잡는지는 아직 코드에 있어요)','부정 키워드');
  add('inbox.m_assignee',I2,'스마트폰 화면 문의 카드의 담당자 글({name}=담당자 이름)','담당 {name}',['name']);
  add('inbox.group_count',I2,'같은 사람의 문의가 한 묶음일 때 이름 뒤에 붙는 건수({n}=묶음 속 문의 수)','({n}건)',['n']);
  add('inbox.status_hint',I2,'문의 목록 맨 위 건수 줄 아래 상태 풀이 글(상태 이름을 고치면 이 글도 같이 고쳐 주세요)','NEW = 아직 아무도 처리 안 함 · 진행중 = 담당자가 답하는 중 · 리콜 = 다시 연락할 문의 · 종결 = 답변 끝 또는 광고 등 정리');
  add('inbox.sum_new',I2,'문의 목록 맨 위 건수 줄 — 새 문의(뒤에 건수가 붙음)','NEW');
  add('inbox.sum_progress',I2,'문의 목록 맨 위 건수 줄 — 진행 중(뒤에 건수가 붙음)','진행중');
  add('inbox.sum_recall',I2,'문의 목록 맨 위 건수 줄 — 리콜 1·2·3차를 합친 것(뒤에 건수가 붙음)','리콜');
  add('inbox.sum_closed',I2,'문의 목록 맨 위 건수 줄 — 종결(뒤에 건수가 붙음)','종결');
  add('inbox.sum_converted',I2,'문의 목록 맨 위 건수 줄 — 상담일지로 넘어간 것(뒤에 건수가 붙음)','전환');
  add('inbox.empty',I2,'조건에 맞는 문의가 하나도 없을 때 뜨는 글','조건에 맞는 문의가 없습니다.');
  add('inbox.btn_call',I2,'전화 문의 줄에 뜨는 전화 걸기 링크 글','전화 걸기');
  add('inbox.btn_reply_go',I2,'채팅·홈페이지 문의 줄에 뜨는 「답하러 가기」 링크 글(눌러서 가는 주소는 코드에 있어요)','답하러 가기');
  add('inbox.d_count',I3,'문의 상세 맨 위 줄 끝 건수({n}=이 사람의 문의 수)','{n}건',['n']);
  add('inbox.opt_unassigned',I3,'담당자 고르는 칸의 「담당 없음」 항목','미배정');
  add('inbox.btn_save',I3,'문의 상세 — 상태·담당을 저장하는 단추 글','상태·담당 저장');
  add('inbox.btn_convert',I3,'문의 상세 — 상담일지로 넘기는 단추 글','상담일지로 전환');
  add('inbox.f_reply',I3,'문의 상세 — 답변 쓰는 칸 이름','실제 답변 기록');
  add('inbox.btn_reply_save',I3,'문의 상세 — 답변을 기록하는 단추 글','답변 기록');
  add('inbox.err_replies',I3,'답변 이력을 못 불러왔을 때 뜨는 글({msg}는 서버 오류)','답변 이력 불러오기 실패: {msg}',['msg']);
  add('inbox.replies_none',I3,'기록된 답변이 하나도 없을 때 뜨는 글','기록된 답변 없음');
  add('inbox.err_views',I3,'열람 이력을 못 불러왔을 때 뜨는 글(원장 화면 · {msg}는 서버 오류)','열람 이력 불러오기 실패: {msg}',['msg']);
  add('inbox.views_title',I3,'열람 이력 칸 제목(원장 화면)','열람 이력 · 원장 전용');
  add('inbox.m_reply_empty',I3,'답변 기록 — 답변을 안 적고 눌렀을 때 뜨는 글','실제 답변 내용을 입력하세요.');
  add('inbox.m_reply_fail',I3,'답변 기록 저장 실패({msg}는 서버 오류)','기록 실패: {msg}',['msg']);
  add('inbox.m_convert_fail',I3,'상담일지 전환 실패 알림창({msg}는 서버 오류)','상담일지 전환 실패: {msg}',['msg']);
  add('inbox.m_convert_close_fail',I3,'상담일지 전환은 됐는데 나머지 문의를 종결 처리하다 실패했을 때 알림창({msg}는 서버 오류)','상담일지 전환은 됐지만 나머지 문의 종결에는 실패했습니다: {msg}',['msg']);
  add('inbox.m_converted',I3,'상담일지 전환이 끝났을 때 상세 칸에 뜨는 글','상담일지로 전환했습니다. 나머지 처리 대상 문의는 종결 상태로 보존했습니다.');
  add('inbox.kb_title',I4,'카카오 예약 줄·상세의 맨 앞 글(뒤에 일정이나 상태가 이어 붙음)','📅 카카오 예약');
  add('inbox.kb_entered',I4,'카카오 예약 — 덴트웹에 입력을 마친 표시(상세 글 앞부분도 같음)','✅ 덴트웹 입력함');
  add('inbox.kb_not_entered',I4,'카카오 예약 목록 줄 — 덴트웹에 아직 안 넣은 표시','덴트웹 입력 전');
  add('inbox.kb_not_yet',I4,'카카오 예약 상세 — 덴트웹에 아직 안 넣었을 때 뜨는 글','아직 덴트웹 입력 전');
  add('inbox.kb_alert',I4,'카카오 예약 — 예약 내용을 못 읽었을 때 첫 줄이 비어 있으면 대신 보이는 글, 상세 칸 이름','예약 알림');
  add('inbox.kb_time_unknown',I4,'카카오 예약 목록 줄 — 일정도 받은 시각도 없을 때 대신 보이는 글','받은 시각 확인 필요');
  add('inbox.kb_check',I4,'카카오 예약 상세 — 상품·예약자·연락처를 못 읽었을 때 대신 보이는 글','확인 필요');
  add('inbox.kb_f_schedule',I4,'카카오 예약 상세 칸 이름 — 일정','일정');
  add('inbox.kb_f_received',I4,'카카오 예약 상세 칸 이름 — 받은 시각(일정을 못 읽었을 때 값 자리에도 같은 글이 보임)','받은 시각');
  add('inbox.kb_f_product',I4,'카카오 예약 상세 칸 이름 — 상품','상품');
  add('inbox.kb_f_option',I4,'카카오 예약 상세 칸 이름 — 옵션','옵션');
  add('inbox.kb_none',I4,'카카오 예약 상세 — 옵션이 없을 때 뜨는 글','없음');
  add('inbox.kb_f_name',I4,'카카오 예약 상세 칸 이름 — 예약자','예약자');
  add('inbox.kb_f_contact',I4,'카카오 예약 상세 칸 이름 — 연락처','연락처');
  add('inbox.kb_partner_open',I4,'카카오 예약 상세 — 카카오 파트너센터를 여는 링크 글','카카오 파트너센터 열기');
  add('inbox.kb_btn_undo',I4,'카카오 예약 상세 — 덴트웹 입력 표시를 되돌리는 단추 글','↩️ 덴트웹 입력 표시 되돌리기');
  add('inbox.kb_btn_set',I4,'카카오 예약 상세 — 덴트웹에 입력했다고 표시하는 단추 글','✅ 덴트웹에 입력함');
  add('inbox.kb_confirm_hint',I4,'카카오 예약 상세 아래 작은 안내','예약확정은 파트너센터에서');
  add('inbox.kb_original',I4,'카카오 예약 상세 — 받은 글 원문을 펼치는 줄 글','받은 글 원문');
  add('inbox.m_dentweb_unavailable',I4,'덴트웹 입력 표시를 눌렀는데 DB가 아직 준비 안 됐을 때 뜨는 글','완료 기록은 DB 변경을 적용한 뒤 사용할 수 있습니다.');
  add('inbox.confirm_undo_dentweb',I4,'덴트웹 입력 표시를 되돌리려 할 때 뜨는 확인창','덴트웹 입력 완료 표시를 되돌릴까요?');
  add('inbox.m_dentweb_fail',I4,'덴트웹 입력 표시 저장 실패({msg}는 서버 오류)','저장 실패: {msg}',['msg']);
  add('inbox.q_title',I5,'빠른 수기 접수 칸 제목','빠른 수기 접수');
  add('inbox.q_f_source',I5,'빠른 수기 접수 칸 이름 — 출처(고르는 항목 이름은 📋 목록 탭에서 고쳐요)','출처');
  add('inbox.q_f_name',I5,'빠른 수기 접수 칸 이름 — 문의한 사람(필수)','문의자 *');
  add('inbox.q_f_contact',I5,'빠른 수기 접수 칸 이름 — 연락처','연락처');
  add('inbox.q_f_subject',I5,'빠른 수기 접수 칸 이름 — 제목','제목');
  add('inbox.q_f_message',I5,'빠른 수기 접수 칸 이름 — 문의 내용(필수)','문의 내용 *');
  add('inbox.q_btn',I5,'빠른 수기 접수 — 접수 단추 글','문의 접수');
  add('inbox.m_manual_required',I5,'수기 접수 — 문의자나 내용을 안 적었을 때 뜨는 글','문의자와 문의 내용은 필수입니다.');
  add('inbox.m_manual_fail',I5,'수기 접수 저장 실패({msg}는 서버 오류)','저장 실패: {msg}',['msg']);
  add('inbox.m_manual_ok',I5,'수기 접수가 끝났을 때 뜨는 글','문의로 접수했습니다.');
  add('inbox.ad_title',I6,'문의함 위쪽 「네이버 광고 알림」 카드 제목(원장·매니저 화면)','네이버 광고 알림');
  add('inbox.ad_pending',I6,'광고 알림 카드 제목 옆 건수({n}=아직 처리 안 한 알림 수)','미처리 {n}건',['n']);
  add('inbox.ad_more',I6,'광고 알림이 여러 개일 때 펼치는 줄 글({n}=나머지 건수)','+{n}건 펼치기',['n']);
  add('inbox.ad_recent_only',I6,'광고 알림이 너무 많을 때 펼친 칸 아래 글({n}=보이는 건수)','최근 {n}건만 표시함',['n']);
  add('inbox.ad_low',I6,'광고 알림 한 줄 — 잔액이 모자랄 때 제목({n}=기준 금액 숫자)','🟠 네이버 광고 잔액 {n}원 이하',['n']);
  add('inbox.ad_stop',I6,'광고 알림 한 줄 — 광고가 멈췄을 때 제목','🔴 네이버 광고 노출 중단');
  add('inbox.ad_btn_raw',I6,'광고 알림 한 줄 — 받은 원문을 보는 단추 글','원문');
  add('inbox.ad_btn_charged',I6,'광고 알림 한 줄 — 충전했다고 표시하는 단추 글','충전했음');
  add('inbox.ad_charged_fail',I6,'충전 표시 저장 실패 알림창({msg}는 서버 오류)','처리 실패: {msg}',['msg']);
  add('inbox.rc_title',I6,'「광고 푸시 받는 매니저」 칸 제목(원장 화면)','네이버 광고 푸시 받는 매니저');
  add('inbox.rc_owner_always',I6,'「광고 푸시 받는 매니저」 칸 제목 옆 작은 글','원장은 항상 받음');
  add('inbox.rc_hint',I6,'「광고 푸시 받는 매니저」 칸 안내','처음에는 활성 매니저 전원이 받음. 체크를 끄면 그 매니저만 제외됨.');
  add('inbox.rc_none',I6,'받을 수 있는 활성 매니저가 한 명도 없을 때 뜨는 글','활성 매니저 없음');
  add('inbox.rc_btn_save',I6,'「광고 푸시 받는 매니저」 칸 — 저장 단추 글','받는 사람 저장');
  add('inbox.rc_err',I6,'받는 사람 설정을 못 불러왔을 때 뜨는 글({msg}는 서버 오류)','받는 사람 설정을 불러오지 못함: {msg}',['msg']);
  add('inbox.rc_save_fail',I6,'받는 사람 저장 실패 알림창({msg}는 서버 오류)','받는 사람 저장 실패: {msg}',['msg']);
  const C1='🗂 상담일지 › 목록·검색';
  const C2='🗂 상담일지 › 기록 입력·수정';
  const C3='🗂 상담일지 › 오늘·기한 지남';
  add('cj.title',C1,'상담일지 화면 맨 위 큰 제목','🗂 상담일지');
  add('cj.hint',C1,'상담일지 제목 아래 설명(상담일지를 볼 수 있는 직위가 바뀌면 이 글도 같이 고쳐 주세요)','매니저·실장·원장만 볼 수 있습니다. 원본 엑셀 행은 가져오지 않으며, 새 기록만 저장합니다.');
  add('cj.btn_home',C1,'상담일지 제목 옆 「홈으로」 단추 글','홈으로');
  add('cj.ph_search',C1,'상담일지 검색 칸 안에 흐리게 보이는 글','환자명·다음 조치 검색');
  add('cj.f_all_kind',C1,'상담일지 검색 — 구분 고르는 칸의 맨 위 항목(구분 이름은 📋 목록 탭에서 고쳐요)','전체 상담 구분');
  add('cj.f_all_status',C1,'상담일지 검색 — 상태 고르는 칸의 맨 위 항목(상태 이름은 📋 목록 탭에서 고쳐요)','전체 상태');
  add('cj.btn_search',C1,'상담일지 검색 단추 글','검색');
  add('cj.th_date',C1,'상담일지 표 머리 — 상담한 날','상담일');
  add('cj.th_patient',C1,'상담일지 표 머리 — 환자(「오늘·기한 지남」 표도 같음)','환자');
  add('cj.th_kind',C1,'상담일지 표 머리 — 상담 구분','구분');
  add('cj.th_status',C1,'상담일지 표 머리 — 상태','상태');
  add('cj.th_amount',C1,'상담일지 표 머리 — 제시한 비용','제시 비용');
  add('cj.th_next',C1,'상담일지 표 머리 — 다음 조치(「오늘·기한 지남」 표도 같음)','다음 조치');
  add('cj.btn_edit',C1,'상담일지 표 한 줄 끝 수정 단추 글','수정');
  add('cj.list_empty',C1,'조건에 맞는 상담 기록이 하나도 없을 때 뜨는 글','조건에 맞는 상담 기록이 없습니다.');
  add('cj.page_info',C1,'목록 아래 쪽 안내({total}=전체 건수 · {page}=지금 쪽 번호)','{total}건 · {page}쪽',['total','page']);
  add('cj.btn_prev',C1,'목록 아래 이전 쪽 단추 글','이전');
  add('cj.btn_next',C1,'목록 아래 다음 쪽 단추 글','다음');
  add('cj.no_access',C1,'상담일지를 볼 수 없는 직원이 들어갔을 때 뜨는 글','상담일지 접근 권한이 없습니다.');
  add('cj.m_load_fail',C1,'상담일지를 못 불러왔을 때 뜨는 글({msg}는 서버 오류)','상담일지 불러오기 실패: {msg}',['msg']);
  add('cj.unknown_error',C1,'서버 오류 내용이 없을 때 {msg} 자리에 대신 들어가는 글(저장·수정 실패 글도 같음)','알 수 없는 오류');
  add('cj.form_new',C2,'새 기록 쓰는 칸 제목(「새로 입력」을 눌렀을 때도 같은 글)','➕ 새 상담 기록');
  add('cj.form_edit',C2,'기록을 불러와 고칠 때 칸 제목','✏️ 상담 기록 수정');
  add('cj.f_name',C2,'입력 칸 이름 — 환자 이름(필수)','환자명 *');
  add('cj.f_phone',C2,'입력 칸 이름 — 환자 연락처','연락처');
  add('cj.f_kind',C2,'입력 칸 이름 — 상담 구분(필수 · 고르는 항목 이름은 📋 목록 탭에서 고쳐요)','상담 구분 *');
  add('cj.f_date',C2,'입력 칸 이름 — 상담한 날(필수)','상담일 *');
  add('cj.f_status',C2,'입력 칸 이름 — 상태(필수 · 고르는 항목 이름은 📋 목록 탭에서 고쳐요)','상태 *');
  add('cj.f_amount',C2,'입력 칸 이름 — 제시한 비용','제시 비용');
  add('cj.f_note',C2,'입력 칸 이름 — 상담 내용(필수)','상담 내용 *');
  add('cj.f_instruction',C2,'입력 칸 이름 — 지시·기타사항','지시/혹은 기타사항');
  add('cj.f_special',C2,'입력 칸 이름 — 특이사항','특이사항');
  add('cj.f_next',C2,'입력 칸 이름 — 다음 조치','다음 조치');
  add('cj.src_title',C2,'입력 칸 아래 「원본 시트 추가 칸」 제목(칸 이름 자체는 코드에 있어요)','원본 시트 추가 칸');
  add('cj.f_assignee',C2,'입력 칸 이름 — 다음 조치 담당자','다음 조치 담당자');
  add('cj.opt_unassigned',C2,'다음 조치 담당자 고르는 칸의 「담당 없음」 항목(「오늘·기한 지남」 표의 담당자 칸도 같음)','미지정');
  add('cj.opt_stale',C2,'이미 저장된 담당자가 지금은 고를 수 없는 사람일 때 그 항목에 보이는 글','기존 담당자(현재 배정 불가)');
  add('cj.f_due',C2,'입력 칸 이름 — 다음 조치 예정일','예정일');
  add('cj.f_done',C2,'입력 칸 이름 — 조치를 마쳤는지 표시하는 칸','완료');
  add('cj.f_done_check',C2,'「완료」 칸의 체크 옆 글','조치 완료');
  add('cj.btn_save',C2,'새 기록 저장 단추 글','저장');
  add('cj.btn_save_edit',C2,'기록을 고친 뒤 저장하는 단추 글','수정 저장');
  add('cj.btn_reset',C2,'입력 칸을 비우는 단추 글','새로 입력');
  add('cj.m_required',C2,'저장 — 환자명·상담일·상담 내용을 안 적었을 때 뜨는 글','환자명, 상담일, 상담 내용은 필수입니다.');
  add('cj.m_amount',C2,'저장 — 제시 비용이 0 이상 숫자가 아닐 때 뜨는 글','제시 비용은 0 이상의 숫자로 입력하세요.');
  add('cj.m_not_allowed',C2,'저장 — 허락되지 않은 구분·상태가 들어 있을 때 뜨는 글','허용되지 않은 상담 구분 또는 상태입니다.');
  add('cj.m_need_next',C2,'저장 — 다음 조치 없이 담당자·예정일·완료만 적었을 때 뜨는 글','담당자·예정일·완료 표시에는 다음 조치 내용이 필요합니다.');
  add('cj.m_saving',C2,'저장하는 동안 뜨는 글','저장 중…');
  add('cj.m_save_fail',C2,'새 기록 저장 실패({msg}는 서버 오류)','상담일지 저장 실패: {msg}',['msg']);
  add('cj.m_update_fail',C2,'기록 수정 저장 실패({msg}는 서버 오류)','상담일지 수정 실패: {msg}',['msg']);
  add('cj.q_title',C3,'「오늘·기한 지남」 칸 제목','오늘·기한 지남');
  add('cj.q_loading',C3,'「오늘·기한 지남」 칸을 불러오는 동안 뜨는 글','불러오는 중…');
  add('cj.queue_err',C3,'「오늘·기한 지남」 목록을 못 불러왔을 때 뜨는 글({msg}는 서버 오류)','오늘·기한 지남 목록 불러오기 실패: {msg}',['msg']);
  add('cj.q_th_due',C3,'「오늘·기한 지남」 표 머리 — 기한','기한');
  add('cj.q_th_who',C3,'「오늘·기한 지남」 표 머리 — 담당자','담당자');
  add('cj.q_overdue',C3,'「오늘·기한 지남」 표 — 기한이 지난 건의 표시','기한 지남');
  add('cj.q_today',C3,'「오늘·기한 지남」 표 — 오늘이 기한인 건의 표시','오늘');
  add('cj.q_btn_open',C3,'「오늘·기한 지남」 표 한 줄 끝 단추 글(눌러서 그 기록을 불러옴)','열기');
  add('cj.q_empty',C3,'오늘이나 기한 지난 다음 조치가 하나도 없을 때 뜨는 글','오늘 또는 기한이 지난 다음 조치가 없습니다.');
  add('cj.q_limit_hint',C3,'「오늘·기한 지남」이 꽉 찼을 때 표 아래 글({n}=보이는 최대 건수 — 건수는 🔢 숫자·기준 탭에서 고쳐요)','최대 {n}건 표시 중임',['n']);
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
  hubTextDefsChapter3(add);
  hubTextDefsChapter4(add);
  hubTextDefsChapter5(add);
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

/* 숫자 기준(app_settings 키) — 근태 기준 7개(차례 1) + 연차·소명 기준 5개(차례 3) + 결재 목록 건수 2개(차례 4) + 문의함·상담일지 건수·간격 5개(차례 5: 화면에만 있던 숫자만 — DB 함수·Storage 규칙에도 박힌 숫자는 안 옮김) */
const HUB_SETTING_DEFS=[
  {key:'late_cut',screen:'🕘 근태 기준',label:'지각 판정 시각',where:'출퇴근 — 이 시각을 넘겨 출근하면 지각으로 계산(예 09:40이면 09:41부터 지각)',def:'09:40',kind:'time'},
  {key:'siueop',screen:'🕘 근태 기준',label:'시업(공식 출근) 시각',where:'출퇴근 — 화면에 보여 주는 공식 출근 시각',def:'10:00',kind:'time'},
  {key:'jongeop_weekday_evening',screen:'🕘 근태 기준',label:'평일 야간조 종업 시각',where:'출퇴근 — 월~금 야간조의 종업 시각(연장근무 계산 기준)',def:'20:00',kind:'time'},
  {key:'jongeop_weekday_day',screen:'🕘 근태 기준',label:'평일 비야간 종업 시각',where:'출퇴근 — 월~금 야간조가 아닌 사람의 종업 시각',def:'18:30',kind:'time'},
  {key:'jongeop_sat',screen:'🕘 근태 기준',label:'토요일 종업 시각',where:'출퇴근 — 토요일 종업 시각',def:'17:00',kind:'time'},
  {key:'jongeop_sun',screen:'🕘 근태 기준',label:'일요일 종업 시각',where:'출퇴근 — 일요일 종업 시각',def:'14:00',kind:'time'},
  {key:'ot_unit_min',screen:'🕘 근태 기준',label:'연장근로 인정 단위(분)',where:'출퇴근 — 이 단위로 버림(예 10이면 9분→0분, 11분→10분)',def:'10',kind:'int',min:1,max:60,unit:'분'},
  {key:'att.issue_list_limit',screen:'🕘 근태 기준',label:'지문누락 소명 목록에 보이는 건수',where:'출퇴근(실장·원장 화면) — 지문누락 소명 표에 최근 몇 건까지 보여 줄지',def:'30',kind:'int',min:5,max:100,unit:'건'},
  {key:'leave.same_day_limit',screen:'🌿 연차 기준',label:'같은 날 동시 휴가, 신청이 막히는 인원',where:'연차 신청 — 같은 날 이미 이 인원 이상이 휴가(대기·승인 포함)면 신청할 수 없음(예 2이면 이미 2명이 있을 때 막힘). 화면 규칙이라 DB에는 없어요',def:'2',kind:'int',min:1,max:30,unit:'명'},
  {key:'leave.same_day_reason_from',screen:'🌿 연차 기준',label:'같은 날 동시 휴가, 특별사정 사유가 필요해지는 인원',where:'연차 신청 — 같은 날 이미 이 인원 이상이 휴가면 「특별사정」 사유를 적어야 신청됨(예 1이면 이미 1명이 있을 때부터). 위 「막히는 인원」보다 작아야 의미가 있어요',def:'1',kind:'int',min:1,max:30,unit:'명'},
  {key:'leave.half_day_value',screen:'🌿 연차 기준',label:'반차·조퇴 1건이 쓰는 연차 일수',where:'연차 신청 — 반차·조퇴를 신청할 때 장부에서 빠지는 일수(예 0.5). 이미 신청된 건은 안 바뀌어요',def:'0.5',kind:'dec',min:0.1,max:1,unit:'일'},
  {key:'leave.my_list_limit',screen:'🌿 연차 기준',label:'내 신청 내역에 보이는 건수',where:'연차 — 「내 신청 내역」 표에 최근 몇 건까지 보여 줄지',def:'20',kind:'int',min:5,max:100,unit:'건'},
  {key:'appr.my_list_limit',screen:'🖊 결재 기준',label:'「내가 올린 문서」에 보이는 건수',where:'결재함 — 「내가 올린 문서」에 최근 몇 건까지 보여 줄지',def:'20',kind:'int',min:5,max:100,unit:'건'},
  {key:'appr.done_list_limit',screen:'🖊 결재 기준',label:'「완결된 결재 문서」에 보이는 건수',where:'결재함(실장·원장 화면) — 「완결된 결재 문서」(취소된 문서 포함)에 최근 몇 건까지 보여 줄지',def:'50',kind:'int',min:10,max:200,unit:'건'},
  {key:'inbox.group_window_min',screen:'📥 문의함 기준',label:'같은 사람의 문의를 한 묶음으로 보는 간격',where:'문의함 — 같은 출처·같은 사람이 보낸 문의가 이 시간(분) 안에 이어지면 한 줄로 묶어서 보여 줘요(예 30이면 30분 안에 이어진 문의를 한 묶음으로)',def:'30',kind:'int',min:5,max:180,unit:'분'},
  {key:'inbox.alert_limit',screen:'📥 문의함 기준',label:'네이버 광고 알림 카드에 불러오는 알림 건수',where:'문의함 위쪽 「네이버 광고 알림」 카드(원장·매니저) — 아직 처리 안 한 알림을 최근 몇 건까지 불러올지',def:'20',kind:'int',min:5,max:100,unit:'건'},
  {key:'consult.page_size',screen:'🗂 상담일지 기준',label:'상담 기록 목록 한 쪽에 보이는 건수',where:'상담일지 — 목록 한 쪽에 상담 기록을 몇 건씩 보여 줄지',def:'20',kind:'int',min:10,max:100,unit:'건'},
  {key:'consult.action_limit',screen:'🗂 상담일지 기준',label:'「오늘·기한 지남」 목록에 보이는 건수',where:'상담일지 — 「오늘·기한 지남」 표에 몇 건까지 보여 줄지(꽉 차면 표 아래에 「최대 N건 표시 중임」 글이 떠요)',def:'100',kind:'int',min:20,max:300,unit:'건'}
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
  if(def.kind==='dec'){
    if(!/^\d{1,2}(\.\d)?$/.test(v))return {ok:false,reason:'숫자만 적어 주세요(예 0.5).'};
    const n=Number(v);
    if(n<def.min||n>def.max)return {ok:false,reason:def.min+'부터 '+def.max+'까지만 쓸 수 있어요.'};
    return {ok:true,value:String(n)};
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
   def:[{code:'chief_pending',label:'실장 검토 대기'},{code:'owner_pending',label:'원장 결재 대기'},{code:'approved',label:'승인'},{code:'rejected',label:'반려'}]},
  {key:'list.leave_types',screen:'🌿 연차',label:'연차 유형 이름',addable:false,
   where:'연차 › 「연차 신청」 창의 「유형」 고르는 칸 · 내 신청 내역·승인 대기·휴가 신청서·근무표·캘린더에 보이는 유형 이름',
   note:'연차·반차·조퇴·기타는 서버 규칙(저장 가능한 값)과 일수 계산(반차·조퇴 0.5일)이 이 코드로 움직여서 코드는 못 바꾸고 새 유형도 못 늘려요. 보이는 이름만 고칠 수 있어요.',
   def:[{code:'연차',label:'연차'},{code:'반차',label:'반차'},{code:'조퇴',label:'조퇴'},{code:'기타',label:'기타'}]},
  {key:'list.work_depts',screen:'🗓 근무표',label:'근무부서 이름',addable:false,
   where:'근무표 › 근무명부 관리 표의 「근무부서」 고르는 칸 · 「비로그인 근무자 추가」 부서 고르는 칸',
   note:'근무부서는 서버에 저장 가능한 7가지로 정해져 있어요(Dr. 이름은 화면이 직접 알아보는 코드이기도 해요). 그래서 코드는 못 바꾸고 새 부서도 못 늘려요. 보이는 이름만 고칠 수 있어요.',
   def:[{code:'Dr.',label:'Dr.'},{code:'진료실',label:'진료실'},{code:'데스크',label:'데스크'},{code:'기공실',label:'기공실'},{code:'미지정',label:'미지정'},{code:'상담',label:'상담'},{code:'행정',label:'행정'}]},
  {key:'list.approval_kinds',screen:'🖊 결재함',label:'결재 종류 이름',addable:false,
   where:'결재함 › 「결재 올리기」 창의 「종류」 고르는 칸 · 이름을 고친 종류는 결재 문서 카드의 [종류] 표시에도 바뀌어 보여요',
   note:'결재 종류는 서버에 저장되는 값(연차·사직서·보고·소명·기타)과 재직증명서 발급 흐름이 이 코드로 움직여서 코드는 못 바꾸고 새 종류도 못 늘려요. 보이는 이름만 고칠 수 있어요. 이미 올라간 문서의 제목·내용은 안 바뀌어요.',
   def:[{code:'연차 신청',label:'연차 신청'},{code:'사직서',label:'사직서'},{code:'재직증명서 발급',label:'재직증명서 발급'},{code:'보고',label:'보고'},{code:'소명',label:'소명'},{code:'기타',label:'기타'}]},
  {key:'list.calendar_kinds',screen:'📅 캘린더',label:'일정 종류 이름',addable:false,
   where:'캘린더 › 일정 추가 줄(실장·원장)의 종류 고르는 칸 · 일정 위에 마우스를 올렸을 때 나오는 종류 글',
   note:'일정 종류는 서버가 허락하는 3가지(이벤트·단축근무·면접)로 정해져 있어서 코드는 못 바꾸고 새 종류도 못 늘려요. 보이는 이름만 고칠 수 있어요.',
   def:[{code:'이벤트',label:'이벤트'},{code:'단축근무',label:'단축근무'},{code:'면접',label:'면접'}]},
  {key:'list.inquiry_sources',screen:'📥 문의함',label:'문의 출처 이름',addable:false,
   where:'문의함 › 목록 맨 위 「출처」 고르는 칸 · 문의 목록 한 줄의 출처 글 · 문의 상세 맨 위 줄 · 「빠른 수기 접수」의 출처 고르는 칸(전화·수기·기타)',
   note:'문의 출처는 서버가 허락하는 8가지로 정해져 있고 자동 접수 연결도 이 코드로 움직여서 코드는 못 바꾸고 새 출처도 못 늘려요. 보이는 이름만 고칠 수 있어요.',
   def:[{code:'daangn',label:'당근'},{code:'kakao',label:'카카오'},{code:'naver_email',label:'네이버메일'},{code:'naver_talktalk',label:'네이버 톡톡'},{code:'homepage',label:'홈페이지'},{code:'phone',label:'전화'},{code:'manual',label:'수기'},{code:'other',label:'기타'}]},
  {key:'list.inquiry_status',screen:'📥 문의함',label:'문의 상태 이름',addable:false,
   where:'문의함 › 목록 맨 위 「상태」 고르는 칸 · 문의 목록의 상태 표시 · 문의 상세의 상태 고르는 칸 · 카카오 예약 상세 맨 위 줄',
   note:'문의 상태는 서버가 허락하는 7가지로 정해져 있고 문의 처리 흐름(새 문의 → 진행중 → 리콜 → 종결, 상담일지 전환)이 이 코드로 움직여서 코드는 못 바꾸고 새 상태도 못 늘려요. 보이는 이름만 고칠 수 있어요. 이름을 고치면 목록·필터·상세 어디서든 그 이름으로 보이고, 안 고치면 지금처럼(필터·목록은 NEW(미처리)·진행중·종결, 상세 고르는 칸은 신규·확인 중·완료)으로 보여요. 목록 맨 위 건수 줄과 풀이 글은 📝 글 고치기에서 따로 고쳐요.',
   def:[{code:'new',label:'NEW(미처리)'},{code:'in_progress',label:'진행중'},{code:'recall_1',label:'리콜 1차'},{code:'recall_2',label:'리콜 2차'},{code:'recall_3',label:'리콜 3차'},{code:'closed',label:'종결'},{code:'converted',label:'상담일지 전환'}]},
  {key:'list.consult_kinds',screen:'🗂 상담일지',label:'상담 구분 이름',addable:false,
   where:'상담일지 › 검색의 「전체 상담 구분」 고르는 칸 · 새 기록의 「상담 구분」 고르는 칸 · 목록 표의 구분 글',
   note:'상담 구분은 원본 엑셀의 시트 이름 6가지로 정해져 있고 서버가 이 값만 저장하며 시트별 추가 칸도 이 구분으로 움직여서 코드는 못 바꾸고 새 구분도 못 늘려요. 보이는 이름만 고칠 수 있어요. 이미 저장된 기록은 그대로예요.',
   def:[{code:'교정',label:'교정'},{code:'확정',label:'확정'},{code:'미확정 및 부분확정',label:'미확정 및 부분확정'},{code:'홈페이지',label:'홈페이지'},{code:'카카오,네이버예약,당근',label:'카카오,네이버예약,당근'},{code:'원본',label:'원본'}]},
  {key:'list.consult_status',screen:'🗂 상담일지',label:'상담 상태 이름',addable:false,
   where:'상담일지 › 검색의 「전체 상태」 고르는 칸 · 새 기록의 「상태」 고르는 칸 · 목록 표의 상태 글',
   note:'상담 상태는 서버가 허락하는 5가지로 정해져 있고 목록의 색깔(확정=초록·종결=노랑)도 이 코드로 정해서 코드는 못 바꾸고 새 상태도 못 늘려요. 보이는 이름만 고칠 수 있어요. 이미 저장된 기록은 그대로예요.',
   def:[{code:'대기',label:'대기'},{code:'미확정',label:'미확정'},{code:'부분확정',label:'부분확정'},{code:'확정',label:'확정'},{code:'종결',label:'종결'}]}
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
  sec.innerHTML='<div class="sub">출퇴근 계산·연차 신청이 쓰는 기준이에요. 출퇴근 기준은 지금까지 SQL로만 고쳤는데 여기서 바로 고쳐요. 저장하면 그 화면이 다음에 열릴 때부터 새 기준으로 움직여요(이미 저장된 지난 기록·신청은 안 바뀌어요).</div>'+
    groups.map(function(g){
      return '<details class="hub-grp" open><summary>'+hubEsc(g.name)+' <span class="sub">('+g.items.length+'개)</span></summary>'+
        g.items.map(function(x){
          const d=x.d,i=x.i,cur=hubSetting(d.key,d.def);
          const input=d.kind==='time'
            ?'<input id="hubSetIn_'+i+'" type="time" value="'+hubEsc(cur)+'">'
            :'<input id="hubSetIn_'+i+'" type="number" inputmode="'+(d.kind==='dec'?'decimal':'numeric')+'"'+(d.kind==='dec'?' step="0.1"':'')+' min="'+d.min+'" max="'+d.max+'" value="'+hubEsc(cur)+'"> '+hubEsc(d.unit||'');
          return '<div class="hub-row" data-hub-set-row="'+i+'">'+
            '<div class="hub-where"><b>'+hubEsc(d.label)+'</b> <span id="hubSetBadge_'+i+'">'+hubBadge(cur!==d.def)+'</span></div>'+
            '<div class="sub">'+hubEsc(d.where)+' · 이름표: '+hubEsc(d.key)+'</div>'+
            '<div class="sub">처음 값 '+hubEsc(d.def)+(d.kind==='int'||d.kind==='dec'?' · '+d.min+'~'+d.max+' 사이':'')+'</div>'+
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
  helpers:{hubText:hubText,hubSetting:hubSetting,hubSettingChecked:hubSettingChecked,hubList:hubList,hubCards:hubCards}
};
root.hubText=hubText;
root.hubTextHtml=hubTextHtml;
root.hubSetting=hubSetting;
root.hubSettingNumber=hubSettingNumber;
root.hubSettingChecked=hubSettingChecked;
root.hubList=hubList;
root.hubCards=hubCards;
root.HubUi=HubUi;
})(typeof window!=='undefined'?window:globalThis);
