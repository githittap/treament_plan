/* ai-assistants.js — 직원허브 「🤖 AI 도우미」 화면(1단계)
   설계서: Z:\09_claude-output\03_병원운영·전산\직원AI도우미\설계서_1단계.md (4장)
   hr.html은 이 파일을 <script src="ai-assistants.js?v=20261001"> 로 불러 window.AIAssistants.render(container,{sb,me}) 만 부른다.
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
  provider_disabled:'이 AI 회사가 꺼져 있어요. 원장에게 알려 주세요.',
  image_not_supported:'이 도우미는 사진을 처리하지 못해요. 내용은 글로 적어 주세요.',
  provider_auth_failed:'이 AI 회사가 연결 키를 받아 주지 않아요. 원장에게 알려 주세요.',
  usage_unavailable:'사용 기록을 확인할 수 없어 지금은 쓸 수 없어요. 잠시 후 다시 시도해 주세요.',
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
// 금액은 「확인된」 것만 더한다: est_cost_usd가 null인 성공 기록(가격 미상)과 status='pending'(결과 기록 전)은 0원으로 더하지 않고
// unknown 건수로 센다(상태와 무관). 실패 기록도 서버가 토큰을 알아 금액을 계산해 두었으면 확인된 금액에 더한다.
function aiUsageSummarize(rows){
  const groups={byDate:{},byAssistant:{},byUser:{},byModel:{}};
  let totalCount=0,totalInput=0,totalOutput=0,totalCostUsd=0,totalUnknown=0,totalKnown=0;
  (rows||[]).forEach(r=>{
    if(!r)return;
    totalCount++;
    const inTok=Number(r.input_tokens||0),outTok=Number(r.output_tokens||0);
    const unknown=r.status==='pending'||r.est_cost_usd==null; // 상태와 무관: 금액이 숫자(0 포함)인 것만 확인된 금액
    const cost=unknown?0:Number(r.est_cost_usd||0);
    totalInput+=inTok;totalOutput+=outTok;totalCostUsd+=cost;
    if(unknown)totalUnknown++;else totalKnown++;
    const dateKey=String(r.created_at||'').slice(0,10)||'(모름)';
    const assistantKey=r.assistant_name||'(이름없음)';
    const userKey=r.user_name||r.user_id||'(모름)';
    const modelKey=(r.provider||'')+' / '+(r.model_id||'');
    [[groups.byDate,dateKey],[groups.byAssistant,assistantKey],[groups.byUser,userKey],[groups.byModel,modelKey]].forEach(function(pair){
      const map=pair[0],key=pair[1];
      if(!map[key])map[key]={count:0,input_tokens:0,output_tokens:0,cost_usd:0,unknown:0,known:0};
      map[key].count++;map[key].input_tokens+=inTok;map[key].output_tokens+=outTok;map[key].cost_usd+=cost;
      if(unknown)map[key].unknown++;else map[key].known++;
    });
  });
  const toRows=function(map){return Object.keys(map).sort(function(a,b){return map[b].count-map[a].count;}).map(function(k){return Object.assign({key:k},map[k]);});};
  const byDate=toRows(groups.byDate).sort(function(a,b){return a.key<b.key?1:-1;});
  return {totalCount:totalCount,totalInput:totalInput,totalOutput:totalOutput,totalCostUsd:totalCostUsd,totalCostWon:aiWon(totalCostUsd),totalUnknown:totalUnknown,totalKnown:totalKnown,
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
// 대화 섞임 방지: 요청을 보낼 때의 (대화 번호, 요청 번호)가 응답 때의 현재 값과 다르면 그 응답은 버린다.
function aiIsStaleResponse(sent,current){
  return !sent||!current||sent.conv!==current.conv||sent.req!==current.req;
}
// 로그인 사용자가 바뀌었는지(이전 사용자가 있었고 지금과 다를 때만 true) — 바뀌면 대화 상태를 비운다.
function aiUserChanged(prevId,nextId){
  return prevId!=null&&prevId!==''&&String(prevId)!==String(nextId==null?'':nextId);
}
// 서버에 보낼 대화(오류 안내 문장은 빼고 role/content만).
function aiHistoryForRequest(messages){
  return (messages||[]).filter(function(m){return m&&!m.isError;}).map(function(m){return {role:m.role,content:m.content};});
}
function aiTextLength(content){return typeof content==='string'?content.length:Array.isArray(content)?content.filter(p=>p.type==='text').reduce((n,p)=>n+String(p.text||'').length,0):0;}
// 서버 제한(메시지 20개·개별 8,000자·합계 40,000자)에 막혀 「다음 전송」이 안 되는 상태인지. nextLen = 다음에 보낼 말 길이(모르면 1).
function aiConversationTooLong(history,nextLen){
  const h=history||[];
  const add=nextLen==null?1:Math.max(1,Number(nextLen)||1);
  if(h.length+1>20)return true;
  let total=add;
  for(let i=0;i<h.length;i++){
    const len=aiTextLength(h[i]&&h[i].content);
    if(len>8000)return true;
    total+=len;
  }
  return total>40000;
}
// 금액 표시: 가격 미상(null)·기록 중(pending)은 0원으로 더하지 않고 미상 건수로 따로 센다.
function aiCostSummaryLabel(costUsd,unknownCount,knownCount){
  const unk=Number(unknownCount)||0;
  if(!unk)return aiWonLabel(costUsd);
  if(!(Number(knownCount)>0))return '금액 모름 · 미상 '+unk+'건';
  return '확인된 금액 '+aiWonLabel(costUsd)+' · 미상 '+unk+'건';
}
// ── 「❓ 사용법」 안내 글(순수 자료) ──
// 직원용 섹션은 모든 역할에, 원장용 섹션은 owner에게만 추가로 보인다. 글은 짧고 쉬운 존댓말로 쓴다.
const AI_HELP_NUMS=['①','②','③','④','⑤','⑥','⑦','⑧','⑨'];
// 실제 화면에 뜨는 안내 문장(AI_ERROR_MESSAGES)과 그 뜻·할 일
const AI_HELP_ERROR_ROWS=[
  {kind:'model_not_set',means:'원장이 아직 이 도우미의 AI를 고르지 않았어요. 원장이 고르면 쓸 수 있어요.'},
  {kind:'model_disabled',means:'이 도우미가 쓰는 AI가 꺼져 있어요. 원장에게 알려 주세요.'},
  {kind:'assistant_disabled',means:'원장이 이 도우미를 잠시 꺼 두었어요.'},
  {kind:'rate_limited',means:'한 시간에 쓸 수 있는 횟수(120번)를 다 썼거나 잠깐 몰렸어요. 조금 뒤에 다시 보내세요.'},
  {kind:'timeout',means:'AI가 답을 쓰는 데 너무 오래 걸렸어요. 다시 한 번 보내 보세요.'},
  {kind:'upstream_error',means:'AI 쪽에서 답이 오지 않았어요. 잠시 뒤에 다시 보내 보세요.'},
  {kind:'provider_not_configured',means:'이 AI 회사와의 연결이 아직 준비되지 않았어요. 원장에게 알려 주세요.'},
  {kind:'usage_unavailable',means:'사용 기록을 확인하지 못해 잠시 쓸 수 없어요. 조금 뒤에 다시 시도하세요.'},
];
const AI_HELP_STAFF_STEPS=[
  {title:'도우미 고르기',text:'「🤖 AI 도우미」 화면에 도우미 카드가 나옵니다. 하려는 일에 맞는 카드를 누르면 대화 창이 열려요. 카드 아래 한 줄 설명을 보면 어떤 일을 돕는 도우미인지 알 수 있어요.'},
  {title:'물어보기',text:'아래 입력칸에 부탁할 내용을 적고 「보내기」를 누르세요. 키보드에서는 Ctrl+Enter로도 보낼 수 있어요. 답이 오기까지 몇 초에서 십여 초 걸리고, 그동안 「생각 중…」이 보여요.'},
  {title:'답 복사해서 쓰기',text:'답 아래의 「복사」를 누르면 그 글이 복사돼요. 카톡이나 게시판 등 필요한 곳에 붙여 넣어 쓰세요.'},
  {title:'고쳐 달라고 하기',text:'마음에 안 들면 같은 창에서 「더 짧게」 「더 부드럽게」 「존댓말로 바꿔 줘」처럼 이어서 말하면 그에 맞춰 다시 써 줘요. 앞 대화를 기억하고 있어서 처음부터 다시 설명하지 않아도 돼요.'},
  {title:'새 대화 시작하기',text:'이야기 주제가 완전히 바뀌었거나 대화가 길어졌을 때는 「새 대화」를 누르세요. 메시지가 20개가 되거나 글이 너무 길어지면 「대화가 길어져 새 대화가 필요해요」가 뜨는데, 그때도 「새 대화」를 누르면 됩니다.'},
  {title:'「준비 중」 카드',text:'카드에 「준비 중」이 보이면 원장이 아직 그 도우미가 쓸 AI를 고르지 않은 것이에요. 원장이 고르면 카드가 열려요.'},
  {title:'자주 보는 안내 문장',text:'화면에 이런 문장이 뜨면 이렇게 하세요.',errors:true},
  {title:'알아 둘 것',list:[
    '답은 초안이에요. 읽어 보고 고쳐서 쓰세요.',
    '누가 언제 어느 도우미를 썼는지는 사용 기록으로 남고, 원장이 볼 수 있어요.',
    '한 시간에 120번까지 보낼 수 있어요.',
    '모든 직원이 함께 쓰는 도우미예요. 쓰다가 불편한 점은 원장에게 알려 주세요.']},
];
const AI_HELP_FIELD_ROWS=[
  ['이름','직원 카드에 보이는 이름이에요(40자까지).'],
  ['아이콘','이름 앞에 붙는 그림 글자예요. 이모지 하나면 충분해요.'],
  ['설명','직원 카드 아래에 보이는 한 줄 설명이에요(200자까지).'],
  ['지침서','AI에게 주는 역할과 규칙이에요. 직원에게는 보이지 않아요(20,000자까지).'],
  ['참고자료','AI가 답할 때 참고할 글이에요. 글을 붙여 넣으면 되고, 직원에게는 보이지 않아요(60,000자까지).'],
  ['모델','답을 써 줄 AI예요. 고르지 않으면 직원 카드에 「준비 중」으로 보여요.'],
  ['예비 모델','첫 번째 AI가 막히거나 오래 걸릴 때 대신 답하는 AI예요. 없어도 돼요.'],
  ['생각 깊이','낮음·보통·높음 중에서 골라요. Claude 5.x 계열에만 적용되고, 높을수록 깊이 생각하지만 느리고 비용이 늘어요. 잘 모르겠으면 「기본」으로 두세요.'],
  ['답 최대 길이','AI가 한 번에 쓸 수 있는 답의 길이예요(256~32,000, 기본 4,000).'],
  ['보이는 역할','직원·매니저·실장·원장 중 누가 이 도우미를 볼지 골라요.'],
  ['켜짐','끄면 직원 목록에서 사라져요. 지우지 않고 잠시 숨길 때 쓰세요.'],
];
const AI_HELP_EXAMPLES=[
  {name:'공지·카톡 문구 다듬기',icon:'📣',description:'직원 공지나 카톡 안내 문구를 읽기 쉽게 다듬어 줌',
   instructions:'당신은 아산정플란트치과 직원이 직원 공지나 카톡 안내 문구를 쓸 때 돕는 도우미입니다.\n직원이 초안이나 전하고 싶은 내용을 적으면 읽기 쉽게 다듬어 줍니다.\n\n말투: 해요체 부탁형(~해주세요, ~부탁드려요)으로 정중하고 친근하게 씁니다.\n길이: 핵심부터 짧게. 한 문장은 한 줄 안팎으로 씁니다.\n형식: 할 일이 여러 개면 번호를 붙이고, 날짜·시간·장소는 빠뜨리지 않고 맨 위에 둡니다.\n내용에 없는 사실(날짜, 이름 등)은 지어내지 않고 [확인 필요]로 표시합니다.\n\n답 형식:\n[다듬은 문구]\n(공지 본문)\n\n[고친 점]\n(한두 줄)\n\n직원이 「더 짧게」「더 부드럽게」처럼 요청하면 그에 맞춰 다시 씁니다.',
   note:'참고자료는 비워 두어도 돼요. 생각 깊이는 「낮음」, 모델은 빠르고 값싼 것을 고르면 충분해요.'},
  {name:'환자 안내 문자 초안',icon:'📱',description:'예약·주의사항 등 환자 안내 문자 초안을 만들어 줌',
   instructions:'당신은 아산정플란트치과 직원이 환자에게 보낼 안내 문자 초안을 쓸 때 돕는 도우미입니다.\n직원이 안내할 상황(예약 안내, 치료 후 주의사항 안내, 다음 내원 안내 등)과 필요한 정보를 적으면 문자 초안을 만듭니다.\n\n말투: 정중한 존댓말, 따뜻하고 간단명료하게.\n길이: 문자 한 통에 들어갈 분량(3~6문장).\n첫머리에 병원 이름(아산정플란트치과)을 밝히고, 마지막에 문의 안내 한 줄을 넣습니다.\n직원이 준 정보에 없는 날짜·시간·금액·전화번호는 쓰지 않고 [확인 필요]로 비워 둡니다.\n\n답 형식:\n[문자 초안]\n(본문)\n\n직원이 「더 짧게」「더 정중하게」처럼 요청하면 그에 맞춰 다시 씁니다.',
   note:'자주 쓰는 안내 문구가 있으면 참고자료에 붙여 넣어 두면 말투가 더 잘 맞아요.'},
  {name:'업무 매뉴얼 묻고 답하기',icon:'📘',description:'병원 업무 매뉴얼을 바탕으로 방법을 알려 줌',
   instructions:'당신은 아산정플란트치과 직원이 업무 방법을 물을 때 답하는 도우미입니다.\n아래 「참고자료」에 붙여 넣은 업무 매뉴얼을 바탕으로 답합니다.\n\n답하는 방법: 질문에 맞는 부분을 찾아 순서대로 짧게 알려 줍니다. 단계가 있으면 번호를 붙입니다.\n참고자료에 없는 내용은 아는 척하지 않고 「매뉴얼에 나와 있지 않아요. 실장님께 확인해 주세요」라고 답합니다.\n말투: 친절한 존댓말, 짧고 쉽게.',
   note:'「참고자료」 칸에 업무 매뉴얼 글을 붙여 넣으세요(60,000자까지). 매뉴얼이 바뀌면 참고자료 글도 새로 붙여 넣어 주세요.'},
];
const AI_HELP_OWNER_STEPS=[
  {title:'새 도우미 만들기',text:'「⚙️ 도우미 관리」 탭에서 「새 도우미」를 누르고 칸을 채운 뒤 「저장」하세요. 칸마다 뜻은 이래요.',fields:true},
  {title:'지침서 잘 쓰는 요령',list:[
    '역할부터 한 줄로: 「당신은 ○○ 할 때 돕는 도우미입니다.」',
    '말투를 정해 주세요: 존댓말인지, 해요체인지, 딱딱한지 부드러운지.',
    '길이를 정해 주세요: 「3~5문장」처럼 숫자로 쓰면 잘 지켜요.',
    '답 형식을 보여 주세요: 「[짧은 답글] … [조금 긴 답글] …」처럼 틀을 적어 두세요.',
    '예시 한두 개를 넣으면 더 정확해요. 마지막에 「고쳐 달라고 하면 그에 맞춰 다시 씁니다」를 적어 두면 좋아요.']},
  {title:'「미리 시험」',text:'도우미를 저장한 뒤 고치기 화면의 「미리 시험」을 누르면 「안녕하세요라고만 답하세요」를 보내서 AI가 제대로 답하는지 확인해요. 직원에게 열기 전에 꼭 한 번 눌러 보세요.'},
  {title:'모델 목록',list:[
    '「🧠 모델 목록」 탭에서 쓸 수 있는 AI를 회사별로 봐요. 가격은 100만 토큰당 원화(1달러=1,500원)로 보여요.',
    '「켜기·끄기」: 끄면 도우미의 모델 고르기 목록에서 숨겨요.',
    '「모델 직접 추가」: 회사와 모델 이름(API 이름 그대로)을 넣어 새로 등록해요.',
    '「회사별 목록 불러오기」: 각 회사가 지금 제공하는 모델 이름을 가져와요. 마음에 드는 것을 눌러 추가하세요.',
    '「시험」: 그 모델에 짧은 인사를 보내 연결이 되는지와 걸린 시간을 봐요.']},
  {title:'사용 기록 보기',text:'「📊 사용 기록」 탭에서 최근 30일의 사용 건수·토큰·추정 금액을 날짜별·도우미별·직원별·모델별로 볼 수 있어요. 가격을 모르는 모델은 금액을 더하지 않고 「미상 N건」으로 따로 세어 보여 줘요.'},
  {title:'특정 직원에게 AI 탭 숨기기',text:'설정의 「탭 노출 설정」(역할별)이나 「사람별 탭 예외」(개인별)에서 「🤖 AI 도우미」를 끄면 그 사람에게는 탭이 보이지 않아요.'},
  {title:'바로 만들어 쓸 만한 도우미 예시 3개',text:'아래 지침서를 복사해서 「새 도우미」의 지침서 칸에 붙여 넣으세요.',examples:true},
];
const AI_HELP_SECTIONS=[
  {id:'staff',title:'직원용 — 이렇게 쓰세요',steps:AI_HELP_STAFF_STEPS},
  {id:'owner',title:'원장용 — 도우미 만들고 관리하기',steps:AI_HELP_OWNER_STEPS},
];
// 역할에 보일 섹션 고르기: 직원용은 모두에게, 원장용은 owner에게만 추가
function aiHelpSectionsFor(role){
  return AI_HELP_SECTIONS.filter(function(sec){return sec.id==='staff'||(sec.id==='owner'&&role==='owner');});
}
// 안내 글의 「자주 보는 안내 문장」 표: 실제 오류 문장표에서 문장을 가져온다.
function aiHelpErrorRows(){
  return AI_HELP_ERROR_ROWS.map(function(r){return {kind:r.kind,message:AI_ERROR_MESSAGES[r.kind]||'',means:r.means};});
}
// CSV 파일 이름: <도우미이름>_<YYYYMMDD-HHmm>.csv — 이 컴퓨터(한국) 현지 시각 기준이고, 파일 이름에 못 쓰는 글자는 _로 바꾼다.
function aiCsvFileName(name,date){
  const d=date||new Date();
  const pad=function(n){return String(n).padStart(2,'0');};
  const stamp=d.getFullYear()+pad(d.getMonth()+1)+pad(d.getDate())+'-'+pad(d.getHours())+pad(d.getMinutes());
  const safe=String(name||'').replace(/[\\/:*?"<>|\u0000-\u001f]/g,'_').replace(/\s+/g,' ').trim().replace(/^\.+/,'')||'assistant';
  return safe+'_'+stamp+'.csv';
}
// AI 답 안의 csv 코드 칸들의 본문을 차례로 뽑는다.
function aiCsvBlocks(text){
  const out=[];
  const re=/```csv\s*\r?\n([\s\S]*?)```/gi;
  let m;
  while((m=re.exec(String(text||'')))!==null)out.push(m[1]);
  return out;
}
// 📎 옆 안내(설계서 F3): 기본 모델이 사진을 못 읽을 때만 보인다. 카드 목록에 images_ok가 없으면(옛 화면·옛 DB) 안내하지 않는다.
function aiPhotoNotice(a){
  if(!a||a.images_ok!==false)return '';
  if(a.fallback_images_ok===true)return '이 AI는 사진을 못 읽어요. 사진을 보내면 예비 AI가 대신 읽어요.';
  return '이 AI는 사진을 못 읽어요. 내용은 글로 적어 주세요.';
}
// 회사 목록의 열쇠 등록 표시: 서버가 돌려준 true/false만 쓴다(모르면 표시 없음).
function aiProviderKeyBadge(status,id){
  if(!status||typeof status[id]!=='boolean')return '';
  return status[id]?'<span class="b ok">열쇠 등록됨</span>':'<span class="b no">열쇠 등록 필요</span>';
}
/* ai-assistants:test-end */

