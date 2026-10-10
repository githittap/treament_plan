/* 모든 안내는 hub-texts.js의 help.<key>를 읽습니다. */
(function(root){
'use strict';
/* hub-help:test-start */
function hubHelpEscape(s){return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');}
function hubHelpParse(text){
  const fields={what:[],who:[],steps:[],notes:[]};let key='what';
  String(text||'').replace(/\r\n/g,'\n').split('\n').forEach(line=>{
    const m=/^\s*(무엇|누가(?: 보고 쓰나)?|쓰는 법|알아둘 점)\s*[:：]\s*(.*)$/.exec(line);
    if(m){key=({'무엇':'what','누가':'who','누가 보고 쓰나':'who','쓰는 법':'steps','알아둘 점':'notes'})[m[1]];line=m[2];}
    if(line.trim())fields[key].push(line.trim());
  });return fields;
}
function hubHelpCardHtml(key,text,label,open,options){
  options=options||{};
  const f=hubHelpParse(text),esc=hubHelpEscape;
  const headings={what:'무엇',who:'누가 보고 쓰나',steps:'쓰는 법',notes:'알아둘 점'};
  return '<section class="hub-help-card" id="hub-help-'+esc(key)+'" data-hub-help-card="'+esc(key)+'" aria-label="'+esc(label)+' 사용법"'+(open?'':' hidden')+'>'+Object.keys(f).filter(k=>f[k].length).map(k=>
    '<div class="hub-help-field"><h3>'+esc(headings[k])+'</h3>'+(k==='steps'?'<ol>'+f[k].map(s=>'<li>'+esc(s.replace(/^\d+[.)]\s*/,''))+'</li>').join('')+'</ol>'+hubHelpExtrasHtml(key,options):'<p>'+f[k].map(esc).join('<br>')+'</p>')+'</div>').join('')+'</section>';
}
function hubHelpButtonHtml(key,text,open){return String(text||'').trim()?'<button type="button" class="mini hub-help-button" data-hub-help="'+hubHelpEscape(key)+'" aria-expanded="'+!!open+'" aria-controls="hub-help-'+hubHelpEscape(key)+'">❓ 사용법</button>':'';}
const HUB_HELP_CSS='.hub-help-row{display:flex;align-items:center;flex-wrap:wrap;gap:8px;min-width:0;max-width:100%;box-sizing:border-box}.hub-help-row>h2{flex:1;min-width:0;margin:0;overflow-wrap:anywhere}.hub-help-button{margin-left:auto;flex:0 0 auto;white-space:nowrap}.hub-help-card{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;background:var(--panel,#142631);border:1px solid var(--line,#3b515e);border-radius:10px;padding:14px;margin:10px 0 16px;max-width:100%;box-sizing:border-box;overflow-wrap:anywhere}.hub-help-card[hidden]{display:none}.hub-help-field{min-width:0}.hub-help-field h3{font-size:14px;margin:0 0 6px;color:var(--mint,#6ee7b7)}.hub-help-field p{margin:0;white-space:pre-wrap;line-height:1.65;font-size:13px}.hub-help-field ol{margin:0;padding-left:22px;line-height:1.65;font-size:13px}@media(max-width:640px){.hub-help-card{grid-template-columns:minmax(0,1fr);padding:12px;gap:10px}}@media print{.hub-help-button,.hub-help-card{display:none!important}}';

function hubHelpImagePaths(value){
  const paths=String(value||'').trim().split(/\s+/);
  return paths.length===2&&paths.every(p=>/^help-img\/[a-z0-9-]+\.(png|webp)$/.test(p))?paths:[];
}
function hubHelpExtrasHtml(key,options){
  const esc=hubHelpEscape,paths=hubHelpImagePaths(options.image);
  return (options.guide?'<button type="button" class="mini" data-hub-help-guide="'+esc(key)+'">'+esc(options.guide)+'</button>':'')+
    (paths.length?'<details class="hub-help-image"><summary>'+esc(options.imageLabel)+'</summary><picture><source media="(max-width:640px)" srcset="'+esc(paths[1])+'"><img src="'+esc(paths[0])+'" alt="'+esc(options.imageAlt)+'" loading="lazy"></picture></details>':'');
}
// Each entry follows the default step order. No target is guessed for a new DB step.
const HUB_HELP_TARGETS={
  "home":[{"selector":".stat"},{"selector":"button[onclick=\"go('inbox')\"]"},{"labels":["보기"],"selector":"button[onclick^=\"openMyPayslip(\"]"}],
  "ai":[{"selector":"[data-ai-open]"},{"labels":["보내기"],"selector":"#aiSendBtn"},{"labels":["새 대화"],"selector":"[data-ai-new]"}],
  "sched":[{"labels":["주간 편집","◀ 지난주","다음주 ▶"],"selector":"button[onclick=\"navWeek(-7)\"]"},{"selector":".schedule-role-cell>summary"},{"labels":["공표(확정)"],"selector":"button[onclick^=\"publishSched(\"]"}],
  "calendar":[{"labels":["전체","근무","연차"]},{"selector":"input[type=\"date\"],input[type=\"month\"]"},{"selector":"button[onclick^=\"selectCalendarDay(\"]"}],
  "att":[{"labels":["근태"],"selector":"#attMonthlyMonth"},{"selector":"#manualAttendanceSubmit"},{"selector":"button[onclick=\"openIssue()\"]","labels":["소명 올리기"]}],
  "owner":[null,{"labels":["승인"]},null],
  "hubset":[{"labels":["글 고치기","숫자·기준","목록"]},{"labels":["저장"]},{"labels":["기본으로 되돌리기"]}],
  "aicost":[{"selector":"input[type=\"month\"]"},null,{"labels":["저장"]},{"labels":["예산 저장"]}],
  "ownerboards":[{"selector":"[data-owner-board]"},null,{"labels":["닫기"]}],
  "pay":[{"selector":"button[onclick^=\"setPayView(\"]"},{"labels":["대상 월","적용일"],"selector":"input[type=\"month\"],input[type=\"date\"]"},null],
  "actlog":[{"selector":"input[type=\"date\"]"},{"labels":["조회"]},{"labels":["200줄 더 보기","CSV 내려받기"]}],
  "ledger":[{"selector":"input[type=\"date\"]"},null,{"labels":["저장"]}],
  "confid":[{"labels":["환자명·차트번호 검색"],"selector":"#cfQ"},null,{"selector":"button[onclick=\"submitConfidRecord()\"]"}],
  "workdocs":[{"labels":["자료 검색"],"selector":"#workDocSearch"},{"selector":".workdoc-card button,.workdoc-card a"},{"labels":["업무자료 설명서 열기"]}],
  "inbox":[{"labels":["상세"]},{"labels":["상태·담당 저장","상담일지로 전환","실제 답변 기록"]},{"labels":["✅ 처리"]}],
  "consult":[{"selector":"#cjName"},{"labels":["저장"]},{"labels":["수정","오늘·기한 지남","열기"]}],
  "tools":[null,{"labels":["열기"]},{"labels":["← 도구 목록","새 창"]}],
  "contract":[null,null,{"labels":["미리보기"]}],
  "onbo":[{"selector":".onboarding-guide"},{"labels":["제출함","서류 올리기","연차 증빙 올리기","체크리스트 정보 저장"]},null],
  "appr":[{"labels":["결재 올리기"],"selector":"button[onclick*=\"apMask\"]"},{"labels":["내가 올린 문서"]},{"labels":["내 결재 대기","도장(승인)"],"selector":"button[onclick*=\"apprAct(\"][onclick*=\"ok\"]"}],
  "leave":[{"selector":".stat:nth-child(3)"},{"labels":["연차 신청"],"selector":"button[onclick=\"openLeave()\"]"},{"labels":["신청서"],"selector":"button[onclick^=\"openLeaveForm(\"]"}],
  "deposit":[{"labels":["오늘","7일","이번달"]},null,null],
  "notice":[{"labels":["전문 ↗"]},{"labels":["공지 작성"]},{"labels":["삭제"]}],
  "suggestions":[{"labels":["건의 등록"]},null,{"labels":["수정","수정 저장"]}],
  "pay.ledger":[{"selector":"input[type=\"month\"]"},{"labels":["엑셀 업로드","수기 행 추가"]},{"labels":["급여대장 저장"]}],
  "pay.wage":[{"selector":"input[type=\"month\"]"},{"labels":["적용일"]},{"labels":["저장"]}],
  "pay.payslip":[{"selector":"input[type=\"month\"]"},{"labels":["인쇄 미리보기"]},{"labels":["발행","재발행(덮어쓰기)"]}],
  "pay.hourly":[{"selector":"input[type=\"month\"]"},{"labels":["확인 필요"]},{"labels":["CSV 내려받기"]},{"labels":["저장","공제율·소득세·구분 저장"]}],
  "pay.bonus":[{"selector":"input[type=\"month\"]"},null,{"labels":["기준 합계 넣기"]},{"labels":["저장(확정)","이 달 전부 확정"]}],
  "pay.reply":[{"selector":"input[type=\"month\"]"},null,{"labels":["엑셀 받기"]}],
  "pay.compare":[{"selector":"input[type=\"month\"]"},null,null],
  "ai.chat":[{"selector":"[data-ai-open]"},{"labels":["보내기","📎 사진"]},{"labels":["← 목록","새 대화"]}],
  "ai.transcripts":[{"selector":"input[type=\"date\"]"},{"labels":["거르기"]},{"labels":["이전","다음 50개"]}],
  "ai.manage":[{"labels":["새 도우미","고치기"]},null,null],
  "ai.models":[{"labels":["모델 직접 추가","회사별 목록 불러오기"]},{"labels":["고치기"]},null],
  "ai.usage":[{"labels":["📊 사용 기록"]},null,null,{"labels":["미상 N건"]}],
  "ai.texts":[{"selector":"details>summary"},{"labels":["저장"]},{"labels":["기본으로 되돌리기"]}],
  "hubset.texts":[{"selector":"#hubTxtSearch"},{"labels":["지금 글"],"selector":"details>summary"},{"labels":["저장"]}],
  "hubset.settings":[{"selector":"[data-hub-subtab=\"settings\"]"},{"labels":["🔔 알림 받는 사람"],"selector":"[data-hub-notify]"},{"labels":["저장"]}],
  "hubset.lists":[{"selector":"details>summary"},{"selector":"input[id^=\"hubLstLbl_\"]"},{"labels":["저장"]}],
  "sched.week":[{"labels":["주간 편집","◀ 지난주","다음주 ▶"],"selector":"button[onclick=\"navWeek(-7)\"]"},{"selector":".schedule-role-cell>summary"},{"labels":["공표(확정)"],"selector":"button[onclick^=\"publishSched(\"]"}],
  "sched.month":[{"labels":["월간 편집","월간 직무표"]},{"selector":"input[type=\"month\"]"},{"labels":["PDF 저장","인쇄"]}],
  "calendar.all":[{"labels":["전체"]},{"selector":"input[type=\"month\"],input[type=\"date\"]"},{"selector":"button[onclick^=\"selectCalendarDay(\"]"}],
  "calendar.work":[{"labels":["근무"]},{"selector":"input[type=\"month\"],input[type=\"date\"]"},{"selector":"button[onclick^=\"selectCalendarDay(\"]"}],
  "calendar.leave":[{"labels":["연차 캘린더","달력 보기","목록 보기"]},{"selector":"input[type=\"month\"],input[type=\"date\"]"},null],
  "calendar.period.week":[{"labels":["주간"]},{"selector":"input[type=\"month\"],input[type=\"date\"]"},{"selector":"button[onclick^=\"selectCalendarDay(\"]"}],
  "calendar.period.month":[{"labels":["월간"]},{"selector":"input[type=\"month\"],input[type=\"date\"]"},{"selector":"button[onclick^=\"selectCalendarDay(\"]"}],
  "calendar.leave.calendar":[{"labels":["연차 캘린더","달력 보기"]},{"selector":"input[type=\"month\"],input[type=\"date\"]"},null],
  "calendar.leave.list":[{"labels":["연차 캘린더","목록 보기"]},{"selector":"input[type=\"month\"],input[type=\"date\"]"},null],
  "inbox.inbox":[{"labels":["상세"]},{"labels":["상태·담당 저장","상담일지로 전환","실제 답변 기록"]},{"labels":["✅ 처리"]}],
  "inbox.recall":[{"labels":["📞 리콜 명단"]},null,{"labels":["📞 연락함","예정일 바꾸기","저장"]},{"labels":["✅ 리콜 끝","새로 조회"]}],
  "deposit.today":[{"labels":["오늘"]},null,null],
  "deposit.week":[{"labels":["7일"]},null,null],
  "deposit.month":[{"labels":["이번달"]},null,null]
};
function hubHelpFindTarget(container,key,index){
  const rule=(HUB_HELP_TARGETS[key]||[])[index];if(!rule)return null;
  function visible(el){return !el.closest('.hub-help-card,.hub-help-button')&&el.getClientRects().length>0;}
  if(rule.selector){const el=Array.from(container.querySelectorAll(rule.selector)).find(visible);if(el)return el;}
  const normalize=s=>String(s||'').replace(/^[^가-힣a-zA-Z0-9◀←]+/u,'').replace(/\s+/g,' ').trim();
  return Array.from(container.querySelectorAll('button,a,summary,label')).find(el=>visible(el)&&(rule.labels||[]).some(label=>normalize(el.textContent)===normalize(label)))||null;
}

/* hub-help:test-end */
const HUB_HELP_GUIDE_CSS='.hub-help-image{margin-top:10px}.hub-help-image img{display:block;max-width:100%;height:auto;margin-top:8px;border-radius:8px}.hub-help-guide{position:fixed;z-index:2147483000;pointer-events:none;inset:0}.hub-help-guide-panel{position:absolute;left:12px;right:12px;bottom:12px;margin:0 auto;max-width:460px;max-height:40vh;overflow:auto;padding:10px 14px;background:#142631;color:#fff;border:1px solid #8299a6;border-radius:12px;box-sizing:border-box;pointer-events:auto;overflow-wrap:anywhere;box-shadow:0 4px 24px #0008}.hub-help-guide-panel p{margin:4px 0;line-height:1.4}.hub-help-guide-actions{display:flex;flex-wrap:wrap;gap:10px}.hub-help-guide-ring{position:fixed;border:3px solid #e53935;border-radius:6px;box-sizing:border-box;pointer-events:none}.hub-help-guide-badge{position:fixed;background:#c62828;color:#fff;border:2px solid white;border-radius:50%;min-width:26px;height:26px;text-align:center;line-height:22px;font-weight:bold;box-sizing:border-box}@media print{.hub-help-guide{display:none!important}}';
const memory={};
function readOpen(key){try{const value=root.localStorage.getItem('hub.help.open.'+key);if(value!=null)return value==='true';}catch(e){}return memory[key]===true;}
function saveOpen(key,value){memory[key]=value;try{root.localStorage.setItem('hub.help.open.'+key,String(value));}catch(e){}}
function text(key){const d=root.HubUi&&root.HubUi.helpers.hubTextDefByKey('help.'+key);return d&&typeof root.hubText==='function'?root.hubText('help.'+key,d.def):'';}
function mount(container,key,label,anchor){
  if(!container||container.querySelector('[data-hub-help="'+key+'"]'))return;
  const value=text(key);if(!value.trim())return;
  if(!document.getElementById('hubHelpStyle')){const style=document.createElement('style');style.id='hubHelpStyle';style.textContent=HUB_HELP_CSS+HUB_HELP_GUIDE_CSS;document.head.appendChild(style);}
  let row=anchor;
  if(!row){row=document.createElement('div');row.className='hub-help-row';const h=document.createElement('h2');h.textContent=label;row.appendChild(h);container.prepend(row);}
  else if(/^H[23]$/.test(row.tagName)){const h=row;row=document.createElement('div');h.before(row);row.appendChild(h);}
  row.classList.add('hub-help-row');
  const opened=readOpen(key);row.insertAdjacentHTML('beforeend',hubHelpButtonHtml(key,value,opened));row.insertAdjacentHTML('afterend',hubHelpCardHtml(key,value,label,opened,{guide:ui('help_ui.guide'),image:ui('help_img.'+key),imageLabel:ui('help_ui.image'),imageAlt:ui('help_ui.image_alt')}));
  const button=row.querySelector('[data-hub-help="'+key+'"]'),panel=row.nextElementSibling;
  button.addEventListener('click',function(){const opened=button.getAttribute('aria-expanded')!=='true';button.setAttribute('aria-expanded',String(opened));panel.hidden=!opened;saveOpen(key,opened);});
  if(panel.querySelector){const start=panel.querySelector('[data-hub-help-guide]');if(start)start.addEventListener('click',()=>startGuide(container,key,start));}
}
function mountRow(container,key,label,button){
  if(!button)return;
  let row=button.parentElement;
  if(row.classList.contains('card')){
    const buttons=Array.from(row.children).filter(el=>el.tagName==='BUTTON'&&/setPayView/.test(el.getAttribute('onclick')||''));
    const line=document.createElement('div');line.className='rowflex';buttons[0].before(line);buttons.forEach(el=>line.appendChild(el));row=line;
  }
  mount(container,key,label,row);
}
// main은 그대로 두고 내용만 다시 그리는 조회·저장 경로도 안내를 유지합니다.
const watched=new WeakMap();
function watch(container,onChange){
  if(!container||watched.has(container))return;
  const state={frame:null,active:true,observer:null};
  const observer=new root.MutationObserver(function(){
    if(!state.active)return;
    if(guide&&guide.container===container)closeGuide(false);
    if(state.frame!==null)return;
    state.frame=root.requestAnimationFrame(function(){state.frame=null;if(state.active)onChange();});
  });
  state.observer=observer;
  observer.observe(container,{childList:true,subtree:true});
  watched.set(container,state);
}
function unwatch(container){
  if(guide&&guide.container===container)closeGuide(false);
  const state=watched.get(container);if(!state)return;
  state.active=false;state.observer.disconnect();
  if(state.frame!==null)root.cancelAnimationFrame(state.frame);
  watched.delete(container);
}

function ui(key,vars){const d=root.HubUi&&root.HubUi.helpers.hubTextDefByKey(key);return d&&typeof root.hubText==='function'?root.hubText(key,d.def,vars):'';}
let guide=null;
function closeGuide(restore){
  if(!guide)return;const old=guide;guide=null;
  root.removeEventListener('keydown',old.keydown);root.removeEventListener('scroll',old.position,true);root.removeEventListener('resize',old.position);
  if(old.frame!==null)root.cancelAnimationFrame(old.frame);
  old.overlay.remove();
  if(restore!==false&&old.start&&old.start.isConnected)old.start.focus({preventScroll:true});
}
function startGuide(container,key,start){
  closeGuide(false);const steps=hubHelpParse(text(key)).steps;if(!steps.length)return;
  const overlay=document.createElement('div');overlay.className='hub-help-guide';
  const panel=document.createElement('section');panel.className='hub-help-guide-panel';panel.setAttribute('role','dialog');panel.setAttribute('aria-label',ui('help_ui.guide'));
  const heading=document.createElement('strong'),body=document.createElement('p'),missing=document.createElement('p'),actions=document.createElement('div');actions.className='hub-help-guide-actions';
  const next=document.createElement('button'),close=document.createElement('button');next.type=close.type='button';next.className=close.className='mini';close.textContent=ui('help_ui.close');
  actions.append(next,close);panel.append(heading,body,missing,actions);overlay.append(panel);document.body.append(overlay);
  const state={container,key,start,overlay,panel,index:0,target:null,ring:null,badge:null,frame:null};guide=state;
  function position(){
    if(guide!==state)return;
    if(!container.isConnected){closeGuide(false);return;}
    const el=state.target;if(!el)return;
    if(!el.isConnected||!el.getClientRects().length){show();return;}
    const r=el.getBoundingClientRect(),w=document.documentElement.clientWidth,h=root.innerHeight;
    const left=Math.max(3,r.left-4),top=Math.max(3,r.top-4),right=Math.min(w-3,r.right+4),bottom=Math.min(h-3,r.bottom+4);
    const onScreen=right>left&&bottom>top;state.ring.hidden=state.badge.hidden=!onScreen;
    if(!onScreen)return;
    Object.assign(state.ring.style,{left:left+'px',top:top+'px',width:(right-left)+'px',height:(bottom-top)+'px'});
    panel.style.top=r.top>h/2?'12px':'auto';panel.style.bottom=r.top>h/2?'auto':'12px';
    const p=panel.getBoundingClientRect(),outside=r.right+34<w;
    let bx=outside?right+2:Math.max(3,left-28),by=Math.max(3,Math.min(h-29,top-28));
    if(by+26>p.top&&by<p.bottom)by=Math.max(3,Math.min(h-29,bottom+2));
    Object.assign(state.badge.style,{left:Math.min(w-29,bx)+'px',top:by+'px'});
  }
  function show(){
    if(state.ring){state.ring.remove();state.badge.remove();state.ring=state.badge=null;}
    state.target=hubHelpFindTarget(container,key,state.index);
    heading.textContent=ui('help_ui.step',{n:state.index+1,total:steps.length});body.textContent=steps[state.index].replace(/^\d+[.)]\s*/,'');
    next.textContent=ui(state.index+1===steps.length?'help_ui.finish':'help_ui.next');
    missing.hidden=!!state.target;missing.textContent=ui('help_ui.missing',{tab:(root.HUB_HELP_TABS||[]).find(t=>t.key===key)?.label||key});
    if(state.target){
      state.ring=document.createElement('div');state.ring.className='hub-help-guide-ring';state.ring.setAttribute('aria-hidden','true');
      state.badge=document.createElement('div');state.badge.className='hub-help-guide-badge';state.badge.textContent=String(state.index+1);state.badge.setAttribute('aria-hidden','true');overlay.append(state.ring,state.badge);
      const r=state.target.getBoundingClientRect();if(r.top<32||r.bottom>root.innerHeight-220||r.left<0||r.right>document.documentElement.clientWidth)state.target.scrollIntoView({behavior:'smooth',block:'center',inline:'nearest'});
    }
    position();
  }
  state.position=position;state.keydown=e=>{if(e.key==='Escape'){e.preventDefault();closeGuide();}};
  root.addEventListener('keydown',state.keydown);root.addEventListener('scroll',position,true);root.addEventListener('resize',position);
  next.addEventListener('click',()=>{if(++state.index>=steps.length)closeGuide();else show();});close.addEventListener('click',()=>closeGuide());
  // Reposition during smooth scrolling and layout shifts; no business control is touched.
  function tick(){if(guide!==state)return;position();if(guide===state)state.frame=root.requestAnimationFrame(tick);}
  show();next.focus({preventScroll:true});state.frame=root.requestAnimationFrame(tick);
}

root.HubHelp={mount:mount,mountRow:mountRow,watch:watch,unwatch:unwatch,startGuide:startGuide,closeGuide:closeGuide,targets:HUB_HELP_TARGETS};
})(typeof window!=='undefined'?window:globalThis);
