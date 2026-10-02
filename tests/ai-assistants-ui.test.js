const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.join(__dirname,'..'),read=p=>fs.readFileSync(path.join(root,p),'utf8');
const js=read('ai-assistants.js');
function helpers(){
  const block=js.match(/\/\* ai-assistants:test-start \*\/[\s\S]*?\/\* ai-assistants:test-end \*\//)?.[0];
  assert.ok(block,'ai-assistants.js에 순수 helper 블록이 없습니다.');
  const c={};
  vm.createContext(c);
  vm.runInContext(block+';this.h={aiRoleLabel,aiProviderLabel,aiWon,aiWonLabel,aiModelPriceLabel,aiGroupModelsByProvider,aiAssistantFormErrors,aiChatInputError,aiErrorMessage,aiAdminAssistantReady,aiUsageSummarize,aiNormalizeInvokeError,aiUnwrapInvoke,aiWriteErrorMessage,aiIsStaleResponse,aiUserChanged,aiHistoryForRequest,aiConversationTooLong,aiCostSummaryLabel,aiHelpSectionsFor,aiHelpErrorRows,AI_HELP_SECTIONS,AI_HELP_EXAMPLES,AI_ERROR_MESSAGES,aiCsvFileName,aiCsvBlocks,aiPhotoNotice,aiProviderKeyBadge};',c);
  return c.h;
}

test('v2 화면은 대화록·웹검색·사진·시작 문장·회사 관리·CSV를 제공하고 저장 안내를 표시하지 않는다',()=>{
  assert.match(js,/key:'transcripts',label:/);
  assert.match(js,/id="aiFWebSearch"/);
  assert.match(js,/id="aiPhotos"/);
  assert.match(js,/data-ai-starter-input/);
  assert.match(js,/회사 목록/);
  assert.match(js,/data-ai-csv/);
  assert.doesNotMatch(js,/대화는 저장되지 않아요|대화 내용은 업무 확인을 위해 저장되며 원장만 볼 수 있어요/);
  assert.doesNotMatch(js,/업무 확인을 위해 저장되며 원장만 볼 수 있어요/);
  assert.doesNotMatch(js,/사용 기록으로 남고|원장이 볼 수 있어요/); // 원장 지시 10-01 — 직원 화면에 기록·열람 안내 문구 없음
});

test('역할 이름 바꾸기: 4개 역할을 한국어로, 모르는 값은 그대로 돌려준다',()=>{
  const h=helpers();
  assert.equal(h.aiRoleLabel('staff'),'직원');
  assert.equal(h.aiRoleLabel('manager'),'매니저');
  assert.equal(h.aiRoleLabel('chief'),'실장');
  assert.equal(h.aiRoleLabel('owner'),'원장');
  assert.equal(h.aiRoleLabel('weird'),'weird');
  assert.equal(h.aiRoleLabel(''),'');
});

test('원화 가격 표시: 1달러=1,500원 고정 환산이고 모르면 "모름"이다',()=>{
  const h=helpers();
  assert.equal(h.aiWon(1),1500);
  assert.equal(h.aiWon(2.5),3750);
  assert.equal(h.aiWon(null),null);
  assert.equal(h.aiWon(undefined),null);
  assert.equal(h.aiWon('abc'),null);
  assert.equal(h.aiWonLabel(4),'₩6,000');
  assert.equal(h.aiWonLabel(null),'모름');
  const label=h.aiModelPriceLabel({price_in_usd_per_mtok:2,price_out_usd_per_mtok:10});
  assert.equal(label,'입력 ₩3,000/출력 ₩15,000 (100만 토큰당)');
  assert.equal(h.aiModelPriceLabel({price_in_usd_per_mtok:null,price_out_usd_per_mtok:null}),'입력 모름/출력 모름 (100만 토큰당)');
});

test('모델 회사별 묶기: 설계서 회사 순서대로 묶고 꺼진 모델은 기본으로 뺀다',()=>{
  const h=helpers();
  const models=[
    {id:'m1',provider:'openai',model_id:'gpt-6-sol',label:'GPT-6 Sol',enabled:true},
    {id:'m2',provider:'anthropic',model_id:'claude-opus-5-5',label:'Claude Opus 5.5',enabled:true},
    {id:'m3',provider:'anthropic',model_id:'claude-haiku-4-5',label:'Claude Haiku 4.5',enabled:false},
    {id:'m4',provider:'deepseek',model_id:'deepseek-flash',label:'DeepSeek Flash',enabled:true},
  ];
  const onlyEnabled=[...h.aiGroupModelsByProvider(models)];
  assert.deepEqual(onlyEnabled.map(g=>g.provider),['anthropic','openai','deepseek']);
  assert.equal(onlyEnabled[0].models.length,1);
  assert.equal(onlyEnabled[0].models[0].id,'m2');
  const all=[...h.aiGroupModelsByProvider(models,{onlyEnabled:false})];
  const anthropicGroup=all.find(g=>g.provider==='anthropic');
  assert.equal(anthropicGroup.models.length,2);
  const unknown=[...h.aiGroupModelsByProvider([{id:'m5',provider:'xai',model_id:'grok',label:'Grok',enabled:true}])];
  assert.equal(unknown[0].provider,'xai');
  assert.equal(unknown[0].label,'xai');
});

test('양식 검사: 이름·참고자료·답 길이·생각 깊이·보이는 역할을 확인한다',()=>{
  const h=helpers();
  assert.deepEqual([...h.aiAssistantFormErrors({name:'리뷰 답글',visible_roles:['staff']})],[]);
  assert.deepEqual([...h.aiAssistantFormErrors({name:'',visible_roles:['staff']})],['이름을 입력하세요.']);
  assert.deepEqual([...h.aiAssistantFormErrors({name:'a'.repeat(41),visible_roles:['staff']})],['이름은 40자 이하로 입력하세요.']);
  assert.deepEqual([...h.aiAssistantFormErrors({name:'ok',knowledge:'a'.repeat(60001),visible_roles:['staff']})],['참고자료는 60,000자 이하로 입력하세요.']);
  assert.deepEqual([...h.aiAssistantFormErrors({name:'ok',max_output_tokens:100,visible_roles:['staff']})],['답 최대 길이는 256~32,000 사이로 입력하세요.']);
  assert.deepEqual([...h.aiAssistantFormErrors({name:'ok',max_output_tokens:40000,visible_roles:['staff']})],['답 최대 길이는 256~32,000 사이로 입력하세요.']);
  assert.deepEqual([...h.aiAssistantFormErrors({name:'ok',effort:'extreme',visible_roles:['staff']})],['생각 깊이 값이 올바르지 않습니다.']);
  assert.deepEqual([...h.aiAssistantFormErrors({name:'ok',visible_roles:[]})],['보이는 역할을 하나 이상 고르세요.']);
  const many=[...h.aiAssistantFormErrors({name:'',max_output_tokens:1,visible_roles:[]})];
  assert.equal(many.length,3);
});

test('채팅 입력 검사: 빈 값·너무 긴 값을 걸러낸다',()=>{
  const h=helpers();
  assert.equal(h.aiChatInputError('  '),'보낼 말을 입력하세요.');
  assert.equal(h.aiChatInputError('안녕하세요'),'');
  assert.equal(h.aiChatInputError('a'.repeat(8001)),'한 번에 8,000자까지 보낼 수 있어요. 나눠서 보내 주세요.');
  assert.equal(h.aiChatInputError('a'.repeat(8000)),'');
});

test('오류 문장 고르기: error_kind마다 쉬운 한국어 문장, 모르는 값은 기본 문장',()=>{
  const h=helpers();
  assert.equal(h.aiErrorMessage('model_not_set'),'원장이 아직 이 도우미의 AI를 고르지 않았어요.');
  assert.equal(h.aiErrorMessage('rate_limited'),'짧은 시간에 너무 많이 요청했어요. 잠시 후 다시 시도해 주세요.');
  assert.equal(h.aiErrorMessage('provider_not_configured'),'이 AI 회사 연결이 아직 준비되지 않았어요.');
  assert.equal(h.aiErrorMessage('never_seen_before'),'오류가 있었어요. 잠시 후 다시 시도해 주세요.');
  assert.equal(h.aiErrorMessage(undefined),'오류가 있었어요. 잠시 후 다시 시도해 주세요.');
});

test('도우미 준비 여부: 모델이 없거나 꺼져 있으면 false',()=>{
  const h=helpers();
  const modelsById={m1:{id:'m1',enabled:true},m2:{id:'m2',enabled:false}};
  assert.equal(h.aiAdminAssistantReady({model_ref:'m1'},modelsById),true);
  assert.equal(h.aiAdminAssistantReady({model_ref:'m2'},modelsById),false);
  assert.equal(h.aiAdminAssistantReady({model_ref:null},modelsById),false);
  assert.equal(h.aiAdminAssistantReady({model_ref:'m9'},modelsById),false);
  assert.equal(h.aiAdminAssistantReady(null,modelsById),false);
});

test('사용 기록 합산: 날짜·도우미·직원·모델별로 건수·토큰·금액을 더한다',()=>{
  const h=helpers();
  const rows=[
    {created_at:'2026-09-28T01:00:00+00:00',assistant_name:'리뷰 답글',user_name:'김직원',provider:'anthropic',model_id:'claude-sonnet-5-5',input_tokens:100,output_tokens:50,est_cost_usd:0.01},
    {created_at:'2026-09-28T02:00:00+00:00',assistant_name:'리뷰 답글',user_name:'김직원',provider:'anthropic',model_id:'claude-sonnet-5-5',input_tokens:200,output_tokens:80,est_cost_usd:0.02},
    {created_at:'2026-09-27T09:00:00+00:00',assistant_name:'공지 요약',user_name:'박실장',provider:'openai',model_id:'gpt-6-sol',input_tokens:50,output_tokens:20,est_cost_usd:null},
  ];
  const s=h.aiUsageSummarize(rows);
  assert.equal(s.totalCount,3);
  assert.equal(s.totalInput,350);
  assert.equal(s.totalOutput,150);
  assert.ok(Math.abs(s.totalCostUsd-0.03)<1e-9);
  assert.equal(s.totalCostWon,45);
  assert.deepEqual([...s.byDate].map(r=>r.key),['2026-09-28','2026-09-27']);
  assert.equal(s.byDate[0].count,2);
  const byAssistant=Object.fromEntries([...s.byAssistant].map(r=>[r.key,r]));
  assert.equal(byAssistant['리뷰 답글'].count,2);
  assert.equal(byAssistant['리뷰 답글'].input_tokens,300);
  assert.equal(byAssistant['공지 요약'].count,1);
  const byUser=Object.fromEntries([...s.byUser].map(r=>[r.key,r]));
  assert.equal(byUser['김직원'].count,2);
  const byModel=Object.fromEntries([...s.byModel].map(r=>[r.key,r]));
  assert.equal(byModel['anthropic / claude-sonnet-5-5'].count,2);
  assert.equal(h.aiUsageSummarize([]).totalCount,0);
  assert.equal(h.aiUsageSummarize(null).totalCount,0);
});

test('hr.html 연결: TABS·MENU에 ai 탭이 있고 render()가 window.AIAssistants.render를 부른다',()=>{
  const html=read('hr.html');
  assert.match(html,/\{key:'ai',\s*label:'🤖 AI 도우미',roles:\['staff','manager','chief','owner'\]\}/);
  assert.match(html,/\{kind:'tab',\s*key:'ai',\s*children:\[\]\}/);
  assert.match(html,/TAB==='ai'\)\{if\(window\.AIAssistants\)await window\.AIAssistants\.render\(m,\{sb,me:ME\}\)/);
  assert.match(html,/<script src="ai-assistants\.js\?v=\d+"><\/script>/);
});

test('functions.invoke 오류: 2xx가 아니면 error.context 본문에서 error_kind를 꺼내 한국어 문장으로 이어진다',async()=>{
  const h=helpers();
  const httpErr=(status,body)=>({name:'FunctionsHttpError',context:{status,json:async()=>{if(body===undefined)throw new Error('not json');return body;}}});
  const a=await h.aiUnwrapInvoke({data:null,error:httpErr(409,{ok:false,error_kind:'model_not_set',message:'x'})});
  assert.equal(a.ok,false);assert.equal(a.error_kind,'model_not_set');
  assert.equal(h.aiErrorMessage(a.error_kind),'원장이 아직 이 도우미의 AI를 고르지 않았어요.');
  const b=await h.aiUnwrapInvoke({data:null,error:httpErr(429,{ok:false,error_kind:'rate_limited'})});
  assert.equal(b.error_kind,'rate_limited');
  // 게이트웨이가 준 본문(error_kind 없음)은 HTTP 상태로 짐작한다
  assert.equal((await h.aiUnwrapInvoke({data:null,error:httpErr(401,{code:401,message:'Invalid JWT'})})).error_kind,'unauthenticated');
  assert.equal((await h.aiUnwrapInvoke({data:null,error:httpErr(502,undefined)})).error_kind,'upstream_error');
  assert.equal((await h.aiUnwrapInvoke({data:null,error:{name:'FunctionsFetchError'}})).error_kind,'network_error');
  assert.equal((await h.aiUnwrapInvoke({data:null,error:{name:'FunctionsRelayError'}})).error_kind,'upstream_error');
  const ok=await h.aiUnwrapInvoke({data:{ok:true,text:'OK'},error:null});
  assert.equal(ok.ok,true);assert.equal(ok.text,'OK');
  assert.equal((await h.aiUnwrapInvoke({data:null,error:null})).error_kind,'unknown');
});

test('백엔드 error_kind 전부가 화면 문장표에 있다(core.mjs ERROR_MESSAGES_KO와 같은 키)',()=>{
  const core=read('supabase/functions/ai-assistant-chat/core.mjs');
  const block=core.match(/export const ERROR_MESSAGES_KO = \{([\s\S]*?)\r?\n\};/)[1];
  const kinds=[...block.matchAll(/^\s+(\w+):/gm)].map(m=>m[1]).filter(k=>k!=='unknown');
  assert.ok(kinds.length>=10);
  const h=helpers();
  const generic=h.aiErrorMessage('never_seen_before');
  kinds.forEach(k=>assert.notEqual(h.aiErrorMessage(k),generic,k+' 문장이 화면에 없음'));
});

test('양식 검사: 설명 200자·지침서 20,000자 제한(DB check와 맞춤)',()=>{
  const h=helpers();
  assert.deepEqual([...h.aiAssistantFormErrors({name:'ok',description:'a'.repeat(201),visible_roles:['staff']})],['설명은 200자 이하로 입력하세요.']);
  assert.deepEqual([...h.aiAssistantFormErrors({name:'ok',instructions:'a'.repeat(20001),visible_roles:['staff']})],['지침서는 20,000자 이하로 입력하세요.']);
});

test('저장·삭제·토글 실패 알림: 동작 이름과 이유를 짧은 한국어로 알려 준다',()=>{
  const h=helpers();
  assert.equal(h.aiWriteErrorMessage('저장',{code:'23505'}),'저장하지 못했어요 — 같은 이름이 이미 있어요.');
  assert.equal(h.aiWriteErrorMessage('삭제',{code:'23503'}),'삭제하지 못했어요 — 다른 곳에서 쓰고 있어서 처리할 수 없어요.');
  assert.equal(h.aiWriteErrorMessage('켜기·끄기',{code:'42501'}),'켜기·끄기하지 못했어요 — 권한이 없어요.');
  assert.equal(h.aiWriteErrorMessage('복제',{message:'new row violates row-level security policy'}),'복제하지 못했어요 — 권한이 없어요.');
  assert.equal(h.aiWriteErrorMessage('저장',{code:'23514'}),'저장하지 못했어요 — 입력한 값이 허용 범위를 벗어났어요.');
  assert.equal(h.aiWriteErrorMessage('저장',{message:'TypeError: Failed to fetch'}),'저장하지 못했어요 — 인터넷 연결을 확인해 주세요.');
  assert.equal(h.aiWriteErrorMessage('저장',null),'저장하지 못했어요 — 다시 시도해 주세요.');
  assert.equal(h.aiWriteErrorMessage(undefined,{}),'저장하지 못했어요 — 다시 시도해 주세요.');
});

test('원장 화면의 저장·삭제·토글은 실패를 삼키지 않고 알림을 세운다',()=>{
  assert.ok(!/catch\(e\)\{\}/.test(js),'빈 catch가 남아 있음');
  const uses=(js.match(/AI_NOTICE=aiWriteErrorMessage\(/g)||[]).length;
  assert.ok(uses>=5,'토글·복제·삭제 5곳에 알림 필요: '+uses);
  assert.ok((js.match(/msgEl\.textContent=aiWriteErrorMessage\('저장',e\)/g)||[]).length>=2,'두 저장 양식도 알림 사용');
});

test('대화 섞임 방지 helper: 대화·요청 번호가 다르면 오래된 응답, 사용자가 바뀌면 초기화, 오류 문장은 서버로 안 보낸다',()=>{
  const h=helpers();
  assert.equal(h.aiIsStaleResponse({conv:1,req:2},{conv:1,req:2}),false);
  assert.equal(h.aiIsStaleResponse({conv:1,req:2},{conv:2,req:2}),true);
  assert.equal(h.aiIsStaleResponse({conv:1,req:2},{conv:1,req:3}),true);
  assert.equal(h.aiIsStaleResponse(null,{conv:1,req:1}),true);
  assert.equal(h.aiUserChanged(null,'u1'),false);
  assert.equal(h.aiUserChanged('u1','u1'),false);
  assert.equal(h.aiUserChanged('u1','u2'),true);
  assert.equal(h.aiUserChanged('u1',undefined),true);
  const hist=h.aiHistoryForRequest([{role:'user',content:'a'},{role:'assistant',content:'오류',isError:true,modelLabel:'x'},{role:'assistant',content:'b',modelLabel:'m'}]);
  assert.deepEqual(JSON.parse(JSON.stringify(hist)),[{role:'user',content:'a'},{role:'assistant',content:'b'}]);
});

test('대화 길이 한도: 메시지 20개·개별 8,000자·합계 40,000자에 닿으면 새 대화가 필요하다',()=>{
  const h=helpers();
  const msg=(n,c='a')=>Array.from({length:n},(_,i)=>({role:i%2?'assistant':'user',content:c}));
  assert.equal(h.aiConversationTooLong(msg(0)),false);
  assert.equal(h.aiConversationTooLong(msg(19)),false);
  assert.equal(h.aiConversationTooLong(msg(20)),true,'20개가 차면 다음 전송(21번째)이 막힘');
  assert.equal(h.aiConversationTooLong([{role:'assistant',content:'a'.repeat(8001)}]),true,'긴 답 뒤엔 다음 전송이 막힘');
  assert.equal(h.aiConversationTooLong([{role:'assistant',content:'a'.repeat(8000)}]),false);
  assert.equal(h.aiConversationTooLong(msg(6,'a'.repeat(7000)),100),true,'합계 40,000자 초과');
  assert.equal(h.aiConversationTooLong(msg(4,'a'.repeat(7000)),100),false);
});

test('사용 기록: 가격 미상(null)·기록 중(pending)은 0원으로 더하지 않고 미상 건수로 센다',()=>{
  const h=helpers();
  const s=h.aiUsageSummarize([
    {status:'ok',provider:'a',model_id:'x',input_tokens:1,output_tokens:1,est_cost_usd:0.002,created_at:'2026-09-29T00:00:00Z'},
    {status:'ok',provider:'a',model_id:'y',input_tokens:1,output_tokens:1,est_cost_usd:null,created_at:'2026-09-29T00:00:00Z'},
    {status:'pending',provider:'a',model_id:'x',input_tokens:0,output_tokens:0,est_cost_usd:null,created_at:'2026-09-29T00:00:00Z'},
    {status:'error',provider:'a',model_id:'x',input_tokens:0,output_tokens:0,est_cost_usd:null,created_at:'2026-09-29T00:00:00Z'},
    {status:'error',provider:'a',model_id:'x',input_tokens:100,output_tokens:50,est_cost_usd:0.001,created_at:'2026-09-29T00:00:00Z'},
  ]);
  // 상태와 무관: 금액이 null이거나 pending이면 미상(오류+토큰 없음 포함), 숫자인 것만 확인된 금액(오류+토큰 있음 → 계산된 금액)
  assert.equal(s.totalUnknown,3);assert.equal(s.totalKnown,2);
  assert.ok(Math.abs(s.totalCostUsd-0.003)<1e-12);
  const byModel=Object.fromEntries([...s.byModel].map(r=>[r.key,r]));
  assert.equal(byModel['a / y'].unknown,1);assert.equal(byModel['a / y'].known,0);
  assert.equal(h.aiCostSummaryLabel(0.002,0,3),'₩3');
  assert.equal(h.aiCostSummaryLabel(0.002,2,2),'확인된 금액 ₩3 · 미상 2건');
  assert.equal(h.aiCostSummaryLabel(0,1,0),'금액 모름 · 미상 1건');
});

test('hr.html: 역할별·개인별 탭 설정 목록에 ai가 들어 있다(2곳)',()=>{
  const html=read('hr.html');
  const hits=html.match(/\['att','deposit','sched','leave','appr','notice','onbo','ai'\]/g)||[];
  assert.equal(hits.length,2);
});

// ── 화면 전체를 가짜 DOM으로 돌려 보는 시험(대화 섞임·다시 조회) ──
function harness(opts){
  const handlers={},rpcCalls=[],invokes=[];
  const registry={};
  function attrs(html,name){const out=[];const re=new RegExp('data-'+name+'(?:="([^"]*)")?','g');let m;while((m=re.exec(html)))out.push(m[1]==null?'':m[1]);return out;}
  function listAll(el,sel){
    const m=sel.match(/^\[data-([\w-]+)\]$/);if(!m)return [];
    return attrs(el.innerHTML,m[1]).map(function(v){return {addEventListener(t,f){handlers['['+m[1]+']='+v+'|'+t]=f;},getAttribute(){return v;}};});
  }
  function makeEl(key){
    const el={innerHTML:'',value:'',textContent:'',scrollTop:0,scrollHeight:0,focus(){},
      addEventListener(t,f){handlers[key+'|'+t]=f;},
      querySelector(sel){return getEl(sel);},
      querySelectorAll(sel){return listAll(el,sel);},
      getAttribute(){return '';}};
    return el;
  }
  function getEl(sel){
    if(sel[0]==='#'){registry[sel]=registry[sel]||makeEl(sel);return registry[sel];}
    const k=sel.replace('[data-','[');return {addEventListener(t,f){handlers[k+'|'+t]=f;}};
  }
  const root=makeEl('root');
  const section=getEl('#aiSection');
  const assistants=(opts&&opts.assistants)||[{id:'A',name:'도우미A',icon:'A',description:'',ready:true,sort_order:1},{id:'B',name:'도우미B',icon:'B',description:'',ready:true,sort_order:2}];
  const sb={
    rpc:async function(name){rpcCalls.push(name);return {data:assistants,error:null};},
    functions:{invoke:function(name,args){return new Promise(function(resolve){invokes.push({args:args,resolve:resolve});});}},
  };
  const ctx={window:{},document:{head:{appendChild(){}},createElement(){return {};}},confirm(){return true;},navigator:{},console};
  vm.createContext(ctx);
  vm.runInContext(js,ctx);
  return {ctx,root,section,sb,rpcCalls,invokes,input:getEl('#aiInput'),
    async click(key){return handlers[key+'|click']();},
    async render(me){await ctx.window.AIAssistants.render(root,{sb:sb,me:me});}};
}
const tick=()=>new Promise(r=>setImmediate(r));

test('화면 시험: A의 답을 기다리는 중 B를 열면 A의 늦은 답이 B 대화·다음 요청에 섞이지 않는다',async()=>{
  const t=harness({});
  await t.render({id:'u1',role:'staff'});
  await t.click('[ai-open]=A');
  t.input.value='A질문';
  const p1=t.click('#aiSendBtn'); // 첫 전송(아직 응답 대기)
  assert.equal(t.invokes.length,1);
  await t.click('#aiSendBtn');   // 대기 중 재전송 → 무시
  assert.equal(t.invokes.length,1,'보내는 중에는 두 번째 요청을 만들지 않음');
  await t.click('[ai-back]');
  await t.click('[ai-open]=B');
  t.invokes[0].resolve({data:{ok:true,text:'A의 비공개 답',model_label:'m'},error:null}); // A의 답이 늦게 도착
  await p1;await tick();
  t.input.value='B후속';
  t.click('#aiSendBtn'); // 응답을 기다리지 않는다(요청 본문만 확인)
  assert.equal(t.invokes.length,2);
  const body=t.invokes[1].args.body;
  assert.equal(body.assistant_id,'B');
  assert.deepEqual(JSON.parse(JSON.stringify(body.messages)),[{role:'user',content:'B후속'}],'A의 답이 B 요청에 실리면 안 됨');
});

test('화면 시험: 새 대화를 누르면 이전 요청의 늦은 답이 새 대화에 들어오지 않는다',async()=>{
  const t=harness({});
  await t.render({id:'u1',role:'staff'});
  await t.click('[ai-open]=A');
  t.input.value='첫 질문';
  const p1=t.click('#aiSendBtn');
  await t.click('[ai-new]');
  t.invokes[0].resolve({data:{ok:true,text:'늦은 답'},error:null});
  await p1;await tick();
  t.input.value='새 질문';
  t.click('#aiSendBtn'); // 응답을 기다리지 않는다(요청 본문만 확인)
  assert.deepEqual(JSON.parse(JSON.stringify(t.invokes[1].args.body.messages)),[{role:'user',content:'새 질문'}]);
});

test('화면 시험: 로그인 사용자가 바뀐 채 render가 다시 불리면 이전 사람의 대화 상태를 비운다',async()=>{
  const t=harness({});
  await t.render({id:'u1',role:'staff'});
  await t.click('[ai-open]=A');
  t.input.value='질문';
  const p=t.click('#aiSendBtn');
  t.invokes[0].resolve({data:{ok:true,text:'답'},error:null});
  await p;await tick();
  assert.match(t.section.innerHTML,/ai-chat-card/);
  await t.render({id:'u2',role:'staff'});
  assert.doesNotMatch(t.section.innerHTML,/ai-chat-card/,'다른 사용자에게 이전 대화가 남으면 안 됨');
  assert.match(t.section.innerHTML,/data-ai-open/);
});

test('화면 시험: 카드 목록으로 돌아갈 때·도우미 탭에 다시 들어갈 때 ai_assistants_for_me를 다시 조회한다',async()=>{
  const t=harness({});
  await t.render({id:'o1',role:'owner'});
  assert.equal(t.rpcCalls.length,1);
  await t.click('[ai-open]=A');
  await t.click('[ai-back]');
  assert.equal(t.rpcCalls.length,2,'← 목록');
  await t.click('[ai-subtab]=manage');
  await t.click('[ai-subtab]=chat');
  assert.equal(t.rpcCalls.length,3,'도우미 탭 재진입');
});

test('화면 시험: 대화가 20개에 닿으면 「새 대화가 필요해요」가 보이고 보내기가 막힌다',async()=>{
  const t=harness({});
  await t.render({id:'u1',role:'staff'});
  await t.click('[ai-open]=A');
  for(let i=0;i<10;i++){
    t.input.value='질문'+i;
    const p=t.click('#aiSendBtn');
    t.invokes[i].resolve({data:{ok:true,text:'답'+i},error:null});
    await p;await tick();
  }
  assert.match(t.section.innerHTML,/대화가 길어져 새 대화가 필요해요/);
  assert.match(t.section.innerHTML,/class="mini stamp" data-ai-new/);
  assert.match(t.section.innerHTML,/id="aiSendBtn" disabled/);
});

test('사용법: 직원용은 모든 역할에, 원장용은 owner에게만 보인다',()=>{
  const h=helpers();
  const ids=r=>[...h.aiHelpSectionsFor(r)].map(s=>s.id);
  assert.deepEqual(ids('staff'),['staff']);
  assert.deepEqual(ids('manager'),['staff']);
  assert.deepEqual(ids('chief'),['staff']);
  assert.deepEqual(ids(undefined),['staff']);
  assert.deepEqual(ids('owner'),['staff','owner']);
});

test('사용법: 직원용 8단계·원장용 7단계, 안내 문장은 실제 오류 문장표에서 가져오고 예시 도우미 3개는 DB 한도 안이다',()=>{
  const h=helpers();
  const secs=Object.fromEntries([...h.AI_HELP_SECTIONS].map(s=>[s.id,s]));
  assert.equal(secs.staff.steps.length,8);
  assert.equal(secs.owner.steps.length,7);
  const rows=[...h.aiHelpErrorRows()];
  assert.ok(rows.length>=6);
  rows.forEach(r=>{assert.equal(r.message,h.AI_ERROR_MESSAGES[r.kind]);assert.ok(r.message&&r.means,r.kind);});
  const ex=[...h.AI_HELP_EXAMPLES];
  assert.equal(ex.length,3);
  ex.forEach(e=>{assert.ok(e.instructions.length>50&&e.instructions.length<=20000);assert.ok(e.description.length<=200);assert.ok(e.name.length<=40);});
});

test('사용법: 글에 § 기호가 없고 개인정보·외부 AI 전송 같은 경고 문구를 넣지 않는다',()=>{
  const h=helpers();
  const all=JSON.stringify([h.AI_HELP_SECTIONS,h.AI_HELP_EXAMPLES]);
  assert.ok(!all.includes('§'));
  assert.ok(!/개인정보|외부 ?AI|유출|주의하세요/.test(all));
  assert.ok(!js.includes('§'));
});

test('화면 시험: 「❓ 사용법」 패널이 직원에게는 직원용만, 원장에게는 직원용+원장용으로 만들어진다',async()=>{
  const staff=harness({});
  await staff.render({id:'u1',role:'staff'});
  assert.match(staff.root.innerHTML,/data-ai-help-toggle/);
  assert.match(staff.root.innerHTML,/id="aiHelpPanel" hidden/);
  assert.match(staff.root.innerHTML,/직원용 — 이렇게 쓰세요/);
  assert.doesNotMatch(staff.root.innerHTML,/원장용 — 도우미 만들고 관리하기/);
  assert.doesNotMatch(staff.root.innerHTML,/data-ai-help-copy/);
  const owner=harness({});
  await owner.render({id:'o1',role:'owner'});
  assert.match(owner.root.innerHTML,/직원용 — 이렇게 쓰세요/);
  assert.match(owner.root.innerHTML,/원장용 — 도우미 만들고 관리하기/);
  assert.equal((owner.root.innerHTML.match(/data-ai-help-copy=/g)||[]).length,3);
});

// ── 5차 고침(10-01) 시험 ──
test('CSV 파일 이름: <도우미이름>_<YYYYMMDD-HHmm>.csv — 현지 시각(UTC 아님)이고 못 쓰는 글자는 _로 바뀐다',()=>{
  const h=helpers();
  assert.equal(h.aiCsvFileName('리뷰 답글',new Date(2026,9,1,0,30)),'리뷰 답글_20261001-0030.csv','한국 시간 10월 1일 00:30이 전날로 찍히면 안 됨');
  assert.equal(h.aiCsvFileName('유튜브 대본 → 블로그 글',new Date(2026,0,5,9,7)),'유튜브 대본 → 블로그 글_20260105-0907.csv');
  assert.equal(h.aiCsvFileName('A/B:C*D?"E"<F>|G\\H',new Date(2026,11,31,23,59)),'A_B_C_D__E__F__G_H_20261231-2359.csv');
  assert.equal(h.aiCsvFileName('',new Date(2026,5,1,1,2)),'assistant_20260601-0102.csv');
  assert.equal(h.aiCsvFileName('..숨김',new Date(2026,5,1,1,2)),'숨김_20260601-0102.csv');
});

test('CSV 칸 뽑기: csv 코드 칸이 여러 개면 차례로 다 뽑고, 다른 코드 칸은 무시한다',()=>{
  const h=helpers();
  const fence='```';
  const text='앞글\n'+fence+'csv\n이름,나이\n가,1\n'+fence+'\n중간\n'+fence+'js\nx=1\n'+fence+'\n'+fence+'CSV\r\n다,2\n'+fence+'\n';
  assert.deepEqual(Array.from(h.aiCsvBlocks(text)),['이름,나이\n가,1\n','다,2\n']);
  assert.deepEqual(Array.from(h.aiCsvBlocks('csv 없음')),[]);
});

test('사진 안내: 기본 모델이 못 읽을 때만 보이고, 예비가 읽으면 그렇게 알려 준다',()=>{
  const h=helpers();
  assert.equal(h.aiPhotoNotice({images_ok:true}),'');
  assert.equal(h.aiPhotoNotice({}),'','옛 카드 목록(칸 없음)은 안내하지 않음');
  assert.match(h.aiPhotoNotice({images_ok:false,fallback_images_ok:null}),/이 AI는 사진을 못 읽어요/);
  assert.match(h.aiPhotoNotice({images_ok:false,fallback_images_ok:false}),/글로 적어/);
  assert.match(h.aiPhotoNotice({images_ok:false,fallback_images_ok:true}),/예비 AI가 대신 읽어요/);
});

test('열쇠 등록 표시: 서버가 준 true/false만 쓰고, 모르면 아무것도 안 그린다',()=>{
  const h=helpers();
  assert.match(h.aiProviderKeyBadge({xai:false},'xai'),/열쇠 등록 필요/);
  assert.match(h.aiProviderKeyBadge({openai:true},'openai'),/열쇠 등록됨/);
  assert.equal(h.aiProviderKeyBadge(null,'openai'),'');
  assert.equal(h.aiProviderKeyBadge({openai:true},'xai'),'');
});

test('v2 화면 글: 영어 안내가 없고 한국어 라벨이며, 파일 맨 앞에 BOM이 없고 hr.html 주소 번호가 올라갔다',()=>{
  assert.doesNotMatch(js,/Web search|Conversation starters|placeholder="Starter/);
  assert.match(js,/🔎 웹검색/);
  assert.match(js,/💬 대화 시작 문장/);
  assert.notEqual(fs.readFileSync(path.join(root,'ai-assistants.js'))[0],0xEF,'맨 앞 BOM 없음');
  assert.match(read('hr.html'),/<script src="ai-assistants\.js\?v=2026100221"><\/script>/);
  assert.doesNotMatch(read('hr.html'),/ai-assistants\.js\?v=20260929/);
  assert.match(js,/data-ai-toggle-images/,'모델마다 사진 읽기 켜고 끄기');
  assert.match(js,/action:'provider_status'/,'회사 목록이 서버에 열쇠 등록 여부를 물음');
});

test('화면 시험: 카드 목록에 시작 문장·사진 읽기 칸이 있으면 빈 대화에 시작 문장 단추와 「사진을 못 읽어요」 안내가 뜬다',async()=>{
  const t=harness({assistants:[
    {id:'A',name:'도우미A',icon:'A',description:'',ready:true,sort_order:1,starters:['첫 문장','둘째 문장'],web_search:false,images_ok:false,fallback_images_ok:null},
    {id:'B',name:'도우미B',icon:'B',description:'',ready:true,sort_order:2,starters:[],web_search:false,images_ok:true,fallback_images_ok:null}]});
  await t.render({id:'u1',role:'staff'});
  await t.click('[ai-open]=A');
  assert.match(t.section.innerHTML,/data-ai-starter="0"[^>]*>첫 문장</);
  assert.match(t.section.innerHTML,/data-ai-starter="1"[^>]*>둘째 문장</);
  assert.match(t.section.innerHTML,/id="aiPhotoNotice"[^>]*>이 AI는 사진을 못 읽어요/);
  await t.click('[ai-starter]=1');
  assert.equal(t.input.value,'둘째 문장','단추를 누르면 입력칸에 들어감(바로 보내지 않음)');
  assert.equal(t.invokes.length,0);
  await t.click('[ai-back]');
  await t.click('[ai-open]=B');
  assert.doesNotMatch(t.section.innerHTML,/data-ai-starter=/);
  assert.doesNotMatch(t.section.innerHTML,/aiPhotoNotice/,'사진 읽는 모델이면 안내 없음');
});