/* ── 아래부터 DOM·네트워크 코드(시험 블록 밖) ── */
function escAi(s){return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}

let SB=null,ME={},AI_ROOT=null,AI_SUBTAB='chat',AI_STYLE_INJECTED=false;
let AI_ASSISTANTS=[],AI_ERROR='';
let AI_ACTIVE_ASSISTANT=null,AI_MESSAGES=[],AI_SENDING=false,AI_CONV=0,AI_REQ=0,AI_UID=null,AI_CONVERSATION_ID=null,AI_IMAGES=[];
let AI_ADMIN_ASSISTANTS=[],AI_ADMIN_MODELS=[],AI_PROVIDER_ROWS=[],AI_PROVIDER_KEYS=null,AI_EDIT_ASSISTANT=null,AI_EDIT_ERRORS=[],AI_MODEL_EDIT=null;
let AI_USAGE_ROWS=[],AI_NOTICE='',AI_HELP_OPEN=false;
let AI_TRANSCRIPTS=[],AI_TRANSCRIPT_OFFSET=0;

function aiNoticeHtml(){
  const n=AI_NOTICE;AI_NOTICE='';
  return n?('<div class="hint" style="color:var(--red);margin-bottom:8px" role="alert">'+escAi(n)+'</div>'):'';
}

