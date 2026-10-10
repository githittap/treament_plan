const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {fnSrc}=require('./fixtures/hub7-harness.cjs');
const read=file=>fs.readFileSync(file,'utf8').replace(/\r\n/g,'\n');
const tick=()=>new Promise(r=>setImmediate(r));
// 실제 폼 함수가 그린 입력을 읽습니다. DB 응답만 보류합니다.
function formDom(){
 const nodes=new Map();let extras=[];
 const root={isConnected:true,querySelector:key=>nodes.get(key)||null,querySelectorAll:key=>extras.filter(x=>x.attrs.includes(key.slice(1,-1))),insertAdjacentHTML(){},addEventListener(){}};
 Object.defineProperty(root,'innerHTML',{set(html){
  extras=[...html.matchAll(/<input\b([^>]*)>/g)].map(m=>({attrs:m[1],checked:/\bchecked\b/.test(m[1]),value:m[1].match(/value="([^"]*)"/)?.[1]||'',getAttribute(key){return this.attrs.match(new RegExp(key+'="([^"]*)"'))?.[1];}}));
  for(const m of html.matchAll(/<(input|select|textarea|div|button|span)\b([^>]*\bid="([^"]+)"[^>]*)>/g)){
   const attrs=m[2],id=m[3],body=html.slice(m.index+m[0].length).split('</'+m[1]+'>')[0];
   let value=attrs.match(/\bvalue="([^"]*)"/)?.[1]||'';
   if(m[1]==='textarea')value=body;
   if(m[1]==='select'){const opts=[...body.matchAll(/<option([^>]*)>/g)];const a=(opts.find(x=>/\bselected\b/.test(x[1]))||opts[0])?.[1]||'';value=a.match(/value="([^"]*)"/)?.[1]||'';}
   nodes.set('#'+id,{value,checked:/\bchecked\b/.test(attrs),textContent:'',addEventListener(){},querySelector:root.querySelector,querySelectorAll:root.querySelectorAll});
  }
 }});
 // 이 래퍼는 폼 안의 querySelector를 같은 입력 목록으로 연결합니다.
 nodes.set('#aiAssistantFormWrap',root);nodes.set('#aiModelFormWrap',root);nodes.set('#aiSection',root);
 return {root,nodes};
}
function aiHarness(kind){
 const {root,nodes}=formDom(),pending=[],requests=[],s=read('ai-assistants.js');
 const c={AI_ROOT:root,AI_EDIT_ASSISTANT:null,AI_MODEL_EDIT:null,AI_EDIT_ERRORS:[],AI_ASSISTANT_EDIT_GENERATION:0,AI_MODEL_EDIT_GENERATION:0,AI_PROVIDER_ROWS:[],AI_ADMIN_MODELS:[],AI_ADMIN_ASSISTANTS:[],AI_NOTICE:'',
  escAi:String,testAssistantForm(){},aiModelOptionsHtml:()=>'',aiWriteErrorMessage:()=> '모의 오류',reloadAssistants:async()=>{},
  drawManageSection(){c.drawAssistantForm();},drawModelsSection(){c.drawModelForm();},renderManageSection:async()=>{},renderModelsSection:async()=>{},
  SB:{from(table){let op,row,id;const q=new Proxy({},{get(_,key){if(key==='then')return (ok,bad)=>{requests.push({table,op,id,row});return (c.hold?new Promise(r=>pending.push(r)):Promise.resolve({error:null})).then(ok,bad);};return (...args)=>{if(['update','insert'].includes(key)){op=key;row=args[0];}if(key==='eq')id=args[1];return q;};}});return q;}}};
 vm.createContext(c);vm.runInContext(s.slice(s.indexOf('const AI_ROLE_LABELS'),s.indexOf('/* ai-assistants:test-end */')),c);
 const names=['blankAssistant','blankModel','openAssistantForm','drawAssistantForm','readAssistantForm','saveAssistantForm','openModelForm','drawModelForm','saveModelForm'];
 vm.runInContext(names.map(n=>fnSrc(s,n)).join('\n'),c);
 const list=kind==='assistant'?c.AI_ADMIN_ASSISTANTS:c.AI_ADMIN_MODELS;
 for(const id of ['A','B'])list.push(kind==='assistant'?{id,name:'도우미 예시 '+id,instructions:'가짜 지침',knowledge:'',visible_roles:['owner'],max_output_tokens:4000}:{id,provider:'openai',model_id:'example-'+id,label:'모델 예시 '+id});
 const open=id=>c[kind==='assistant'?'openAssistantForm':'openModelForm'](id),save=()=>c[kind==='assistant'?'saveAssistantForm':'saveModelForm']();
 return {c,root,nodes,pending,requests,open,save,release(error=null){c.hold=false;pending.splice(0).forEach(r=>r({error}));}};
}
for(const kind of ['assistant','model'])for(const target of ['A','B',null])test('실제 AI '+kind+' 저장 중 '+(target||'새 입력')+' 편집 차례는 이전 성공 뒤 유지되고 후속 대상도 맞다',async()=>{
 const h=aiHarness(kind);h.open('A');h.c.hold=true;const job=h.save();await tick();assert.equal(h.pending.length,1);
 // 하위 화면 왕복은 원래 section을 분리하고 새 section에서 실제 폼을 엽니다.
 h.root.isConnected=false;const next=formDom();h.c.AI_ROOT=next.root;h.open(target);
 const field=next.nodes.get(kind==='assistant'?'#aiFName':'#aiMLabel');field.value='가짜 새 편집';
 if(!target&&kind==='model')next.nodes.get('#aiMModelId').value='example-new';
 if(!target&&kind==='assistant')next.nodes.get('#aiFInstr').value='가짜 지침';
 h.release();await job;
 assert.equal((kind==='assistant'?h.c.AI_EDIT_ASSISTANT:h.c.AI_MODEL_EDIT)?.id,target);assert.equal(field.value,'가짜 새 편집');
 await h.save();assert.equal(h.requests.at(-1).op,target?'update':'insert');assert.equal(h.requests.at(-1).id,target||undefined);
});
for(const kind of ['assistant','model'])test('실제 AI '+kind+' 정상 저장 정리와 오류 보존',async()=>{
 const h=aiHarness(kind);h.open('A');h.c.hold=true;const job=h.save();await tick();h.release({message:'모의 실패'});await job;
 assert.equal((kind==='assistant'?h.c.AI_EDIT_ASSISTANT:h.c.AI_MODEL_EDIT).id,'A');
 await h.save();assert.equal(kind==='assistant'?h.c.AI_EDIT_ASSISTANT:h.c.AI_MODEL_EDIT,null);
});

function listHarness(){
 const pending=[],requests=[],{root,nodes}=formDom(),s=read('hub-texts.js');
 const c={HUB_SB:{},HUB_LIST_EDIT_GENERATION:0,HUB_LIST_DRAFT:{},HUB_CARD_DRAFT:{},HUB_CARDS_MAX:20,
  HUB_LIST_DEFS:[{key:'list.a',def:[{code:'base',label:'기본'}],addable:true,orderable:true},{key:'list.b',def:[{code:'base',label:'기본'}],addable:true}],
  HUB_CARD_DEFS:[{key:'cards.a',def:[{icon:'📄',title:'가짜 카드',category:'',description:'',depts:[],url:'',manual:false}]}],
  hubList:(key,def)=>c.saved?.[key]||def,hubCards:(key,def)=>c.saved?.[key]||def,hubListValidate:()=>({ok:true}),hubEsc:String,hubBadge:()=>'',hubText:(k,d)=>d,hubWriteErrorMessage:()=> '모의 오류',hubCardsHtml:()=>'',hubBindCards(){},saved:{},
  hubListSave:async(_,key,rows)=>{requests.push({key,rows:JSON.parse(JSON.stringify(rows))});if(c.hold)await new Promise(r=>pending.push(r));c.saved[key]=rows;return {ok:true};},
  hubCardsSave:async(_,key,rows)=>c.hubListSave(_,key,rows),hubListReset:async(_,key)=>{if(c.hold)await new Promise(r=>pending.push(r));delete c.saved[key];return {ok:true};},hubCardsReset:async(_,key)=>c.hubListReset(_,key),hubSettingsRefresh:async()=>{}};
 vm.createContext(c);vm.runInContext(['hubRenderListsSection','hubListItemsFor','hubDrawListsSection','hubCollectListDraft','hubAddListItem','hubDelListItem','hubMoveListItem','hubSaveList','hubResetList','hubCardItemsFor','hubCollectCardDraft','hubCardMsg','hubAddCard','hubMoveCard','hubDelCard','hubSaveCards','hubResetCards'].map(n=>fnSrc(s,n)).join('\n'),c);
 return {c,root,nodes,pending,requests,release(){c.hold=false;pending.splice(0).forEach(r=>r());}};
}
test('실제 목록 이전 저장 대기 중 같은 목록 항목 추가는 후속 저장에도 포함한다',async()=>{
 const h=listHarness(),c=h.c;await c.hubRenderListsSection(h.root);c.hold=true;const job=c.hubSaveList(h.root,0);await tick();
 h.nodes.get('#hubLstNew_0').value='가짜 새 항목';c.hubAddListItem(h.root,0);h.release();await job;
 await c.hubSaveList(h.root,0);assert.ok(h.requests.at(-1).rows.some(x=>x.code==='가짜 새 항목'));
});
test('실제 목록 다른 목록 새 편집과 복귀 후 새 입력은 이전 저장이 지우지 않는다',async()=>{
 for(const comeback of [false,true]){
  const h=listHarness(),c=h.c;await c.hubRenderListsSection(h.root);c.hold=true;const job=c.hubSaveList(h.root,0);await tick();
  if(comeback)await c.hubRenderListsSection(h.root);
  const di=comeback?0:1;h.nodes.get('#hubLstNew_'+di).value='가짜 다음 항목';c.hubAddListItem(h.root,di);h.release();await job;
  await c.hubSaveList(h.root,di);assert.ok(h.requests.at(-1).rows.some(x=>x.code==='가짜 다음 항목'));
 }
});
for(const operation of ['hubSaveList','hubResetList'])test('실제 '+operation+' 대기 중 다시 만든 목록 초안을 지우지 않는다',async()=>{
 const h=listHarness(),c=h.c;await c.hubRenderListsSection(h.root);c.hold=true;const job=c[operation](h.root,0);await tick();
 h.nodes.get('#hubLstNew_0').value='가짜 새 차례';c.hubAddListItem(h.root,0);h.release();await job;
 assert.ok(c.HUB_LIST_DRAFT['list.a'].some(x=>x.code==='가짜 새 차례'));
});
for(const operation of ['hubSaveCards','hubResetCards'])test('실제 '+operation+' 대기 중 추가한 카드 초안을 지우지 않는다',async()=>{
 const h=listHarness(),c=h.c;await c.hubRenderListsSection(h.root);c.hold=true;const job=c[operation](h.root,0);await tick();
 c.hubAddCard(h.root,0);h.release();await job;
 assert.equal(c.HUB_CARD_DRAFT['cards.a'].length,2);
});
