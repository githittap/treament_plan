/* hub-texts.js — 직원허브 「⚙️ 허브 설정」(원장 전용) + 허브 전체 글·숫자·목록 덮어쓰기 엔진 (차례 1)
   설계서: Z:\09_claude-output\03_병원운영·전산\직원AI도우미\설계서_허브문구전체.md
   원리(AI 도우미 「📝 안내 문구」와 같음): 화면 코드에 지금 글을 「기본값」으로 남기고, 표에 같은 키가 있으면 그 값으로 바꿔 보여 준다.
   표를 못 읽으면 기본값 그대로(화면이 깨지지 않음). 「기본으로 되돌리기」 = 표의 그 행을 지움(app_settings는 지울 수 없어 기본값을 다시 적음).
   · 글  → 표 hub_ui_texts(db/hub_ui_texts.sql) · 숫자·목록 → 이미 있는 표 app_settings(키만 더함, 표·정책은 안 고침)
   hr.html은 이 파일을 main 스크립트보다 먼저 <script src="hub-texts.js?v=…"> 로 불러온다(함수는 전역 hubText·hubSetting·hubList·HubUi).
   로그인 전 화면 글은 표를 읽을 수 없어 이 엔진을 쓰지 않는다(설계서 5장).
   시간 표시: 허브 전체의 날짜·시각 꼴 8개(hubTextDefsTime · time.* — 「2026.9.9 오전 9시 30분」·「오후 3시」) — hr.html 공통 함수 hubFmtDate·hubFmtTime·hubFmtDateTime·hubFmtWhen이 읽음.
   차례 7: 급여·AI비용·원장 보기판·진료기록·입금·홈 글(hubTextDefsChapter7) + 계정·권한 위험 작업 확인창 3개·직무 분류 관리 글·저장 상태 글 + 화면 표시 건수·일수 숫자 8개 + 결재·계약 상태 이름·급여형태·마케팅 분류·AI 플랫폼 이름 목록 7개.
     계산식에 들어가는 숫자(세율·식대 한도·4대보험 절사·야간 시간대)와 엑셀 열 이름·급여 항목 이름·산출식 설명은 안 옮김. 명세서 서식 글은 새로 발행하는 명세서에만 적용(이미 발행한 명세서는 저장된 본문 그대로).
   차례 6: 근로계약서 글(hubTextDefsChapter6 — 화면 글 + 계약서 본문 기본 문구) + 계약 만료 알림 일수(app_settings contract.expiry_alert_days — 정수 1~365 · 1~5개 · 중복 없음, 틀리면 기본 14·30·60. 화면에만 있던 숫자라 옮김 · DB 함수·크론·Edge에는 같은 숫자 없음). 이미 발송·서명한 계약서는 저장된 본문(merged_html)을 그대로 보여 줘서 글을 고쳐도 안 바뀜.
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
function hubSettingBoolean(key,def){return Object.prototype.hasOwnProperty.call(HUB_SETTING_VALUES,key)?HUB_SETTING_VALUES[key]==='true':def;}
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
// 정수 목록 읽기(차례 6): 허브 설정이 정한 모양(1~5개 · 각각 정수 범위 · 중복 없음)이 아니면 기본 목록. 작은 수부터 정렬해서 돌려준다.
function hubSettingIntList(key){
  const d=hubSettingDefByKey(key);
  if(!d)return [];
  const chk=hubSettingValidate(d,hubSetting(key,d.def));
  return JSON.parse(chk.ok?chk.value:d.def);
}
// 근로계약서 만료 알림 일수(오름차순): 가장 작은 수=긴급 · 두 번째=경고 · 나머지=예정. 기본 [14,30,60]
function hubContractExpiryDays(){return hubSettingIntList('contract.expiry_alert_days');}
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
  add('onbo.guide.items',S4,'★ 신입 첫날 안내 항목들 — 한 줄이 항목 하나(번호는 화면이 붙임). 줄을 지우거나 더해도 됨(홈 화면에도 같은 글)','병원 시설을 둘러보고 식당·출퇴근 기록 장치 등 기본 시설 사용법을 안내받는다.\n조직도, 호칭, 기본 예절, 업무 분장, 근로계약과 복리후생 설명을 듣는다.\n무전기를 지급받으면 담당자에게 사용법과 업무용 대화 범위를 확인한다.\n소속 부서의 담당자, 보고 라인, 당일 교육 항목을 확인한다.\n기본 도구와 오픈·마감 절차를 확인한다.\n무전은 들었다는 뜻으로 최초 1회 응답한다.\n진료실·데스크에서 큰 소리의 사담을 피하고, 환자 앞에서 치료계획 변경이나 내부 판단을 논의하지 않으며 필요한 설명과 양해를 먼저 제공한다.\n환자가 언제 어떻게 납부하기로 했는지, 비급여 차감 등 금액 관련 사항이 있으면 상담·데스크 기록을 일치시킨다.\n대기시간과 환자 동선을 안내하고 접수 후 어디에서 기다리는지 분명히 설명한다.\n컴플레인은 말을 끊지 않고 듣고, 담당자에게 즉시 보고한 뒤 단독으로 확정 약속하지 않는다.\n상담 전 최신 수가표와 내부 설명 자료의 사용 범위를 담당자에게 확인한다.\n신환은 구강포토와 상담 차트를 준비하고 지정 위치에 기록·스캔한다.\n임플란트 식립 후 1차 내원은 s/o 또는 드레싱, 2차 내원은 3주 후, 3차 내원은 6주 후로 안내하며 이때 ISQ 측정 등을 가능하면 시행한다.\n사용한 기구와 재료는 원래 위치에 정리하고 오픈·마감 시 체어·컴프레서·무전기·기구 정리 항목을 체크한다.\n치료 후 다음 계획 또는 정기검진·불편 시 내원 등 후속 계획을 기록한다.');
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
  add('onbo.check.m_not_confirmed',S6,'확인 저장에서 바뀐 행이 없을 때','확인되지 않았음. 권한과 대상 항목을 확인한 뒤 다시 시도해 주세요.');
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
  add('att.manual.confirm_discard','🕘 출퇴근 › 수기 출퇴근 입력','날짜를 바꿀 때 저장 전 입력을 버릴지 확인하는 글','저장 안 한 내용이 있음 — 버리고 이동할까요?');
  add('att.manual.m_loading','🕘 출퇴근 › 수기 출퇴근 입력','선택 날짜의 저장값을 읽는 동안 보이는 글','저장된 내용을 불러오는 중입니다.');
  add('att.manual.m_load_fail','🕘 출퇴근 › 수기 출퇴근 입력','선택 날짜의 저장값 조회 실패({msg}는 서버 오류)','저장값을 불러오지 못했습니다. 날짜를 다시 선택하세요: {msg}',['msg']);
  add('att.manual.m_ok','🕘 출퇴근 › 수기 출퇴근 입력','수기 입력을 제출했을 때 뜨는 글','제출했습니다. 승인 대기 중입니다.');
  add('att.review.m_fail','🕘 출퇴근 › 월 마감·인정 근태·수기 검토(실장·원장)','수기 출퇴근 검토 — 승인·반려 처리가 실패했을 때({msg}는 서버 오류)','처리 실패: {msg}',['msg']);
  add('att.btn.chief_ok','🕘 출퇴근 › 월 마감·인정 근태·수기 검토(실장·원장)','출퇴근 — 실장이 누르는 승인 단추(수기·소명 공통)','실장 승인');
  add('att.btn.owner_ok','🕘 출퇴근 › 월 마감·인정 근태·수기 검토(실장·원장)','출퇴근 — 원장이 누르는 확정 단추(수기·소명 공통)','원장 확정');
  add('att.btn.reject','🕘 출퇴근 › 월 마감·인정 근태·수기 검토(실장·원장)','출퇴근 — 반려 단추(수기·소명 공통)','반려');
  add('att.close.title','🕘 출퇴근 › 월 마감·인정 근태·수기 검토(실장·원장)','월 마감 카드 제목(실장·원장·매니저 화면)','🗂 근태 엑셀 올리기 · 월 마감');
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
  add('att.diff.title','🕘 출퇴근 › 지문·수기 차이','실장·원장 차이 카드 제목','📊 지문·수기 차이');
  add('att.diff.month','🕘 출퇴근 › 지문·수기 차이','차이를 조회할 달 선택','달');
  add('att.diff.employee','🕘 출퇴근 › 지문·수기 차이','차이를 조회할 직원 선택','직원');
  add('att.diff.all','🕘 출퇴근 › 지문·수기 차이','직원 선택 전체 항목','전체');
  add('att.diff.list','🕘 출퇴근 › 지문·수기 차이','차이 목록 조회 단추','목록 보기');
  add('att.diff.export','🕘 출퇴근 › 지문·수기 차이','차이 엑셀 내려받기 단추','엑셀로 받기');
  add('att.diff.error','🕘 출퇴근 › 지문·수기 차이','차이 자료 조회 실패({msg}는 오류 내용)','차이를 불러오지 못했습니다: {msg}',['msg']);
  add('att.diff.coverage','🕘 출퇴근 › 지문·수기 차이','지문 자료 범위·기준·건수 안내({date}·{gap}·{count}는 화면 값)','지문 자료는 {date}까지 · {gap}분 이상 다르면 차이 · {count}건',['date','gap','count']);
  add('att.diff.no_fp','🕘 출퇴근 › 지문·수기 차이','조회 달에 지문 자료가 없을 때','이 달 지문 자료가 아직 없음');
  add('att.diff.export_no_fp','🕘 출퇴근 › 지문·수기 차이 엑셀','안내 시트에 지문 자료가 없을 때','자료 없음');
  add('att.diff.none','🕘 출퇴근 › 지문·수기 차이','차이가 없을 때','차이 없음');
  add('att.diff.th_person','🕘 출퇴근 › 지문·수기 차이','차이 표 직원 열','직원');
  add('att.diff.th_date','🕘 출퇴근 › 지문·수기 차이','차이 표 날짜 열','날짜');
  add('att.diff.th_kind','🕘 출퇴근 › 지문·수기 차이','차이 표 종류 열','종류');
  add('att.diff.th_manual','🕘 출퇴근 › 지문·수기 차이','차이 표 수기 시간 열','수기');
  add('att.diff.th_fp','🕘 출퇴근 › 지문·수기 차이','차이 표 지문 시간 열','지문');
  add('att.diff.th_gap','🕘 출퇴근 › 지문·수기 차이','차이 표 차이 열','차이');
  add('att.diff.th_status','🕘 출퇴근 › 지문·수기 차이','차이 표 수기 상태 열','수기 상태');
  add('att.diff.th_issue','🕘 출퇴근 › 지문·수기 차이','차이 표 소명 열','소명');
  add('att.diff.staff_gap','🕘 출퇴근 › 내 지문·수기 차이','직원 본인 화면의 출근·퇴근 차이 분({in}과 {out}은 분 차이, 없으면 -) 표시','차이: 출근 {in}분 · 퇴근 {out}분',['in','out']);
  add('att.diff.staff_title','🕘 출퇴근 › 내 지문·수기 차이','직원 본인 차이 목록 제목','지문·수기가 다른 날');
  add('att.diff.staff_issue','🕘 출퇴근 › 내 지문·수기 차이','직원이 차이 날짜 소명 양식을 여는 단추','소명 쓰기');
  add('att.diff.signed_minute','🕘 출퇴근 › 지문·수기 차이','부호가 있는 수기−지문 분 차이({value}는 부호와 숫자)','{value}분',['value']);
  add('att.diff.staff_line','🕘 출퇴근 › 내 지문·수기 차이','직원 본인 차이 한 줄({date} 날짜, {manual_in}~{manual_out} 수기, {fp_in}~{fp_out} 지문, {in_delta}/{out_delta}분 차이, {missing}은 지문 누락 종류)','{date} · 수기 {manual_in}~{manual_out} · 지문 {fp_in}~{fp_out} · 출근 {in_delta} · 퇴근 {out_delta}{missing}',['date','manual_in','manual_out','fp_in','fp_out','in_delta','out_delta','missing']);
  add('att.diff.staff_none','🕘 출퇴근 › 내 지문·수기 차이','직원 본인 차이가 없을 때','다른 날이 없습니다.');
  add('att.diff.staff_error','🕘 출퇴근 › 내 지문·수기 차이','직원 본인 차이 자료 조회 실패({msg}는 오류 내용)','차이를 불러오지 못했습니다: {msg}',['msg']);
  add('att.diff.kind_in','🕘 출퇴근 › 지문·수기 차이','출근 시각 차이 종류','출근');
  add('att.diff.kind_out','🕘 출퇴근 › 지문·수기 차이','퇴근 시각 차이 종류','퇴근');
  add('att.diff.kind_in_missing','🕘 출퇴근 › 지문·수기 차이','수기 출근만 있고 지문 출근이 없는 차이 종류','지문 출근 없음');
  add('att.diff.kind_out_missing','🕘 출퇴근 › 지문·수기 차이','수기 퇴근만 있고 지문 퇴근이 없는 차이 종류','지문 퇴근 없음');
  add('att.diff.kind_absent','🕘 출퇴근 › 지문·수기 차이','수기 날짜의 지문 자료가 없는 차이 종류','지문 없음');
  add('att.diff.export.sheet_list','🕘 출퇴근 › 지문·수기 차이 엑셀','차이 엑셀 첫 시트 이름','차이 목록');
  add('att.diff.export.sheet_guide','🕘 출퇴근 › 지문·수기 차이 엑셀','차이 엑셀 안내 시트 이름','안내');
  add('att.diff.export.item','🕘 출퇴근 › 지문·수기 차이 엑셀','안내 시트 첫 열','항목');
  add('att.diff.export.content','🕘 출퇴근 › 지문·수기 차이 엑셀','안내 시트 둘째 열','내용');
  add('att.diff.export_gap','🕘 출퇴근 › 지문·수기 차이 엑셀','안내 시트 차이 기준 행','차이 기준');
  add('att.diff.export_gap_value','🕘 출퇴근 › 지문·수기 차이 엑셀','안내 시트 차이 기준 값({n}은 분)','{n}분 이상',['n']);
  add('att.diff.export_coverage','🕘 출퇴근 › 지문·수기 차이 엑셀','안내 시트 지문 자료 마지막 날 행','지문 자료 마지막 날');
  add('att.diff.export_created','🕘 출퇴근 › 지문·수기 차이 엑셀','안내 시트 만든 시각 행','만든 시각');
  add('att.diff.export_kinds','🕘 출퇴근 › 지문·수기 차이 엑셀','안내 시트 차이 종류 행','차이 종류');
  add('att.diff.export_kind_help','🕘 출퇴근 › 지문·수기 차이 엑셀','안내 시트 차이 종류 설명','수기 시각과 지문 시각 차이 또는 지문 기록 없음');
  add('att.diff.weekday_sun','🕘 출퇴근 › 지문·수기 차이 엑셀','요일 일요일','일');
  add('att.diff.weekday_mon','🕘 출퇴근 › 지문·수기 차이 엑셀','요일 월요일','월');
  add('att.diff.weekday_tue','🕘 출퇴근 › 지문·수기 차이 엑셀','요일 화요일','화');
  add('att.diff.weekday_wed','🕘 출퇴근 › 지문·수기 차이 엑셀','요일 수요일','수');
  add('att.diff.weekday_thu','🕘 출퇴근 › 지문·수기 차이 엑셀','요일 목요일','목');
  add('att.diff.weekday_fri','🕘 출퇴근 › 지문·수기 차이 엑셀','요일 금요일','금');
  add('att.diff.weekday_sat','🕘 출퇴근 › 지문·수기 차이 엑셀','요일 토요일','토');
  add('att.diff.export.head_person','🕘 출퇴근 › 지문·수기 차이 엑셀','차이 표 직원 열','직원');
  add('att.diff.export.head_date','🕘 출퇴근 › 지문·수기 차이 엑셀','차이 표 날짜 열','날짜');
  add('att.diff.export.head_weekday','🕘 출퇴근 › 지문·수기 차이 엑셀','차이 표 요일 열','요일');
  add('att.diff.export.head_kind','🕘 출퇴근 › 지문·수기 차이 엑셀','차이 표 차이 종류 열','차이 종류');
  add('att.diff.export.head_manual_in','🕘 출퇴근 › 지문·수기 차이 엑셀','차이 표 수기 출근 열','수기 출근');
  add('att.diff.export.head_manual_out','🕘 출퇴근 › 지문·수기 차이 엑셀','차이 표 수기 퇴근 열','수기 퇴근');
  add('att.diff.export.head_fp_in','🕘 출퇴근 › 지문·수기 차이 엑셀','차이 표 지문 출근 열','지문 출근');
  add('att.diff.export.head_fp_out','🕘 출퇴근 › 지문·수기 차이 엑셀','차이 표 지문 퇴근 열','지문 퇴근');
  add('att.diff.export.head_diff_in','🕘 출퇴근 › 지문·수기 차이 엑셀','차이 표 출근 차이 열','출근 차이(분, 수기−지문)');
  add('att.diff.export.head_diff_out','🕘 출퇴근 › 지문·수기 차이 엑셀','차이 표 퇴근 차이 열','퇴근 차이(분, 수기−지문)');
  add('att.diff.export.head_manual_status','🕘 출퇴근 › 지문·수기 차이 엑셀','차이 표 수기 상태 열','수기 상태');
  add('att.diff.export.head_manual_reason','🕘 출퇴근 › 지문·수기 차이 엑셀','차이 표 수기 사유 열','수기 사유');
  add('att.diff.export.head_issue_status','🕘 출퇴근 › 지문·수기 차이 엑셀','차이 표 소명 상태 열','소명 상태');
  add('att.diff.export.head_issue_reason','🕘 출퇴근 › 지문·수기 차이 엑셀','차이 표 소명 사유 열','소명 사유');
  add('att.diff.export.head_staff_reply','🕘 출퇴근 › 지문·수기 차이 엑셀','차이 표 직원 확인 열','직원 확인');
  add('att.diff.export.head_memo','🕘 출퇴근 › 지문·수기 차이 엑셀','차이 표 메모 열','메모');
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
  add('att.issue.p_date','🕘 출퇴근 › 결근 후보·지문누락 소명','소명 올리기 — 근무일을 묻는 창','소명할 근무일');
  add('att.issueform.title','🕘 출퇴근 › 지문누락 소명 양식','소명 양식 창 제목','🙋 지문누락 소명');
  add('att.issueform.date','🕘 출퇴근 › 지문누락 소명 양식','소명 양식 근무일 칸','근무일');
  add('att.issueform.auto','🕘 출퇴근 › 지문누락 소명 양식','자동 감지 건에 표시하는 안내','{kind} 지문 없음(자동 감지)',['kind']);
  add('att.issueform.kind','🕘 출퇴근 › 지문누락 소명 양식','사유 종류 고르는 칸','사유 종류');
  add('att.issueform.reason','🕘 출퇴근 › 지문누락 소명 양식','자세한 사유 입력 칸','자세한 사유');
  add('att.issueform.reason_hint','🕘 출퇴근 › 지문누락 소명 양식','자세한 사유 안내','언제·왜 지문이 빠졌는지, 실제 출근·퇴근 시각을 적어 주세요.');
  add('att.issueform.evidence','🕘 출퇴근 › 지문누락 소명 양식','증거 파일 선택 칸','증거 파일');
  add('att.issueform.evidence_hint','🕘 출퇴근 › 지문누락 소명 양식','증거 파일 안내','카톡 캡처·사진 등 사유를 보여 주는 자료를 올려 주세요. JPG·PNG·WEBP·PDF, 파일마다 10MB 이하.');
  add('att.issueform.evidence_required','🕘 출퇴근 › 지문누락 소명 양식','필수 증거 표시','증거 파일을 꼭 내야 합니다.');
  add('att.issueform.files','🕘 출퇴근 › 지문누락 소명 양식','이미 연결된 파일 제목','이미 낸 파일');
  add('att.issueform.no_files','🕘 출퇴근 › 지문누락 소명 양식','이미 낸 파일이 없을 때','아직 낸 파일이 없습니다.');
  add('att.issueform.btn_submit','🕘 출퇴근 › 지문누락 소명 양식','저장 단추','저장');
  add('att.issueform.btn_cancel','🕘 출퇴근 › 지문누락 소명 양식','닫기 단추','닫기');
  add('att.issueform.m_date','🕘 출퇴근 › 지문누락 소명 양식','근무일이 없거나 올바르지 않을 때','근무일을 확인해 주세요.');
  add('att.issueform.m_kind','🕘 출퇴근 › 지문누락 소명 양식','사유 종류를 고르지 않았을 때','사유 종류를 골라 주세요.');
  add('att.issueform.m_reason','🕘 출퇴근 › 지문누락 소명 양식','사유가 짧거나 긴 때','자세한 사유는 {min}자 이상 1000자 이하로 적어 주세요.',['min']);
  add('att.issueform.m_evidence_required','🕘 출퇴근 › 지문누락 소명 양식','필수 증거가 없을 때','증거 파일을 하나 이상 올려 주세요.');
  add('att.issueform.m_file_type','🕘 출퇴근 › 지문누락 소명 양식','허용되지 않는 파일 형식','JPG·PNG·WEBP·PDF 파일만 올릴 수 있습니다.');
  add('att.issueform.m_file_size','🕘 출퇴근 › 지문누락 소명 양식','10MB를 넘는 파일','파일마다 10MB 이하만 올릴 수 있습니다.');
  add('att.issueform.m_file_count','🕘 출퇴근 › 지문누락 소명 양식','파일 개수가 설정 한도를 넘을 때','파일은 한 건에 최대 {max}개까지 올릴 수 있습니다.',['max']);
  add('att.issueform.m_saving','🕘 출퇴근 › 지문누락 소명 양식','저장 중','소명을 저장하는 중…');
  add('att.issueform.m_fail','🕘 출퇴근 › 지문누락 소명 양식','소명 저장 실패({detail}은 서버 오류)','소명 저장 실패: {detail}',['detail']);
  add('att.issueform.m_not_found','🕘 출퇴근 › 지문누락 소명 양식','직원 소명을 찾지 못했을 때({detail}은 서버 오류)','소명을 찾지 못했습니다: {detail}',['detail']);
  add('att.issueform.m_not_editable','🕘 출퇴근 › 지문누락 소명 양식','대기 상태가 아닌 소명을 고치려 할 때','대기 중인 소명만 고칠 수 있습니다.');
  add('att.issue.evidence_missing','🕘 출퇴근 › 소명 증거','증거 파일이 없을 때','파일 없음');
  add('att.issueform.m_partial','🕘 출퇴근 › 지문누락 소명 양식','소명은 저장됐지만 파일이 일부 실패({n}은 연결되지 않은 파일 수)','소명은 저장됐고 파일 {n}개가 안 올라갔습니다. 「내 소명」의 고치기로 다시 올려 주세요.',['n']);
  add('att.issueform.m_uncertain','🕘 출퇴근 › 지문누락 소명 양식','연결 응답이 끊겨 파일 처리 결과가 불명일 때({n}은 결과 불명 수)','소명은 저장됐지만 파일 {n}개의 처리 결과를 확인하지 못했습니다. 파일이 남아 있을 수 있어 삭제하지 않았습니다. 내 소명에서 상태를 확인해 주세요.',['n']);
  add('att.issueform.m_refresh_fail','🕘 출퇴근 › 지문누락 소명 양식','저장 성공 뒤 화면 갱신 실패','소명은 저장됐지만 화면 갱신에 실패했습니다. 다시 열어 저장 상태를 확인해 주세요.');
  add('att.issueform.m_saved','🕘 출퇴근 › 지문누락 소명 양식','저장 성공','소명을 저장했습니다.');
  add('att.issueform.mode_new','🕘 출퇴근 › 지문누락 소명 양식','새 소명 설명','새 소명을 올립니다.');
  add('att.issueform.mode_answer','🕘 출퇴근 › 지문누락 소명 양식','자동 감지 건 답변 설명','자동 감지된 소명에 사유를 적습니다.');
  add('att.issueform.mode_edit','🕘 출퇴근 › 지문누락 소명 양식','내 소명 수정 설명','대기 중인 내 소명을 고칩니다.');
  add('att.myissue.title','🕘 출퇴근 › 내 지문누락 소명','직원·매니저·실장 소명 카드 제목','🙋 내 지문누락 소명');
  add('att.myissue.pending','🕘 출퇴근 › 내 지문누락 소명','직원 답이 필요한 소명 제목','답이 필요한 소명');
  add('att.myissue.pending_empty','🕘 출퇴근 › 내 지문누락 소명','답이 필요한 소명이 없을 때','답이 필요한 소명이 없습니다.');
  add('att.myissue.btn_answer','🕘 출퇴근 › 내 지문누락 소명','자동 감지 건 답변 단추','사유 쓰기');
  add('att.myissue.list','🕘 출퇴근 › 내 지문누락 소명','내 소명 목록 제목','내 소명');
  add('att.myissue.empty','🕘 출퇴근 › 내 지문누락 소명','내 소명이 없을 때','올린 소명이 없습니다.');
  add('att.myissue.btn_new','🕘 출퇴근 › 내 지문누락 소명','새 소명 단추','소명 올리기');
  add('att.myissue.btn_edit','🕘 출퇴근 › 내 지문누락 소명','내 대기 소명 수정 단추','고치기');
  add('att.myissue.th_kind','🕘 출퇴근 › 내 지문누락 소명','내 소명 목록 종류 머리','종류');
  add('att.myissue.th_reason','🕘 출퇴근 › 내 지문누락 소명','내 소명 목록 사유 머리','사유');
  add('att.myissue.th_evidence','🕘 출퇴근 › 내 지문누락 소명','내 소명 목록 증거 머리','증거');
  add('att.issue.admin_evidence','🕘 출퇴근 › 소명 검토 표','관리자 표 증거 머리','증거');
  add('att.issue.evidence_load_fail','🕘 출퇴근 › 소명 증거','연결된 증거 파일 조회에 실패했을 때','증거 파일 조회 실패');
  add('att.issue.awaiting_staff','🕘 출퇴근 › 소명 검토 표','직원 답 전 상태','직원 답 기다림');
  add('att.issue.evidence_none','🕘 출퇴근 › 소명 검토 표','필수 증거가 빠진 소명 상태','증거 없음');
  add('att.issue.evidence_count','🕘 출퇴근 › 소명 검토 표','증거 파일 개수 단추({n}은 개수)','📎 {n}',['n']);
  add('att.issue.evidence_view','🕘 출퇴근 › 소명 증거 보기','증거 파일 목록 창 제목','소명 증거 파일');
  add('att.issue.evidence_open_fail','🕘 출퇴근 › 소명 증거 보기','서명 주소를 만들지 못했을 때','파일 주소를 만들지 못했습니다. 파일이 삭제됐거나 접근할 수 없습니다.');
  add('att.issue.evidence_open_blocked','🕘 출퇴근 › 소명 증거 보기','새 탭을 열지 못했을 때','새 탭이 막혔습니다. 팝업 허용 후 다시 눌러 주세요.');
  add('att.issue.evidence_empty','🕘 출퇴근 › 소명 증거 보기','증거 파일이 없을 때','연결된 증거 파일이 없습니다.');
  add('att.issue.auto_clock_in','🕘 출퇴근 › 소명 유형','출근 지문 누락 유형','출근 지문 없음(자동 감지)');
  add('att.issue.auto_clock_out','🕘 출퇴근 › 소명 유형','퇴근 지문 누락 유형','퇴근 지문 없음(자동 감지)');
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
  add('sched.btn_names','🗓 근무표 › 주간·월간 화면','근무표·캘린더 공통 — 날짜 칸 안의 이름을 모두 표시하는 단추','👤 이름 보기');
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
  add('leave.grant.title','🌿 연차 › 연차 부여·자동 적립(원장)','연차 부여 카드 제목(원장)','👥 직원별 연차 현황');
  add('leave.owner_tag','🌿 연차 › 연차 부여·자동 적립(원장)','원장 전용 카드 제목 옆 작은 글(부여·자동 적립 공통)','원장');
  add('leave.grant.th_name','🌿 연차 › 연차 부여·자동 적립(원장)','연차 부여 표 머리 — 이름','이름');
  add('leave.grant.th_hire','🌿 연차 › 연차 부여·자동 적립(원장)','연차 부여 표 머리 — 입사일','입사일');
  add('leave.grant.ph_note','🌿 연차 › 연차 부여·자동 적립(원장)','연차 부여 — 메모 칸 안에 흐리게 보이는 글','메모(예: 남은 연차 변경)');
  add('leave.status.load_fail','🌿 연차 › 연차 부여·자동 적립(원장)','직원별 연차 현황 — 연차 현황을 불러오지 못했습니다: {msg}','연차 현황을 불러오지 못했습니다: {msg}',['msg']);
  add('leave.status.balance','🌿 연차 › 연차 부여·자동 적립(원장)','직원별 연차 현황 — 지금 남은 연차','지금 남은 연차');
  add('leave.status.earned','🌿 연차 › 연차 부여·자동 적립(원장)','직원별 연차 현황 — 올해 생긴','올해 생긴');
  add('leave.status.used','🌿 연차 › 연차 부여·자동 적립(원장)','직원별 연차 현황 — 쓴','쓴');
  add('leave.status.standard','🌿 연차 › 연차 부여·자동 적립(원장)','직원별 연차 현황 — 법정 기준 {days}일','법정 기준 {days}일',['days']);
  add('leave.status.change','🌿 연차 › 연차 부여·자동 적립(원장)','직원별 연차 현황 — 바꾸기','바꾸기');
  add('leave.status.target','🌿 연차 › 연차 부여·자동 적립(원장)','직원별 연차 현황 — 남은 연차를','남은 연차를');
  add('leave.status.day','🌿 연차 › 연차 부여·자동 적립(원장)','직원별 연차 현황 — 일로','일로');
  add('leave.status.save','🌿 연차 › 연차 부여·자동 적립(원장)','직원별 연차 현황 — 저장','저장');
  add('leave.status.other','🌿 연차 › 연차 부여·자동 적립(원장)','직원별 연차 현황 — 그 밖의 계정 {n}개','그 밖의 계정 {n}개',['n']);
  add('leave.status.invalid','🌿 연차 › 연차 부여·자동 적립(원장)','직원별 연차 현황 — 남은 연차는 0 이상, 0.5일 단위로 입력하세요.','남은 연차는 0 이상, 0.5일 단위로 입력하세요.');
  add('leave.status.preview','🌿 연차 › 연차 부여·자동 적립(원장)','직원별 연차 현황 — 지금 {before}일 → 바꾸면 {after}일 ({delta}일)','지금 {before}일 → 바꾸면 {after}일 ({delta}일)',['before','after','delta']);
  add('leave.status.note','🌿 연차 › 연차 부여·자동 적립(원장)','직원별 연차 현황 — 남은 연차 변경: {days}일','남은 연차 변경: {days}일',['days']);
  add('leave.acc.title','🌿 연차 › 연차 부여·자동 적립(원장)','자동 연차 적립 카드 제목(원장)','📆 1년 된 직원의 연차 15일을 확인하고 넣기');
  add('leave.acc.hint','🌿 연차 › 연차 부여·자동 적립(원장)','자동 연차 적립 카드 설명','1년 미만 월차는 매달 자동으로 생깁니다. 1년이 된 직원의 15일과 아직 확인되지 않은 지난 기간은 여기에서 개근·재직을 확인하고 넣습니다. 이미 넣은 연차는 두 번 넣지 않습니다.');
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
  add('notice.btn_download',N3,'미리보기를 지원하지 않는 첨부의 내려받기 단추','⬇ 내려받기');
  add('notice.m_no_file',N3,'첨부 서명 주소가 없을 때 오류 이유','파일 없음');
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
  add('inbox.th_handled',I2,'문의 목록 표 머리 — 처리(「✅ 처리」 단추 또는 처리한 사람·시각이 보이는 칸)','처리');
  add('inbox.th_views',I2,'문의 목록 표 머리 — 열람(누가 열어 봤는지 · 원장 화면에만 보임)','열람');
  add('inbox.btn_handle',I2,'문의 목록 — 처리 칸의 「✅ 처리」 단추 글(누르면 처리 메모 입력칸이 펼쳐짐)','✅ 처리');
  add('inbox.handled_line',I2,'문의 목록 — 처리됨 줄의 처리한 사람·시각 글({who}=처리한 사람, {time}=처리 시각)','✅ {who} · {time}',['who','time']);
  add('inbox.views_more',I2,'문의 목록 열람 칸 — 열람한 사람이 3명 이상일 때 이름 뒤에 붙는 글({n}=보여 주지 않은 사람 수)','외 {n}명',['n']);
  add('inbox.m_views',I2,'스마트폰 화면 문의 카드의 열람 글(원장 화면 · {names}=열람한 사람 이름)','열람 {names}',['names']);
  add('inbox.btn_detail',I2,'문의 한 줄 끝 「상세」 단추 글(카카오 예약 줄도 같음)','상세');
  add('inbox.unknown_time',I2,'받은 시각을 알 수 없을 때 대신 보이는 글(상세 화면도 같음)','미상');
  add('inbox.neg_kw',I2,'불만·환불 같은 말이 들어 있는 문의 앞에 붙는 표시(어떤 말을 잡는지는 아직 코드에 있어요)','부정 키워드');
  add('inbox.m_assignee',I2,'스마트폰 화면 문의 카드의 담당자 글({name}=담당자 이름)','담당 {name}',['name']);
  add('inbox.group_count',I2,'같은 사람의 문의가 한 묶음일 때 이름 뒤에 붙는 건수({n}=묶음 속 문의 수)','({n}건)',['n']);
  add('inbox.status_hint',I2,'문의 목록 맨 위 건수 줄 아래 상태 풀이 글(상태 이름을 고치면 이 글도 같이 고쳐 주세요)','NEW = 아직 아무도 처리 안 함 · 진행중 = 담당자가 답하는 중 · 리콜 = 다시 연락할 문의 · 처리됨 = 담당자가 처리를 끝냄(답변·예약·광고 정리 등)');
  add('inbox.sum_new',I2,'문의 목록 맨 위 건수 줄 — 새 문의(뒤에 건수가 붙음)','NEW');
  add('inbox.sum_progress',I2,'문의 목록 맨 위 건수 줄 — 진행 중(뒤에 건수가 붙음)','진행중');
  add('inbox.sum_recall',I2,'문의 목록 맨 위 건수 줄 — 리콜 1·2·3차를 합친 것(뒤에 건수가 붙음)','리콜');
  add('inbox.sum_closed',I2,'문의 목록 맨 위 건수 줄 — 처리됨(뒤에 건수가 붙음)','처리됨');
  add('inbox.sum_converted',I2,'문의 목록 맨 위 건수 줄 — 상담일지로 넘어간 것(뒤에 건수가 붙음)','전환');
  add('inbox.empty',I2,'조건에 맞는 문의가 하나도 없을 때 뜨는 글','조건에 맞는 문의가 없습니다.');
  add('inbox.btn_call',I2,'전화 문의 줄에 뜨는 전화 걸기 링크 글','전화 걸기');
  add('inbox.btn_reply_go',I2,'채팅·홈페이지 문의 줄에 뜨는 「답하러 가기」 링크 글(눌러서 가는 주소는 코드에 있어요)','답하러 가기');
  add('inbox.ph_handle_memo',I3,'처리 메모 입력칸의 안내 글(목록의 처리 칸·상세의 처리 완료 상자 모두)','어떻게 처리했나요?(선택)');
  add('inbox.btn_handle_save',I3,'처리 메모 입력칸의 저장 단추 글(저장하면 그 문의가 처리됨으로 바뀜)','처리됨으로 저장');
  add('inbox.btn_handle_cancel',I3,'목록의 처리 메모 입력칸을 접는 「취소」 단추 글','취소');
  add('inbox.d_handle_title',I3,'문의 상세 맨 위 처리 완료 상자의 제목','✅ 처리 완료');
  add('inbox.btn_back',I3,'문의 상세 맨 위 「목록으로」 단추 글(누르면 문의 목록 쪽으로 올라감)','↑ 목록으로');
  add('inbox.m_handle_fail',I3,'처리됨으로 저장하다 실패했을 때 입력칸 아래에 뜨는 글({msg}는 서버 오류)','처리 저장 실패: {msg}',['msg']);
  add('inbox.m_handle_memo_fail',I3,'처리됨으로는 바뀌었는데 처리 메모만 저장하지 못했을 때 뜨는 글({msg}는 서버 오류)','처리됨으로 바꿨지만 메모는 저장하지 못했습니다: {msg} — 상세에서 「답변 기록」으로 다시 남겨 주세요',['msg']);
  add('inbox.m_memo_unknown',I3,'처리됨으로는 바뀌었는데 처리 메모가 저장됐는지 확인하지 못했을 때 뜨는 글(인터넷이 끊긴 때 등 · {msg}는 서버 오류)','처리됨으로 바꿨지만 메모가 저장됐는지 확인하지 못했습니다: {msg} — 문의함을 새로 열어 메모가 없을 때만 상세에서 다시 남겨 주세요',['msg']);
  add('inbox.m_handled',I3,'상세에서 처리됨으로 저장했을 때 상세 칸에 뜨는 글','처리됨으로 저장했습니다.');
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
  add('inbox.m_reply_unknown',I3,'답변 기록이 저장됐는지 확인하지 못했을 때 뜨는 글(인터넷이 끊긴 때 등 · {msg}는 서버 오류)','답변이 기록됐는지 확인하지 못했습니다: {msg} — 문의를 다시 열어 아래 답변 이력에 없을 때만 다시 눌러 주세요',['msg']);
  add('inbox.m_convert_fail',I3,'상담일지 전환 실패 알림창({msg}는 서버 오류)','상담일지 전환 실패: {msg}',['msg']);
  add('inbox.m_convert_close_fail',I3,'상담일지 전환은 됐는데 나머지 문의를 처리됨으로 바꾸다 실패했을 때 알림창({msg}는 서버 오류)','상담일지 전환은 됐지만 나머지 문의를 처리됨으로 바꾸지 못했습니다: {msg}',['msg']);
  add('inbox.m_converted',I3,'상담일지 전환이 끝났을 때 상세 칸에 뜨는 글','상담일지로 전환했습니다. 나머지 처리 대상 문의는 처리됨 상태로 보존했습니다.');
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
// ── 차례 6: 근로계약서 글(기본 글은 hr.html의 글과 같아야 함 — 시험이 대조). 계약서 본문 문구(contract.body.*)는 새로 만드는 계약서에만 쓰여요 ──
function hubTextDefsChapter6(add){
  const C1='📝 근로계약서 › 새 계약서 쓰기·미리보기';
  const C2='📝 근로계약서 › 발송·반려·원본 PDF';
  const C3='📝 근로계약서 › 계약 목록·계약기간·만료 알림';
  const C4='📝 근로계약서 › 직원 서명 화면';
  const C5='📝 근로계약서 › 계약서 본문 기본 문구';
  add('contract_job.alias_clinical_consult',C1,'진료·상담에 연결할 계약 직무·직종 이름(쉼표로 구분, 다른 분류와 겹치면 자동 채우지 않음)','진료·상담,진료실,상담,치과위생사,위생사');
  add('contract_job.alias_sterilization_admin',C1,'소독·행정에 연결할 계약 직무·직종 이름(쉼표로 구분)','소독·행정,소독,소독실,행정');
  add('contract_job.alias_lab',C1,'기공에 연결할 계약 직무·직종 이름(쉼표로 구분)','기공,기공실,치과기공사,기공사');
  add('contract_job.alias_desk',C1,'데스크에 연결할 계약 직무·직종 이름(쉼표로 구분)','데스크,코디,코디네이터');
  add('contract_job.conflict',C1,'계약 직무와 기존 직원 직무가 다를 때 보여 주는 안내','{employee}: 계약 직무 {contract} · 직원 직무 {profile} — 직원 직무는 그대로 유지됩니다.',['employee','contract','profile']);
  add('contract.new_title',C1,'근로계약서 화면 맨 위 「새 계약서」 칸 제목(원장·실장·매니저)','📝 새 근로계약서');
  add('contract.new_hint',C1,'새 계약서 칸 제목 아래 안내','✓ 작성 중인 내용은 이 PC에 자동 저장됨(주민번호·생년월일·주소 제외)');
  add('contract.btn_clear',C1,'새 계약서 칸 — 작성 중인 내용을 비우는 단추 글','새로 쓰기');
  add('contract.btn_preset_save',C1,'새 계약서 칸 — 입력한 값을 내 설정으로 저장하는 단추 글','설정값 저장');
  add('contract.opt_preset_load',C1,'새 계약서 칸 — 저장한 내 설정을 고르는 칸의 맨 위 항목','내 설정 불러오기');
  add('contract.btn_preset_del',C1,'새 계약서 칸 — 저장한 내 설정을 지우는 단추 글','삭제');
  add('contract.f_template',C1,'새 계약서 칸 — 서식 고르는 칸 이름','서식');
  add('contract.f_employee',C1,'새 계약서 칸 — 직원 고르는 칸 이름(계약 종료일 설정 창의 「직원」도 같음)','직원');
  add('contract.f_role',C1,'새 계약서 칸 — 역할(부서) 고르는 칸 이름','역할(부서)');
  add('contract.opt_none',C1,'새 계약서 칸 — 역할(부서) 칸의 「고르지 않음」 항목','선택 안 함');
  add('contract.f_period',C1,'새 계약서 칸 — 계약 기간 칸 이름(계약 종료일 설정 창도 같음)','계약 기간');
  add('contract.f_noend',C1,'「기간의 정함 없음」 체크 옆 글(새 계약서·직원별 계약기간 표·종료일 설정 창). 체크했을 때 계약서에 들어가는 값 자체는 코드에 고정이라 이 글을 고쳐도 안 바뀌어요','기간의 정함 없음');
  add('contract.opt_need',C1,'새 계약서 칸 — 꼭 골라야 하는 선택칸의 맨 위 항목','선택 필요');
  add('contract.details',C1,'새 계약서 칸 — 접어 둔 「상세 조건」 줄 글','상세 조건 (특별한 경우만 수정)');
  add('contract.f_due',C1,'새 계약서 상세 조건 — 서명 만료일 칸 이름','서명 만료일');
  add('contract.btn_preview',C1,'새 계약서 칸 — 미리보기 단추 글(「원장 최종 발송 대기」 표의 미리보기 단추도 같음)','미리보기');
  add('contract.btn_send_owner',C1,'새 계약서 칸 — 원장 화면의 발송 단추 글','최종 발송');
  add('contract.btn_send_req',C1,'새 계약서 칸 — 실장·매니저 화면의 발송 요청 단추 글','원장 발송 요청');
  add('contract.preview_empty',C1,'계약서 미리보기 자리에 처음 보이는 글','미리보기 또는 계약 보기를 선택하세요.');
  add('contract.preview_h',C1,'미리보기를 눌렀을 때 미리보기 칸 맨 위 제목','미리보기');
  add('contract.no_template',C1,'쓸 수 있는 계약서 서식이 하나도 없을 때 뜨는 글','활성 근로계약서 서식이 없습니다.');
  add('contract.err_load',C1,'계약 정보를 못 불러왔을 때 뜨는 글({msg}는 서버 오류)','계약 정보를 불러오지 못했습니다: {msg}',['msg']);
  add('contract.sch_hint',C1,'근무시간표 입력 칸 맨 위 안내','요일을 복수 선택하고 주간·야간·별도 시간을 각각 추가하세요.');
  add('contract.sch_add',C1,'근무시간표 — 시간대를 한 줄 더 넣는 단추 글','+ 시간대 추가');
  add('contract.sch_day_label',C1,'근무시간표 한 줄 — 근무일 방식 고르는 칸 이름','근무일');
  add('contract.sch_mode_fixed',C1,'근무시간표 — 근무일 방식 항목: 요일을 직접 고름','고정 요일');
  add('contract.sch_mode_rot',C1,'근무시간표 — 근무일 방식 항목: 주 5일 교대','월~일 중 주 5일 교대(주말 가능)');
  add('contract.sch_mode_twice',C1,'근무시간표 — 근무일 방식 항목: 평일 야간 2회','상기 주 5일 중 평일 야간 2회');
  add('contract.sch_note_rot',C1,'근무시간표 — 「주 5일 교대」를 골랐을 때 옆에 뜨는 설명','토·일을 포함해 근무표에 따라 주 5일 근무');
  add('contract.sch_note_twice',C1,'근무시간표 — 「평일 야간 2회」를 골랐을 때 옆에 뜨는 설명','상기 주 5일 중 평일 야간 주 2회(근무표에 따름)');
  add('contract.sch_note_fixed',C1,'근무시간표 — 「고정 요일」을 골랐을 때 옆에 뜨는 설명','근무하는 요일을 선택하세요.');
  add('contract.sch_ph_break',C1,'근무시간표 — 휴게시간 입력칸 안의 예시 글','휴게 13:00 ~ 14:00');
  add('contract.sch_ph_note',C1,'근무시간표 — 비고 입력칸 안의 예시 글','비고(선택)');
  add('contract.sch_aria_start',C1,'근무시간표 — 시업 시간 입력칸의 읽어 주는 이름(화면에는 안 보임)','시업시간');
  add('contract.sch_aria_end',C1,'근무시간표 — 종업 시간 입력칸의 읽어 주는 이름(화면에는 안 보임)','종업시간');
  add('contract.sch_aria_del',C1,'근무시간표 — 줄 지우기 단추의 읽어 주는 이름(화면에는 안 보임)','근무시간 행 삭제');
  add('contract.send_title',C2,'원장 화면 — 「최종 발송 대기」 칸 제목','🖋 원장 최종 발송 대기');
  add('contract.th_employee',C2,'계약 표 머리 — 직원(최종 발송 대기·계약 목록·직원별 계약기간 표 모두 같음)','직원');
  add('contract.th_author',C2,'최종 발송 대기 표 머리 — 작성자','작성자');
  add('contract.th_due',C2,'최종 발송 대기 표·계약 목록 머리 — 서명기한','서명기한');
  add('contract.btn_edit',C2,'최종 발송 대기 표 — 수정 단추 글','수정');
  add('contract.btn_approve',C2,'최종 발송 대기 표 — 확인 후 발송 단추 글','확인 후 최종 발송');
  add('contract.btn_reject',C2,'최종 발송 대기 표 — 반려 단추 글','반려');
  add('contract.send_empty',C2,'최종 발송 요청이 하나도 없을 때 뜨는 글','최종 발송 요청이 없습니다.');
  add('contract.pdf_title',C2,'원본 PDF 등록 칸 제목(원장·실장·매니저)','📄 원본 근로계약서 PDF 등록');
  add('contract.pdf_hint',C2,'원본 PDF 등록 칸 제목 아래 안내','실제 직원을 위한 PDF를 임의로 선택하지 않습니다. 발송 요청 계약에 확인된 원본만 등록하고, 원본 파일은 변경하지 않은 채 별도 완료 PDF를 만듭니다.');
  add('contract.pdf_f_contract',C2,'원본 PDF 등록 — 계약 고르는 칸 이름','발송 요청 계약');
  add('contract.opt_choose',C2,'원본 PDF 등록 — 계약 고르는 칸의 맨 위 항목','선택');
  add('contract.pdf_f_version',C2,'원본 PDF 등록 — 원본 버전 칸 이름','원본 버전');
  add('contract.pdf_ph_version',C2,'원본 PDF 등록 — 원본 버전 칸 안의 예시 글','예: 2026-09-20 검토본');
  add('contract.pdf_f_file',C2,'원본 PDF 등록 — 파일 고르는 칸 이름','PDF 파일');
  add('contract.pdf_btn',C2,'원본 PDF 등록 — 등록 단추 글','원본 PDF 해시 등록');
  add('contract.m_need_basic',C2,'발송 — 서식·직원·서명 만료일 중 빈 것이 있을 때 뜨는 글','서식, 직원, 서명 만료일을 모두 선택하세요.');
  add('contract.m_need_fields',C2,'발송 — 꼭 적어야 하는 계약 조건이 비었을 때 뜨는 글({list}=빈 항목 이름들)','필수 계약 조건을 입력하세요: {list}',['list']);
  add('contract.m_need_end',C2,'발송·종료일 저장 — 계약 종료일도 「기간의 정함 없음」도 안 골랐을 때 뜨는 글','계약 종료일을 입력하거나 \'기간의 정함 없음\'을 선택하세요.');
  add('contract.m_need_schedule',C2,'발송 — 근무시간표에 요일·시간이 비었을 때 뜨는 글','근무시간표에서 요일·시업·종업시간을 모두 입력하세요.');
  add('contract.m_bad_due',C2,'발송 — 서명 만료일이 날짜로 읽히지 않을 때 뜨는 글','서명 만료일을 확인하세요.');
  add('contract.m_sending_edit',C2,'발송 — 요청을 고쳐서 최종 발송하는 동안 뜨는 글','수정 후 최종 발송 중…');
  add('contract.m_sending_owner',C2,'발송 — 원장이 발송하는 동안 뜨는 글','발송 중…');
  add('contract.m_sending_req',C2,'발송 — 실장·매니저가 원장에게 요청하는 동안 뜨는 글','원장 발송 요청 중…');
  add('contract.m_fail_edit',C2,'발송 — 고쳐서 발송하다 실패했을 때 뜨는 글({msg}는 서버 오류)','수정 발송 실패: {msg}',['msg']);
  add('contract.m_fail_send',C2,'발송 실패 글({msg}는 서버 오류 · 최종 발송 확인 때도 같음)','발송 실패: {msg}',['msg']);
  add('contract.m_sent',C2,'발송을 마쳤을 때 새 계약서 칸 아래에 뜨는 글(원장)','발송했습니다.');
  add('contract.m_requested',C2,'원장에게 발송을 요청했을 때 새 계약서 칸 아래에 뜨는 글(실장·매니저)','원장에게 최종 발송을 요청했습니다.');
  add('contract.m_edit_sent',C2,'요청을 고쳐서 발송했을 때 새 계약서 칸 아래에 뜨는 글','수정 후 발송했습니다.');
  add('contract.m_approved',C2,'최종 발송을 확인해서 마쳤을 때 새 계약서 칸 아래에 뜨는 글','최종 발송을 완료했습니다.');
  add('contract.m_rejected',C2,'발송 요청을 반려했을 때 새 계약서 칸 아래에 뜨는 글','발송 요청을 반려했습니다.');
  add('contract.m_archive_fail',C2,'최종 발송 — 최종본 보관에 실패했을 때 알림창({msg}는 서버 오류)','최종본 보관 실패: {msg}',['msg']);
  add('contract.confirm_reject',C2,'반려 단추를 눌렀을 때 뜨는 확인창','이 발송 요청을 반려할까요? 직원에게 가지 않고 취소로 바뀝니다');
  add('contract.m_reject_fail',C2,'반려 실패 알림창({msg}는 서버 오류)','반려하지 못했습니다: {msg}',['msg']);
  add('contract.m_already_done',C2,'반려하려는데 이미 다른 사람이 처리했을 때 알림창','이미 처리된 요청입니다.');
  add('contract.m_pdf_need',C2,'원본 PDF 등록 — 계약·PDF 파일(20MB 이하)을 안 골랐을 때 뜨는 글','발송 요청 계약과 PDF 파일(최대 20MB)을 선택하세요.');
  add('contract.m_pdf_version',C2,'원본 PDF 등록 — 원본 버전을 안 적었을 때 뜨는 글','원본 PDF 버전을 입력하세요.');
  add('contract.m_pdf_state',C2,'원본 PDF 등록 — 발송 요청 상태가 아닌 계약을 골랐을 때 뜨는 글','발송 요청 상태의 계약만 등록할 수 있습니다.');
  add('contract.m_pdf_saving',C2,'원본 PDF 등록 — 파일을 보관하는 동안 뜨는 글','원본 PDF 보관 중…');
  add('contract.m_pdf_save_fail',C2,'원본 PDF 등록 — 보관 실패({msg}는 서버 오류)','원본 PDF 보관 실패: {msg}',['msg']);
  add('contract.m_pdf_reg_fail',C2,'원본 PDF 등록 — 해시 등록 실패({msg}는 서버 오류)','원본 PDF 등록 실패: {msg}',['msg']);
  add('contract.m_pdf_done',C2,'원본 PDF 등록을 마쳤을 때 뜨는 글','원본 PDF를 보관하고 해시를 등록했습니다.');
  add('contract.m_pdf_open_fail',C2,'원본 PDF를 못 열었을 때 알림창({msg}는 서버 오류)','원본 PDF를 열 수 없습니다: {msg}',['msg']);
  add('contract.m_signed_open_fail',C2,'완료 PDF를 못 열었을 때 알림창({msg}는 서버 오류)','완료 PDF를 열 수 없습니다: {msg}',['msg']);
  add('contract.m_no_file',C2,'PDF를 못 열었는데 서버 오류 글이 없을 때 {msg} 자리에 대신 들어가는 글','파일 없음');
  add('contract.v_warn',C3,'계약 「보기」 — 예전 방식으로 저장된 요청일 때 뜨는 경고 첫 문장','이전 브라우저에서 저장된 요청이라 근무시간표 값을 다시 확인해야 합니다.');
  add('contract.v_warn_owner',C3,'계약 「보기」 경고 — 원장 화면 뒤 문장','아래 ‘수정 후 최종 발송’으로 시간표를 입력하세요.');
  add('contract.v_warn_other',C3,'계약 「보기」 경고 — 실장·매니저 화면 뒤 문장','원장 최종 검토 후 시간표를 입력해야 합니다.');
  add('contract.v_review',C3,'계약 「보기」 — 근무시간표가 깨져 읽을 수 없을 때 그 자리에 대신 뜨는 글','근무시간표 확인 필요');
  add('contract.default_title',C3,'계약서 서식 이름을 못 찾았을 때 대신 쓰는 계약서 제목','근로계약서');
  add('contract.list_title',C3,'계약 목록 칸 제목','📚 계약 목록');
  add('contract.show_cancelled',C3,'계약 목록·내 근로계약서 — 취소된 계약을 보는 체크칸 글','취소된 계약 보기');
  add('contract.th_template',C3,'계약 목록 표 머리 — 서식','서식');
  add('contract.th_status',C3,'계약 목록 표 머리 — 상태','상태');
  add('contract.th_end',C3,'계약 목록 표 머리 — 계약종료','계약종료');
  add('contract.th_sent',C3,'계약 목록 표 머리 — 발송일','발송일');
  add('contract.th_signed',C3,'계약 목록 표 머리 — 서명일','서명일');
  add('contract.btn_view',C3,'계약 목록 한 줄 끝 — 보기 단추 글','보기');
  add('contract.btn_pdf',C3,'계약 목록 한 줄 끝 — 완료 PDF 단추 글','완료 PDF');
  add('contract.btn_set_end',C3,'계약 목록 한 줄 끝 — 종료일 설정 단추 글','종료일 설정');
  add('contract.btn_cancel',C3,'계약 목록 한 줄 끝 — 발송 취소 단추 글','취소');
  add('contract.list_hidden',C3,'계약이 있는데 모두 취소된 것이라 숨겨졌을 때 뜨는 글(직원 화면도 같음)','취소된 계약은 숨겨져 있습니다.');
  add('contract.list_empty',C3,'계약이 하나도 없을 때 뜨는 글','계약이 없습니다.');
  add('contract.confirm_cancel',C3,'발송한 계약을 취소하려 할 때 뜨는 확인창','이 계약 발송을 취소할까요?');
  add('contract.m_cancel_fail',C3,'계약 취소 실패 알림창({msg}는 서버 오류)','취소하지 못했습니다: {msg}',['msg']);
  add('contract.m_changed',C3,'계약 취소 — 그 사이 상태가 바뀌었을 때 {msg} 자리에 대신 들어가는 글','이미 상태가 변경되었습니다.');
  add('contract.al_title',C3,'만료 알림 칸 제목','⏰ 근로계약 만료 확인');
  add('contract.al_count',C3,'만료 알림 칸 제목 옆 건수({n}=건수)','{n}건',['n']);
  add('contract.al_end',C3,'만료 알림 한 줄 — 계약 종료일 글({end}=날짜)','계약 종료 {end}',['end']);
  add('contract.al_end_none',C3,'만료 알림 한 줄 — 종료일이 비어 있을 때 글','계약 종료일 미입력');
  add('contract.al_review',C3,'만료 알림·계약 목록 — 종료일을 읽을 수 없어 사람이 봐야 할 때 표시','관리자 확인 필요');
  add('contract.al_expired',C3,'만료 알림 한 줄 오른쪽 표시 — 이미 만료됨({n}=지난 일수)','만료 {n}일 경과',['n']);
  add('contract.al_today',C3,'만료 알림 한 줄 오른쪽 표시 — 오늘 만료','오늘 만료');
  add('contract.al_dday',C3,'만료 알림 한 줄 오른쪽 표시 — 남은 일수({n}=남은 일수)','D-{n}',['n']);
  add('contract.al_btn',C3,'만료 알림 칸 — 계약서로 가는 단추 글','계약서에서 확인');
  add('contract.al_empty',C3,'만료가 다가온 계약이 하나도 없을 때 뜨는 글({n}=🔢 숫자·기준 탭의 만료 알림 일수 중 가장 큰 수)','{n}일 안에 만료되거나 확인이 필요한 계약이 없습니다.',['n']);
  add('contract.term_title',C3,'직원별 계약기간 관리 칸 제목','🗓 직원별 계약기간 관리');
  add('contract.term_sub',C3,'직원별 계약기간 관리 칸 제목 옆 작은 글','(계약서 파일이 없어도 설정 가능)');
  add('contract.th_start',C3,'직원별 계약기간 표 머리 — 계약 시작일','계약 시작일');
  add('contract.th_termend',C3,'직원별 계약기간 표 머리 — 계약 종료일','계약 종료일');
  add('contract.th_noend',C3,'직원별 계약기간 표 머리 — 무기한','무기한');
  add('contract.btn_save',C3,'직원별 계약기간 표·종료일 설정 창 — 저장 단추 글','저장');
  add('contract.term_hint',C3,'직원별 계약기간 표 아래 안내','원장·실장·매니저가 등록·변경할 수 있으며, 종료일 값이 만료 알림의 기준입니다.');
  add('contract.m_term_start',C3,'계약기간 저장 — 시작일이 날짜로 읽히지 않을 때 알림창','계약 시작일을 확인하세요.');
  add('contract.m_term_end',C3,'계약기간 저장 — 종료일도 「기간의 정함 없음」도 안 골랐을 때 알림창','종료일을 입력하거나 \'기간의 정함 없음\'을 선택하세요.');
  add('contract.m_term_order',C3,'계약기간 저장 — 종료일이 시작일보다 빠를 때 알림창','계약 종료일은 시작일보다 빠를 수 없습니다.');
  add('contract.m_save_fail',C3,'계약기간·종료일 저장 실패({msg}는 서버 오류 · 알림창과 종료일 설정 창 모두 같음)','저장 실패: {msg}',['msg']);
  add('contract.end_title',C3,'계약 종료일 설정 창 제목','📅 계약 종료일 설정');
  add('contract.end_f_date',C3,'계약 종료일 설정 창 — 계약 종료일 칸 이름','계약 종료일');
  add('contract.end_hint',C3,'계약 종료일 설정 창 — 아래 안내','계약서 본문·서명·발송 기록은 바꾸지 않고, 만료 알림 기준인 종료일만 보완합니다.');
  add('contract.m_saving',C3,'계약 종료일 설정 창 — 저장하는 동안 뜨는 글','저장 중…');
  add('contract.m_not_found',C3,'계약 종료일 저장 — 계약을 못 찾았을 때 {msg} 자리에 대신 들어가는 글','계약을 찾지 못했습니다.');
  add('contract.err_mine',C4,'내 계약서를 못 불러왔을 때 뜨는 글({msg}는 서버 오류)','내 계약서를 불러오지 못했습니다: {msg}',['msg']);
  add('contract.mine_title',C4,'직원 화면 — 「내 근로계약서」 칸 제목','📝 내 근로계약서');
  add('contract.mine_hint',C4,'직원 화면 — 받은 계약서가 있을 때 칸 제목 아래 안내','계약 내용을 확인한 뒤 서명란에 직접 서명하세요.');
  add('contract.mine_empty',C4,'직원 화면 — 받은 계약서가 하나도 없을 때 뜨는 글','받은 근로계약서가 없습니다.');
  add('contract.meta_sent',C4,'직원 화면 계약서 한 장 위 줄 — 발송일 글({date}=날짜)','발송 {date}',['date']);
  add('contract.meta_due',C4,'직원 화면 계약서 한 장 위 줄 — 서명기한 글({date}=날짜)','서명기한 {date}',['date']);
  add('contract.meta_signed',C4,'직원 화면 계약서 한 장 위 줄 — 서명한 날 글({date}=날짜)','서명 {date}',['date']);
  add('contract.pdf_base',C4,'직원 화면 — 원본 PDF가 있는 계약서에 뜨는 안내','이 계약의 기준 문서는 원본 PDF이며, HTML 계약 본문과 별도 보관됩니다.');
  add('contract.btn_pdf_down',C4,'직원 화면 — 서명 끝난 계약의 완료 PDF 내려받기 단추 글','완료 PDF 다운로드');
  add('contract.expired',C4,'직원 화면 — 서명기한이 지난 계약에 뜨는 글','서명 기간 만료, 원장에게 문의');
  add('contract.pdf_pos3',C4,'직원 화면 — 세 구역 서명 + 원본 PDF 계약의 서명 위치 안내','원본 PDF의 세 서명 위치를 확인하세요. 좌표 기준은 PDF 왼쪽 아래입니다.');
  add('contract.btn_pdf_open',C4,'직원 화면 — 원본 PDF를 여는 단추 글','원본 PDF 확인');
  add('contract.sign_h',C4,'직원 화면 — 서명 칸 위 제목','직원 서명');
  add('contract.pdf_pos1',C4,'직원 화면 — 원본 PDF 계약의 서명 위치 안내','원본 PDF를 먼저 확인하세요. 좌표 기준은 PDF 왼쪽 아래이며, 실제 페이지에 맞게 조정합니다.');
  add('contract.f_page',C4,'PDF 서명 위치 칸 이름 — 페이지','페이지');
  add('contract.ph_page',C4,'세 구역 서명의 PDF 위치 칸 안 글 — 쪽','쪽');
  add('contract.f_w',C4,'PDF 서명 위치 칸 이름 — 가로(칸 안 글도 같음)','가로');
  add('contract.f_h',C4,'PDF 서명 위치 칸 이름 — 세로(칸 안 글도 같음)','세로');
  add('contract.btn_clear_sig',C4,'서명 칸 — 서명을 지우는 단추 글','지우기');
  add('contract.btn_use_sig',C4,'서명 칸 — 보관해 둔 내 서명을 쓰는 단추 글','보관 서명 사용');
  add('contract.btn_sign_pdf',C4,'서명 칸 — 원본 PDF 계약의 서명 완료 단추 글','원본 확인 후 PDF 서명');
  add('contract.btn_sign_save',C4,'서명 칸 — 일반 계약의 서명 저장 단추 글','원문 확인 후 서명 저장');
  add('contract.signed_ok',C4,'직원 화면 — 서명을 마친 계약에 뜨는 글','✓ 서명 완료');
  add('contract.int_sig_h',C4,'세 구역 서명 칸 제목({part}=구역 이름 · 읽어 주는 이름도 같음)','{part} 서명',['part']);
  add('contract.int_confirm',C4,'세 구역 서명 칸 — 내용을 읽었다는 체크칸 글({part}=구역 이름)','{part} 내용을 읽고 이 서명을 확인함',['part']);
  add('contract.btn_print',C4,'세 구역 서명 화면 — 인쇄 단추 글','🖨️ 인쇄·PDF 저장');
  add('contract.btn_int_done',C4,'세 구역 서명 화면 — 완료 단추 글','3개 모두 서명 후 완료');
  add('contract.int_bad',C4,'세 구역 서명 — 본문 구성을 읽을 수 없을 때 뜨는 글','통합 계약 본문 구성을 확인할 수 없습니다.');
  add('contract.m_processed',C4,'서명 저장 — 이미 처리된 계약일 때 뜨는 글','이미 처리된 계약입니다.');
  add('contract.m_expired',C4,'서명 — 서명 기간이 지났을 때 뜨는 글','서명 기간이 만료되었습니다. 원장에게 문의하세요.');
  add('contract.m_sign_first',C4,'서명 — 서명을 안 하고 저장하려 할 때 뜨는 글','서명을 먼저 작성하세요.');
  add('contract.m_no_slot',C4,'서명 저장 — 계약서에서 직원 서명 자리를 못 찾았을 때 뜨는 글','직원 서명 위치를 찾지 못했습니다. 원장에게 문의하세요.');
  add('contract.m_sig_saving',C4,'서명 저장하는 동안 뜨는 글','서명 저장 중…');
  add('contract.m_sig_fail',C4,'서명 저장 실패({msg}는 서버 오류)','서명 저장 실패: {msg}',['msg']);
  add('contract.m_state_changed',C4,'서명 저장 — 서버 오류 글이 없을 때 {msg} 자리에 대신 들어가는 글','계약 상태가 변경되었습니다.');
  add('contract.m_not_pdf',C4,'PDF 서명 — PDF 서명 대상이 아닌 계약일 때 뜨는 글','PDF 서명 대상이 아닙니다.');
  add('contract.m_pdf_conf_fail',C4,'PDF 서명 — 원본 확인 기록 실패({msg}는 서버 오류)','원본 PDF 확인 기록 실패: {msg}',['msg']);
  add('contract.m_pdf_pos',C4,'PDF 서명 — 서명 위치 값이 잘못됐을 때 뜨는 글','PDF 서명 위치 값을 확인하세요.');
  add('contract.m_pdf_pos3',C4,'세 구역 PDF 서명 — 서명 위치 값이 잘못됐을 때 뜨는 글','세 PDF 서명 위치를 확인하세요.');
  add('contract.m_pdf_making',C4,'PDF 서명 — 완료 PDF를 만드는 동안 뜨는 글','완료 PDF 생성 중…');
  add('contract.m_pdf_sign_fail',C4,'PDF 서명 실패({msg}는 서버 오류)','PDF 서명 실패: {msg}',['msg']);
  add('contract.m_no_func',C4,'PDF 서명 실패인데 오류 글이 없을 때 {msg} 자리에 대신 들어가는 글','함수 미배포');
  add('contract.m_pdf_signed',C4,'PDF 서명을 마쳤을 때 뜨는 글','완료 PDF를 보관하고 서명 기록을 남겼습니다.');
  add('contract.m_int_need',C4,'세 구역 서명 — 세 구역을 다 확인·서명하지 않았을 때 뜨는 글','세 구역의 내용을 확인하고 각각 서명하세요.');
  add('contract.m_int_saving',C4,'세 구역 서명을 저장하는 동안 뜨는 글','세 서명 저장 중…');
  add('contract.m_int_fail',C4,'세 구역 서명 저장 실패({msg}는 서버 오류)','세 서명 저장 실패: {msg}',['msg']);
  add('contract.body.fixed_term',C5,'⚠️ 새로 만드는 계약서 본문에 들어가는 글이에요(이미 발송·서명한 계약서는 저장된 본문이 그대로라 안 바뀌어요). 법적 효력이 있는 문구라 고친 뒤 새 계약서 「미리보기」로 꼭 확인해 주세요. 계약 종료일이 정해진 계약서에서만 들어가는 「기간 만료」 조항','기간 만료 시 근로관계는 종료됩니다. 기간 중 사업운영이 더 이상 어렵거나 담당 직무가 폐지되는 경우에는 관련 절차에 따릅니다.');
  add('contract.body.holiday',C5,'⚠️ 새로 만드는 계약서 본문에 들어가는 글이에요(이미 발송·서명한 계약서는 저장된 본문이 그대로라 안 바뀌어요). 법적 효력이 있는 문구라 고친 뒤 새 계약서 「미리보기」로 꼭 확인해 주세요. 「공휴일 근무」를 「포함」으로 고른 계약서에 들어가는 한 줄','■ 설·추석 등 공휴일 근무 포함');
  add('contract.body.na',C5,'⚠️ 새로 만드는 계약서 본문에 들어가는 글이에요(이미 발송·서명한 계약서는 저장된 본문이 그대로라 안 바뀌어요). 법적 효력이 있는 문구라 고친 뒤 새 계약서 「미리보기」로 꼭 확인해 주세요. 선택 항목(연봉세전·통상시급 등)을 비워 두면 그 자리에 들어가는 글','해당 없음');
  add('contract.body.wage_caption',C5,'⚠️ 새로 만드는 계약서 본문에 들어가는 글이에요(이미 발송·서명한 계약서는 저장된 본문이 그대로라 안 바뀌어요). 법적 효력이 있는 문구라 고친 뒤 새 계약서 「미리보기」로 꼭 확인해 주세요. 계약서의 임금 구성표 제목(임금 항목 이름 자체는 코드에 있어요)','직원별 임금 구성 · 계약 발송 전 확인');
  add('contract.body.wage_empty',C5,'⚠️ 새로 만드는 계약서 본문에 들어가는 글이에요(이미 발송·서명한 계약서는 저장된 본문이 그대로라 안 바뀌어요). 법적 효력이 있는 문구라 고친 뒤 새 계약서 「미리보기」로 꼭 확인해 주세요. 임금 구성을 아직 안 적은 계약서의 임금 자리 문장','임금 구성은 계약 발송 전에 직원별로 기입합니다.');
  add('contract.body.wage_hours',C5,'⚠️ 새로 만드는 계약서 본문에 들어가는 글이에요(이미 발송·서명한 계약서는 저장된 본문이 그대로라 안 바뀌어요). 법적 효력이 있는 문구라 고친 뒤 새 계약서 「미리보기」로 꼭 확인해 주세요. 임금 항목 이름 뒤에 붙는 산정 시간 글({h}=시간)','(산정: {h})',['h']);
  add('contract.body.sched_th_days',C5,'⚠️ 새로 만드는 계약서 본문에 들어가는 글이에요(이미 발송·서명한 계약서는 저장된 본문이 그대로라 안 바뀌어요). 법적 효력이 있는 문구라 고친 뒤 새 계약서 「미리보기」로 꼭 확인해 주세요. 계약서 근무시간표 머리 — 근무일','근무일');
  add('contract.body.sched_th_kind',C5,'⚠️ 새로 만드는 계약서 본문에 들어가는 글이에요(이미 발송·서명한 계약서는 저장된 본문이 그대로라 안 바뀌어요). 법적 효력이 있는 문구라 고친 뒤 새 계약서 「미리보기」로 꼭 확인해 주세요. 계약서 근무시간표 머리 — 구분','구분');
  add('contract.body.sched_th_time',C5,'⚠️ 새로 만드는 계약서 본문에 들어가는 글이에요(이미 발송·서명한 계약서는 저장된 본문이 그대로라 안 바뀌어요). 법적 효력이 있는 문구라 고친 뒤 새 계약서 「미리보기」로 꼭 확인해 주세요. 계약서 근무시간표 머리 — 시업~종업','시업~종업');
  add('contract.body.sched_th_break',C5,'⚠️ 새로 만드는 계약서 본문에 들어가는 글이에요(이미 발송·서명한 계약서는 저장된 본문이 그대로라 안 바뀌어요). 법적 효력이 있는 문구라 고친 뒤 새 계약서 「미리보기」로 꼭 확인해 주세요. 계약서 근무시간표 머리 — 휴게시간','휴게시간');
  add('contract.body.sched_th_note',C5,'⚠️ 새로 만드는 계약서 본문에 들어가는 글이에요(이미 발송·서명한 계약서는 저장된 본문이 그대로라 안 바뀌어요). 법적 효력이 있는 문구라 고친 뒤 새 계약서 「미리보기」로 꼭 확인해 주세요. 계약서 근무시간표 머리 — 비고','비고');
  add('contract.body.sched_rot',C5,'⚠️ 새로 만드는 계약서 본문에 들어가는 글이에요(이미 발송·서명한 계약서는 저장된 본문이 그대로라 안 바뀌어요). 법적 효력이 있는 문구라 고친 뒤 새 계약서 「미리보기」로 꼭 확인해 주세요. 계약서 근무시간표 — 「주 5일 교대」(평일만)의 근무일 칸({days}=고른 요일)','{days} 중 주 5일 (교대)',['days']);
  add('contract.body.sched_rot_wk',C5,'⚠️ 새로 만드는 계약서 본문에 들어가는 글이에요(이미 발송·서명한 계약서는 저장된 본문이 그대로라 안 바뀌어요). 법적 효력이 있는 문구라 고친 뒤 새 계약서 「미리보기」로 꼭 확인해 주세요. 계약서 근무시간표 — 「주 5일 교대」에 토·일이 들어 있을 때 근무일 칸({days}=고른 요일)','{days} 중 주 5일 (교대·주말 포함 가능)',['days']);
  add('contract.body.sched_twice',C5,'⚠️ 새로 만드는 계약서 본문에 들어가는 글이에요(이미 발송·서명한 계약서는 저장된 본문이 그대로라 안 바뀌어요). 법적 효력이 있는 문구라 고친 뒤 새 계약서 「미리보기」로 꼭 확인해 주세요. 계약서 근무시간표 — 「평일 야간 2회」의 근무일 칸({days}=고른 요일)','상기 주 5일 중 {days} 야간 2회 (근무표에 따름)',['days']);
}
let HUB_TEXT_DEFS_CACHE=null;
function hubTextDefsChapter7(add){
  const S1='🏠 홈';
  const S2='💰 입금';
  const S3='🔒 진료기록';
  const S4='💰 AI비용 › 사용량 현황판';
  const S5='📒 원장 보기판';
  const S6='💰 AI비용 › 마케팅비';
  const S7='💰 AI비용 › 실제 청구액';
  const S8='💰 급여 › 급여대장·시급설정';
  const S9='💰 급여 › 명세서 화면';
  const S10='💰 급여 › 명세서 서식(발행할 때부터 적용)';
  const S11='🛡️ 계정·권한 관리 › 위험 작업 확인창';
  const S12='🧩 직무 분류 관리';
  const S13='💾 저장 상태 글(허브 맨 위)';
  const S14='📎 내 서류함 › 결제 금액 단위·계약서 미리보기 창';
  add('home.greeting',S1,'홈 맨 위 인사 — {name}은 내 이름','안녕하세요, {name}님',['name']);
  add('home.stat_leave',S1,'홈 맨 위 칸 — 내 연차 잔여 위 작은 이름','내 연차 잔여');
  add('home.stat_notice',S1,'홈 맨 위 칸 — 안 읽은 공지 위 작은 이름','안 읽은 공지');
  add('home.stat_undone',S1,'홈 맨 위 칸 — 미제출 서류 위 작은 이름','미제출 서류');
  add('home.undone_alert',S1,'홈 맨 위 칸 아래 주황 안내 — 미제출 서류가 있을 때. {n}은 미제출 서류 개수','⚠ 미제출 서류 {n}개 — [내 서류함] 탭에서 제출하세요.',['n']);
  add('home.slip_title',S1,'홈 「내 명세서」 칸 제목(발행된 명세서가 있는 직원에게만)','💰 내 명세서');
  add('home.slip_btn',S1,'홈 「내 명세서」 칸 — 월마다 있는 「보기」 단추 글','보기');
  add('home.inbox_title',S1,'홈 문의함 요약 칸 제목(문의함을 보는 사람에게만)','📥 문의함');
  add('home.inbox_open',S1,'홈 문의함 요약 칸 — 문의함으로 가는 단추 글','문의함 열기');
  add('home.inbox_err',S1,'홈 문의함 요약 칸 — 요약을 못 불러왔을 때 뜨는 글','문의함 요약을 불러오지 못했습니다.');
  add('home.inbox_count_err',S1,'홈 문의함 요약 칸 — 요약을 못 불러왔을 때 제목 아래 작은 글','미처리 개수를 확인할 수 없습니다.');
  add('home.inbox_new',S1,'홈 문의함 요약 칸 — 제목 아래 작은 글. {n}은 미처리(NEW) 문의 건수','NEW(미처리) 문의 {n}건',['n']);
  add('home.inbox_unknown',S1,'홈 문의함 요약 칸 — 최근 문의 한 줄, 받은 시각을 모를 때 대신 보이는 글','미상');
  add('home.inbox_recent_empty',S1,'홈 문의함 요약 칸 — 최근 문의가 하나도 없을 때','최근 문의가 없습니다.');
  add('home.consult_title',S1,'홈 상담일지 칸 제목(매니저·실장·원장에게만)','🗂 상담일지');
  add('home.consult_hint',S1,'홈 상담일지 칸 제목 아래 작은 글','매니저·실장·원장만 상담 기록을 입력·조회·수정합니다.');
  add('home.consult_open',S1,'홈 상담일지 칸 — 상담일지로 가는 단추 글','상담일지 열기');
  add('dep.no_access',S2,'입금 화면 — 볼 권한이 없는 직원에게 뜨는 글','예치금은 데스크·실장·원장만 조회할 수 있습니다.');
  add('dep.title',S2,'입금 화면 맨 위 제목','💰 입금');
  add('dep.warn',S2,'입금 화면 제목 아래 주황 안내','⚠ 미검증 자동 알림 · 회계 원장이 아니며 수기 대조용');
  add('dep.btn_today',S2,'입금 화면 — 기간 단추 「오늘」','오늘');
  add('dep.btn_week',S2,'입금 화면 — 기간 단추 「7일」','7일');
  add('dep.btn_month',S2,'입금 화면 — 기간 단추 「이번달」','이번달');
  add('dep.th_time',S2,'입금 표 머리 — 시각 칸','시각');
  add('dep.th_amount',S2,'입금 표 머리 — 금액 칸','금액');
  add('dep.th_payer',S2,'입금 표 머리 — 입금자 칸','입금자');
  add('dep.th_account',S2,'입금 표 머리 — 계좌 칸','계좌');
  add('dep.card_est',S2,'입금 표 — 카드 결제로 보이는 줄의 입금자 앞 표시','💳 카드결제(추정)');
  add('dep.empty',S2,'입금 내역이 하나도 없을 때','입금 내역이 없습니다 (자동 수집 대기)');
  add('cf.err',S3,'진료기록 화면 — 기록을 못 불러왔을 때','불러오기 오류');
  add('cf.title',S3,'진료기록 화면 맨 위 제목','🔒 진료기록');
  add('cf.ph_search',S3,'진료기록 검색칸 안 안내 글','환자명·차트번호 검색');
  add('cf.empty',S3,'진료기록 목록이 비었거나 검색 결과가 없을 때','기록 없음');
  add('cf.badge_owner',S3,'진료기록 한 줄 — 원장 전용 기록 표시','🔒 원장전용');
  add('cf.add_title',S3,'진료기록 「기록 추가」 칸 제목','➕ 기록 추가');
  add('cf.ph_name',S3,'기록 추가 — 환자명 칸 안 안내 글','환자명 *');
  add('cf.ph_chart',S3,'기록 추가 — 차트번호 칸 안 안내 글','차트번호(선택)');
  add('cf.ph_body',S3,'기록 추가 — 내용 칸 안 안내 글','내용');
  add('cf.owner_only',S3,'기록 추가 — 원장에게만 보이는 체크칸 글','원장 전용(다른 직원 안 보임)');
  add('cf.btn_save',S3,'기록 추가 — 저장 단추 글','저장');
  add('cf.m_missing',S3,'기록 저장 — 환자명·내용을 안 적었을 때','환자명과 내용은 필수입니다.');
  add('cf.m_fail',S3,'기록 저장 — 저장이 안 됐을 때. {detail}은 서버 오류 글','저장 실패: {detail}',['detail']);
  add('aiu.model_title',S4,'사용량 현황판 — 「모델별 사용량」 구역 제목. {days}는 며칠치인지(허브 설정 「모델별 사용량 기간」)','🤖 모델별 사용량(최근 {days}일)',['days']);
  add('aiu.model_sub',S4,'사용량 현황판 — 「모델별 사용량」 제목 옆 작은 글','Codex 토큰');
  add('aiu.period',S4,'사용량 현황판 — 모델별 사용량 제목 아래 기간 글. {start}~{end}는 날짜','기간 {start} ~ {end}',['start','end']);
  add('aiu.last_sync',S4,'사용량 현황판 — 기간 글 옆 마지막 동기화 글. {when}은 시각','마지막 동기화 {when}',['when']);
  add('aiu.model_err',S4,'사용량 현황판 — 모델별 사용량을 못 불러왔을 때. {detail}은 오류 글','AI 사용량을 불러오지 못했습니다: {detail}',['detail']);
  add('aiu.model_empty',S4,'사용량 현황판 — 올라온 사용량 기록이 하나도 없을 때','아직 올라온 사용량 기록이 없습니다. PC에서 하루 한 번 올리면 여기에 쌓입니다.');
  add('aiu.astra_note',S4,'사용량 현황판 — 노란 상자의 Astra 이름 옆 설명','(고비용 검증 모델)');
  add('aiu.astra_none',S4,'사용량 현황판 — 노란 상자에서 최근 Astra 사용 기록이 없을 때. {days}는 며칠치인지','최근 {days}일 사용 기록 없음',['days']);
  add('aiu.model_total',S4,'사용량 현황판 — 큰 숫자 위 작은 글. {days}는 며칠치인지','{days}일 합계',['days']);
  add('aiu.th_model',S4,'사용량 현황판 — 모델별 표 머리: 모델 칸','모델');
  add('aiu.th_tokens',S4,'사용량 현황판 — 모델별 표 머리: 토큰 칸','토큰');
  add('aiu.th_share',S4,'사용량 현황판 — 모델별 표 머리: 비중 칸','비중');
  add('aiu.th_turns',S4,'사용량 현황판 — 모델별 표 머리: 턴 칸','턴');
  add('aiu.model_hint',S4,'사용량 현황판 — 모델별 표 아래 작은 글','PC에 남은 Codex 대화 기록을 모아 올린 값입니다(오늘은 올린 시점까지). 비용이 큰 Astra는 노란색으로 따로 표시합니다.');
  add('aiu.cost_title',S4,'사용량 현황판 — 「정가 환산 사용가치」 구역 제목','💸 정가 환산 사용가치');
  add('aiu.cost_sub',S4,'사용량 현황판 — 「정가 환산 사용가치」 제목 옆 작은 글','청구액 아님 · PC 상황판 값');
  add('aiu.cost_err',S4,'사용량 현황판 — 정가 환산 기록을 못 불러왔을 때. {detail}은 오류 글','비용 기록을 불러오지 못했습니다: {detail}',['detail']);
  add('aiu.cost_empty',S4,'사용량 현황판 — 올라온 비용 기록이 하나도 없을 때','아직 올라온 비용 기록이 없습니다. PC 상황판이 갱신된 뒤 올리면 여기에 보입니다.');
  add('aiu.cost_th_platform',S4,'사용량 현황판 — 정가 환산 표 머리: 플랫폼 칸','플랫폼');
  add('aiu.cost_th_month',S4,'사용량 현황판 — 정가 환산 표 머리: 이번 달 칸','이번 달');
  add('aiu.cost_th_cum',S4,'사용량 현황판 — 정가 환산 표 머리: 누적 칸','누적');
  add('aiu.cost_th_tokens',S4,'사용량 현황판 — 정가 환산 표 머리: 토큰 칸','토큰(입력/출력)');
  add('aiu.cost_basis',S4,'사용량 현황판 — 정가 환산 구역 맨 위 작은 글. {generated}는 기준 시각, {fx}는 환율','기준 {generated} · 환율 US$1 = ₩{fx}',['generated','fx']);
  add('aiu.cost_this_month',S4,'사용량 현황판 — 큰 숫자 위 작은 글. {month}는 이번 달','이번 달({month}) 정가 환산 · 청구액 아님',['month']);
  add('aiu.cost_cum',S4,'사용량 현황판 — 큰 숫자 옆 누적 글. {won}은 누적 금액','· 누적 {won}',['won']);
  add('aiu.cost_monthly',S4,'사용량 현황판 — 월별 막대 위 제목','월별 합계(전 플랫폼)');
  add('aiu.cost_hint_a',S4,'사용량 현황판 — 정가 환산 맨 아래 작은 글 첫 부분(「사용 가치」 앞)','쓴 토큰을 API 정가로 환산한');
  add('aiu.cost_hint_b',S4,'사용량 현황판 — 정가 환산 맨 아래 작은 글 가운데 굵은 말','사용 가치');
  add('aiu.cost_hint_c',S4,'사용량 현황판 — 정가 환산 맨 아래 작은 글 끝부분(굵은 말 뒤)','입니다. Claude·Codex는 구독제라 실제 결제는 이보다 훨씬 적습니다. 실제 청구액은 맨 위 표를 보세요.');
  add('aiu.ext_before',S4,'사용량 현황판 — 외부 AI 금액 칸: 금액 기록을 시작하기 전 날짜일 때(두 곳에 같은 글)','금액 기록 전');
  add('aiu.ext_uncounted',S4,'사용량 현황판 — 외부 AI 금액 칸: 그날 금액이 하나도 집계 안 됐을 때. {calls}는 그날 부른 횟수','금액 미집계(0/{calls}건)',['calls']);
  add('aiu.ext_partial',S4,'사용량 현황판 — 외부 AI 금액 칸: 일부만 기록됐을 때. {costed}는 기록된 건수, {calls}는 전체 건수','({costed}/{calls}건 기록)',['costed','calls']);
  add('aiu.ext_title',S4,'사용량 현황판 — 「외부 AI」 구역 제목','🛰️ 외부 AI(딥시크·스텝5 등)');
  add('aiu.ext_sub',S4,'사용량 현황판 — 「외부 AI」 제목 옆 작은 글','PC에서 부른 횟수 · 정가 환산');
  add('aiu.ext_err',S4,'사용량 현황판 — 외부 AI 기록을 못 불러왔을 때. {detail}은 오류 글','외부 AI 기록을 불러오지 못했습니다: {detail}',['detail']);
  add('aiu.ext_empty',S4,'사용량 현황판 — 올라온 외부 AI 기록이 하나도 없을 때','아직 올라온 외부 AI 기록이 없습니다. PC 집계가 갱신된 뒤 올리면 여기에 보입니다.');
  add('aiu.ext_okfail',S4,'사용량 현황판 — 외부 AI 카드 안 작은 글. {ok}는 성공, {fail}은 실패 건수','성공 {ok} · 실패 {fail}',['ok','fail']);
  add('aiu.ext_basis',S4,'사용량 현황판 — 외부 AI 구역 맨 위 작은 글. {generated}는 기준 시각, {fx}는 환율, {days}는 날짜별 표 일수','기준 {generated} · 환율 US$1 = ₩{fx}(고정) · 누적은 전체 기간, 날짜별 표는 최근 {days}일',['generated','fx','days']);
  add('aiu.ext_th_date',S4,'사용량 현황판 — 외부 AI 날짜별 표 머리: 날짜 칸','날짜');
  add('aiu.ext_th_ai',S4,'사용량 현황판 — 외부 AI 날짜별 표 머리: AI 칸','AI');
  add('aiu.ext_th_calls',S4,'사용량 현황판 — 외부 AI 날짜별 표 머리: 건수 칸','건수');
  add('aiu.ext_th_okfail',S4,'사용량 현황판 — 외부 AI 날짜별 표 머리: 성공 / 실패 칸','성공 / 실패');
  add('aiu.ext_th_money',S4,'사용량 현황판 — 외부 AI 날짜별 표 머리: 금액 칸','금액');
  add('aiu.ext_rows_empty',S4,'사용량 현황판 — 외부 AI 날짜별 기록이 하나도 없을 때','날짜별 기록이 없습니다.');
  add('aiu.ext_note',S4,'사용량 현황판 — 외부 AI 구역 맨 아래 작은 글. {since}는 금액 기록 시작일(코드에 고정)','금액은 {since}부터 기록합니다(그 전 날짜는 금액 기록 전). 청구액이 아니라 쓴 토큰을 정가로 환산한 값입니다.',['since']);
  add('aiu.sess_title',S4,'사용량 현황판 — 「Codex 대화 효율 점검」 구역 제목','🩺 Codex 대화 효율 점검');
  add('aiu.sess_sub',S4,'사용량 현황판 — 「대화 효율 점검」 제목 옆 작은 글','오늘 · 돈이 새는 대화');
  add('aiu.sess_err',S4,'사용량 현황판 — 대화 점검 기록을 못 불러왔을 때. {detail}은 오류 글','점검 기록을 불러오지 못했습니다: {detail}',['detail']);
  add('aiu.sess_empty',S4,'사용량 현황판 — 올라온 점검 기록이 하나도 없을 때','아직 올라온 점검 기록이 없습니다.');
  add('aiu.sess_meta',S4,'사용량 현황판 — 대화 점검 구역 맨 위 작은 글. {generated}는 기준 시각, {won}은 오늘 전체 금액','기준 {generated} · 오늘 전체 약 ₩{won} · 🔴 지금 헛도는 중(멈추고 새 대화에서 #이어서) · 🟠 오늘 비쌈 · 추정 비용은 대략값',['generated','won']);
  add('aiu.sess_none',S4,'사용량 현황판 — 지금 돈이 새는 대화가 하나도 없을 때','지금 돈이 새는 대화 없음');
  add('aiu.sess_on',S4,'사용량 현황판 — 대화 점검 한 줄: 활성 대화 표시','활성');
  add('aiu.sess_off',S4,'사용량 현황판 — 대화 점검 한 줄: 멈춘 대화 표시','멈춤');
  add('aiu.panel_title',S4,'사용량 현황판 — 카드 맨 위 제목','📊 AI 사용량 현황판');
  add('aiu.panel_sub',S4,'사용량 현황판 — 카드 제목 옆 작은 글','원장 전용 · PC가 모아 올린 값');
  add('ob.busd_title',S5,'원장 보기판 — 첫째 판 카드·보기 화면 제목','📒 뻐스디 장부');
  add('ob.busd_desc',S5,'원장 보기판 — 첫째 판 카드 설명','AI 일 장부');
  add('ob.pin_title',S5,'원장 보기판 — 둘째 판 카드·보기 화면 제목','📌 명심판');
  add('ob.pin_desc',S5,'원장 보기판 — 둘째 판 카드 설명','AI가 지킬 약속');
  add('ob.word_title',S5,'원장 보기판 — 셋째 판 카드·보기 화면 제목','📖 박제 단어장');
  add('ob.word_desc',S5,'원장 보기판 — 셋째 판 카드 설명','원장이 알아 둘 말');
  add('ob.inbox_title',S5,'원장 보기판 — 넷째 판(총괄 인박스 맨 위 경고·대기 줄) 카드·보기 화면 제목','📥 인박스 경고');
  add('ob.inbox_desc',S5,'원장 보기판 — 넷째 판 카드 설명','AI가 남긴 최근 경고·대기');
  add('ob.frame_title',S5,'원장 보기판 — 판 화면 안쪽 창의 읽어 주는 이름(화면에는 안 보임). {title}은 판 제목','{title} 보기',['title']);
  add('ob.synced',S5,'원장 보기판 — 판 카드·보기 화면의 마지막 올라온 시각 글. {when}은 시각','마지막으로 올라온 때 {when}',['when']);
  add('ob.not_synced',S5,'원장 보기판 — 판이 아직 PC에서 안 올라왔을 때 카드 글(판 보기 오류 글에도 같이 씀)','아직 PC에서 올라오지 않음');
  add('ob.preparing',S5,'원장 보기판 — 판 저장 공간이 아직 준비 안 됐을 때(목록·보기 두 곳)','원장 보기판이 준비 중입니다.');
  add('ob.list_err_unknown',S5,'원장 보기판 — 목록 오류 글 끝에 붙는 오류 내용을 모를 때 대신 보이는 글','조회 오류');
  add('ob.list_err',S5,'원장 보기판 — 목록을 못 불러왔을 때. {detail}은 오류 글','원장 보기판 목록을 불러오지 못했습니다: {detail}',['detail']);
  add('ob.title',S5,'원장 보기판 화면 맨 위 제목','📒 원장 보기판');
  add('ob.sub',S5,'원장 보기판 화면 제목 옆 작은 글','원장 전용');
  add('ob.owner_only',S5,'원장 보기판 — 원장이 아닌 사람이 열었을 때','원장 전용입니다.');
  add('ob.loading',S5,'원장 보기판 — 판을 불러오는 동안 보이는 글','판을 불러오는 중…');
  add('ob.unknown_time',S5,'원장 보기판 — 판 보기 화면에서 올라온 시각을 모를 때','확인되지 않음');
  add('ob.view_err',S5,'원장 보기판 — 판을 못 불러왔을 때. {detail}은 오류 글','판을 불러오지 못했습니다: {detail}',['detail']);
  add('ob.png_note',S5,'원장 보기판 — 판 보기 화면 맨 위 작은 글','PNG 저장은 PC 판에서만 됨 · 허브에서는 PDF 저장을 쓰세요');
  add('ob.btn_close',S5,'원장 보기판 — 판 보기 화면의 닫기 단추 글','닫기');
  add('mkt.opt_default',S6,'마케팅비 — 분류 고르는 칸의 맨 위 항목(개별 분류·가맹점 기본 분류가 아니라 「기본 분류를 따름」 뜻)','기본 분류 사용');
  add('mkt.unclassified',S6,'마케팅비 — 분류를 못 정한 내역 묶음 이름·내역 줄의 분류 자리 글','미분류');
  add('mkt.m_budget_int',S6,'마케팅비 — 월 예산을 잘못 적었을 때 뜨는 알림','예산은 0원 이상의 정수로 입력해 주세요.');
  add('mkt.owner_only',S6,'마케팅비 — 원장이 아닌 사람이 볼 때','원장 전용입니다.');
  add('mkt.title',S6,'마케팅비 카드 제목(오류 화면 포함)','📣 마케팅비');
  add('mkt.sub',S6,'마케팅비 카드 제목 옆 작은 글(오류 화면 포함)','(원장 전용)');
  add('mkt.manager_sub',S6,'매니저 마케팅비 화면 제목 옆 설명','(마케팅 분류 내역만 · 읽기 전용)');
  add('mkt.view_unavailable',S6,'매니저 보기 설정이 꺼져 있거나 열람할 수 없을 때','마케팅비 열람이 꺼져 있거나 사용할 수 없습니다.');
  add('mkt.err_storage',S6,'마케팅비 — 마케팅비 저장 공간을 못 읽었을 때','마케팅비 저장 공간을 아직 불러오지 못했습니다.');
  add('mkt.err_load',S6,'마케팅비 — 마케팅비를 못 불러왔을 때','마케팅비를 불러오지 못했습니다.');
  add('mkt.merchant_unknown',S6,'마케팅비 — 내역 한 줄: 가맹점 이름을 모를 때','가맹점 미확인');
  add('mkt.cancel_tag',S6,'마케팅비 — 내역 한 줄 가맹점 이름 옆 취소 표시(앞의 · 는 코드가 붙임)','취소');
  add('mkt.time_unknown',S6,'마케팅비 — 내역 한 줄·취소 검토 줄: 시각을 모를 때(두 곳)','시간 미확인');
  add('mkt.aria_override',S6,'마케팅비 — 내역 한 줄 분류 고르는 칸의 읽어 주는 이름(화면에는 안 보임)','개별 분류');
  add('mkt.btn_apply',S6,'마케팅비 — 내역 한 줄 개별 분류의 「적용」 단추 글','적용');
  add('mkt.opt_nolink',S6,'마케팅비 — 외화 결제에서 원화 청구를 고르는 칸의 맨 위 항목','원화 청구 연결 안 함');
  add('mkt.aria_link',S6,'마케팅비 — 원화 청구 고르는 칸의 읽어 주는 이름(화면에는 안 보임)','원화 청구 연결');
  add('mkt.btn_link',S6,'마케팅비 — 외화 결제의 「연결」 단추 글','연결');
  add('mkt.none',S6,'마케팅비 — 접어 둔 목록 안에 내역이 하나도 없을 때','해당 내역 없음');
  add('mkt.count',S6,'마케팅비 — 건수 뒤에 붙는 글. {n}은 건수(접어 둔 목록 이름 옆·분류 줄·외화 줄)','{n}건',['n']);
  add('mkt.d_foreign',S6,'마케팅비 — 접어 둔 목록 이름: 외화 결제','외화 결제');
  add('mkt.d_not_marketing',S6,'마케팅비 — 접어 둔 목록 이름: 마케팅 아님으로 분류한 내역','마케팅 아님');
  add('mkt.d_cancel',S6,'마케팅비 — 접어 둔 목록 이름: 취소 검토. {n}은 건수','취소 검토 {n}건',['n']);
  add('mkt.foreign_mixed',S6,'마케팅비 — 분류 줄 오른쪽: 금액이 없고 외화만 있을 때','외화 포함');
  add('mkt.foreign_title',S6,'마케팅비 — 외화 합계 위 작은 제목','외화');
  add('mkt.cancel_multi',S6,'마케팅비 — 취소 검토 줄: 취소와 맞는 승인 후보가 여러 건일 때','승인 후보가 여러 건');
  add('mkt.cancel_dup',S6,'마케팅비 — 취소 검토 줄: 이미 취소 처리된 승인일 때','이미 취소 처리된 승인');
  add('mkt.cancel_none',S6,'마케팅비 — 취소 검토 줄: 연결할 승인이 없을 때','연결할 승인 없음');
  add('mkt.unread',S6,'마케팅비 — 읽지 못한 문자 건수 글. {n}은 건수','읽지 못한 문자 {n}건',['n']);
  add('mkt.rules_title',S6,'마케팅비 — 접어 둔 「가맹점 기본 분류 수정」 줄 글','가맹점 기본 분류 수정');
  add('mkt.btn_rule',S6,'마케팅비 — 가맹점 기본 분류의 저장 단추 글','가맹점 기본값');
  add('mkt.rules_hint',S6,'마케팅비 — 가맹점 기본 분류 아래 작은 글','기본 분류를 바꾸면 같은 가맹점의 지난달 내역에도 반영됨. 개별 분류가 우선 적용됨.');
  add('mkt.f_month',S6,'마케팅비 — 조회 월 칸 이름','조회 월');
  add('mkt.sum_label',S6,'마케팅비 — 큰 숫자 위 작은 글','이번 달 원화 합계');
  add('mkt.f_budget',S6,'마케팅비 — 월 예산 칸 이름','월 예산');
  add('mkt.ph_budget',S6,'마케팅비 — 월 예산 칸 안 안내 글','입력 안 함');
  add('mkt.unit_won',S6,'마케팅비 — 월 예산 칸 뒤 단위 글','원');
  add('mkt.btn_budget',S6,'마케팅비 — 예산 저장 단추 글','예산 저장');
  add('mkt.budget_used',S6,'마케팅비 — 예산 사용 비율 글. {budget}은 예산 금액, {pct}는 사용 비율(%)','예산 {budget}원 중 {pct}% 사용',['budget','pct']);
  add('mkt.budget_zero',S6,'마케팅비 — 예산이 0원일 때','예산이 0원이라 사용 비율을 계산하지 않음');
  add('mkt.no_sum',S6,'마케팅비 — 이번 달 집계가 하나도 없을 때','이번 달 집계가 없습니다.');
  add('aic.a_save_fail',S7,'AI비용 — 청구액 저장이 안 됐을 때 뜨는 알림. {detail}은 서버 오류 글','AI 비용 저장 실패: {detail}',['detail']);
  add('aic.owner_only',S7,'AI비용 — 원장이 아닌 사람이 열었을 때','원장만 사용할 수 있습니다.');
  add('aic.load_err',S7,'AI비용 — 청구액을 못 불러왔을 때. {detail}은 오류 글','AI 비용을 불러오지 못했습니다: {detail}',['detail']);
  add('aic.title',S7,'AI비용 화면 맨 위 제목','💰 AI비용');
  add('aic.sub',S7,'AI비용 화면 제목 옆 작은 글','(원장 전용)');
  add('bill.prev',S7,'월별 비용 정리 — 이전 달',"이전 달");
  add('bill.next',S7,'월별 비용 정리 — 다음 달',"다음 달");
  add('bill.month',S7,'월별 비용 정리 — {year}년 {month}월',"{year}년 {month}월",["year", "month"]);
  add('bill.zero_budget',S7,'월별 비용 정리 — 예산이 0원이라 사용 비율을 계산하지 않음',"예산이 0원이라 사용 비율을 계산하지 않음");
  add('bill.budget_used',S7,'월별 비용 정리 — 예산 {budget}원 중 {pct}% 사용',"예산 {budget}원 중 {pct}% 사용",["budget", "pct"]);
  add('bill.export_month',S7,'월별 비용 정리 — ⬇ 이 달 엑셀',"⬇ 이 달 엑셀");
  add('bill.export_year',S7,'월별 비용 정리 — ⬇ 1년 요약 엑셀',"⬇ 1년 요약 엑셀");
  add('bill.excel_unavailable',S7,'월별 비용 정리 — 엑셀 도구를 불러오지 못했습니다. 다시 열어 주세요.',"엑셀 도구를 불러오지 못했습니다. 다시 열어 주세요.");
  add('bill.budget_invalid',S7,'월별 비용 정리 — 예산은 0원 이상의 정수로 입력해 주세요.',"예산은 0원 이상의 정수로 입력해 주세요.");
  add('bill.budget_fail',S7,'월별 비용 정리 — 예산을 저장하지 못했습니다.',"예산을 저장하지 못했습니다.");
  add('bill.budget',S7,'월별 비용 정리 — 이번 달 예산',"이번 달 예산");
  add('bill.save_budget',S7,'월별 비용 정리 — 예산 저장',"예산 저장");
  add('bill.col_date',S7,'월별 비용 정리 — 날짜',"날짜");
  add('bill.col_merchant',S7,'월별 비용 정리 — 가맹점',"가맹점");
  add('bill.col_category',S7,'월별 비용 정리 — 분류',"분류");
  add('bill.col_amount',S7,'월별 비용 정리 — 금액(원)',"금액(원)");
  add('bill.col_month',S7,'월별 비용 정리 — 월',"월");
  add('bill.col_total',S7,'월별 비용 정리 — 합계(원)',"합계(원)");
  add('bill.col_currency',S7,'월별 비용 정리 — 통화',"통화");
  add('bill.col_native',S7,'월별 비용 정리 — 외화 원금액',"외화 원금액");
  add('bill.col_source',S7,'월별 비용 정리 — 입력 구분',"입력 구분");
  add('bill.source_manual',S7,'월별 비용 정리 — 직접 입력(월 합계)',"직접 입력(월 합계)");
  add('bill.source_auto',S7,'월별 비용 정리 — 자동감지',"자동감지");
  add('bill.sheet_month',S7,'월별 비용 정리 — 월 내역',"월 내역");
  add('bill.sheet_year',S7,'월별 비용 정리 — 연간 요약',"연간 요약");
  add('aic.f_month',S7,'AI비용 — 조회 월 칸 이름','조회 월');
  add('aic.total_label',S7,'AI비용 — 큰 숫자 위 작은 글','이번 달 실제 청구액 (직접 입력 + 자동감지 문자 합계)');
  add('aic.th_platform',S7,'AI비용 — 청구액 표 머리: 플랫폼 칸','플랫폼');
  add('aic.th_manual',S7,'AI비용 — 청구액 표 머리: 직접 입력 칸','직접 입력');
  add('aic.th_auto',S7,'AI비용 — 청구액 표 머리: 자동감지(문자) 칸','자동감지(문자)');
  add('aic.th_note',S7,'AI비용 — 청구액 표 머리: 메모 칸','메모');
  add('aic.unit_won',S7,'AI비용 — 직접 입력 칸 뒤 단위 글','원');
  add('aic.ph_note',S7,'AI비용 — 메모 칸 안 안내 글','선택 입력');
  add('aic.btn_save',S7,'AI비용 — 줄마다 저장 단추 글','저장');
  add('aic.hint',S7,'AI비용 — 청구액 표 아래 작은 글','"직접 입력"은 원장이 넣는 값, "자동감지(문자)"는 결제 문자를 MacroDroid가 자동으로 전송해 쌓인 값(수정 불가·자동 집계). 합계가 위 총액에 함께 반영됩니다.');
  add('aic.hist_title',S7,'AI비용 — 「최근 N개월 실제 청구액」 카드 제목. {n}은 몇 개월(허브 설정 「청구액 보여 줄 개월 수」)','최근 {n}개월 실제 청구액',['n']);
  add('aic.hist_empty',S7,'AI비용 — 저장된 청구 내역이 하나도 없을 때','저장된 청구 내역이 없습니다.');
  add('aic.auto_title',S7,'AI비용 — 「자동감지 내역」 카드 제목','📩 자동감지 내역');
  add('aic.auto_sub',S7,'AI비용 — 「자동감지 내역」 제목 옆 작은 글. {n}은 건수(허브 설정 「자동감지 내역 건수」)','(최근 {n}건, 문자 웹훅)',['n']);
  add('aic.auto_th_time',S7,'AI비용 — 자동감지 표 머리: 수신 칸','수신');
  add('aic.auto_th_platform',S7,'AI비용 — 자동감지 표 머리: 플랫폼 칸','플랫폼');
  add('aic.auto_th_amount',S7,'AI비용 — 자동감지 표 머리: 금액 칸','금액');
  add('aic.auto_th_text',S7,'AI비용 — 자동감지 표 머리: 원문 칸','원문');
  add('aic.unknown_time',S7,'AI비용 — 자동감지 한 줄: 받은 시각을 모를 때','미상');
  add('aic.auto_empty',S7,'AI비용 — 자동감지된 결제 문자가 하나도 없을 때','아직 자동감지된 결제 문자가 없습니다. MacroDroid 연동 후 결제 문자가 오면 여기 쌓입니다.');
  add('pay.title',S8,'급여 화면 맨 위 제목','💰 급여');
  add('pay.sub',S8,'급여 화면 제목 옆 작은 글','(원장 전용)');
  add('pay.tab_ledger',S8,'급여 화면 — 위쪽 단추 「급여대장」','급여대장');
  add('pay.tab_wage',S8,'급여 화면 — 위쪽 단추 「시급설정」','시급설정');
  add('pay.tab_slip',S8,'급여 화면 — 위쪽 단추 「명세서」','명세서');
  add('pay.owner_only',S8,'급여 화면 — 원장이 아닌 사람이 열었을 때','원장만 사용할 수 있습니다.');
  add('pay.wage_err',S8,'시급설정 — 시급 정보를 못 불러왔을 때. {detail}은 오류 글','시급 정보를 불러오지 못했습니다: {detail}',['detail']);
  add('pay.wage_title',S8,'시급설정 카드 제목','시급설정');
  add('pay.wage_th_name',S8,'시급설정 표 머리: 직원 칸','직원');
  add('pay.wage_th_type',S8,'시급설정 표 머리: 급여형태 칸','급여형태');
  add('pay.wage_th_base',S8,'시급설정 표 머리: 기본급/시급 칸','기본급/시급');
  add('pay.wage_th_hours',S8,'시급설정 표 머리: 통상시간 칸','통상시간');
  add('pay.wage_th_bonus',S8,'시급설정 표 머리: 고정상여 칸','고정상여');
  add('pay.wage_th_housing',S8,'시급설정 표 머리: 숙소지원 칸','숙소지원');
  add('pay.wage_th_from',S8,'시급설정 표 머리: 적용일 칸','적용일');
  add('pay.wage_th_memo',S8,'시급설정 표 머리: 메모 칸','메모');
  add('pay.wage_btn_save',S8,'시급설정 — 줄마다 저장 단추 글','저장');
  add('pay.wage_hint',S8,'시급설정 표 아래 작은 글','적용일을 새 날짜로 바꾸어 저장하면 기존 값을 덮지 않고 새 임금 이력이 만들어집니다.');
  add('pay.m_wage_date',S8,'시급설정 — 적용일을 안 적고 저장했을 때','적용일을 입력하세요.');
  add('pay.m_wage_fail',S8,'시급설정 — 저장이 안 됐을 때. {detail}은 서버 오류 글','저장 실패: {detail}',['detail']);
  add('pay.m_wage_saved',S8,'시급설정 — 저장됐을 때. {name}은 직원 이름','{name} 시급 정보를 저장했습니다.',['name']);
  add('pay.m_month_changed',S8,'급여대장 — 대상 월을 바꿨을 때 안내','대상 월을 바꿨습니다. 새 월의 대장 파일을 다시 선택하세요.');
  add('pay.m_row_added',S8,'급여대장 — 수기 행을 추가했을 때 안내','수기 입력 행을 추가했습니다.');
  add('pay.m_xls_read_fail',S8,'급여대장 — 엑셀을 못 읽었을 때. {detail}은 오류 글','엑셀을 읽지 못했습니다: {detail}',['detail']);
  add('pay.m_xls_no_base',S8,'급여대장 — 엑셀에서 「기본급」 열 줄을 못 찾았을 때','기본급 열이 있는 헤더 행을 찾지 못했습니다.');
  add('pay.m_xls_no_name',S8,'급여대장 — 엑셀에서 「성명」 열을 못 찾았을 때','성명 열을 찾지 못했습니다.');
  add('pay.m_xls_read',S8,'급여대장 — 엑셀을 읽었을 때 안내. {n}은 읽은 행 수','엑셀 {n}행을 읽었습니다.',['n']);
  add('pay.m_xls_map_fail',S8,'급여대장 — 엑셀을 읽은 안내 뒤에 붙는 글: 열 이름 매핑 저장이 안 됐을 때. {detail}은 오류 글','열 매핑 저장 실패: {detail}',['detail']);
  add('pay.m_xls_map_ok',S8,'급여대장 — 엑셀을 읽은 안내 뒤에 붙는 글: 열 이름 매핑을 저장했을 때','열 매핑도 저장했습니다.');
  add('pay.ledger_title',S8,'급여대장 카드 제목','급여대장');
  add('pay.f_month',S8,'급여대장 — 대상 월 칸 이름','대상 월');
  add('pay.btn_upload',S8,'급여대장 — 엑셀 업로드 단추 글','엑셀 업로드');
  add('pay.btn_addrow',S8,'급여대장 — 수기 행 추가 단추 글','수기 행 추가');
  add('pay.btn_save_ledger',S8,'급여대장 — 급여대장 저장 단추 글','급여대장 저장');
  add('pay.counts',S8,'급여대장 — 단추 아래 작은 글. {saved}는 저장된 행 수, {archived}는 보관함 행 수','선택 월 저장 행 {saved}건 · 복구 가능 보관 행 {archived}건',['saved','archived']);
  add('pay.pending_src',S8,'급여대장 — 위 작은 글 끝에 붙는 저장 대기 파일 글. {name}은 파일 이름','저장 대기 원본: {name}',['name']);
  add('pay.f_move',S8,'급여대장 — 옮길 월 칸 이름','옮길 월');
  add('pay.btn_move',S8,'급여대장 — 선택 월을 옮기는 단추 글','선택 월을 옮기기');
  add('pay.btn_archive',S8,'급여대장 — 선택 월을 보관함으로 보내는(복구 가능한 삭제) 단추 글','선택 월 삭제(복구 가능)');
  add('pay.btn_restore',S8,'급여대장 — 보관함의 월을 되돌리는 단추 글','선택 월 복구');
  add('pay.orig_label',S8,'급여대장 — 원본 파일 줄의 앞 글(뒤의 한 칸은 코드가 붙임)','원본 파일:');
  add('pay.orig_list_err',S8,'급여대장 — 원본 파일 목록을 못 불러왔을 때. {detail}은 오류 글','목록 조회 실패: {detail}',['detail']);
  add('pay.orig_btn',S8,'급여대장 — 원본 받기 단추 글. {name}은 파일 이름','원본 받기 · {name}',['name']);
  add('pay.orig_none',S8,'급여대장 — 저장된 원본 파일이 하나도 없을 때','저장된 원본 없음');
  add('pay.ledger_msg',S8,'급여대장 — 안내 글이 아직 없을 때 기본 안내','노무법인 급여대장의 첫 시트를 올리거나 수기 행을 추가하세요.');
  add('pay.th_map',S8,'급여대장 표 머리: 직원 매핑 칸','직원 매핑');
  add('pay.th_srcname',S8,'급여대장 표 머리: 원본 성명 칸','원본 성명');
  add('pay.opt_pick',S8,'급여대장 — 직원 매핑 고르는 칸의 맨 위 항목(이미 매핑된 줄)','선택');
  add('pay.opt_unmapped',S8,'급여대장 — 직원 매핑 고르는 칸의 맨 위 항목(매핑 안 된 줄)','미매핑');
  add('pay.manual_name',S8,'급여대장 — 수기로 넣은 줄의 원본 성명 칸','수기');
  add('pay.empty',S8,'급여대장 — 입력된 급여 행이 하나도 없을 때','입력된 급여 행이 없습니다.');
  add('pay.ledger_hint',S8,'급여대장 표 아래 작은 글','직원 이름이 정확히 한 명과 일치할 때만 자동 매핑합니다. 미매핑 행은 저장하지 않습니다.');
  add('pay.m_pick_month',S8,'급여대장 저장 — 대상 월을 안 골랐을 때','대상 월을 선택하세요.');
  add('pay.m_save_none',S8,'급여대장 저장 — 저장할 행이 하나도 없을 때. {skipped}는 건너뛴 행 수','저장할 매핑 행이 없습니다. 건너뜀 {skipped}건.',['skipped']);
  add('pay.m_ledger_fail',S8,'급여대장 저장 — 저장이 안 됐을 때. {detail}은 서버 오류 글','급여대장 저장 실패: {detail}',['detail']);
  add('pay.m_src_ok',S8,'급여대장 저장 — 안내 끝에 붙는 글: 원본 파일을 함께 보관했을 때(앞의 · 는 코드가 붙임)','원본 보관 완료');
  add('pay.m_src_fail',S8,'급여대장 저장 — 안내 끝에 붙는 글: 원본 파일 보관이 안 됐을 때. {detail}은 오류 글','원본 보관 실패: {detail}',['detail']);
  add('pay.m_saved',S8,'급여대장 저장 — 저장됐을 때 안내. {n}은 저장한 행 수','급여대장 {n}건 저장 완료',['n']);
  add('pay.m_skipped',S8,'급여대장 저장 — 안내 끝에 붙는 글: 건너뛴 행이 있을 때(앞의 · 는 코드가 붙임). {n}은 건너뛴 행 수','건너뜀 {n}건',['n']);
  add('pay.e_orig_limit',S8,'급여대장 — 원본 파일이 너무 클 때 오류 글(코드의 20MB 제한 자체는 안 바뀌어요)','원본은 20MB 이하 XLS/XLSX만 보관할 수 있습니다.');
  add('pay.e_orig_list',S8,'급여대장 — 원본 파일은 보관됐지만 목록 등록이 안 됐을 때. {detail}은 오류 글','파일은 비공개 Storage에 보관됐지만 목록 등록 실패: {detail}',['detail']);
  add('pay.a_orig_none',S8,'급여대장 — 원본 받기: 기록을 못 찾았을 때 알림','원본 기록을 찾지 못했습니다.');
  add('pay.a_orig_fail',S8,'급여대장 — 원본 받기: 내려받기가 안 됐을 때 알림. {detail}은 오류 글','원본 다운로드 실패: {detail}',['detail']);
  add('pay.a_orig_hash',S8,'급여대장 — 원본 받기: 파일 검증이 안 맞을 때 알림(파일이 바뀌었을 수 있다는 안전 경고예요)','원본 파일 검증에 실패했습니다. 내려받기를 중단했습니다.');
  add('pay.m_move_pick',S8,'급여대장 — 월 옮기기: 다른 월을 안 골랐을 때','옮길 다른 월을 선택하세요.');
  add('pay.c_move',S8,'급여대장 — 월 옮기기 확인창. {from}은 지금 월, {to}는 옮길 월','{from} 급여대장을 {to}(으)로 옮깁니다. 계속할까요?',['from','to']);
  add('pay.m_move_fail',S8,'급여대장 — 월 옮기기가 안 됐을 때. {detail}은 서버 오류 글','월 변경 실패: {detail}',['detail']);
  add('pay.m_moved',S8,'급여대장 — 월 옮기기 끝났을 때. {n}은 건수, {to}는 옮긴 월','{n}건을 {to}(으)로 옮겼습니다.',['n','to']);
  add('pay.c_archive',S8,'급여대장 — 월 삭제(보관함으로 보내기) 확인창. {month}는 월','{month} 급여대장 행을 복구 가능한 보관함으로 옮깁니다. 원본 파일은 그대로 보관합니다. 계속할까요?',['month']);
  add('pay.m_archive_fail',S8,'급여대장 — 월 삭제가 안 됐을 때. {detail}은 서버 오류 글','삭제 실패: {detail}',['detail']);
  add('pay.m_archived',S8,'급여대장 — 월 삭제(보관함으로 보냄) 끝났을 때. {n}은 건수','{n}건을 보관함으로 옮겼습니다. 같은 월의 복구 버튼으로 되돌릴 수 있습니다.',['n']);
  add('pay.m_restore_fail',S8,'급여대장 — 월 복구가 안 됐을 때. {detail}은 서버 오류 글','복구 실패: {detail}',['detail']);
  add('pay.m_restored',S8,'급여대장 — 월 복구 끝났을 때. {n}은 건수','{n}건을 복구했습니다.',['n']);
  add('pay.slip_none',S9,'명세서 — 직원이 한 명도 없을 때','직원이 없습니다.');
  add('pay.slip_att_err',S9,'명세서 — 근태 시간 집계를 못 불러왔을 때. {detail}은 오류 글','근태 시간 집계를 불러오지 못했습니다: {detail}',['detail']);
  add('pay.slip_no_row',S9,'명세서 — 고른 월·직원의 급여대장 행이 없을 때. {month}는 월, {name}은 직원 이름','{month} 급여대장에 {name} 행이 없습니다. 급여대장 탭에서 먼저 업로드·저장하세요.',['month','name']);
  add('pay.btn_reissue',S9,'명세서 — 이미 발행한 명세서의 발행 단추 글','재발행(덮어쓰기)');
  add('pay.btn_issue',S9,'명세서 — 발행 단추 글','발행');
  add('pay.btn_print',S9,'명세서 — 인쇄 미리보기 단추 글','🖨️ 인쇄 미리보기');
  add('pay.slip_title',S9,'명세서 카드 제목','명세서');
  add('pay.slip_f_month',S9,'명세서 — 대상 월 칸 이름','대상 월');
  add('pay.slip_f_user',S9,'명세서 — 직원 칸 이름','직원');
  add('pay.m_slip_pick',S9,'명세서 — 발행 단추를 눌렀는데 보이는 명세서가 없을 때','먼저 급여대장이 있는 월·직원을 선택하세요.');
  add('pay.m_slip_fail',S9,'명세서 — 발행이 안 됐을 때. {detail}은 서버 오류 글','발행 실패: {detail}',['detail']);
  add('pay.m_slip_done',S9,'명세서 — 발행했을 때 안내','명세서를 발행했습니다.');
  add('slip.badge_ledger',S10,'⚠ 명세서를 발행할 때 이 글이 본문에 박혀서 저장돼요. 이미 발행한 명세서(직원이 보는 것)는 안 바뀌고, 새로 발행하거나 재발행할 때부터 적용돼요. 명세서 공제 칸의 검산 표시 — 대장 값을 그대로 쓰는 항목','대장 값 사용');
  add('slip.badge_missing',S10,'⚠ 명세서를 발행할 때 이 글이 본문에 박혀서 저장돼요. 이미 발행한 명세서(직원이 보는 것)는 안 바뀌고, 새로 발행하거나 재발행할 때부터 적용돼요. 명세서 공제 칸의 검산 표시 — 대장에 값이 없을 때. {won}은 검산 금액','검산 {won}(대장에 값 없음)',['won']);
  add('slip.badge_diff',S10,'⚠ 명세서를 발행할 때 이 글이 본문에 박혀서 저장돼요. 이미 발행한 명세서(직원이 보는 것)는 안 바뀌고, 새로 발행하거나 재발행할 때부터 적용돼요. 명세서 공제 칸의 검산 표시 — 대장과 검산이 다를 때. {won}은 검산 금액, {diff}는 차이 금액','검산 {won}(차이 {diff})',['won','diff']);
  add('slip.badge_match',S10,'⚠ 명세서를 발행할 때 이 글이 본문에 박혀서 저장돼요. 이미 발행한 명세서(직원이 보는 것)는 안 바뀌고, 새로 발행하거나 재발행할 때부터 적용돼요. 명세서 공제 칸의 검산 표시 — 대장과 검산이 같을 때. {won}은 검산 금액','검산 일치 {won}',['won']);
  add('slip.draft_note',S10,'⚠ 명세서를 발행할 때 이 글이 본문에 박혀서 저장돼요. 이미 발행한 명세서(직원이 보는 것)는 안 바뀌고, 새로 발행하거나 재발행할 때부터 적용돼요. 명세서 맨 아래 — 아직 발행 전 미리보기일 때 노란 안내','⚠ 아직 발행 전 — 미리보기입니다. 발행하면 이 화면 그대로 잠깁니다.');
  add('slip.stamp_label',S10,'⚠ 명세서를 발행할 때 이 글이 본문에 박혀서 저장돼요. 이미 발행한 명세서(직원이 보는 것)는 안 바뀌고, 새로 발행하거나 재발행할 때부터 적용돼요. 명세서 맨 아래 도장 줄 앞 글(발행 도장)','발행');
  add('slip.clinic',S10,'⚠ 명세서를 발행할 때 이 글이 본문에 박혀서 저장돼요. 이미 발행한 명세서(직원이 보는 것)는 안 바뀌고, 새로 발행하거나 재발행할 때부터 적용돼요. 명세서 맨 위 병원 이름','아산정플란트치과의원');
  add('slip.doc_title',S10,'⚠ 명세서를 발행할 때 이 글이 본문에 박혀서 저장돼요. 이미 발행한 명세서(직원이 보는 것)는 안 바뀌고, 새로 발행하거나 재발행할 때부터 적용돼요. 명세서 맨 위 큰 제목','급 여 명 세 서');
  add('slip.th_name',S10,'⚠ 명세서를 발행할 때 이 글이 본문에 박혀서 저장돼요. 이미 발행한 명세서(직원이 보는 것)는 안 바뀌고, 새로 발행하거나 재발행할 때부터 적용돼요. 명세서 윗표: 성명 칸 이름','성명');
  add('slip.th_month',S10,'⚠ 명세서를 발행할 때 이 글이 본문에 박혀서 저장돼요. 이미 발행한 명세서(직원이 보는 것)는 안 바뀌고, 새로 발행하거나 재발행할 때부터 적용돼요. 명세서 윗표: 귀속월 칸 이름','귀속월');
  add('slip.th_dept',S10,'⚠ 명세서를 발행할 때 이 글이 본문에 박혀서 저장돼요. 이미 발행한 명세서(직원이 보는 것)는 안 바뀌고, 새로 발행하거나 재발행할 때부터 적용돼요. 명세서 윗표: 소속 칸 이름','소속');
  add('slip.th_paid',S10,'⚠ 명세서를 발행할 때 이 글이 본문에 박혀서 저장돼요. 이미 발행한 명세서(직원이 보는 것)는 안 바뀌고, 새로 발행하거나 재발행할 때부터 적용돼요. 명세서 윗표: 지급일 칸 이름','지급일');
  add('slip.paid_auto',S10,'⚠ 명세서를 발행할 때 이 글이 본문에 박혀서 저장돼요. 이미 발행한 명세서(직원이 보는 것)는 안 바뀌고, 새로 발행하거나 재발행할 때부터 적용돼요. 명세서 윗표: 아직 발행 전이라 지급일이 없을 때 대신 보이는 글','발행 시 자동 기록');
  add('slip.th_days',S10,'⚠ 명세서를 발행할 때 이 글이 본문에 박혀서 저장돼요. 이미 발행한 명세서(직원이 보는 것)는 안 바뀌고, 새로 발행하거나 재발행할 때부터 적용돼요. 명세서 가운데표: 근로일수 칸 이름','근로일수');
  add('slip.unit_days',S10,'⚠ 명세서를 발행할 때 이 글이 본문에 박혀서 저장돼요. 이미 발행한 명세서(직원이 보는 것)는 안 바뀌고, 새로 발행하거나 재발행할 때부터 적용돼요. 명세서 가운데표: 근로일수 값 뒤 단위. {n}은 일수','{n}일',['n']);
  add('slip.th_total',S10,'⚠ 명세서를 발행할 때 이 글이 본문에 박혀서 저장돼요. 이미 발행한 명세서(직원이 보는 것)는 안 바뀌고, 새로 발행하거나 재발행할 때부터 적용돼요. 명세서 가운데표: 총근로시간 칸 이름','총근로시간');
  add('slip.unit_hours',S10,'⚠ 명세서를 발행할 때 이 글이 본문에 박혀서 저장돼요. 이미 발행한 명세서(직원이 보는 것)는 안 바뀌고, 새로 발행하거나 재발행할 때부터 적용돼요. 명세서 가운데표: 시간 값 뒤 단위(네 칸 모두). {n}은 시간','{n}시간',['n']);
  add('slip.th_ot',S10,'⚠ 명세서를 발행할 때 이 글이 본문에 박혀서 저장돼요. 이미 발행한 명세서(직원이 보는 것)는 안 바뀌고, 새로 발행하거나 재발행할 때부터 적용돼요. 명세서 가운데표: 연장근로시간 칸 이름','연장근로시간');
  add('slip.th_night',S10,'⚠ 명세서를 발행할 때 이 글이 본문에 박혀서 저장돼요. 이미 발행한 명세서(직원이 보는 것)는 안 바뀌고, 새로 발행하거나 재발행할 때부터 적용돼요. 명세서 가운데표: 야간근로시간 칸 이름','야간근로시간');
  add('slip.th_holiday',S10,'⚠ 명세서를 발행할 때 이 글이 본문에 박혀서 저장돼요. 이미 발행한 명세서(직원이 보는 것)는 안 바뀌고, 새로 발행하거나 재발행할 때부터 적용돼요. 명세서 가운데표: 휴일근로시간 칸 이름','휴일근로시간');
  add('slip.pay_head',S10,'⚠ 명세서를 발행할 때 이 글이 본문에 박혀서 저장돼요. 이미 발행한 명세서(직원이 보는 것)는 안 바뀌고, 새로 발행하거나 재발행할 때부터 적용돼요. 명세서 — 지급 표 위 작은 제목','지급');
  add('slip.deduct_head',S10,'⚠ 명세서를 발행할 때 이 글이 본문에 박혀서 저장돼요. 이미 발행한 명세서(직원이 보는 것)는 안 바뀌고, 새로 발행하거나 재발행할 때부터 적용돼요. 명세서 — 공제 표 위 작은 제목','공제');
  add('slip.total_gross',S10,'⚠ 명세서를 발행할 때 이 글이 본문에 박혀서 저장돼요. 이미 발행한 명세서(직원이 보는 것)는 안 바뀌고, 새로 발행하거나 재발행할 때부터 적용돼요. 명세서 지급 표 맨 아래 줄 이름','지급액계');
  add('slip.total_deduct',S10,'⚠ 명세서를 발행할 때 이 글이 본문에 박혀서 저장돼요. 이미 발행한 명세서(직원이 보는 것)는 안 바뀌고, 새로 발행하거나 재발행할 때부터 적용돼요. 명세서 공제 표 맨 아래 줄 이름','공제액계');
  add('slip.th_net',S10,'⚠ 명세서를 발행할 때 이 글이 본문에 박혀서 저장돼요. 이미 발행한 명세서(직원이 보는 것)는 안 바뀌고, 새로 발행하거나 재발행할 때부터 적용돼요. 명세서 맨 아래표: 차인지급액 칸 이름','차인지급액(임금총액)');
  add('slip.unit_won',S10,'⚠ 명세서를 발행할 때 이 글이 본문에 박혀서 저장돼요. 이미 발행한 명세서(직원이 보는 것)는 안 바뀌고, 새로 발행하거나 재발행할 때부터 적용돼요. 명세서 맨 아래표: 차인지급액 값 뒤 단위','원');
  add('slip.foot_note',S10,'⚠ 명세서를 발행할 때 이 글이 본문에 박혀서 저장돼요. 이미 발행한 명세서(직원이 보는 것)는 안 바뀌고, 새로 발행하거나 재발행할 때부터 적용돼요. 명세서 맨 아래 작은 회색 글(검산·대장 금액에 대한 설명)','검산(회색)은 이 병원 급여 규정에 따른 참고 재계산이며, 실제 지급은 항상 왼쪽 대장 금액을 따릅니다. 국민연금·소득세·연말정산·조정수당은 노무법인 산출값을 그대로 사용합니다.');
  add('acct.c_block',S11,'⚠ 계정에 큰 영향을 주는 작업 직전에 뜨는 확인창이에요. 「영구」·「되돌릴 수 없음」 같은 핵심 뜻이 빠지지 않게 고쳐 주세요. 직원 계정 영구 차단 확인창. {name}은 직원 이름','{name} 계정의 접속을 영구 차단합니다. 인사·계약·출퇴근·휴가·급여 기록은 삭제하지 않습니다. 계속하시겠습니까?',['name']);
  add('acct.c_delete',S11,'⚠ 계정에 큰 영향을 주는 작업 직전에 뜨는 확인창이에요. 「영구」·「되돌릴 수 없음」 같은 핵심 뜻이 빠지지 않게 고쳐 주세요. 로그인 계정 영구 삭제 첫 확인창(줄바꿈 그대로 보임). {name}은 직원 이름','{name} 님의 로그인 계정(이메일 포함)을 영구히 삭제합니다. 되돌릴 수 없습니다.\n\n· 근무·연차·계약·출퇴근 기록은 그대로 남습니다.\n· 이 직원이 올린 파일도 지우지 않고, 소유권만 원장 계정으로 옮깁니다.\n· 다만 케이스노트 접근권한은 함께 사라집니다(다시 주려면 새로 부여해야 합니다).\n\n계속하시겠습니까?',['name']);
  add('acct.p_delete',S11,'⚠ 계정에 큰 영향을 주는 작업 직전에 뜨는 확인창이에요. 「영구」·「되돌릴 수 없음」 같은 핵심 뜻이 빠지지 않게 고쳐 주세요. 로그인 계정 영구 삭제 둘째 단계 — 이름을 직접 쳐 넣게 하는 입력창 글. {name}은 직원 이름(입력한 이름이 이 이름과 같아야 삭제됨)','정말로 삭제하려면 이름을 정확히 입력하세요: {name}',['name']);
  add('acct.c_revoke',S11,'⚠ 계정에 큰 영향을 주는 작업 직전에 뜨는 확인창이에요. 「영구」·「되돌릴 수 없음」 같은 핵심 뜻이 빠지지 않게 고쳐 주세요. 가입 승인 취소 확인창. {name}은 직원 이름','{name}의 승인을 취소합니다. 로그인은 되지만 업무 화면과 주요 데이터 접근이 막힙니다. 계속하시겠습니까?',['name']);
  add('jg.title',S12,'직무 분류 관리 — 칸 제목(계정·권한 관리 화면 안)','직무 분류');
  add('jg.doctors',S12,'직무 분류 관리 — 맨 위 원장 안내 줄 굵은 글','Dr. 별도 유지 · 편집 제외');
  add('jg.doctors_none',S12,'직무 분류 관리 — Dr. 명단이 없을 때 안내','근무표의 기존 Dr. 항목 유지');
  add('jg.unassigned',S12,'직무 분류 관리 — 분류가 안 된 직원이 있을 때 빨간 안내 제목. {n}은 인원','미지정 직원 {n}명',['n']);
  add('jg.legend',S12,'직무 분류 관리 — 1단계 칸 제목','1. 대상 선택');
  add('jg.no_people',S12,'직무 분류 관리 — 분류할 재직 직원이 없을 때','현재 분류할 재직 직원 없음');
  add('jg.step2',S12,'직무 분류 관리 — 2단계 칸 이름','2. 새 분류');
  add('jg.opt_pick',S12,'직무 분류 관리 — 새 분류 고르는 칸의 맨 위 항목','분류 선택');
  add('jg.preview_hint',S12,'직무 분류 관리 — 미리보기 자리에 처음 보이는 글','대상을 선택하고 새 분류를 고르면 미리보기가 표시됨');
  add('jg.btn_save',S12,'직무 분류 관리 — 저장 단추 글','미리보기대로 저장');
  add('jg.p_before',S12,'직무 분류 관리 — 미리보기 첫 줄 이름','변경 전');
  add('jg.p_after',S12,'직무 분류 관리 — 미리보기 둘째 줄 이름','변경 후');
  add('jg.p_none',S12,'직무 분류 관리 — 미리보기에서 바뀌는 사람이 없을 때','변경 대상 없음');
  add('jg.p_stale',S12,'직무 분류 관리 — 미리보기 한 줄 끝 표시(그 사이 값이 바뀐 사람)','값이 바뀌었음');
  add('jg.m_cannot',S12,'직무 분류 관리 — 저장할 수 없는 상태에서 저장을 눌렀을 때','저장할 수 없음: 대상을 다시 선택하고 미리보기를 확인하세요.');
  add('jg.m_nosession',S12,'직무 분류 관리 — 로그인 정보가 없을 때','로그인 세션 없음 — 다시 로그인한 뒤 재시도하세요.');
  add('jg.m_saving',S12,'직무 분류 관리 — 저장하는 동안 보이는 글','저장 중…');
  add('jg.f_session',S12,'직무 분류 관리 — 저장 결과 맨 앞 말: 로그인이 풀렸을 때','세션 만료');
  add('jg.f_perm',S12,'직무 분류 관리 — 저장 결과 맨 앞 말: 권한이 없을 때','권한 거부');
  add('jg.f_server',S12,'직무 분류 관리 — 저장 결과 맨 앞 말: 서버 오류일 때','서버 오류');
  add('jg.f_conflict',S12,'직무 분류 관리 — 저장 결과 맨 앞 말: 같은 때 다른 사람이 바꿨을 때','동시 변경 충돌');
  add('jg.f_some',S12,'직무 분류 관리 — 저장 결과 맨 앞 말: 그 밖에 일부만 저장됐을 때','일부 저장 실패');
  add('jg.f_counts',S12,'직무 분류 관리 — 저장 결과 맨 앞 말 뒤 글. {ok}는 성공 인원, {fail}은 실패 인원, {ids}는 실패한 번호들','성공 {ok}명 / 실패 {fail}명 · 실패 ID {ids}',['ok','fail','ids']);
  add('jg.m_ok',S12,'직무 분류 관리 — 저장 결과 맨 앞 말: 전부 저장 확인됐을 때. {n}은 인원','분류 변경 저장 확인됨: {n}명',['n']);
  add('jg.m_refetch',S12,'직무 분류 관리 — 저장은 보냈는데 다시 읽기가 실패했을 때(성공으로 치지 않는다는 안전 안내예요). {detail}은 오류 글','저장 후 재조회 실패 — 성공 여부 불명확, 완료로 처리하지 않음: {detail}',['detail']);
  add('save.saving',S13,'허브 맨 위 오른쪽 — 저장하는 동안 보이는 글','저장 중…');
  add('save.saved',S13,'허브 맨 위 오른쪽 — 저장이 끝난 순간 잠깐 보이는 글','✓ 저장됨');
  add('save.auto',S13,'허브 맨 위 오른쪽 — 평소 보이는 글(로그인한 뒤 · 저장이 끝나고 잠시 뒤)','✓ 자동 저장');
  add('save.error',S13,'허브 맨 위 오른쪽 — 저장이 안 됐을 때 빨갛게 보이는 글','⚠ 저장 안됨 · 인터넷 확인');
  add('payreq.unit_won',S14,'내 서류함 › 결제 요청 표 — 금액 뒤 단위 글(예 1,000원)','원');
  add('empdoc.preview_title',S14,'내 서류함 › 직원 서류함 — 근로계약서 미리보기 창의 읽어 주는 이름(화면에는 안 보임)','근로계약서 미리보기');
  add('empdoc.preview_name',S14,'내 서류함 › 직원 서류함 — 근로계약서 미리보기 위 제목: 파일 이름이 없을 때 대신 보이는 글','근로계약서');
}
function hubTextDefsTime(add){
  const S='⏰ 시간 표시';
  add('time.am',S,'오전·오후 표시 — 낮 12시 전에 붙는 말(「오전 9시 30분」의 「오전」). 밤 12시는 「오전 12시」','오전');
  add('time.pm',S,'오전·오후 표시 — 낮 12시부터 붙는 말(「오후 3시 31분」의 「오후」). 낮 12시는 「오후 12시」','오후');
  add('time.fmt_date',S,'날짜 꼴 — {y}는 해, {m}는 달, {d}는 일(앞에 0을 안 붙임). 예 「2026.9.9」 · 허브에서 날짜가 보이는 모든 곳(문의함·연차·결재·AI비용·입금·출퇴근·원장 보기판 안 날짜 글자 등)','{y}.{m}.{d}',['y','m','d']);
  add('time.fmt_time',S,'시각 꼴(분이 있을 때) — {ampm}은 위 오전·오후, {h}는 시(1~12), {mi}는 분(앞에 0을 안 붙임). 예 「오후 3시 31분」 · 출퇴근에 찍힌 시각, 문의 받은 시각 등 허브에서 시각이 보이는 모든 곳','{ampm} {h}시 {mi}분',['ampm','h','mi']);
  add('time.fmt_time_hour',S,'시각 꼴(정각일 때, 분이 0) — {ampm}은 오전·오후, {h}는 시. 예 「오후 3시」','{ampm} {h}시',['ampm','h']);
  add('time.fmt_datetime',S,'날짜와 시각을 같이 보여 줄 때의 꼴 — {date}는 위 날짜 꼴, {time}은 위 시각 꼴. 예 「2026.9.9 오전 9시 30분」 · 문의 받은 시각·연차 신청·승인 시각·원장 보기판 올라온 때 등','{date} {time}',['date','time']);
  add('time.fmt_today',S,'목록·로그 줄에서 「오늘」 기록의 꼴 — 기본은 시각만 보임({time}). 오늘 기록에도 날짜를 붙이려면 「{date} {time}」으로 바꾸세요(입금 목록·AI 도우미 대화록 목록 등)','{time}',['time','date']);
  add('time.fmt_md_time',S,'원장 보기판 안에 「10-02 20:13」처럼 해가 없이 적힌 시각을 바꿔 보여 줄 때의 꼴 — {m}은 달, {d}는 일, {time}은 위 시각 꼴. 예 「10.2 오후 8시 13분」(보기판 원본 글은 안 바뀜)','{m}.{d} {time}',['m','d','time']);
}
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
  hubTextDefsChapter6(add);
  hubTextDefsChapter7(add);
  hubTextDefsTime(add);
  ((typeof globalThis!=='undefined'&&globalThis.HUB_INTRO_TEXT_DEFS)||[]).forEach(function(d){add(d[0],'🌌 첫 화면',d[1],d[2]);}); // hub-intro.js의 첫 화면 글
  hubTextDefsP7(add);
  hubTextDefsP9(add);
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
  {key:'consult.action_limit',screen:'🗂 상담일지 기준',label:'「오늘·기한 지남」 목록에 보이는 건수',where:'상담일지 — 「오늘·기한 지남」 표에 몇 건까지 보여 줄지(꽉 차면 표 아래에 「최대 N건 표시 중임」 글이 떠요)',def:'100',kind:'int',min:20,max:300,unit:'건'},
  {key:'contract.expiry_alert_days',screen:'📝 근로계약 기준',label:'계약 만료 알림 일수',where:'근로계약서(원장·실장·매니저 화면) › 「⏰ 근로계약 만료 확인」 — 계약 종료일까지 남은 날이 이 일수 안이면 알림 목록에 올라와요. 가장 작은 수=긴급 · 두 번째=경고 · 나머지=예정이고(예 14, 30, 60이면 14일 이내 긴급 · 30일 이내 경고 · 60일 이내 예정), 가장 큰 수는 「N일 안에 만료되는 계약이 없습니다」 글에도 쓰여요. 이미 저장된 계약서는 안 바뀌어요',def:'[14,30,60]',kind:'intlist',min:1,max:365,unit:'일'},
  {key:'home.payslip_limit',screen:'🏠 홈·입금 기준',label:'홈 「내 명세서」에 보이는 달 수',where:'홈 — 발행된 명세서가 있는 직원 홈의 「💰 내 명세서」 칸에 최근 몇 달치까지 보여 줄지',def:'12',kind:'int',min:1,max:36,unit:'개월'},
  {key:'dep.list_limit',screen:'🏠 홈·입금 기준',label:'입금 목록에 보이는 최대 건수',where:'입금 — 고른 기간(오늘·7일·이번달) 안에서 입금 내역을 최대 몇 건까지 보여 줄지',def:'300',kind:'int',min:50,max:1000,unit:'건'},
  {key:'aic.history_months',screen:'💰 AI비용 기준',label:'「최근 N개월 실제 청구액」에 보이는 개월 수',where:'AI비용 — 「최근 N개월 실제 청구액」 카드에 몇 달치까지 보여 줄지(제목의 N도 같이 바뀌어요)',def:'6',kind:'int',min:1,max:24,unit:'개월'},
  {key:'aic.auto_limit',screen:'💰 AI비용 기준',label:'「자동감지 내역」에 보이는 건수',where:'AI비용 — 「📩 자동감지 내역」 카드에 최근 몇 건까지 보여 줄지(제목의 건수도 같이 바뀌어요)',def:'20',kind:'int',min:5,max:100,unit:'건'},
  {key:'aiu.model_days',screen:'💰 AI비용 기준',label:'사용량 현황판 「모델별 사용량」 기간',where:'AI비용 › 사용량 현황판 — 모델별 사용량을 최근 며칠치로 모아 보여 줄지(제목·합계 글의 일수도 같이 바뀌어요)',def:'7',kind:'int',min:3,max:30,unit:'일'},
  {key:'aiu.cost_months',screen:'💰 AI비용 기준',label:'사용량 현황판 「월별 합계」에 보이는 개월 수',where:'AI비용 › 사용량 현황판 › 정가 환산 — 월별 합계 막대를 몇 달치까지 보여 줄지(PC가 올린 달만 나와요)',def:'6',kind:'int',min:2,max:24,unit:'개월'},
  {key:'aiu.external_days',screen:'💰 AI비용 기준',label:'사용량 현황판 「외부 AI」 날짜별 표 일수',where:'AI비용 › 사용량 현황판 › 외부 AI — 날짜별 표에 최근 며칠치까지 보여 줄지(PC가 올린 날짜까지만 나와요 · 위쪽 작은 글의 일수도 같이 바뀌어요)',def:'14',kind:'int',min:3,max:60,unit:'일'},
  {key:'aiu.session_limit',screen:'💰 AI비용 기준',label:'사용량 현황판 「대화 효율 점검」에 보이는 대화 수',where:'AI비용 › 사용량 현황판 › 대화 효율 점검 — 돈이 새는 대화를 최대 몇 개까지 보여 줄지',def:'8',kind:'int',min:3,max:30,unit:'건'},
  {key:'leave.hidden_accounts',screen:'🌿 연차 기준',label:'연차 현황에서 접어 둘 계정 이름',where:'입사일 없는 계정은 항상 접음. 이름 목록은 JSON으로 적고 *는 어떤 글자든 뜻함. []면 이름으로 숨기지 않음',def:'["*_test","테스트","직원검토","abc","공용1","매니저"]',kind:'stringlist'},
  {key:'marketing.manager_view_enabled',screen:'📣 마케팅비 기준',label:'마케팅비 매니저 보기',where:'켬이면 매니저가 마케팅 분류 내역만 읽을 수 있어요. 미분류·제외 내역과 수정은 원장만 가능해요.',def:'true',kind:'bool'},
  {key:'att.diff.gap_min',screen:'🕘 근태 기준',label:'지문·수기 차이를 보여 줄 분',where:'출퇴근 차이 비교 — 수기와 지문 시각 차이가 이 분 이상이면 차이로 보여 줌',def:'1',kind:'int',min:1,max:120,unit:'분'},
  {key:'att.diff.show_staff',screen:'🕘 근태 기준',label:'직원에게 지문·수기 차이 보이기',where:'출퇴근 — 1이면 직원에게 본인 차이를 보여 주고 0이면 숨김',def:'1',kind:'int',min:0,max:1,unit:'1=보임 · 0=숨김'},
  {key:'att.issue.reason_min',screen:'🕘 근태 기준',label:'소명 사유 최소 글자 수',where:'지문누락 소명 — 직원이 직접 적어야 하는 사유의 최소 길이',def:'10',kind:'int',min:1,max:200,unit:'자'},
  {key:'att.issue.evidence_required',screen:'🕘 근태 기준',label:'소명 증거 파일 제출',where:'지문누락 소명 — 1이면 파일을 꼭 내고 0이면 생략 가능',def:'1',kind:'int',min:0,max:1,unit:'1=꼭 냄 · 0=안 내도 됨'},
  {key:'att.issue.evidence_max',screen:'🕘 근태 기준',label:'소명 한 건에 낼 수 있는 파일 수',where:'지문누락 소명 — 기존 파일과 새 파일을 합친 최대 개수',def:'5',kind:'int',min:1,max:10,unit:'개'},
  {key:'att.myissue_list_limit',screen:'🕘 근태 기준',label:'내 소명 목록에 보이는 건수',where:'출퇴근 — 내 소명 목록에 최근 몇 건까지 보여 줄지',def:'20',kind:'int',min:5,max:100,unit:'건'},
  {key:'monthly_leave_attendance_mode',screen:'🌿 연차 기준',label:'1년 미만 월차 적립 방식',labelKey:'p7.monthly.mode_label',where:'자동은 근무표 없이 매달 적립하고 원장이 결근 후보를 확인해 뺄 수 있습니다. 근무표 확인은 공표된 근무표로 개근 확인 뒤 적립합니다.',whereKey:'p7.monthly.mode_hint',def:'auto',kind:'enum',options:[{value:'auto',label:'매달 자동',labelKey:'p7.monthly.mode_auto'},{value:'published_schedule',label:'공표 근무표 확인',labelKey:'p7.monthly.mode_schedule'}]},
];
function hubSettingDefByKey(key){
  for(let i=0;i<HUB_SETTING_DEFS.length;i++)if(HUB_SETTING_DEFS[i].key===key)return HUB_SETTING_DEFS[i];
  return null;
}
// 값 검사: 화면에서 막고, 읽을 때는 모양이 틀리면 기본값을 쓴다. 통과하면 {ok:true,value}, 아니면 {ok:false,reason}.
function hubSettingValidate(def,raw){
  const v=String(raw==null?'':raw).trim();
  if(def.kind==='enum')return def.options.some(o=>o.value===v)?{ok:true,value:v}:{ok:false,reason:hubText('p7.monthly.mode_invalid','월차 적립 방식을 선택해 주세요.')};
  if(def.kind==='stringlist'){
    try{const a=JSON.parse(v);if(Array.isArray(a)&&a.length<=100&&a.every(x=>typeof x==='string'&&x.trim()&&x.length<=100))return {ok:true,value:JSON.stringify(a.map(x=>x.trim()))};}catch(e){}
    return {ok:false,reason:'이름 목록은 ["*_test","테스트"] 모양으로 적어 주세요. 모두 표시하려면 []를 적어요.'};
  }
  if(def.kind==='bool')return v==='true'||v==='false'?{ok:true,value:v}:{ok:false,reason:'켬 또는 끔을 골라 주세요.'};
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
  if(def.kind==='intlist'){ // 정수 목록(차례 6): 쉼표·띄어쓰기로 나눈 글 또는 [14,30,60] 모양 — 각각 정수 min~max · 1~5개 · 중복 없음 · 작은 수부터 정렬해 [14,30,60] 모양으로 저장
    let arr;
    try{arr=v.charAt(0)==='['?JSON.parse(v):v.split(/[\s,]+/).filter(function(x){return x!=='';});}
    catch(e){return {ok:false,reason:'일수는 14, 30, 60 처럼 쉼표로 나눠 적어 주세요.'};}
    if(!Array.isArray(arr)||arr.length<1||arr.length>5)return {ok:false,reason:'일수는 1개부터 5개까지 적어 주세요(예 14, 30, 60).'};
    const nums=[];
    for(let i=0;i<arr.length;i++){
      const x=String(arr[i]).trim();
      if(!/^\d{1,3}$/.test(x))return {ok:false,reason:'일수는 숫자만 적어 주세요(예 14, 30, 60).'};
      const n=Number(x);
      if(n<def.min||n>def.max)return {ok:false,reason:def.min+'부터 '+def.max+'까지만 쓸 수 있어요.'};
      if(nums.indexOf(n)>=0)return {ok:false,reason:'같은 일수가 두 번 들어 있어요: '+n};
      nums.push(n);
    }
    nums.sort(function(a,b){return a-b;});
    return {ok:true,value:JSON.stringify(nums)};
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
  {key:'list.att_issue_kinds',screen:'🕘 출퇴근',label:'지문누락 소명 사유 종류 이름',addable:false,
   where:'출퇴근 › 지문누락 소명 양식의 「사유 종류」 고르는 칸 · 소명 표의 유형',
   note:'서버가 허용하는 세 종류라 왼쪽 코드는 바꿀 수 없고 이름만 고칠 수 있으며, 새 항목은 늘릴 수 없어요.',
   def:[{code:'지문인식오류',label:'지문인식오류(찍었는데 인식 안 됨)'},{code:'입력오류',label:'입력오류(안 찍었거나 잘못 찍음)'},{code:'기타',label:'기타(외근·기기 고장 등)'}]},
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
   note:'문의 상태는 서버가 허락하는 7가지로 정해져 있고 문의 처리 흐름(새 문의 → 진행중 → 리콜 → 처리됨, 상담일지 전환)이 이 코드로 움직여서 코드는 못 바꾸고 새 상태도 못 늘려요. 보이는 이름만 고칠 수 있어요. 이름을 고치면 목록·필터·상세 어디서든 그 이름으로 보이고, 안 고치면 지금처럼(필터·목록은 NEW(미처리)·진행중·처리됨, 상세 고르는 칸은 신규·확인 중·처리됨)으로 보여요. 목록 맨 위 건수 줄과 풀이 글은 📝 글 고치기에서 따로 고쳐요.',
   def:[{code:'new',label:'NEW(미처리)'},{code:'in_progress',label:'진행중'},{code:'recall_1',label:'리콜 1차'},{code:'recall_2',label:'리콜 2차'},{code:'recall_3',label:'리콜 3차'},{code:'closed',label:'처리됨'},{code:'converted',label:'상담일지 전환'}]},
  {key:'list.consult_kinds',screen:'🗂 상담일지',label:'상담 구분 이름',addable:false,
   where:'상담일지 › 검색의 「전체 상담 구분」 고르는 칸 · 새 기록의 「상담 구분」 고르는 칸 · 목록 표의 구분 글',
   note:'상담 구분은 원본 엑셀의 시트 이름 6가지로 정해져 있고 서버가 이 값만 저장하며 시트별 추가 칸도 이 구분으로 움직여서 코드는 못 바꾸고 새 구분도 못 늘려요. 보이는 이름만 고칠 수 있어요. 이미 저장된 기록은 그대로예요.',
   def:[{code:'교정',label:'교정'},{code:'확정',label:'확정'},{code:'미확정 및 부분확정',label:'미확정 및 부분확정'},{code:'홈페이지',label:'홈페이지'},{code:'카카오,네이버예약,당근',label:'카카오,네이버예약,당근'},{code:'원본',label:'원본'}]},
  {key:'list.consult_status',screen:'🗂 상담일지',label:'상담 상태 이름',addable:false,
   where:'상담일지 › 검색의 「전체 상태」 고르는 칸 · 새 기록의 「상태」 고르는 칸 · 목록 표의 상태 글',
   note:'상담 상태는 서버가 허락하는 5가지로 정해져 있고 목록의 색깔(확정=초록·종결=노랑)도 이 코드로 정해서 코드는 못 바꾸고 새 상태도 못 늘려요. 보이는 이름만 고칠 수 있어요. 이미 저장된 기록은 그대로예요.',
   def:[{code:'대기',label:'대기'},{code:'미확정',label:'미확정'},{code:'부분확정',label:'부분확정'},{code:'확정',label:'확정'},{code:'종결',label:'종결'}]},
  {key:'list.approval_status',screen:'🖊 결재함',label:'결재 문서 상태 이름',addable:false,
   where:'결재함 › 결재 문서 카드의 상태 표시 · 내 서류함 › 결재 요청 표의 「상태」 칸',
   note:'결재 문서 상태는 서버가 허락하는 4가지(진행·완결·반려·취소)로 정해져 있고 결재 흐름이 이 코드로 움직여서 코드는 못 바꾸고 새 상태도 못 늘려요. 보이는 이름만 고칠 수 있어요. 이미 올라간 문서의 값은 그대로예요.',
   def:[{code:'진행',label:'진행'},{code:'완결',label:'완결'},{code:'반려',label:'반려'},{code:'취소',label:'취소'}]},
  {key:'list.contract_status',screen:'📝 근로계약서',label:'계약 상태 이름',addable:false,
   where:'근로계약서 › 계약 목록·계약 보기 제목·직원 계약 카드의 상태 표시',
   note:'계약 상태는 서버가 허락하는 값(발송요청·대기·서명완료·취소)이 계약 흐름과 묶여 있어서 코드는 못 바꾸고 새 상태도 못 늘려요. 「반려됨」은 원장이 발송 요청을 반려해 취소된 계약을 화면이 따로 부르는 이름이에요. 보이는 이름만 고칠 수 있어요.',
   def:[{code:'발송요청',label:'발송요청'},{code:'대기',label:'대기'},{code:'서명완료',label:'서명완료'},{code:'취소',label:'취소'},{code:'반려됨',label:'반려됨'}]},
  {key:'list.pay_wage_types',screen:'💰 급여',label:'급여형태 이름',addable:false,
   where:'급여 › 시급설정 표의 「급여형태」 고르는 칸',
   note:'급여형태는 서버에 저장되는 값(monthly·hourly)이 급여 계산과 묶여 있어서 코드는 못 바꾸고 새 형태도 못 늘려요. 보이는 이름만 고칠 수 있어요.',
   def:[{code:'monthly',label:'월급'},{code:'hourly',label:'시급'}]},
  {key:'list.marketing_categories',screen:'💰 AI비용 › 마케팅비',label:'마케팅비 분류 이름',addable:false,
   where:'AI비용 › 마케팅비 › 분류 고르는 칸(개별 분류·가맹점 기본 분류) · 분류별 줄·접어 둔 목록의 분류 이름',
   note:'마케팅비 분류는 서버가 허락하는 6가지로 정해져 있어서 코드는 못 바꾸고 새 분류도 못 늘려요. 보이는 이름만 고칠 수 있어요.',
   def:[{code:'daangn',label:'당근'},{code:'kakao',label:'카카오'},{code:'google',label:'구글'},{code:'naver',label:'네이버'},{code:'meta',label:'메타'},{code:'not_marketing',label:'마케팅 아님'}]},
  {key:'list.ai_billing_platforms',screen:'💰 AI비용 › 실제 청구액',label:'AI 플랫폼 이름(청구액 표)',addable:false,
   where:'AI비용 › 실제 청구액 표의 첫 칸(플랫폼 이름)',
   note:'저장된 청구액과 자동감지된 결제 문자가 이 이름으로 맞춰져서 코드는 못 바꾸고 새 플랫폼도 못 늘려요. 보이는 이름만 고칠 수 있어요.',
   def:[{code:'Claude',label:'Claude'},{code:'Codex(OpenAI)',label:'Codex(OpenAI)'},{code:'Kimi',label:'Kimi'},{code:'DeepSeek',label:'DeepSeek'},{code:'StepFun',label:'StepFun'},{code:'기타',label:'기타'}]},
  {key:'list.ai_cost_platforms',screen:'💰 AI비용 › 사용량 현황판',label:'정가 환산 표의 AI 플랫폼 이름',addable:false,
   where:'AI비용 › 사용량 현황판 › 정가 환산 표의 첫 칸',
   note:'이 값은 PC가 올릴 때 정한 이름표(claude·codex 등)라 코드는 못 바꾸고 새 항목도 못 늘려요. 보이는 이름만 고칠 수 있고, 목록에 없는 플랫폼은 올라온 이름이 그대로 보여요.',
   def:[{code:'claude',label:'Claude Code'},{code:'codex',label:'Codex (OpenAI)'},{code:'kimi',label:'Kimi (Moonshot)'},{code:'openclaw',label:'OpenClaw'}]},
  {key:'list.ai_external_names',screen:'💰 AI비용 › 사용량 현황판',label:'외부 AI 이름',addable:false,
   where:'AI비용 › 사용량 현황판 › 외부 AI 카드·날짜별 표의 AI 이름',
   note:'이 값은 PC가 올릴 때 정한 이름표(deepseek·step5 등)라 코드는 못 바꾸고 새 항목도 못 늘려요. 보이는 이름만 고칠 수 있고, 목록에 없는 AI는 올라온 이름이 그대로 보여요.',
   def:[{code:'deepseek',label:'딥시크'},{code:'step5',label:'스텝5'},{code:'kimi',label:'키미'},{code:'luna',label:'루나'},{code:'?',label:'이름 모름'}]}
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
const HUB_NOTIFY_ROWS=[['inquiry','문의'],['leave_request','연차 신청'],['leave_result','연차 결과'],['approval','결재'],['notice','공지'],['document','서류 승인'],['payment','결제 요청'],['advertising','광고']];
const HUB_NOTIFY_COLS=[['owner','원장'],['chief','실장'],['manager','매니저'],['desk','데스크'],['applicant','신청자 본인']];
const HUB_MANUAL_GROUPS=[['clinical_consult','진료·상담'],['sterilization_admin','소독·행정'],['lab','기공'],['desk','데스크']];
function hubNotifyDefault(row,col){
  return ({inquiry:['manager','desk'],leave_request:['owner','chief'],leave_result:['applicant'],approval:['owner','chief'],notice:['owner','chief','manager','desk'],document:['applicant'],payment:['owner','chief'],advertising:['owner','manager']})[row].includes(col);
}
function hubNotifyEnabled(row,col){const raw=hubSetting('notify.'+row+'.'+col,'');return raw==='true'?true:raw==='false'?false:hubNotifyDefault(row,col);}

function hubTextDefsP9(add){
  const defs={
  "pledge.body.title": "비밀유지·의료정보 보안·개인정보 취급자 서약서",
  "pledge.body.rules": "본인은 취업규칙 등 원내 규정이 근로기준법 제14조에 따라 원내에 게시되어 언제든지 자유롭게 열람할 수 있음을 안내받았으며, 이를 열람하지 않아 생기는 불이익은 본인이 감수함을 확인합니다.",
  "pledge.pending": "대기",
  "pledge.waiting": "서약 서명 대기",
  "pledge.progress": "계약 {n}곳 {contract} · 서약 {pledge}",
  "pledge.signature": "보안서약 별도 서명",
  "pledge.signed_meta": "서명 일시 {date} · 버전 {version}",
  "pledge.read": "조항을 모두 읽었음",
  "pledge.submit": "서약 서명·확인 후 완료",
  "pledge.clear": "서약 서명 지우기",
  "pledge.print": "서약본 인쇄·PDF 저장",
  "pledge.open": "보안서약 서명",
  "pledge.card_title": "보안서약 서명",
  "pledge.overview": "직원별 보안서약 서명 현황",
  "pledge.finish_pdf": "계약·서약 묶음 완료 PDF 만들기",
  "pledge.stage": "계약 {n}서명 저장 후 보안서약으로",
  "pledge.stage_confirm": "계약 {n}곳의 서명을 저장하고 별도 보안서약 서명으로 이어갑니다.",
  "pledge.failed": "서약 처리 실패: {msg}",
  "pledge.coordinates": "PDF 서명 위치를 확인하세요.",
  "phone.title": "폰 알림",
  "phone.on": "켬 (기기 {n}대 · 마지막 {date})",
  "phone.off": "안 켬",
  "phone.unknown": "확인 필요",
  "phone.guide": "업무자료 탭 맨 아래 🔔 모바일 알림 → 이 기기에서 알림 받기",
  "pledge.body.clause.1": "영업비밀 보호 — 공공연히 알려져 있지 않고 경제적 가치가 있으며 영업·기타 영업활동에 유용한 기술상·경영상 정보를 영업비밀로 보고, 회사의 보호 지침을 철저히 준수함.",
  "pledge.body.clause.2": "연봉·영업비밀·개인정보 비밀 유지 — 자신의 연봉수준을 비밀로 지킴. 업무 중 또는 업무와 관계없이 얻은 영업비밀은 지정된 업무에만 사용함. 재직 중·퇴직 후 사적 이용, 개인 SNS 업로드, 회사 안팎 제3자에게 누설·공개하지 않음. 직무상 알게 된 의원·제3자의 개인정보와 진료·간호 중 알게 된 타인의 비밀을 누설·발표하지 않음. 원문 의료법 제19조의 다른 법령에 특별히 규정된 경우의 문구도 유지함.",
  "pledge.body.clause.3": "업무 목적의 자원 사용 — 의원 정보·시스템계정·전산망 등의 자원은 업무 외 목적으로 이용하지 않음.",
  "pledge.body.clause.4": "전자의무기록 보호 — 원문 의료법 제23조(전자의무기록) 문구: 정당한 사유 없이 전자의무기록에 저장된 개인정보를 탐지하거나 누출·변호·훼손하지 않음. 「변호」는 원문 추출 표기를 그대로 둠.",
  "pledge.body.clause.5": "업무상 비밀누설 조항 — 원문 형법 제317조(업무상비밀누설): 의사·한의사·치과의사·약제사·약종상·조산사·변호사·변리사·공인회계사·공증인·대서업자, 그 직무상 보조자 또는 그 직에 있던 자의 업무 처리 중 알게 된 타인의 비밀누설에 관한 문구임. 원문의 3년 이하 징역이나 금고, 10년 이하 자격정지 또는 700만원 이하 벌금 문구를 유지함.",
  "pledge.body.clause.6": "위탁 처리와 취급자 감독 — 원문의 개인정보보호법 제26조(업무위탁에 따른 개인정보의 처리제한) 및 제28조(개인정보취급자에 대한 감독) 항목을 유지함.",
  "pledge.body.clause.7": "인터넷·USB·SNS 반출 금지 — 재직 중 알게 된 영업비밀·정보를 어떠한 이유로도 인터넷·SNS에 게시하거나 USB 등으로 가져가지 않음.",
  "pledge.body.clause.8": "접근·장비·정보자산 보호 — 허가받지 않은 정보·시설에는 접근하지 않으며 원내 지정 데이터 처리시설·설비만 이용함. 승인받지 않은 프로그램, 외장하드·모뎀·녹음기·외장Drive·CD-ROM·비허가 USB 등 정보저장·처리장치를 원내에서 사용하지 않음. 제공받은 문서·서류·사진·영상·PC·전자파일·저장매체·전산장비·통신망 등 정보자산은 무단변조·복사·훼손·분실·유출·무단반출로부터 안전하게 관리하고 업무 외 개인 목적으로 사용하지 않음.",
  "pledge.body.clause.9": "E-mail 규정과 관리 동의 — 회사 E-mail의 영업비밀·정보자산 보호, 오남용 방지 및 사용 규정을 준수함. 사전 승인 없이 회사 관련 정보를 개별적으로 외부에 전달·누설하지 않음. 경영정보 유출 방지, 정보통신망의 원활한 운영·유지, 전자메일 오남용 방지를 위한 회사의 관리에 동의함.",
  "pledge.body.clause.10": "동종·유사업체 협력 — 재직 중 회사의 사전 서면동의 없이 영업비밀이 누설될 수 있는 동종·유사업체의 임직원을 겸직하거나 자문·고문·그 밖의 방법으로 협력하지 않음.",
  "pledge.body.clause.11": "퇴직 때 반환·퇴직 후 비밀 유지 — 퇴직 때 관리하던 진료기록부·도표·명세서·파일·기타 기록매체 등 영업비밀 관련 일체의 정보자산과 의원 소유 정보자산을 모두 반납하고 어떠한 형태의 사본도 개인적으로 보유하지 않음. DOCX의 퇴직 후 1년 영업비밀 보안유지 의무 및 영업비밀을 이용한 이익 취득 금지 문구를 유지함. PDF의 퇴직 후에도 모든 고객정보·영업비밀·누설로 의원에 손해를 줄 수 있는 각종 정보를 일체 누설하지 않는 의무와 재직기간·퇴직 후 적용 문구도 함께 유지함.",
  "pledge.body.clause.12": "개인정보 처리 전 과정 — 개인정보의 수집·생성·기록·저장·보유·가공·편집·검색·출력·정점·복구·이용·제공·공개·파기 및 이와 유사한 일체 행위에서 의원 규정·통제절차를 준수함. 「정점」은 원문 추출 표기를 그대로 둠.",
  "pledge.body.clause.13": "계정·출입증 공동사용 금지 — 업무에 할당된 사용자 ID·패스워드·출입증·개인정보 처리시스템을 타인과 공동사용하거나 관련 정보를 누설하지 않음.",
  "pledge.body.clause.14": "위반 때 책임·변상·복구 — DOCX의 「부정경쟁방지 및 영업비밀보호에 관한 법률」·「정보통신망이용촉진 및 정보보호등에 관한 법률」 등에 규정된 민형사상 책임, 회사 징계조치 및 손해의 지체 없는 변상·복구 서약을 유지함. PDF 머리말의 관련 법령에 따른 민·형사상·행정상 책임, 의원 내규·관련 규정의 징계조치 등 불이익 감수와 손해 변상·복구 문구도 유지함."
};
  Object.entries(defs).forEach(([key,value])=>add(key,"보안서약·폰 알림",value,value,[...value.matchAll(/\{([a-z_]+)\}/g)].map(m=>m[1])));
}

function hubTextDefsP7(add){
  const S='⚙️ 허브 설정 › 알림·직무별 매뉴얼';
  add('p7.monthly.mode_label',S,"1년 미만 월차 적립 방식","1년 미만 월차 적립 방식",[]);
  add('p7.monthly.mode_hint',S,"자동은 근무표 없이 매달 적립하고 원장이 결근 후보를 확인해 뺄 수 있습니다. 근무표 확인은 공표된 근무표로 개근 확인 뒤 적립합니다.","자동은 근무표 없이 매달 적립하고 원장이 결근 후보를 확인해 뺄 수 있습니다. 근무표 확인은 공표된 근무표로 개근 확인 뒤 적립합니다.",[]);
  add('p7.monthly.mode_auto',S,"매달 자동","매달 자동",[]);
  add('p7.monthly.mode_schedule',S,"공표 근무표 확인","공표 근무표 확인",[]);
  add('p7.monthly.mode_invalid',S,"월차 적립 방식을 선택해 주세요.","월차 적립 방식을 선택해 주세요.",[]);
  add('p7.monthly.candidate',S,"결근 후보 {n}일","결근 후보 {n}일",["n"]);
  add('p7.monthly.revoke',S,"이 달 월차 빼기","이 달 월차 빼기",[]);
  add('p7.monthly.confirm',S,"{date}에 적립한 월차 {days}일을 뺄까요?","{date}에 적립한 월차 {days}일을 뺄까요?",["date", "days"]);
  add('p7.monthly.reason',S,"결근 후보 확인 후 월차 취소","결근 후보 확인 후 월차 취소",[]);
  add('p7.monthly.revoked',S,"월차를 뺐습니다.","월차를 뺐습니다.",[]);
  add('p7.monthly.load_fail',S,"월차 결근 후보를 불러오지 못했습니다: {msg}","월차 결근 후보를 불러오지 못했습니다: {msg}",["msg"]);
  add('p7.monthly.revoke_fail',S,"월차를 빼지 못했습니다: {msg}","월차를 빼지 못했습니다: {msg}",["msg"]);

  [['p7.notify.title','🔔 알림 받는 사람'],['p7.notify.hint','칸을 켜거나 끄면 다음 알림부터 반영됩니다. 결재·결제 요청의 기본 알림은 현재 처리 단계의 담당자에게 갑니다.'],['p7.manual.title','📚 직무별 매뉴얼 주소'],['p7.manual.hint','주소를 비우면 기존 공용 매뉴얼을 사용합니다.'],['p7.save','저장'],['p7.saved','저장했습니다.'],['p7.invalid_url','http:// 또는 https:// 주소를 입력해 주세요.'],['p7.employment.title','직원 재직 상태 지정'],['p7.employment.status','재직 상태'],['p7.employment.date','유효일'],['p7.employment.reason','사유'],['p7.employment.no_access','재직 상태를 지정할 권한이 없습니다.'],['manual.card_title','업무 매뉴얼'],['manual.card_hint','내 직무에 맞는 업무 안내를 확인합니다.']].forEach(it=>add(it[0],S,it[1],it[1]));
  ['재직','자진퇴사','계약만료','권고사직'].forEach((label,i)=>add('p7.employment.state.'+i,S,'재직 상태 이름',label));
  HUB_NOTIFY_ROWS.forEach(it=>add('p7.notify.row.'+it[0],S,'알림 종류 이름',it[1]));
  HUB_NOTIFY_COLS.forEach(it=>add('p7.notify.col.'+it[0],S,'알림 대상 이름',it[1]));
  HUB_MANUAL_GROUPS.forEach(it=>add('p7.manual.group.'+it[0],S,'매뉴얼 직무 이름',it[1]));
}
function hubP7SettingsHtml(){
  return '<section><h3>'+hubEsc(hubText('p7.notify.title','🔔 알림 받는 사람'))+'</h3><p>'+hubEsc(hubText('p7.notify.hint','칸을 켜거나 끄면 다음 알림부터 반영됩니다. 결재·결제 요청의 기본 알림은 현재 처리 단계의 담당자에게 갑니다.'))+'</p><div class="tblwrap"><table><thead><tr><th></th>'+HUB_NOTIFY_COLS.map(c=>'<th>'+hubEsc(hubText('p7.notify.col.'+c[0],c[1]))+'</th>').join('')+'</tr></thead><tbody>'+HUB_NOTIFY_ROWS.map(r=>'<tr><th>'+hubEsc(hubText('p7.notify.row.'+r[0],r[1]))+'</th>'+HUB_NOTIFY_COLS.map(c=>'<td><input type="checkbox" data-hub-notify="notify.'+r[0]+'.'+c[0]+'" aria-label="'+hubEsc(hubText('p7.notify.row.'+r[0],r[1])+' '+hubText('p7.notify.col.'+c[0],c[1]))+'"'+(hubNotifyEnabled(r[0],c[0])?' checked':'')+'></td>').join('')+'</tr>').join('')+'</tbody></table></div><span id="hubNotifyMsg" role="status"></span></section><section><h3>'+hubEsc(hubText('p7.manual.title','📚 직무별 매뉴얼 주소'))+'</h3><p>'+hubEsc(hubText('p7.manual.hint','주소를 비우면 기존 공용 매뉴얼을 사용합니다.'))+'</p>'+HUB_MANUAL_GROUPS.map(g=>'<div class="hub-row"><label>'+hubEsc(hubText('p7.manual.group.'+g[0],g[1]))+' <input type="url" id="hubManual_'+g[0]+'" value="'+hubEsc(hubSetting('manual.url.'+g[0],''))+'"></label> <button class="mini stamp" data-hub-manual="'+g[0]+'">'+hubEsc(hubText('p7.save','저장'))+'</button><span id="hubManualMsg_'+g[0]+'" role="status"></span></div>').join('')+'</section>';
}
async function hubNotifyWrite(sb,key,enabled){
  if(!HUB_NOTIFY_ROWS.some(r=>HUB_NOTIFY_COLS.some(c=>key==='notify.'+r[0]+'.'+c[0]))||typeof enabled!=='boolean')return {ok:false,reason:'invalid'};
  return hubSettingWrite(sb,key,String(enabled));
}
async function hubManualWrite(sb,group,raw){
  if(!HUB_MANUAL_GROUPS.some(g=>g[0]===group))return {ok:false,reason:'invalid'};
  const value=String(raw||'').trim();if(value&&!hubCardUrlOk(value))return {ok:false,reason:'invalid_url'};
  return hubSettingWrite(sb,'manual.url.'+group,value);
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
  // 계약서 본문 문구(법적 효력)는 저장 전에 한 번 확인(기본 글로 돌리는 경우는 안 물음)
  if(/^contract\.body\./.test(d.key)&&typeof root.confirm==='function'&&hubTextNorm(inp.value)!==''&&hubTextNorm(inp.value)!==hubTextNorm(d.def)&&!root.confirm('이 글은 앞으로 새로 만드는 근로계약서 본문에 들어가는 법적 문구예요(이미 발송·서명한 계약서는 안 바뀌어요). 저장할까요?')){const m0=sec.querySelector('#hubTxtMsg_'+i);if(m0)m0.textContent='저장하지 않았어요.';return;}
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
// 정수 목록은 화면에 「14, 30, 60」 모양으로 보여 주고, 기본값 비교도 같은 모양(검사를 거친 값)으로 한다.
function hubSettingShow(d,raw){
  if(d.kind==='enum'){const option=d.options.find(o=>o.value===raw)||d.options.find(o=>o.value===d.def);return hubText(option.labelKey,option.label);}
  if(d.kind==='bool')return raw==='true'?'켬':'끔';
  if(d.kind!=='intlist')return raw;
  const chk=hubSettingValidate(d,raw);
  return chk.ok?JSON.parse(chk.value).join(', '):String(raw);
}
function hubSettingIsDefault(d,raw){
  if(d.kind!=='intlist')return raw===d.def;
  const a=hubSettingValidate(d,raw),b=hubSettingValidate(d,d.def);
  return a.ok&&b.ok?a.value===b.value:true; // 잘못된 값이 들어 있으면 읽을 때 기본값을 쓰므로 기본으로 본다
}
function hubDrawSettingsSection(sec){
  const groups=[];
  HUB_SETTING_DEFS.forEach(function(d,i){
    let g=groups.find(function(x){return x.name===d.screen;});
    if(!g){g={name:d.screen,items:[]};groups.push(g);}
    g.items.push({d:d,i:i});
  });
  sec.innerHTML=hubP7SettingsHtml()+'<div class="sub">출퇴근 계산·연차 신청이 쓰는 기준이에요. 출퇴근 기준은 지금까지 SQL로만 고쳤는데 여기서 바로 고쳐요. 저장하면 그 화면이 다음에 열릴 때부터 새 기준으로 움직여요(이미 저장된 지난 기록·신청은 안 바뀌어요).</div>'+
    groups.map(function(g){
      return '<details class="hub-grp" open><summary>'+hubEsc(g.name)+' <span class="sub">('+g.items.length+'개)</span></summary>'+
        g.items.map(function(x){
          const d=x.d,i=x.i,cur=hubSetting(d.key,d.def);
          const input=d.kind==='enum'
            ?'<select id="hubSetIn_'+i+'">'+d.options.map(o=>'<option value="'+hubEsc(o.value)+'"'+(cur===o.value?' selected':'')+'>'+hubEsc(hubText(o.labelKey,o.label))+'</option>').join('')+'</select>'
            :d.kind==='bool'
            ?'<select id="hubSetIn_'+i+'"><option value="true"'+(cur==='true'?' selected':'')+'>켬</option><option value="false"'+(cur!=='true'?' selected':'')+'>끔</option></select>'
            :d.kind==='time'
            ?'<input id="hubSetIn_'+i+'" type="time" value="'+hubEsc(cur)+'">'
            :d.kind==='stringlist'
            ?'<input id="hubSetIn_'+i+'" type="text" size="40" value="'+hubEsc(cur)+'">'
            :d.kind==='intlist'
            ?'<input id="hubSetIn_'+i+'" type="text" inputmode="numeric" size="16" placeholder="14, 30, 60" value="'+hubEsc(hubSettingShow(d,cur))+'"> '+hubEsc(d.unit||'')+' (쉼표로 나눠 적어요)'
            :'<input id="hubSetIn_'+i+'" type="number" inputmode="'+(d.kind==='dec'?'decimal':'numeric')+'"'+(d.kind==='dec'?' step="0.1"':'')+' min="'+d.min+'" max="'+d.max+'" value="'+hubEsc(cur)+'"> '+hubEsc(d.unit||'');
          return '<div class="hub-row" data-hub-set-row="'+i+'">'+
            '<div class="hub-where"><b>'+hubEsc(d.labelKey?hubText(d.labelKey,d.label):d.label)+'</b> <span id="hubSetBadge_'+i+'">'+hubBadge(!hubSettingIsDefault(d,cur))+'</span></div>'+
            '<div class="sub">'+hubEsc(d.whereKey?hubText(d.whereKey,d.where):d.where)+' · 이름표: '+hubEsc(d.key)+'</div>'+
            '<div class="sub">처음 값 '+hubEsc(hubSettingShow(d,d.def))+(d.kind==='int'||d.kind==='dec'?' · '+d.min+'~'+d.max+' 사이':(d.kind==='intlist'?' · 숫자 1~5개, 각각 '+d.min+'~'+d.max+' 사이':''))+'</div>'+
            '<div class="rowflex">'+input+'<button class="mini stamp" data-hub-set-save="'+i+'">저장</button><button class="mini" data-hub-set-reset="'+i+'">기본으로 되돌리기</button><span class="hint" id="hubSetMsg_'+i+'"></span></div>'+
            '</div>';
        }).join('')+'</details>';
    }).join('');
  Array.prototype.forEach.call(sec.querySelectorAll('[data-hub-set-save]'),function(b){b.addEventListener('click',function(){return hubSaveSettingRow(sec,Number(b.getAttribute('data-hub-set-save')));});});
  Array.prototype.forEach.call(sec.querySelectorAll('[data-hub-set-reset]'),function(b){b.addEventListener('click',function(){return hubResetSettingRow(sec,Number(b.getAttribute('data-hub-set-reset')));});});
  // 새 입력칸을 먼저 붙이고 기존 기준 입력칸의 이벤트도 한 번만 연결한다.
  const panel=sec;
  panel.querySelectorAll('[data-hub-notify]').forEach(function(input){input.addEventListener('change',async function(){
    const enabled=input.checked;input.disabled=true;const r=await hubNotifyWrite(HUB_SB,input.getAttribute('data-hub-notify'),enabled);input.disabled=false;if(!r.ok)input.checked=!enabled;
    panel.querySelector('#hubNotifyMsg').textContent=r.ok?hubText('p7.saved','저장했습니다.'):hubWriteErrorMessage('저장',r.error);
  });});
  panel.querySelectorAll('[data-hub-manual]').forEach(function(button){button.addEventListener('click',async function(){
    const group=button.getAttribute('data-hub-manual'),input=panel.querySelector('#hubManual_'+group);button.disabled=true;const r=await hubManualWrite(HUB_SB,group,input.value);button.disabled=false;
    panel.querySelector('#hubManualMsg_'+group).textContent=r.ok?hubText('p7.saved','저장했습니다.'):r.reason==='invalid_url'?hubText('p7.invalid_url','http:// 또는 https:// 주소를 입력해 주세요.'):hubWriteErrorMessage('저장',r.error);
  });});
}
function hubAfterSettingWrite(sec,i,r){
  const d=HUB_SETTING_DEFS[i];
  const msg=sec.querySelector('#hubSetMsg_'+i),inp=sec.querySelector('#hubSetIn_'+i),badge=sec.querySelector('#hubSetBadge_'+i);
  if(!r.ok){
    if(msg)msg.textContent=r.reason==='invalid'?('저장하지 못했어요 — '+r.message):hubWriteErrorMessage('저장',r.error);
    return;
  }
  const cur=hubSetting(d.key,d.def);
  if(inp)inp.value=hubSettingShow(d,cur);
  if(badge)badge.innerHTML=hubBadge(!hubSettingIsDefault(d,cur));
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
  saveText:hubTextsSave,resetText:hubTextsReset, // 첫 화면(hub-intro.js) 「문구 고치기」가 씀
  applyTextFilter:hubApplyTextFilter, // 검색칸 동작(시험용으로도 공개)
  helpers:{hubText:hubText,hubTextDefByKey:hubTextDefByKey,hubSetting:hubSetting,hubSettingChecked:hubSettingChecked,hubSettingIntList:hubSettingIntList,hubContractExpiryDays:hubContractExpiryDays,hubList:hubList,hubCards:hubCards}
};
root.hubText=hubText;
root.hubTextHtml=hubTextHtml;
root.hubSetting=hubSetting;
root.hubSettingBoolean=hubSettingBoolean;
root.hubSettingNumber=hubSettingNumber;
root.hubSettingChecked=hubSettingChecked;
root.hubContractExpiryDays=hubContractExpiryDays;
root.hubList=hubList;
root.hubCards=hubCards;
root.HubUi=HubUi;
})(typeof window!=='undefined'?window:globalThis);