function ensureStyle(){
  if(AI_STYLE_INJECTED)return;
  AI_STYLE_INJECTED=true;
  const css=
    '.ai-wrap{max-width:100%}'+
    '.ai-helpbar{margin-bottom:8px}'+
    '.ai-help{margin-bottom:10px;max-width:100%}'+
    '.ai-help[hidden]{display:none}'+
    '.ai-help details{border:1px solid var(--line);border-radius:10px;margin:8px 0;padding:8px 10px}'+
    '.ai-help summary{font-weight:700;cursor:pointer;font-size:14px}'+
    '.ai-help h4{margin:10px 0 3px;font-size:13.5px}'+
    '.ai-help p,.ai-help li{font-size:13px;line-height:1.65;overflow-wrap:anywhere}'+
    '.ai-help ul{margin:4px 0 4px 18px;padding:0}'+
    '.ai-help pre{white-space:pre-wrap;overflow-wrap:anywhere;font-size:12px;line-height:1.55;background:var(--bg);border:1px solid var(--line);border-radius:8px;padding:8px;max-width:100%;margin:6px 0;font-family:inherit}'+
    '.ai-help .ai-help-msg{font-weight:700}'+
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
  if(aiUserChanged(AI_UID,ME.id)){resetAiState();}
  AI_UID=ME.id==null?null:ME.id;
  ensureStyle();
  if(!AI_ROOT)return;
  AI_ROOT.innerHTML='<div class="empty">불러오는 중…</div>';
  await loadAndRenderShell();
}

