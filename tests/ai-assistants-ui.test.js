const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.join(__dirname,'..'),read=p=>fs.readFileSync(path.join(root,p),'utf8');
const js=read('ai-assistants.js');
function helpers(){
  const block=js.match(/\/\* ai-assistants:test-start \*\/[\s\S]*?\/\* ai-assistants:test-end \*\//)?.[0];
  assert.ok(block,'ai-assistants.js에 순수 helper 블록이 없습니다.');
  const c={};
  vm.createContext(c);
  vm.runInContext(block+';this.h={aiRoleLabel,aiProviderLabel,aiWon,aiWonLabel,aiModelPriceLabel,aiGroupModelsByProvider,aiAssistantFormErrors,aiChatInputError,aiErrorMessage,aiAdminAssistantReady,aiUsageSummarize,aiNormalizeInvokeError,aiUnwrapInvoke};',c);
  return c.h;
}

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
