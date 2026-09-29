/* ai-assistants.js — 직원허브 「🤖 AI 도우미」 화면(1단계)
   설계서: Z:\09_claude-output\03_병원운영·전산\직원AI도우미\설계서_1단계.md (4장)
   hr.html은 이 파일을 <script src="ai-assistants.js?v=20260929"> 로 불러 window.AIAssistants.render(container,{sb,me}) 만 부른다.
   © 2026 Jung · 아산정플란트치과 */
(function(){
'use strict';

/* ai-assistants:test-start */
/* 아래 블록은 DOM·네트워크에 의존하지 않는 순수 함수만 둔다(hr.html의 기존 test-start/end 패턴과 동일).
   tests/ai-assistants-ui.test.js 가 이 블록만 vm으로 불러 시험한다. */

const AI_ROLE_LABELS={staff:'직원',manager:'매니저',chief:'실장',owner:'원장'};
function aiRoleLabel(role){return AI_ROLE_LABELS[role]||role||'';}

const AI_PROVIDER_LABELS={anthropic:'Anthropic (Claude)',openai:'OpenAI (GPT)',deepseek:'DeepSeek',stepfun:'StepFun (Step)',moonshot:'Moonshot (Kimi)',google:'Google (Gemini)'};
function aiProviderLabel(p){return AI_PROVIDER_LABELS[p]||p||'기타';}

// 1달러=1,500원 고정 환산(전역지침 「화폐 표기」 · 환율 조회 안 함)
function aiWon(usd){
  if(usd==null)return null;
  const n=Number(usd);
  if(!Number.isFinite(n))return null;
  return Math.round(n*1500);
}
function aiWonLabel(usd){
  const w=aiWon(usd);
  return w==null?'모름':('₩'+w.toLocaleString('ko-KR'));
}
function aiModelPriceLabel(model){
  const inL=aiWonLabel(model&&model.price_in_usd_per_mtok);
  const outL=aiWonLabel(model&&model.price_out_usd_per_mtok);
  return `입력 ${inL}/출력 ${outL} (100만 토큰당)`;
}

// 켜진(또는 전체) 모델을 회사 순서(설계서 2-4 나열 순)대로 묶는다.
function aiGroupModelsByProvider(models,opts){
  const onlyEnabled=!opts||opts.onlyEnabled!==false;
  const order=Object.keys(AI_PROVIDER_LABELS);
  const groups={};
  (models||[]).forEach(m=>{
    if(!m)return;
    if(onlyEnabled&&m.enabled===false)return;
    const key=m.provider||'기타';
    if(!groups[key])groups[key]={provider:key,label:aiProviderLabel(key),models:[]};
    groups[key].models.push(m);
  });
  const keys=Object.keys(groups).sort((a,b)=>{
    const ia=order.indexOf(a),ib=order.indexOf(b);
    if(ia===-1&&ib===-1)return a.localeCompare(b);
    if(ia===-1)return 1;
    if(ib===-1)return -1;
    return ia-ib;
  });
  return keys.map(k=>groups[k]);
}

// 도우미 고치기 양식 검사(설계서 2-2 제약과 맞춤).
function aiAssistantFormErrors(form){
  const f=form||{};
  const errs=[];
  const name=String(f.name==null?'':f.name).trim();
  if(!name)errs.push('이름을 입력하세요.');
  else if(name.length>40)errs.push('이름은 40자 이하로 입력하세요.');
  if(String(f.description==null?'':f.description).length>200)errs.push('설명은 200자 이하로 입력하세요.');
  if(String(f.instructions==null?'':f.instructions).length>20000)errs.push('지침서는 20,000자 이하로 입력하세요.');
  const knowledge=String(f.knowledge==null?'':f.knowledge);
  if(knowledge.length>60000)errs.push('참고자료는 60,000자 이하로 입력하세요.');
  const maxTok=f.max_output_tokens==null?4000:Number(f.max_output_tokens);
  if(!Number.isFinite(maxTok)||maxTok<256||maxTok>32000)errs.push('답 최대 길이는 256~32,000 사이로 입력하세요.');
  if(f.effort!=null&&f.effort!==''&&!['low','medium','high'].includes(f.effort))errs.push('생각 깊이 값이 올바르지 않습니다.');
  const roles=Array.isArray(f.visible_roles)?f.visible_roles:[];
  if(!roles.length)errs.push('보이는 역할을 하나 이상 고르세요.');
  return errs;
}

// 채팅 입력 검사(설계서 3-2-4: 메시지 1~8,000자).
function aiChatInputError(text){
  const t=String(text==null?'':text).trim();
  if(!t)return '보낼 말을 입력하세요.';
  if(t.length>8000)return '한 번에 8,000자까지 보낼 수 있어요. 나눠서 보내 주세요.';
  return '';
}

// Edge 함수 error_kind → 쉬운 한국어 문장(설계서 3-1·4-2). 키는 백엔드 core.mjs ERROR_MESSAGES_KO와 같은 이름이다.
const AI_ERROR_MESSAGES={
  unauthenticated:'로그인이 만료됐어요. 다시 로그인해 주세요.',
  hub_access_denied:'허브 접근 권한이 없어요.',
  assistant_not_found:'이 도우미를 찾을 수 없어요.',
  assistant_disabled:'지금은 쓸 수 없는 도우미예요.',
  forbidden_role:'이 도우미는 내 역할에서 쓸 수 없어요.',
  model_not_set:'원장이 아직 이 도우미의 AI를 고르지 않았어요.',
  model_disabled:'이 도우미의 AI가 꺼져 있어요. 원장에게 알려 주세요.',
  invalid_input:'요청 내용을 확인해 주세요.',
  rate_limited:'짧은 시간에 너무 많이 요청했어요. 잠시 후 다시 시도해 주세요.',
  provider_not_configured:'이 AI 회사 연결이 아직 준비되지 않았어요.',
  provider_auth_failed:'이 AI 회사가 연결 키를 받아 주지 않아요. 원장에게 알려 주세요.',
  upstream_error:'AI 응답을 받지 못했어요. 잠시 후 다시 시도해 주세요.',
  timeout:'응답이 너무 오래 걸려요. 다시 시도해 주세요.',
  network_error:'인터넷 연결을 확인하고 다시 시도해 주세요.',
};
function aiErrorMessage(kind){return AI_ERROR_MESSAGES[kind]||'오류가 있었어요. 잠시 후 다시 시도해 주세요.';}

// supabase-js functions.invoke는 2xx가 아니면 data가 비고 error(FunctionsHttpError)가 온다. 본문({ok:false,error_kind,...})은
// error.context(Response)를 .json()으로 읽어야 나온다 — 여기서 그 본문을 꺼내 늘 {ok:false,error_kind,...} 모양으로 돌려준다.
async function aiNormalizeInvokeError(error){
  const name=(error&&error.name)||'';
  const ctx=error&&error.context;
  if(ctx&&typeof ctx.json==='function'){
    let body=null;
    try{body=await ctx.json();}catch(e){body=null;}
    if(body&&typeof body==='object'&&body.error_kind)return Object.assign({ok:false},body);
    const st=Number(ctx.status)||0;
    const byStatus={401:'unauthenticated',403:'hub_access_denied',404:'assistant_not_found',429:'rate_limited',504:'timeout'};
    return {ok:false,error_kind:byStatus[st]||(st>=500?'upstream_error':'unknown')};
  }
  if(name==='FunctionsFetchError')return {ok:false,error_kind:'network_error'};
  if(name==='FunctionsRelayError')return {ok:false,error_kind:'upstream_error'};
  return {ok:false,error_kind:(error&&error.error_kind)||'network_error'};
}
// invoke 결과({data,error})를 성공이면 data 그대로, 실패면 정규화한 {ok:false,error_kind}로 돌려준다.
async function aiUnwrapInvoke(res){
  if(res&&res.error)return aiNormalizeInvokeError(res.error);
  const data=res&&res.data;
  if(!data||typeof data!=='object')return {ok:false,error_kind:'unknown'};
  return data;
}

// 도우미 준비 여부(관리 목록용 — RPC ready와 같은 규칙: model_ref 있고 그 모델이 켜져 있어야 함).
function aiAdminAssistantReady(assistant,modelsById){
  if(!assistant||!assistant.model_ref)return false;
  const m=modelsById&&modelsById[assistant.model_ref];
  return !!(m&&m.enabled!==false);
}

// 사용 기록(ai_assistant_usage) 합산 — 날짜별·도우미별·직원별·모델별(설계서 4-3-3).
function aiUsageSummarize(rows){
  const groups={byDate:{},byAssistant:{},byUser:{},byModel:{}};
  let totalCount=0,totalInput=0,totalOutput=0,totalCostUsd=0;
  (rows||[]).forEach(r=>{
    if(!r)return;
    totalCount++;
    const inTok=Number(r.input_tokens||0),outTok=Number(r.output_tokens||0);
    const cost=r.est_cost_usd==null?0:Number(r.est_cost_usd||0);
    totalInput+=inTok;totalOutput+=outTok;totalCostUsd+=cost;
    const dateKey=String(r.created_at||'').slice(0,10)||'(모름)';
    const assistantKey=r.assistant_name||'(이름없음)';
    const userKey=r.user_name||r.user_id||'(모름)';
    const modelKey=(r.provider||'')+' / '+(r.model_id||'');
    [[groups.byDate,dateKey],[groups.byAssistant,assistantKey],[groups.byUser,userKey],[groups.byModel,modelKey]].forEach(function(pair){
      const map=pair[0],key=pair[1];
      if(!map[key])map[key]={count:0,input_tokens:0,output_tokens:0,cost_usd:0};
      map[key].count++;map[key].input_tokens+=inTok;map[key].output_tokens+=outTok;map[key].cost_usd+=cost;
    });
  });
  const toRows=function(map){return Object.keys(map).sort(function(a,b){return map[b].count-map[a].count;}).map(function(k){return Object.assign({key:k},map[k]);});};
  const byDate=toRows(groups.byDate).sort(function(a,b){return a.key<b.key?1:-1;});
  return {totalCount:totalCount,totalInput:totalInput,totalOutput:totalOutput,totalCostUsd:totalCostUsd,totalCostWon:aiWon(totalCostUsd),
    byDate:byDate,byAssistant:toRows(groups.byAssistant),byUser:toRows(groups.byUser),byModel:toRows(groups.byModel)};
}
// 원장 화면 저장·삭제·토글 실패 알림(쉬운 한국어). what: '저장'|'삭제'|'켜기·끄기'|'복제' 등 동작 이름.
function aiWriteErrorMessage(what,error){
  const w=what||'저장';
  const code=String((error&&error.code)||'');
  const msg=String((error&&error.message)||'');
  let why='';
  if(code==='23505')why='같은 이름이 이미 있어요.';
  else if(code==='23503')why='다른 곳에서 쓰고 있어서 처리할 수 없어요.';
  else if(code==='23514'||code==='22001'||code==='22P02')why='입력한 값이 허용 범위를 벗어났어요.';
  else if(code==='42501'||/row-level security|permission denied/i.test(msg))why='권한이 없어요.';
  else if(/failed to fetch|network|load failed/i.test(msg))why='인터넷 연결을 확인해 주세요.';
  return w+'하지 못했어요'+(why?(' — '+why):' — 다시 시도해 주세요.');
}
/* ai-assistants:test-end */

/* ── 아래부터 DOM·네트워크 코드(시험 블록 밖) ── */
function escAi(s){return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}

let SB=null,ME={},AI_ROOT=null,AI_SUBTAB='chat',AI_STYLE_INJECTED=false;
let AI_ASSISTANTS=[],AI_ERROR='';
let AI_ACTIVE_ASSISTANT=null,AI_MESSAGES=[],AI_SENDING=false;
let AI_ADMIN_ASSISTANTS=[],AI_ADMIN_MODELS=[],AI_EDIT_ASSISTANT=null,AI_EDIT_ERRORS=[],AI_MODEL_EDIT=null;
let AI_USAGE_ROWS=[],AI_NOTICE='';

function aiNoticeHtml(){
  const n=AI_NOTICE;AI_NOTICE='';
  return n?('<div class="hint" style="color:var(--red);margin-bottom:8px" role="alert">'+escAi(n)+'</div>'):'';
}

function ensureStyle(){
  if(AI_STYLE_INJECTED)return;
  AI_STYLE_INJECTED=true;
  const css=
    '.ai-wrap{max-width:100%}'+
    '.ai-subnav{margin-bottom:10px}'+
    '.ai-subnav .mini.on{background:var(--mint-dk);border-color:var(--mint);color:var(--mint)}'+
    '.ai-cards{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:10px}'+
    '.ai-card{display:flex;flex-direction:column;align-items:flex-start;gap:4px;text-align:left;background:var(--panel);border:1px solid var(--line);border-radius:10px;padding:12px;min-height:96px;width:100%}'+
    '.ai-card:hover{border-color:var(--mint)}'+
    '.ai-card.off{opacity:.55;cursor:not-allowed}'+
    '.ai-card-icon{font-size:22px}'+
    '.ai-card-name{font-weight:700}'+
    '.ai-card-desc{font-size:12px;color:var(--gray)}'+
    '.ai-card-badge{font-size:11px;color:var(--gold)}'+
    '.ai-chat-card{max-width:100%}'+
    '.ai-msgs{max-height:50vh;overflow-y:auto;display:flex;flex-direction:column;gap:8px;margin:10px 0;padding:6px 0}'+
    '.ai-msg{max-width:92%;border-radius:10px;padding:8px 10px;font-size:13.5px;white-space:pre-wrap;overflow-wrap:break-word}'+
    '.ai-msg-user{align-self:flex-end;background:var(--mint-dk);color:var(--ink)}'+
    '.ai-msg-assistant{align-self:flex-start;background:var(--panel);border:1px solid var(--line)}'+
    '.ai-msg-who{font-size:10.5px;color:var(--gray);margin-bottom:2px}'+
    '#aiInput{width:100%;min-height:70px;box-sizing:border-box}'+
    '.ai-wrap .grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:10px}'+
    '@media(max-width:480px){.ai-cards{grid-template-columns:repeat(auto-fill,minmax(120px,1fr))}.ai-wrap .grid{grid-template-columns:1fr}}';
  const style=document.createElement('style');
  style.id='ai-assistants-style';
  style.textContent=css;
  document.head.appendChild(style);
}

async function renderAIAssistants(container,ctx){
  SB=(ctx&&ctx.sb)||null;
  ME=(ctx&&ctx.me)||{};
  AI_ROOT=container;
  ensureStyle();
  if(!AI_ROOT)return;
  AI_ROOT.innerHTML='<div class="empty">불러오는 중…</div>';
  await loadAndRenderShell();
}

async function loadAndRenderShell(){
  AI_ERROR='';
  try{
    if(!SB)throw new Error('연결 정보가 없습니다.');
    const res=await SB.rpc('ai_assistants_for_me');
    if(res.error)throw res.error;
    AI_ASSISTANTS=(res.data||[]).slice().sort(function(a,b){return (a.sort_order||0)-(b.sort_order||0);});
  }catch(e){
    AI_ASSISTANTS=[];
    AI_ERROR=(e&&e.message)||'도우미 목록을 불러오지 못했습니다.';
  }
  renderShell();
}

function renderShell(){
  const isOwner=ME.role==='owner';
  const tabs=[{key:'chat',label:'🤖 도우미'}];
  if(isOwner)tabs.push({key:'manage',label:'⚙️ 도우미 관리'},{key:'models',label:'🧠 모델 목록'},{key:'usage',label:'📊 사용 기록'});
  const nav=tabs.length>1?('<div class="rowflex ai-subnav">'+tabs.map(function(t){return '<button class="mini'+(AI_SUBTAB===t.key?' on':'')+'" data-ai-subtab="'+t.key+'">'+t.label+'</button>';}).join('')+'</div>'):'';
  AI_ROOT.innerHTML='<div class="ai-wrap">'+nav+'<div id="aiSection"></div></div>';
  Array.prototype.forEach.call(AI_ROOT.querySelectorAll('[data-ai-subtab]'),function(btn){
    btn.addEventListener('click',function(){
      AI_SUBTAB=btn.getAttribute('data-ai-subtab');
      renderShell();
      renderActiveSection();
    });
  });
  renderActiveSection();
}

function renderActiveSection(){
  const sec=AI_ROOT&&AI_ROOT.querySelector('#aiSection');
  if(!sec)return;
  if(AI_SUBTAB==='manage'&&ME.role==='owner')renderManageSection(sec);
  else if(AI_SUBTAB==='models'&&ME.role==='owner')renderModelsSection(sec);
  else if(AI_SUBTAB==='usage'&&ME.role==='owner')renderUsageSection(sec);
  else renderChatSection(sec);
}

/* ── 직원 화면: 카드 목록 + 채팅(설계서 4-2) ── */
function renderChatSection(root){
  if(AI_ERROR){
    root.innerHTML='<div class="card"><div class="empty">도우미 목록을 불러오지 못했습니다: '+escAi(AI_ERROR)+'</div></div>';
    return;
  }
  if(AI_ACTIVE_ASSISTANT){renderChatPanel(root);return;}
  if(!AI_ASSISTANTS.length){
    root.innerHTML='<div class="card"><div class="empty">아직 쓸 수 있는 도우미가 없습니다. 원장에게 문의하세요.</div></div>';
    return;
  }
  root.innerHTML='<div class="card"><h2>🤖 AI 도우미</h2><div class="ai-cards">'+
    AI_ASSISTANTS.map(function(a){
      return '<button class="ai-card'+(a.ready?'':' off')+'" data-ai-open="'+a.id+'" '+(a.ready?'':'disabled')+'>'+
        '<div class="ai-card-icon">'+escAi(a.icon||'🤖')+'</div>'+
        '<div class="ai-card-name">'+escAi(a.name)+'</div>'+
        '<div class="ai-card-desc">'+escAi(a.description||'')+'</div>'+
        (a.ready?'':'<div class="ai-card-badge">준비 중(원장이 모델을 고르면 열림)</div>')+
        '</button>';
    }).join('')+'</div></div>';
  Array.prototype.forEach.call(root.querySelectorAll('[data-ai-open]'),function(btn){
    btn.addEventListener('click',function(){openAiChat(btn.getAttribute('data-ai-open'));});
  });
}

function openAiChat(id){
  AI_ACTIVE_ASSISTANT=AI_ASSISTANTS.find(function(a){return a.id===id;})||null;
  AI_MESSAGES=[];AI_SENDING=false;
  renderActiveSection();
}
function closeAiChat(){AI_ACTIVE_ASSISTANT=null;AI_MESSAGES=[];renderActiveSection();}

function aiMessageHtml(msg,idx){
  const who=msg.role==='user'?'나':'AI';
  const metaLine=(msg.role==='assistant'&&!msg.isError)?('<div class="sub">'+escAi(msg.modelLabel||'')+(msg.fallbackUsed?' · 예비 모델로 답함':'')+' <button class="mini" data-ai-copy="'+idx+'">복사</button></div>'):'';
  return '<div class="ai-msg ai-msg-'+msg.role+'"><div class="ai-msg-who">'+who+'</div><div class="ai-msg-body">'+escAi(msg.content)+'</div>'+metaLine+'</div>';
}

function renderChatPanel(root){
  const a=AI_ACTIVE_ASSISTANT;
  root.innerHTML='<div class="card ai-chat-card">'+
    '<div class="rowflex" style="justify-content:space-between;align-items:center">'+
    '<h2>'+escAi(a.icon||'🤖')+' '+escAi(a.name)+'</h2>'+
    '<div class="rowflex"><button class="mini" data-ai-new>새 대화</button><button class="mini" data-ai-back>← 목록</button></div>'+
    '</div>'+
    '<div class="sub">'+escAi(a.description||'')+'</div>'+
    '<div class="ai-msgs" id="aiMsgs">'+(AI_MESSAGES.length?AI_MESSAGES.map(aiMessageHtml).join(''):'<div class="empty">메시지를 보내 대화를 시작하세요.</div>')+'</div>'+
    (AI_SENDING?'<div class="sub">생각 중…</div>':'')+
    '<textarea id="aiInput" placeholder="메시지를 입력하세요(Ctrl+Enter로 보내기)"></textarea>'+
    '<div class="rowflex" style="justify-content:flex-end"><button class="mini stamp" id="aiSendBtn"'+(AI_SENDING?' disabled':'')+'>보내기</button></div>'+
    '<div class="hint" id="aiChatErr"></div>'+
    '</div>';
  root.querySelector('[data-ai-back]').addEventListener('click',closeAiChat);
  root.querySelector('[data-ai-new]').addEventListener('click',function(){AI_MESSAGES=[];renderActiveSection();});
  const input=root.querySelector('#aiInput');
  input.addEventListener('keydown',function(e){if(e.ctrlKey&&e.key==='Enter'){e.preventDefault();sendAiMessage();}});
  root.querySelector('#aiSendBtn').addEventListener('click',sendAiMessage);
  const msgsEl=root.querySelector('#aiMsgs');
  if(msgsEl)msgsEl.scrollTop=msgsEl.scrollHeight;
  Array.prototype.forEach.call(root.querySelectorAll('[data-ai-copy]'),function(btn){
    btn.addEventListener('click',function(){
      const idx=Number(btn.getAttribute('data-ai-copy')),msg=AI_MESSAGES[idx];
      if(msg&&navigator.clipboard&&navigator.clipboard.writeText)navigator.clipboard.writeText(msg.content).catch(function(){});
    });
  });
}

async function sendAiMessage(){
  const root=AI_ROOT.querySelector('#aiSection');
  const input=root&&root.querySelector('#aiInput');
  if(!input)return;
  const text=input.value;
  const err=aiChatInputError(text);
  const errEl=root.querySelector('#aiChatErr');
  if(err){if(errEl)errEl.textContent=err;return;}
  if(errEl)errEl.textContent='';
  const a=AI_ACTIVE_ASSISTANT;
  AI_MESSAGES.push({role:'user',content:text.trim()});
  AI_SENDING=true;
  renderActiveSection();
  try{
    const data=await aiUnwrapInvoke(await SB.functions.invoke('ai-assistant-chat',{body:{action:'chat',assistant_id:a.id,messages:AI_MESSAGES.map(function(m){return {role:m.role,content:m.content};})}}));
    if(!data||data.ok===false){
      AI_MESSAGES.push({role:'assistant',content:aiErrorMessage(data&&data.error_kind),isError:true});
    }else{
      AI_MESSAGES.push({role:'assistant',content:data.text||'',modelLabel:data.model_label||data.model_id||'',fallbackUsed:!!data.fallback_used});
    }
  }catch(e){
    AI_MESSAGES.push({role:'assistant',content:aiErrorMessage('network_error'),isError:true});
  }
  AI_SENDING=false;
  renderActiveSection();
}

/* ── 원장 화면 1: 도우미 관리(설계서 4-3-1) ── */
function blankAssistant(){
  return {id:null,name:'',icon:'🤖',description:'',instructions:'',knowledge:'',model_ref:null,fallback_model_ref:null,effort:'',max_output_tokens:4000,visible_roles:['staff','manager','chief','owner'],enabled:true};
}

async function renderManageSection(root){
  root.innerHTML='<div class="empty">불러오는 중…</div>';
  try{
    const [ares,mres]=await Promise.all([
      SB.from('ai_assistants').select('*').order('sort_order',{ascending:true}),
      SB.from('ai_models').select('*').order('sort_order',{ascending:true}),
    ]);
    if(ares.error)throw ares.error;
    if(mres.error)throw mres.error;
    AI_ADMIN_ASSISTANTS=ares.data||[];
    AI_ADMIN_MODELS=mres.data||[];
  }catch(e){
    root.innerHTML='<div class="card"><div class="empty">불러오지 못했습니다: '+escAi((e&&e.message)||'')+'</div></div>';
    return;
  }
  drawManageSection(root);
}

function drawManageSection(root){
  const modelsById={};AI_ADMIN_MODELS.forEach(function(m){modelsById[m.id]=m;});
  root.innerHTML='<div class="card">'+aiNoticeHtml()+
    '<div class="rowflex" style="justify-content:space-between;align-items:center"><h2>⚙️ 도우미 관리</h2><button class="mini stamp" data-ai-new-assistant>새 도우미</button></div>'+
    '<div class="tblwrap"><table><tr><th></th><th>이름</th><th>설명</th><th>모델</th><th>보이는 역할</th><th>켜짐</th><th></th></tr>'+
    (AI_ADMIN_ASSISTANTS.map(function(a){
      const ready=aiAdminAssistantReady(a,modelsById);
      return '<tr><td>'+escAi(a.icon||'🤖')+'</td><td>'+escAi(a.name)+(ready?'':' <span class="b wait">⚠️ 모델 고르기 필요</span>')+'</td>'+
        '<td class="sub">'+escAi(a.description||'')+'</td>'+
        '<td class="sub">'+(a.model_ref&&modelsById[a.model_ref]?escAi(modelsById[a.model_ref].label):'미지정')+'</td>'+
        '<td class="sub">'+(a.visible_roles||[]).map(aiRoleLabel).join(', ')+'</td>'+
        '<td><span class="b '+(a.enabled?'ok':'no')+'">'+(a.enabled?'켜짐':'꺼짐')+'</span></td>'+
        '<td class="rowflex">'+
        '<button class="mini" data-ai-edit-assistant="'+a.id+'">고치기</button>'+
        '<button class="mini" data-ai-toggle-assistant="'+a.id+'">'+(a.enabled?'끄기':'켜기')+'</button>'+
        '<button class="mini" data-ai-dup-assistant="'+a.id+'">복제</button>'+
        '<button class="mini rej" data-ai-del-assistant="'+a.id+'">삭제</button>'+
        '</td></tr>';
    }).join('')||'<tr><td colspan="7" class="empty">아직 도우미가 없습니다.</td></tr>')+
    '</table></div></div><div id="aiAssistantFormWrap"></div>';
  root.querySelector('[data-ai-new-assistant]').addEventListener('click',function(){openAssistantForm(null);});
  Array.prototype.forEach.call(root.querySelectorAll('[data-ai-edit-assistant]'),function(b){b.addEventListener('click',function(){openAssistantForm(b.getAttribute('data-ai-edit-assistant'));});});
  Array.prototype.forEach.call(root.querySelectorAll('[data-ai-toggle-assistant]'),function(b){b.addEventListener('click',function(){toggleAssistantEnabled(b.getAttribute('data-ai-toggle-assistant'));});});
  Array.prototype.forEach.call(root.querySelectorAll('[data-ai-dup-assistant]'),function(b){b.addEventListener('click',function(){duplicateAssistant(b.getAttribute('data-ai-dup-assistant'));});});
  Array.prototype.forEach.call(root.querySelectorAll('[data-ai-del-assistant]'),function(b){b.addEventListener('click',function(){deleteAssistant(b.getAttribute('data-ai-del-assistant'));});});
  if(AI_EDIT_ASSISTANT)drawAssistantForm();
}

function openAssistantForm(id){
  if(id){
    const found=AI_ADMIN_ASSISTANTS.find(function(a){return a.id===id;});
    AI_EDIT_ASSISTANT=found?Object.assign({},found):blankAssistant();
  }else{
    AI_EDIT_ASSISTANT=blankAssistant();
  }
  AI_EDIT_ERRORS=[];
  drawManageSection(AI_ROOT.querySelector('#aiSection'));
}

function aiModelOptionsHtml(selected){
  const groups=aiGroupModelsByProvider(AI_ADMIN_MODELS,{onlyEnabled:true});
  return '<option value="">고르지 않음</option>'+groups.map(function(g){
    return '<optgroup label="'+escAi(g.label)+'">'+g.models.map(function(m){
      return '<option value="'+m.id+'"'+(selected===m.id?' selected':'')+'>'+escAi(m.label)+' — '+escAi(aiModelPriceLabel(m))+'</option>';
    }).join('')+'</optgroup>';
  }).join('');
}

function drawAssistantForm(){
  const wrap=AI_ROOT.querySelector('#aiAssistantFormWrap');
  if(!wrap)return;
  const a=AI_EDIT_ASSISTANT;
  const roles=['staff','manager','chief','owner'];
  wrap.innerHTML='<div class="card"><h2>'+(a.id?'도우미 고치기':'새 도우미')+'</h2>'+
    (AI_EDIT_ERRORS.length?'<div class="hint" style="color:var(--red)">'+AI_EDIT_ERRORS.map(escAi).join(' · ')+'</div>':'')+
    '<div class="grid">'+
    '<div class="fld"><label>이름</label><input id="aiFName" value="'+escAi(a.name)+'" maxlength="40"></div>'+
    '<div class="fld"><label>아이콘</label><input id="aiFIcon" value="'+escAi(a.icon||'🤖')+'" maxlength="8"></div>'+
    '<div class="fld w4"><label>설명(직원 카드에 보임)</label><input id="aiFDesc" value="'+escAi(a.description||'')+'"></div>'+
    '<div class="fld w4"><label>지침서(직원에게 안 보임)</label><textarea id="aiFInstr" style="min-height:140px">'+escAi(a.instructions||'')+'</textarea></div>'+
    '<div class="fld w4"><label>참고자료(직원에게 안 보임, 최대 60,000자) <span class="sub" id="aiFKnowLen">'+(a.knowledge||'').length+'자</span></label><textarea id="aiFKnow" style="min-height:100px">'+escAi(a.knowledge||'')+'</textarea></div>'+
    '<div class="fld w2"><label>모델</label><select id="aiFModel">'+aiModelOptionsHtml(a.model_ref)+'</select></div>'+
    '<div class="fld w2"><label>예비 모델(없어도 됨)</label><select id="aiFFallback">'+aiModelOptionsHtml(a.fallback_model_ref)+'</select></div>'+
    '<div class="fld"><label>생각 깊이 <span class="sub">(Claude 5.x에만 적용)</span></label><select id="aiFEffort">'+
    '<option value=""'+(!a.effort?' selected':'')+'>기본</option>'+
    '<option value="low"'+(a.effort==='low'?' selected':'')+'>낮음</option>'+
    '<option value="medium"'+(a.effort==='medium'?' selected':'')+'>보통</option>'+
    '<option value="high"'+(a.effort==='high'?' selected':'')+'>높음</option>'+
    '</select></div>'+
    '<div class="fld"><label>답 최대 길이</label><input id="aiFMaxTok" type="number" min="256" max="32000" value="'+(a.max_output_tokens||4000)+'"></div>'+
    '<div class="fld w4"><label>보이는 역할</label><div class="chips">'+roles.map(function(r){return '<label class="sub"><input type="checkbox" data-ai-role="'+r+'"'+((a.visible_roles||[]).indexOf(r)!==-1?' checked':'')+'> '+aiRoleLabel(r)+'</label>';}).join(' ')+'</div></div>'+
    '<div class="fld"><label>켜짐</label><input type="checkbox" id="aiFEnabled"'+(a.enabled!==false?' checked':'')+'></div>'+
    '</div>'+
    '<div class="rowflex" style="margin-top:10px"><button class="mini stamp" id="aiFSave">저장</button><button class="mini" id="aiFCancel">취소</button><button class="mini" id="aiFTest">미리 시험</button></div>'+
    '<div class="hint" id="aiFMsg"></div><div id="aiFTestArea"></div></div>';
  wrap.querySelector('#aiFKnow').addEventListener('input',function(e){wrap.querySelector('#aiFKnowLen').textContent=e.target.value.length+'자';});
  wrap.querySelector('#aiFSave').addEventListener('click',saveAssistantForm);
  wrap.querySelector('#aiFCancel').addEventListener('click',function(){AI_EDIT_ASSISTANT=null;drawManageSection(AI_ROOT.querySelector('#aiSection'));});
  wrap.querySelector('#aiFTest').addEventListener('click',testAssistantForm);
}

function readAssistantForm(){
  const wrap=AI_ROOT.querySelector('#aiAssistantFormWrap');
  const roles=Array.prototype.filter.call(wrap.querySelectorAll('[data-ai-role]'),function(el){return el.checked;}).map(function(el){return el.getAttribute('data-ai-role');});
  return {
    name:wrap.querySelector('#aiFName').value,
    icon:wrap.querySelector('#aiFIcon').value||'🤖',
    description:wrap.querySelector('#aiFDesc').value,
    instructions:wrap.querySelector('#aiFInstr').value,
    knowledge:wrap.querySelector('#aiFKnow').value,
    model_ref:wrap.querySelector('#aiFModel').value||null,
    fallback_model_ref:wrap.querySelector('#aiFFallback').value||null,
    effort:wrap.querySelector('#aiFEffort').value||null,
    max_output_tokens:Number(wrap.querySelector('#aiFMaxTok').value||4000),
    visible_roles:roles,
    enabled:wrap.querySelector('#aiFEnabled').checked,
  };
}

async function saveAssistantForm(){
  const form=readAssistantForm();
  const errs=aiAssistantFormErrors(form);
  AI_EDIT_ERRORS=errs;
  if(errs.length){drawAssistantForm();return;}
  const msgEl=AI_ROOT.querySelector('#aiFMsg');
  try{
    if(AI_EDIT_ASSISTANT&&AI_EDIT_ASSISTANT.id){
      const res=await SB.from('ai_assistants').update(form).eq('id',AI_EDIT_ASSISTANT.id);
      if(res.error)throw res.error;
    }else{
      const res=await SB.from('ai_assistants').insert(form);
      if(res.error)throw res.error;
    }
    AI_EDIT_ASSISTANT=null;
    await renderManageSection(AI_ROOT.querySelector('#aiSection'));
  }catch(e){
    if(msgEl)msgEl.textContent=aiWriteErrorMessage('저장',e);
  }
}

async function testAssistantForm(){
  const area=AI_ROOT.querySelector('#aiFTestArea');
  if(!AI_EDIT_ASSISTANT||!AI_EDIT_ASSISTANT.id){if(area)area.innerHTML='<div class="hint">저장한 뒤 시험할 수 있습니다.</div>';return;}
  if(area)area.innerHTML='<div class="sub">시험 중…</div>';
  try{
    const data=await aiUnwrapInvoke(await SB.functions.invoke('ai-assistant-chat',{body:{action:'chat',assistant_id:AI_EDIT_ASSISTANT.id,messages:[{role:'user',content:'안녕하세요라고만 답하세요.'}]}}));
    if(!data||data.ok===false){if(area)area.innerHTML='<div class="hint">'+escAi(aiErrorMessage(data&&data.error_kind))+'</div>';return;}
    if(area)area.innerHTML='<div class="hint">✅ '+escAi(data.model_label||data.model_id||'')+': '+escAi(data.text||'')+'</div>';
  }catch(e){
    if(area)area.innerHTML='<div class="hint">시험 실패: '+escAi((e&&e.message)||'')+'</div>';
  }
}

async function toggleAssistantEnabled(id){
  const a=AI_ADMIN_ASSISTANTS.find(function(x){return x.id===id;});
  if(!a)return;
  try{const res=await SB.from('ai_assistants').update({enabled:!a.enabled}).eq('id',id);if(res.error)throw res.error;}catch(e){AI_NOTICE=aiWriteErrorMessage('켜기·끄기',e);}
  await renderManageSection(AI_ROOT.querySelector('#aiSection'));
}
async function duplicateAssistant(id){
  const a=AI_ADMIN_ASSISTANTS.find(function(x){return x.id===id;});
  if(!a)return;
  const copy=Object.assign({},a);
  delete copy.id;delete copy.created_at;delete copy.updated_at;
  copy.name=(copy.name||'')+' 복제';
  try{const res=await SB.from('ai_assistants').insert(copy);if(res.error)throw res.error;}catch(e){AI_NOTICE=aiWriteErrorMessage('복제',e);}
  await renderManageSection(AI_ROOT.querySelector('#aiSection'));
}
async function deleteAssistant(id){
  if(!confirm('이 도우미를 삭제할까요? 되돌릴 수 없습니다.'))return;
  try{const res=await SB.from('ai_assistants').delete().eq('id',id);if(res.error)throw res.error;}catch(e){AI_NOTICE=aiWriteErrorMessage('삭제',e);}
  await renderManageSection(AI_ROOT.querySelector('#aiSection'));
}

/* ── 원장 화면 2: 모델 목록(설계서 4-3-2) ── */
function blankModel(){return {id:null,provider:'anthropic',model_id:'',label:'',enabled:true,price_in_usd_per_mtok:null,price_out_usd_per_mtok:null,note:'',sort_order:0};}

async function renderModelsSection(root){
  root.innerHTML='<div class="empty">불러오는 중…</div>';
  try{
    const res=await SB.from('ai_models').select('*').order('sort_order',{ascending:true});
    if(res.error)throw res.error;
    AI_ADMIN_MODELS=res.data||[];
  }catch(e){
    root.innerHTML='<div class="card"><div class="empty">불러오지 못했습니다: '+escAi((e&&e.message)||'')+'</div></div>';
    return;
  }
  drawModelsSection(root);
}

function drawModelsSection(root){
  const groups=aiGroupModelsByProvider(AI_ADMIN_MODELS,{onlyEnabled:false});
  root.innerHTML='<div class="card">'+aiNoticeHtml()+
    '<div class="rowflex" style="justify-content:space-between;align-items:center"><h2>🧠 모델 목록</h2>'+
    '<div class="rowflex"><button class="mini" data-ai-new-model>모델 직접 추가</button><button class="mini" data-ai-fetch-models>회사별 목록 불러오기</button></div></div>'+
    (groups.map(function(g){
      return '<h3>'+escAi(g.label)+'</h3><div class="tblwrap"><table><tr><th>표시 이름</th><th>모델 이름</th><th>켜짐</th><th>가격(100만 토큰당)</th><th>메모</th><th></th></tr>'+
        g.models.map(function(m){
          return '<tr><td>'+escAi(m.label)+'</td><td class="sub">'+escAi(m.model_id)+'</td>'+
            '<td><span class="b '+(m.enabled?'ok':'no')+'">'+(m.enabled?'켜짐':'꺼짐')+'</span></td>'+
            '<td class="sub">'+escAi(aiModelPriceLabel(m))+'</td>'+
            '<td class="sub">'+escAi(m.note||'')+'</td>'+
            '<td class="rowflex">'+
            '<button class="mini" data-ai-edit-model="'+m.id+'">고치기</button>'+
            '<button class="mini" data-ai-toggle-model="'+m.id+'">'+(m.enabled?'끄기':'켜기')+'</button>'+
            '<button class="mini" data-ai-test-model="'+m.id+'">시험</button>'+
            '<button class="mini rej" data-ai-del-model="'+m.id+'">삭제</button>'+
            '</td></tr>';
        }).join('')+'</table></div>';
    }).join('')||'<div class="empty">아직 등록된 모델이 없습니다.</div>')+
    '<div id="aiModelTestResult"></div></div>'+
    '<div id="aiModelFormWrap"></div><div id="aiModelFetchResult"></div>';
  root.querySelector('[data-ai-new-model]').addEventListener('click',function(){openModelForm(null);});
  root.querySelector('[data-ai-fetch-models]').addEventListener('click',fetchModelLists);
  Array.prototype.forEach.call(root.querySelectorAll('[data-ai-edit-model]'),function(b){b.addEventListener('click',function(){openModelForm(b.getAttribute('data-ai-edit-model'));});});
  Array.prototype.forEach.call(root.querySelectorAll('[data-ai-toggle-model]'),function(b){b.addEventListener('click',function(){toggleModelEnabled(b.getAttribute('data-ai-toggle-model'));});});
  Array.prototype.forEach.call(root.querySelectorAll('[data-ai-test-model]'),function(b){b.addEventListener('click',function(){testModel(b.getAttribute('data-ai-test-model'));});});
  Array.prototype.forEach.call(root.querySelectorAll('[data-ai-del-model]'),function(b){b.addEventListener('click',function(){deleteModel(b.getAttribute('data-ai-del-model'));});});
  if(AI_MODEL_EDIT)drawModelForm();
}

function openModelForm(id){
  if(id){
    const found=AI_ADMIN_MODELS.find(function(m){return m.id===id;});
    AI_MODEL_EDIT=found?Object.assign({},found):blankModel();
  }else{
    AI_MODEL_EDIT=blankModel();
  }
  drawModelsSection(AI_ROOT.querySelector('#aiSection'));
}

function drawModelForm(){
  const wrap=AI_ROOT.querySelector('#aiModelFormWrap');
  if(!wrap)return;
  const m=AI_MODEL_EDIT;
  const providers=Object.keys(AI_PROVIDER_LABELS);
  wrap.innerHTML='<div class="card"><h2>'+(m.id?'모델 고치기':'모델 직접 추가')+'</h2><div class="grid">'+
    '<div class="fld"><label>회사</label><select id="aiMProvider">'+providers.map(function(p){return '<option value="'+p+'"'+(m.provider===p?' selected':'')+'>'+escAi(aiProviderLabel(p))+'</option>';}).join('')+'</select></div>'+
    '<div class="fld"><label>모델 이름(API 이름 그대로)</label><input id="aiMModelId" value="'+escAi(m.model_id)+'"></div>'+
    '<div class="fld"><label>화면 표시 이름</label><input id="aiMLabel" value="'+escAi(m.label)+'"></div>'+
    '<div class="fld"><label>켜짐</label><input type="checkbox" id="aiMEnabled"'+(m.enabled!==false?' checked':'')+'></div>'+
    '<div class="fld"><label>입력 가격(달러/100만 토큰, 모르면 비움)</label><input id="aiMPriceIn" type="number" step="0.01" value="'+(m.price_in_usd_per_mtok==null?'':m.price_in_usd_per_mtok)+'"></div>'+
    '<div class="fld"><label>출력 가격(달러/100만 토큰, 모르면 비움)</label><input id="aiMPriceOut" type="number" step="0.01" value="'+(m.price_out_usd_per_mtok==null?'':m.price_out_usd_per_mtok)+'"></div>'+
    '<div class="fld w2"><label>메모</label><input id="aiMNote" value="'+escAi(m.note||'')+'"></div>'+
    '<div class="fld"><label>순서</label><input id="aiMSort" type="number" value="'+(m.sort_order||0)+'"></div>'+
    '</div><div class="rowflex" style="margin-top:10px"><button class="mini stamp" id="aiMSave">저장</button><button class="mini" id="aiMCancel">취소</button></div>'+
    '<div class="hint" id="aiMMsg"></div></div>';
  wrap.querySelector('#aiMSave').addEventListener('click',saveModelForm);
  wrap.querySelector('#aiMCancel').addEventListener('click',function(){AI_MODEL_EDIT=null;drawModelsSection(AI_ROOT.querySelector('#aiSection'));});
}

async function saveModelForm(){
  const wrap=AI_ROOT.querySelector('#aiModelFormWrap');
  const priceIn=wrap.querySelector('#aiMPriceIn').value,priceOut=wrap.querySelector('#aiMPriceOut').value;
  const form={
    provider:wrap.querySelector('#aiMProvider').value,
    model_id:wrap.querySelector('#aiMModelId').value.trim(),
    label:wrap.querySelector('#aiMLabel').value.trim(),
    enabled:wrap.querySelector('#aiMEnabled').checked,
    price_in_usd_per_mtok:priceIn===''?null:Number(priceIn),
    price_out_usd_per_mtok:priceOut===''?null:Number(priceOut),
    note:wrap.querySelector('#aiMNote').value,
    sort_order:Number(wrap.querySelector('#aiMSort').value||0),
  };
  const msgEl=wrap.querySelector('#aiMMsg');
  if(!form.model_id||!form.label){if(msgEl)msgEl.textContent='모델 이름과 표시 이름을 입력하세요.';return;}
  try{
    if(AI_MODEL_EDIT&&AI_MODEL_EDIT.id){
      const res=await SB.from('ai_models').update(form).eq('id',AI_MODEL_EDIT.id);
      if(res.error)throw res.error;
    }else{
      const res=await SB.from('ai_models').insert(form);
      if(res.error)throw res.error;
    }
    AI_MODEL_EDIT=null;
    await renderModelsSection(AI_ROOT.querySelector('#aiSection'));
  }catch(e){
    if(msgEl)msgEl.textContent=aiWriteErrorMessage('저장',e);
  }
}

async function toggleModelEnabled(id){
  const m=AI_ADMIN_MODELS.find(function(x){return x.id===id;});
  if(!m)return;
  try{const res=await SB.from('ai_models').update({enabled:!m.enabled}).eq('id',id);if(res.error)throw res.error;}catch(e){AI_NOTICE=aiWriteErrorMessage('켜기·끄기',e);}
  await renderModelsSection(AI_ROOT.querySelector('#aiSection'));
}
async function deleteModel(id){
  if(!confirm('이 모델을 삭제할까요?'))return;
  try{const res=await SB.from('ai_models').delete().eq('id',id);if(res.error)throw res.error;}catch(e){AI_NOTICE=aiWriteErrorMessage('삭제',e);}
  await renderModelsSection(AI_ROOT.querySelector('#aiSection'));
}
async function testModel(id){
  const area=AI_ROOT.querySelector('#aiModelTestResult');
  if(area)area.innerHTML='<div class="sub">시험 중…</div>';
  try{
    const data=await aiUnwrapInvoke(await SB.functions.invoke('ai-assistant-chat',{body:{action:'test_model',model_ref:id}}));
    if(!data||data.ok===false){if(area)area.innerHTML='<div class="hint">'+escAi(aiErrorMessage(data&&data.error_kind))+'</div>';return;}
    if(area)area.innerHTML='<div class="hint">✅ '+(data.latency_ms||0)+'ms · '+escAi(data.text||'')+'</div>';
  }catch(e){
    if(area)area.innerHTML='<div class="hint">시험 실패: '+escAi((e&&e.message)||'')+'</div>';
  }
}
async function fetchModelLists(){
  const area=AI_ROOT.querySelector('#aiModelFetchResult');
  if(area)area.innerHTML='<div class="sub">불러오는 중…</div>';
  try{
    const data=await aiUnwrapInvoke(await SB.functions.invoke('ai-assistant-chat',{body:{action:'list_models'}}));
    if(!data||data.ok===false){if(area)area.innerHTML='<div class="hint">'+escAi(aiErrorMessage(data&&data.error_kind))+'</div>';return;}
    const known={};AI_ADMIN_MODELS.forEach(function(m){known[m.provider+'::'+m.model_id]=true;});
    const providers=data.providers||{};
    let html='<div class="card"><h3>회사별 목록</h3>';
    Object.keys(providers).forEach(function(p){
      const ids=providers[p]||[];
      html+='<h4>'+escAi(aiProviderLabel(p))+'</h4><div class="chips">'+(ids.map(function(mid){
        const already=known[p+'::'+mid];
        return already?('<span class="b ok">'+escAi(mid)+' (이미 있음)</span>'):('<button class="mini" data-ai-add-fetched="'+p+'::'+escAi(mid)+'">'+escAi(mid)+' 추가</button>');
      }).join(' ')||'<span class="sub">없음</span>')+'</div>';
    });
    const errors=data.errors||{};
    Object.keys(errors).forEach(function(p){html+='<div class="hint">'+escAi(aiProviderLabel(p))+': '+escAi(aiErrorMessage(errors[p]))+'</div>';});
    html+='</div>';
    if(area){
      area.innerHTML=html;
      Array.prototype.forEach.call(area.querySelectorAll('[data-ai-add-fetched]'),function(b){b.addEventListener('click',function(){addFetchedModel(b.getAttribute('data-ai-add-fetched'));});});
    }
  }catch(e){
    if(area)area.innerHTML='<div class="hint">불러오기 실패: '+escAi((e&&e.message)||'')+'</div>';
  }
}
function addFetchedModel(key){
  const idx=key.indexOf('::'),provider=key.slice(0,idx),modelId=key.slice(idx+2);
  AI_MODEL_EDIT=Object.assign(blankModel(),{provider:provider,model_id:modelId,label:modelId});
  drawModelsSection(AI_ROOT.querySelector('#aiSection'));
}

/* ── 원장 화면 3: 사용 기록(설계서 4-3-3) ── */
async function renderUsageSection(root){
  root.innerHTML='<div class="empty">불러오는 중…</div>';
  const since=new Date(Date.now()-30*24*3600*1000).toISOString();
  try{
    const [ures,pres]=await Promise.all([
      SB.from('ai_assistant_usage').select('*').gte('created_at',since).order('created_at',{ascending:false}),
      SB.from('profiles').select('user_id,name'),
    ]);
    if(ures.error)throw ures.error;
    const nameById={};(pres.data||[]).forEach(function(p){nameById[p.user_id]=p.name;});
    AI_USAGE_ROWS=(ures.data||[]).map(function(r){return Object.assign({},r,{user_name:nameById[r.user_id]||r.user_id});});
  }catch(e){
    root.innerHTML='<div class="card"><div class="empty">불러오지 못했습니다: '+escAi((e&&e.message)||'')+'</div></div>';
    return;
  }
  drawUsageSection(root);
}

function drawUsageSection(root){
  const s=aiUsageSummarize(AI_USAGE_ROWS);
  const rowsHtml=function(rows,label){
    return rows.length?('<div class="tblwrap"><table><tr><th>'+label+'</th><th>건수</th><th>입력 토큰</th><th>출력 토큰</th><th>추정 금액</th></tr>'+
      rows.map(function(r){return '<tr><td>'+escAi(r.key)+'</td><td>'+r.count+'</td><td>'+r.input_tokens.toLocaleString('ko-KR')+'</td><td>'+r.output_tokens.toLocaleString('ko-KR')+'</td><td>'+aiWonLabel(r.cost_usd)+'</td></tr>';}).join('')+
      '</table></div>'):'<div class="empty">기록이 없습니다.</div>';
  };
  root.innerHTML='<div class="card"><h2>📊 사용 기록 <span class="sub">(최근 30일)</span></h2>'+
    '<div class="rowflex">'+
    '<div class="stat"><div class="sub">전체 건수</div><div>'+s.totalCount+'건</div></div>'+
    '<div class="stat"><div class="sub">입력 토큰</div><div>'+s.totalInput.toLocaleString('ko-KR')+'</div></div>'+
    '<div class="stat"><div class="sub">출력 토큰</div><div>'+s.totalOutput.toLocaleString('ko-KR')+'</div></div>'+
    '<div class="stat"><div class="sub">추정 금액</div><div>'+aiWonLabel(s.totalCostUsd)+'</div></div>'+
    '</div>'+
    '<h3>날짜별</h3>'+rowsHtml(s.byDate,'날짜')+
    '<h3>도우미별</h3>'+rowsHtml(s.byAssistant,'도우미')+
    '<h3>직원별</h3>'+rowsHtml(s.byUser,'직원')+
    '<h3>모델별</h3>'+rowsHtml(s.byModel,'모델')+
    '</div>';
}

window.AIAssistants={render:renderAIAssistants};
})();