// 로그인 사용자가 바뀌면 이전 사람의 대화·관리 화면 상태를 모두 비운다.
function resetAiState(){
  AI_CONV++;AI_REQ++;
  AI_ACTIVE_ASSISTANT=null;AI_MESSAGES=[];AI_SENDING=false;AI_IMAGES=[];AI_SUBTAB='chat';
  AI_ASSISTANTS=[];AI_ERROR='';AI_ADMIN_ASSISTANTS=[];AI_ADMIN_MODELS=[];AI_EDIT_ASSISTANT=null;AI_EDIT_ERRORS=[];AI_MODEL_EDIT=null;AI_USAGE_ROWS=[];AI_NOTICE='';
}

// 직원용 RPC를 다시 읽어 카드 목록(ready 등)을 최신으로 맞춘다.
async function reloadAssistants(){
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
}

async function loadAndRenderShell(){
  await reloadAssistants();
  renderShell();
}

function aiHelpStepHtml(step,idx,sec){
  let h='<h4>'+AI_HELP_NUMS[idx]+' '+escAi(step.title)+'</h4>';
  if(step.text)h+='<p>'+escAi(step.text)+'</p>';
  if(step.list)h+='<ul>'+step.list.map(function(t){return '<li>'+escAi(t)+'</li>';}).join('')+'</ul>';
  if(step.errors)h+='<ul>'+aiHelpErrorRows().map(function(r){return '<li><span class="ai-help-msg">「'+escAi(r.message)+'」</span><br>→ '+escAi(r.means)+'</li>';}).join('')+'</ul>';
  if(step.fields)h+='<ul>'+AI_HELP_FIELD_ROWS.map(function(r){return '<li><b>'+escAi(r[0])+'</b> — '+escAi(r[1])+'</li>';}).join('')+'</ul>';
  if(step.examples)h+=AI_HELP_EXAMPLES.map(function(ex,i){
    return '<p><b>'+escAi(ex.icon)+' '+escAi(ex.name)+'</b> <span class="sub">— 설명 칸에 「'+escAi(ex.description)+'」</span></p>'+
      '<pre>'+escAi(ex.instructions)+'</pre>'+
      '<p class="sub">'+escAi(ex.note)+' <button class="mini" data-ai-help-copy="'+i+'">지침서 복사</button></p>';
  }).join('');
  return h;
}
function aiHelpHtml(role){
  return aiHelpSectionsFor(role).map(function(sec,si){
    return '<details class="ai-help-sec"'+(si===0?' open':'')+'><summary>'+escAi(sec.title)+'</summary>'+
      sec.steps.map(function(st,i){return aiHelpStepHtml(st,i,sec);}).join('')+'</details>';
  }).join('');
}

function renderShell(){
  const isOwner=ME.role==='owner';
  const tabs=[{key:'chat',label:'🤖 도우미'}];
  if(isOwner)tabs.push({key:'transcripts',label:'\uD83D\uDDC2\uFE0F \uB300\uD654\uB85D'},{key:'manage',label:'⚙️ 도우미 관리'},{key:'models',label:'🧠 모델 목록'},{key:'usage',label:'📊 사용 기록'});
  const nav=tabs.length>1?('<div class="rowflex ai-subnav">'+tabs.map(function(t){return '<button class="mini'+(AI_SUBTAB===t.key?' on':'')+'" data-ai-subtab="'+t.key+'">'+t.label+'</button>';}).join('')+'</div>'):'';
  const helpBar='<div class="rowflex ai-helpbar"><button class="mini" data-ai-help-toggle>'+(AI_HELP_OPEN?'❓ 사용법 닫기':'❓ 사용법')+'</button></div>'+
    '<div class="card ai-help" id="aiHelpPanel"'+(AI_HELP_OPEN?'':' hidden')+'>'+aiHelpHtml(ME.role)+'</div>';
  AI_ROOT.innerHTML='<div class="ai-wrap">'+helpBar+nav+'<div id="aiSection"></div></div>';
  const helpBtn=AI_ROOT.querySelector('[data-ai-help-toggle]');
  if(helpBtn)helpBtn.addEventListener('click',function(){
    AI_HELP_OPEN=!AI_HELP_OPEN;
    const panel=AI_ROOT.querySelector('#aiHelpPanel');
    if(panel)panel.hidden=!AI_HELP_OPEN;
    helpBtn.textContent=AI_HELP_OPEN?'❓ 사용법 닫기':'❓ 사용법';
  });
  Array.prototype.forEach.call(AI_ROOT.querySelectorAll('[data-ai-help-copy]'),function(btn){
    btn.addEventListener('click',function(){
      const ex=AI_HELP_EXAMPLES[Number(btn.getAttribute('data-ai-help-copy'))];
      if(ex&&navigator.clipboard&&navigator.clipboard.writeText)navigator.clipboard.writeText(ex.instructions).then(function(){btn.textContent='복사됨';}).catch(function(){});
    });
  });
  Array.prototype.forEach.call(AI_ROOT.querySelectorAll('[data-ai-subtab]'),function(btn){
    btn.addEventListener('click',async function(){
      AI_SUBTAB=btn.getAttribute('data-ai-subtab');
      if(AI_SUBTAB==='chat')await reloadAssistants(); // 관리 화면에서 바꾼 모델·이름이 카드에 바로 보이게
      renderShell();
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
  else if(AI_SUBTAB==='transcripts'&&ME.role==='owner')renderTranscriptsSection(sec);
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

// 대화가 바뀔 때마다(열기·새 대화·목록으로) 대화 번호를 올려 이전 대화의 늦은 응답이 섞이지 않게 한다.
function startFreshConversation(){AI_CONV++;AI_REQ++;AI_MESSAGES=[];AI_SENDING=false;AI_IMAGES=[];AI_CONVERSATION_ID=(window.crypto&&crypto.randomUUID)?crypto.randomUUID():('xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g,c=>{const r=Math.random()*16|0;return(c==='x'?r:(r&3|8)).toString(16);}));}
function openAiChat(id){
  AI_ACTIVE_ASSISTANT=AI_ASSISTANTS.find(function(a){return a.id===id;})||null;
  startFreshConversation();
  renderActiveSection();
}
async function closeAiChat(){
  AI_ACTIVE_ASSISTANT=null;startFreshConversation();
  await reloadAssistants(); // 카드 목록에 들어갈 때마다 최신(모델 지정 여부 등)으로
  renderActiveSection();
}

function aiDisplayContent(content){return typeof content==='string'?content:Array.isArray(content)?content.filter(p=>p.type==='text').map(p=>p.text||'').join(' '):String(content||'');}
function aiCsvBlocks(text){const out=[];const re=/```csv\s*\r?\n([\s\S]*?)```/gi;let m;while((m=re.exec(String(text||'')))!==null)out.push(m[1]);return out;}
async function aiCompressImage(file){const bitmap=await createImageBitmap(file);const scale=Math.min(1,1600/Math.max(bitmap.width,bitmap.height));const canvas=document.createElement('canvas');canvas.width=Math.round(bitmap.width*scale);canvas.height=Math.round(bitmap.height*scale);canvas.getContext('2d').drawImage(bitmap,0,0,canvas.width,canvas.height);bitmap.close();return canvas.toDataURL('image/jpeg',0.82);}
function aiMessageHtml(msg,idx){
 const who=msg.role==='user'?'\uB098':'AI',text=aiDisplayContent(msg.content);
 const meta=msg.role==='assistant'&&!msg.isError?'<div class="sub">'+escAi(msg.modelLabel||'')+(msg.fallbackUsed?' · \uC608\uBE44 \uBAA8\uB378\uB85C \uB2F5\uD568':'')+(msg.webSearchUsed?' · 🔎 \uC6F9 \uAC80\uC0C9\uD568':msg.webSearchUnsupported?' · \uC774 AI\uB294 \uC6F9\uAC80\uC0C9\uC744 \uBABB \uD574\uC11C \uAC80\uC0C9 \uC5C6\uC774 \uB2F5\uD588\uC5B4\uC694':'')+' <button class="mini" data-ai-copy="'+idx+'">\uBCF5\uC0AC</button></div>':'';
 const sources=(msg.sources||[]).slice(0,5).filter(x=>/^https:\/\//i.test(x.url||'')).map(x=>'<a href="'+escAi(x.url)+'" target="_blank" rel="noopener">'+escAi(x.title||x.url)+'</a>').join(' · ');
 const csv=aiCsvBlocks(text).map((v,i)=>'<button class="mini" data-ai-csv="'+idx+'::'+i+'">&#11015; CSV\uB85C \uBC1B\uAE30</button>').join(' ');
 return '<div class="ai-msg ai-msg-'+msg.role+'"><div class="ai-msg-who">'+who+'</div><div class="ai-msg-body">'+escAi(text)+'</div>'+meta+(sources?'<div class="sub">\uCD9C\uCC98: '+sources+'</div>':'')+(csv?'<div class="rowflex">'+csv+'</div>':'')+'</div>';
}
function renderChatPanel(root){
 const a=AI_ACTIVE_ASSISTANT,tooLong=aiConversationTooLong(aiHistoryForRequest(AI_MESSAGES));
 root.innerHTML='<div class="card ai-chat-card"><div class="rowflex" style="justify-content:space-between;align-items:center"><h2>'+escAi(a.icon||'\uD83E\uDD16')+' '+escAi(a.name)+'</h2><div class="rowflex"><button class="mini'+(tooLong?' stamp':'')+'" data-ai-new>\uC0C8 \uB300\uD654</button><button class="mini" data-ai-back>\u2190 \uBAA9\uB85D</button></div></div><div class="sub">'+escAi(a.description||'')+'</div>'+
 (tooLong?'<div class="hint" role="alert">\uB300\uD654\uAC00 \uAE38\uC5B4\uC838 \uC0C8 \uB300\uD654\uAC00 \uD544\uC694\uD574\uC694. \u300C\uC0C8 \uB300\uD654\u300D\uB97C \uB20C\uB7EC \uC8FC\uC138\uC694.</div>':'')+
 '<div class="ai-msgs" id="aiMsgs">'+(AI_MESSAGES.length?AI_MESSAGES.map(aiMessageHtml).join(''):'<div class="empty">\uBA54\uC2DC\uC9C0\uB97C \uBCF4\uB0B4 \uB300\uD654\uB97C \uC2DC\uC791\uD558\uC138\uC694.</div>')+'</div>'+
 (!AI_MESSAGES.length&&Array.isArray(a.starters)&&a.starters.length?'<div class="rowflex">'+a.starters.slice(0,4).map((v,i)=>'<button class="mini" data-ai-starter="'+i+'">'+escAi(v)+'</button>').join('')+'</div>':'')+
 '<label class="mini" for="aiPhotos">📎 \uC0AC\uC9C4 (\uCD5C\uB300 4\uC7A5)</label><input id="aiPhotos" type="file" accept="image/jpeg,image/png,image/webp" multiple>'+(aiPhotoNotice(a)?'<div class="sub" id="aiPhotoNotice" role="note">'+escAi(aiPhotoNotice(a))+'</div>':'')+'<div class="sub" id="aiPhotoStatus"></div>'+
 (AI_SENDING?'<div class="sub">\uC0DD\uAC01 \uC911...</div>':'')+'<textarea id="aiInput" placeholder="\uBA54\uC2DC\uC9C0\uB97C \uC785\uB825\uD558\uC138\uC694(Ctrl+Enter\uB85C \uBCF4\uB0B4\uAE30)"></textarea><div class="rowflex" style="justify-content:flex-end"><button class="mini stamp" id="aiSendBtn"'+((AI_SENDING||tooLong)?' disabled':'')+'>\uBCF4\uB0B4\uAE30</button></div><div class="hint" id="aiChatErr"></div></div>';
 root.querySelector('[data-ai-back]').addEventListener('click',closeAiChat);root.querySelector('[data-ai-new]').addEventListener('click',function(){startFreshConversation();renderActiveSection();});
 const input=root.querySelector('#aiInput');input.addEventListener('keydown',function(e){if(e.ctrlKey&&e.key==='Enter'){e.preventDefault();sendAiMessage();}});
 root.querySelector('#aiPhotos').addEventListener('change',async function(e){AI_IMAGES=[];for(const file of Array.from(e.target.files||[]).slice(0,4)){if(['image/jpeg','image/png','image/webp'].includes(file.type)){try{AI_IMAGES.push(await aiCompressImage(file));}catch(_){}}}root.querySelector('#aiPhotoStatus').textContent=AI_IMAGES.length?AI_IMAGES.length+' \uC120\uD0DD \uC644\uB8CC':'';});
 root.querySelectorAll('[data-ai-starter]').forEach(b=>b.addEventListener('click',()=>{input.value=(a.starters||[])[Number(b.getAttribute('data-ai-starter'))]||'';input.focus();}));root.querySelector('#aiSendBtn').addEventListener('click',sendAiMessage);
 const msgs=root.querySelector('#aiMsgs');if(msgs)msgs.scrollTop=msgs.scrollHeight;
 root.querySelectorAll('[data-ai-copy]').forEach(b=>b.addEventListener('click',()=>{const m=AI_MESSAGES[Number(b.getAttribute('data-ai-copy'))];if(m&&navigator.clipboard)navigator.clipboard.writeText(aiDisplayContent(m.content)).catch(()=>{});}));
 root.querySelectorAll('[data-ai-csv]').forEach(b=>b.addEventListener('click',()=>{const ids=b.getAttribute('data-ai-csv').split('::'),m=AI_MESSAGES[Number(ids[0])],csv=aiCsvBlocks(aiDisplayContent(m&&m.content))[Number(ids[1])];if(!csv)return;const a=document.createElement('a');a.href=URL.createObjectURL(new Blob(['\ufeff'+csv],{type:'text/csv;charset=utf-8'}));a.download=aiCsvFileName(AI_ACTIVE_ASSISTANT.name);a.click();URL.revokeObjectURL(a.href);}));
}

async function sendAiMessage(){
  if(AI_SENDING)return; // 답을 기다리는 중 Ctrl+Enter 등으로 두 번 보내지 않는다
  const root=AI_ROOT.querySelector('#aiSection');
  const input=root&&root.querySelector('#aiInput');
  if(!input)return;
  const text=input.value;
  const err=aiChatInputError(text);
  const errEl=root.querySelector('#aiChatErr');
  if(err){if(errEl)errEl.textContent=err;return;}
  if(errEl)errEl.textContent='';
  const a=AI_ACTIVE_ASSISTANT;
  if(!a)return;
  const history=aiHistoryForRequest(AI_MESSAGES);
  if(aiConversationTooLong(history,text.trim().length)){
    // 서버 제한(20개·8,000자·40,000자)에 막힐 대화 — 일반 오류처럼 보이지 않게 새 대화 안내를 띄운다.
    if(aiConversationTooLong(history))renderActiveSection();
    else if(errEl)errEl.textContent='대화가 길어져 새 대화가 필요해요. 「새 대화」를 눌러 주세요.';
    return;
  }
  const sent={conv:AI_CONV,req:++AI_REQ};
  const userContent=AI_IMAGES.length?[{type:'text',text:text.trim()},...AI_IMAGES.map(url=>({type:'image_url',image_url:{url}}))]:text.trim();
  AI_MESSAGES.push({role:'user',content:userContent});
  AI_SENDING=true;
  renderActiveSection();
  let reply;
  try{
    const data=await aiUnwrapInvoke(await SB.functions.invoke('ai-assistant-chat',{body:{action:'chat',assistant_id:a.id,conversation_id:AI_CONVERSATION_ID,messages:aiHistoryForRequest(AI_MESSAGES)}}));
    if(!data||data.ok===false){
      reply={role:'assistant',content:aiErrorMessage(data&&data.error_kind),isError:true};
    }else{
      reply={role:'assistant',content:data.text||'',modelLabel:data.model_label||data.model_id||'',fallbackUsed:!!data.fallback_used,webSearchUsed:!!data.web_search_used,webSearchUnsupported:!!data.web_search_unsupported,sources:data.sources||[],images:data.images||[]};
    }
  }catch(e){
    reply={role:'assistant',content:aiErrorMessage('network_error'),isError:true};
  }
  // 그 사이 다른 대화를 열었거나 새 대화·새 요청이 생겼으면 이 응답은 버린다(다른 도우미 대화에 섞이지 않게).
  if(aiIsStaleResponse(sent,{conv:AI_CONV,req:AI_REQ}))return;
  AI_IMAGES=[];
  AI_MESSAGES.push(reply);
  AI_SENDING=false;
  renderActiveSection();
}

/* ── 원장 화면 1: 도우미 관리(설계서 4-3-1) ── */
function blankAssistant(){
  return {id:null,name:'',icon:'🤖',description:'',instructions:'',knowledge:'',model_ref:null,fallback_model_ref:null,effort:'',max_output_tokens:4000,visible_roles:['staff','manager','chief','owner'],enabled:true,web_search:false,starters:[]};
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
    '<div class="fld"><label>🔎 웹검색</label><input type="checkbox" id="aiFWebSearch"'+(a.web_search?' checked':'')+'></div>'+
    '<div class="fld w4"><label>💬 대화 시작 문장 (최대 4개, 각 120자)</label><div class="grid">'+[0,1,2,3].map(function(i){return '<input data-ai-starter-input="'+i+'" maxlength="120" value="'+escAi((a.starters||[])[i]||'')+'" placeholder="시작 문장 '+(i+1)+'">';}).join('')+'</div></div>'+
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
    web_search:wrap.querySelector('#aiFWebSearch').checked,
    starters:Array.from(wrap.querySelectorAll('[data-ai-starter-input]')).map(el=>el.value.trim()).filter(Boolean),
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
    await reloadAssistants(); // 직원 화면 카드(준비 여부·이름)도 최신으로
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
  try{const res=await SB.from('ai_assistants').update({enabled:!a.enabled}).eq('id',id);if(res.error)throw res.error;await reloadAssistants();}catch(e){AI_NOTICE=aiWriteErrorMessage('켜기·끄기',e);}
  await renderManageSection(AI_ROOT.querySelector('#aiSection'));
}
async function duplicateAssistant(id){
  const a=AI_ADMIN_ASSISTANTS.find(function(x){return x.id===id;});
  if(!a)return;
  const copy=Object.assign({},a);
  delete copy.id;delete copy.created_at;delete copy.updated_at;
  copy.name=(copy.name||'')+' 복제';
  try{const res=await SB.from('ai_assistants').insert(copy);if(res.error)throw res.error;await reloadAssistants();}catch(e){AI_NOTICE=aiWriteErrorMessage('복제',e);}
  await renderManageSection(AI_ROOT.querySelector('#aiSection'));
}
async function deleteAssistant(id){
  if(!confirm('이 도우미를 삭제할까요? 되돌릴 수 없습니다.'))return;
  try{const res=await SB.from('ai_assistants').delete().eq('id',id);if(res.error)throw res.error;await reloadAssistants();}catch(e){AI_NOTICE=aiWriteErrorMessage('삭제',e);}
  await renderManageSection(AI_ROOT.querySelector('#aiSection'));
}

/* ── 원장 화면 2: 모델 목록(설계서 4-3-2) ── */
function blankModel(){return {id:null,provider:'anthropic',model_id:'',label:'',enabled:true,supports_images:false,price_in_usd_per_mtok:null,price_out_usd_per_mtok:null,note:'',sort_order:0};}

async function renderModelsSection(root){
  root.innerHTML='<div class="empty">불러오는 중…</div>';
  try{
    const [res,prs]=await Promise.all([SB.from('ai_models').select('*').order('sort_order',{ascending:true}),SB.from('ai_providers').select('*').order('sort_order',{ascending:true})]);
    if(res.error)throw res.error;
    AI_ADMIN_MODELS=res.data||[];AI_PROVIDER_ROWS=prs.error?[]:(prs.data||[]);AI_PROVIDER_ROWS.forEach(p=>AI_PROVIDER_LABELS[p.id]=p.label);
  }catch(e){
    root.innerHTML='<div class="card"><div class="empty">불러오지 못했습니다: '+escAi((e&&e.message)||'')+'</div></div>';
    return;
  }
  drawModelsSection(root);
  loadProviderKeyStatus(root);
}
// 회사마다 서버에 열쇠가 등록돼 있는지(true/false만)를 원장 전용 Edge 동작에서 받아 회사 목록에 표시한다. 못 받으면 표시만 생략한다.
async function loadProviderKeyStatus(root){
  try{
    const data=await aiUnwrapInvoke(await SB.functions.invoke('ai-assistant-chat',{body:{action:'provider_status'}}));
    if(!data||data.ok===false||!Array.isArray(data.providers))return;
    AI_PROVIDER_KEYS={};
    data.providers.forEach(function(p){if(p&&typeof p.configured==='boolean')AI_PROVIDER_KEYS[p.id]=p.configured;});
    if(AI_ROOT&&AI_ROOT.querySelector('#aiSection')===root)drawProviderKeyBadges(root);
  }catch(e){/* 표시만 생략 */}
}
function drawProviderKeyBadges(root){
  Array.prototype.forEach.call(root.querySelectorAll('[data-ai-provider-badge]'),function(el){el.innerHTML=aiProviderKeyBadge(AI_PROVIDER_KEYS,el.getAttribute('data-ai-provider-badge'));});
}

function drawModelsSection(root){
  const groups=aiGroupModelsByProvider(AI_ADMIN_MODELS,{onlyEnabled:false});
  root.innerHTML='<div class="card">'+aiNoticeHtml()+
    '<div class="rowflex" style="justify-content:space-between;align-items:center"><h2>🧠 모델 목록</h2>'+
    '<div class="rowflex"><button class="mini" data-ai-new-model>모델 직접 추가</button><button class="mini" data-ai-fetch-models>회사별 목록 불러오기</button></div></div>'+
    (groups.map(function(g){
      return '<h3>'+escAi(g.label)+'</h3><div class="tblwrap"><table><tr><th>표시 이름</th><th>모델 이름</th><th>켜짐</th><th>📷 사진</th><th>가격(100만 토큰당)</th><th>메모</th><th></th></tr>'+
        g.models.map(function(m){
          return '<tr><td>'+escAi(m.label)+'</td><td class="sub">'+escAi(m.model_id)+'</td>'+
            '<td><span class="b '+(m.enabled?'ok':'no')+'">'+(m.enabled?'켜짐':'꺼짐')+'</span></td>'+
            '<td><span class="b '+(m.supports_images?'ok':'no')+'">'+(m.supports_images?'읽음':'못 읽음')+'</span></td>'+
            '<td class="sub">'+escAi(aiModelPriceLabel(m))+'</td>'+
            '<td class="sub">'+escAi(m.note||'')+'</td>'+
            '<td class="rowflex">'+
            '<button class="mini" data-ai-edit-model="'+m.id+'">고치기</button>'+
            '<button class="mini" data-ai-toggle-model="'+m.id+'">'+(m.enabled?'끄기':'켜기')+'</button>'+
            '<button class="mini" data-ai-toggle-images="'+m.id+'">'+(m.supports_images?'사진 끄기':'사진 켜기')+'</button>'+
            '<button class="mini" data-ai-test-model="'+m.id+'">시험</button>'+
            '<button class="mini rej" data-ai-del-model="'+m.id+'">삭제</button>'+
            '</td></tr>';
        }).join('')+'</table></div>';
    }).join('')||'<div class="empty">아직 등록된 모델이 없습니다.</div>')+
    '<div id="aiModelTestResult"></div></div>'+
    '<div id="aiModelFormWrap"></div><div id="aiModelFetchResult"></div>';
  root.insertAdjacentHTML('beforeend','<div class="card"><h3>회사 목록</h3>'+AI_PROVIDER_ROWS.map(p=>'<div class="rowflex"><span>'+escAi(p.label)+' · '+escAi(p.id)+' · '+escAi(p.base_url)+' · '+escAi(p.key_env)+'</span><span data-ai-provider-badge="'+escAi(p.id)+'">'+aiProviderKeyBadge(AI_PROVIDER_KEYS,p.id)+'</span><button class="mini" data-ai-provider-toggle="'+escAi(p.id)+'">'+(p.enabled?'끄기':'켜기')+'</button></div>').join('')+'<h4>OpenAI 호환 회사 추가</h4><div class="grid"><input id="aiProviderId" placeholder="회사 ID"><input id="aiProviderLabel" placeholder="화면 이름"><input id="aiProviderUrl" placeholder="https://API 주소/v1"><input id="aiProviderKey" placeholder="MYAI_API_KEY (이름만)"></div><button class="mini stamp" data-ai-provider-save>회사 추가</button><div class="hint" id="aiProviderMsg"></div></div>');
  root.querySelectorAll('[data-ai-provider-toggle]').forEach(b=>b.addEventListener('click',async()=>{const p=AI_PROVIDER_ROWS.find(x=>x.id===b.getAttribute('data-ai-provider-toggle'));if(p){const r=await SB.from('ai_providers').update({enabled:!p.enabled}).eq('id',p.id);if(r.error)AI_NOTICE=aiWriteErrorMessage('회사 켜기·끄기',r.error);await renderModelsSection(AI_ROOT.querySelector('#aiSection'));}}));
  const providerSave=root.querySelector('[data-ai-provider-save]');if(providerSave)providerSave.addEventListener('click',saveProvider);
  root.querySelector('[data-ai-new-model]').addEventListener('click',function(){openModelForm(null);});
  root.querySelector('[data-ai-fetch-models]').addEventListener('click',fetchModelLists);
  Array.prototype.forEach.call(root.querySelectorAll('[data-ai-edit-model]'),function(b){b.addEventListener('click',function(){openModelForm(b.getAttribute('data-ai-edit-model'));});});
  Array.prototype.forEach.call(root.querySelectorAll('[data-ai-toggle-model]'),function(b){b.addEventListener('click',function(){toggleModelEnabled(b.getAttribute('data-ai-toggle-model'));});});
  Array.prototype.forEach.call(root.querySelectorAll('[data-ai-toggle-images]'),function(b){b.addEventListener('click',function(){toggleModelImages(b.getAttribute('data-ai-toggle-images'));});});
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
  const providers=Array.from(new Set([...Object.keys(AI_PROVIDER_LABELS),...AI_PROVIDER_ROWS.map(x=>x.id)]));
  wrap.innerHTML='<div class="card"><h2>'+(m.id?'모델 고치기':'모델 직접 추가')+'</h2><div class="grid">'+
    '<div class="fld"><label>회사</label><select id="aiMProvider">'+providers.map(function(p){return '<option value="'+p+'"'+(m.provider===p?' selected':'')+'>'+escAi(aiProviderLabel(p))+'</option>';}).join('')+'</select></div>'+
    '<div class="fld"><label>모델 이름(API 이름 그대로)</label><input id="aiMModelId" value="'+escAi(m.model_id)+'"></div>'+
    '<div class="fld"><label>📷 사진 읽기 (확인된 모델만 켜기)</label><input type="checkbox" id="aiMImages"'+(m.supports_images?' checked':'')+'></div>'+
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
    supports_images:wrap.querySelector('#aiMImages').checked,
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
    await reloadAssistants(); // 모델을 켜고 끄면 도우미 ready가 바뀜
    await renderModelsSection(AI_ROOT.querySelector('#aiSection'));
  }catch(e){
    if(msgEl)msgEl.textContent=aiWriteErrorMessage('저장',e);
  }
}

async function toggleModelEnabled(id){
  const m=AI_ADMIN_MODELS.find(function(x){return x.id===id;});
  if(!m)return;
  try{const res=await SB.from('ai_models').update({enabled:!m.enabled}).eq('id',id);if(res.error)throw res.error;await reloadAssistants();}catch(e){AI_NOTICE=aiWriteErrorMessage('켜기·끄기',e);}
  await renderModelsSection(AI_ROOT.querySelector('#aiSection'));
}
async function toggleModelImages(id){
  const m=AI_ADMIN_MODELS.find(function(x){return x.id===id;});
  if(!m)return;
  try{const res=await SB.from('ai_models').update({supports_images:!m.supports_images}).eq('id',id);if(res.error)throw res.error;await reloadAssistants();}catch(e){AI_NOTICE=aiWriteErrorMessage('사진 켜기·끄기',e);}
  await renderModelsSection(AI_ROOT.querySelector('#aiSection'));
}
async function deleteModel(id){
  if(!confirm('이 모델을 삭제할까요?'))return;
  try{const res=await SB.from('ai_models').delete().eq('id',id);if(res.error)throw res.error;await reloadAssistants();}catch(e){AI_NOTICE=aiWriteErrorMessage('삭제',e);}
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
async function saveProvider(){
 const box=AI_ROOT.querySelector('#aiSection'),id=box.querySelector('#aiProviderId').value.trim(),label=box.querySelector('#aiProviderLabel').value.trim(),base_url=box.querySelector('#aiProviderUrl').value.trim(),key_env=box.querySelector('#aiProviderKey').value.trim(),msg=box.querySelector('#aiProviderMsg');
 if(!/^[a-z][a-z0-9_-]{1,30}$/.test(id)||!label||!/^https:\/\/[^\s]+$/.test(base_url)||!/^[A-Z][A-Z0-9_]{1,60}_API_KEY$/.test(key_env)||key_env.startsWith('SUPABASE')){msg.textContent='회사 ID·이름·https 주소·열쇠 이름을 확인하세요.';return;}
 try{const res=await SB.from('ai_providers').insert({id,label,kind:'openai_compat',base_url,key_env,enabled:true,sort_order:100});if(res.error)throw res.error;await renderModelsSection(box);}catch(e){msg.textContent=aiWriteErrorMessage('회사 저장',e);}
}async function fetchModelLists(){
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
async function renderTranscriptsSection(root){
 root.innerHTML='<div class="empty">불러오는 중…</div>';
 try{
  const [pr,as]=await Promise.all([SB.from('profiles').select('user_id,name'),SB.from('ai_assistants').select('id,name').order('name')]);
  const names={};(pr.data||[]).forEach(x=>names[x.user_id]=x.name||x.user_id);
  const filters='<div class="rowflex"><label>직원 <select id="aiTranscriptUser"><option value="">전체</option>'+Object.entries(names).map(([id,n])=>'<option value="'+escAi(id)+'">'+escAi(n)+'</option>').join('')+'</select></label><label>도우미 <select id="aiTranscriptAssistant"><option value="">전체</option>'+((as.data||[]).map(x=>'<option value="'+escAi(x.name)+'">'+escAi(x.name)+'</option>').join(''))+'</select></label><label>시작일 <input id="aiTranscriptFrom" type="date"></label><label>종료일 <input id="aiTranscriptTo" type="date"></label><button class="mini" id="aiTranscriptFilter">거르기</button></div>';
  root.innerHTML='<div class="card"><h2>🗂️ 대화록</h2>'+filters+'<div id="aiTranscriptRows" class="sub">불러오는 중…</div><div class="rowflex"><button class="mini" id="aiTranscriptPrev">이전</button><span id="aiTranscriptPage"></span><button class="mini" id="aiTranscriptNext">다음 50개</button></div><div id="aiTranscriptDetail"></div></div>';
  const load=async()=>{
   const user=root.querySelector('#aiTranscriptUser').value,assistant=root.querySelector('#aiTranscriptAssistant').value,from=root.querySelector('#aiTranscriptFrom').value,to=root.querySelector('#aiTranscriptTo').value;
   let q=SB.from('ai_assistant_conversations').select('id,user_id,assistant_name,started_at,last_at').order('last_at',{ascending:false}).range(AI_TRANSCRIPT_OFFSET,AI_TRANSCRIPT_OFFSET+49);
   if(user)q=q.eq('user_id',user);if(assistant)q=q.eq('assistant_name',assistant);if(from)q=q.gte('last_at',new Date(from+'T00:00:00').toISOString());if(to)q=q.lte('last_at',new Date(to+'T23:59:59.999').toISOString());
   const c=await q;if(c.error)throw c.error;const rows=c.data||[],ids=rows.map(x=>x.id);let grouped={};
   if(ids.length){const mr=await SB.from('ai_assistant_messages').select('conversation_id,role,content').in('conversation_id',ids).order('created_at',{ascending:true});if(mr.error)throw mr.error;(mr.data||[]).forEach(m=>(grouped[m.conversation_id]||(grouped[m.conversation_id]=[])).push(m));}
   root.querySelector('#aiTranscriptRows').innerHTML=rows.map(x=>{const ms=grouped[x.id]||[],first=ms.find(m=>m.role==='user')?.content||'';return '<div class="rowflex"><span>'+escAi(new Date(x.last_at).toLocaleString('ko-KR'))+'</span><span>'+escAi(names[x.user_id]||x.user_id)+'</span><span>'+escAi(x.assistant_name)+'</span><span>'+escAi(String(first).slice(0,40))+'</span><span>'+ms.filter(m=>m.role==='user').length+'회 대화</span><button class="mini" data-ai-transcript="'+escAi(x.id)+'">열기</button></div>';}).join('')||'<p class="empty">대화가 없습니다.</p>';
   root.querySelector('#aiTranscriptPage').textContent=''+(Math.floor(AI_TRANSCRIPT_OFFSET/50)+1)+'쪽';root.querySelector('#aiTranscriptPrev').disabled=AI_TRANSCRIPT_OFFSET===0;root.querySelector('#aiTranscriptNext').disabled=rows.length<50;
   root.querySelectorAll('[data-ai-transcript]').forEach(btn=>btn.addEventListener('click',async()=>{const d=await SB.from('ai_assistant_messages').select('*').eq('conversation_id',btn.getAttribute('data-ai-transcript')).order('created_at',{ascending:true}),box=root.querySelector('#aiTranscriptDetail');if(d.error){box.textContent='대화 내용을 불러오지 못했습니다.';return;}box.innerHTML=(d.data||[]).map(m=>'<div class="ai-msg ai-msg-'+m.role+'"><div class="ai-msg-who">'+(m.role==='user'?'직원':'AI')+'</div><div class="ai-msg-body">'+escAi(m.content)+'</div>'+(m.image_count?'<div class="sub">사진 '+m.image_count+'장</div>':'')+'</div>').join('')||'<p class="empty">내용이 없습니다.</p>'; }));
  };
  root.querySelector('#aiTranscriptFilter').addEventListener('click',()=>{AI_TRANSCRIPT_OFFSET=0;load().catch(()=>{});});root.querySelector('#aiTranscriptPrev').addEventListener('click',()=>{AI_TRANSCRIPT_OFFSET=Math.max(0,AI_TRANSCRIPT_OFFSET-50);load().catch(()=>{});});root.querySelector('#aiTranscriptNext').addEventListener('click',()=>{AI_TRANSCRIPT_OFFSET+=50;load().catch(()=>{});});await load();
 }catch(_){root.innerHTML='<div class="card"><div class="empty">대화록을 불러오지 못했습니다.</div></div>';}
}
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
      rows.map(function(r){return '<tr><td>'+escAi(r.key)+'</td><td>'+r.count+'</td><td>'+r.input_tokens.toLocaleString('ko-KR')+'</td><td>'+r.output_tokens.toLocaleString('ko-KR')+'</td><td>'+aiCostSummaryLabel(r.cost_usd,r.unknown,r.known)+'</td></tr>';}).join('')+
      '</table></div>'):'<div class="empty">기록이 없습니다.</div>';
  };
  root.innerHTML='<div class="card"><h2>📊 사용 기록 <span class="sub">(최근 30일)</span></h2>'+
    '<div class="rowflex">'+
    '<div class="stat"><div class="sub">전체 건수</div><div>'+s.totalCount+'건</div></div>'+
    '<div class="stat"><div class="sub">입력 토큰</div><div>'+s.totalInput.toLocaleString('ko-KR')+'</div></div>'+
    '<div class="stat"><div class="sub">출력 토큰</div><div>'+s.totalOutput.toLocaleString('ko-KR')+'</div></div>'+
    '<div class="stat"><div class="sub">추정 금액</div><div>'+aiCostSummaryLabel(s.totalCostUsd,s.totalUnknown,s.totalKnown)+'</div></div>'+
    '</div>'+
    '<h3>날짜별</h3>'+rowsHtml(s.byDate,'날짜')+
    '<h3>도우미별</h3>'+rowsHtml(s.byAssistant,'도우미')+
    '<h3>직원별</h3>'+rowsHtml(s.byUser,'직원')+
    '<h3>모델별</h3>'+rowsHtml(s.byModel,'모델')+
    '</div>';
}

window.AIAssistants={render:renderAIAssistants};
})();
