const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {fnSrc}=require('./fixtures/hub7-harness.cjs');
const root=path.join(__dirname,'..'),hr=fs.readFileSync(path.join(root,'hr.html'),'utf8').replace(/\r\n/g,'\n');
const source=name=>fnSrc(hr,name);
function directMainCalls(text){
 return [...text.matchAll(/\brender[A-Z]\w*\s*\(\s*\$\s*\(\s*(['"])#main\1\s*\)\s*\)/g)].map(m=>m[0]);
}
test('모든 화면 파일에서 공용 render 밖의 main 직접 재그리기는 없다',()=>{
 for(const file of fs.readdirSync(root).filter(f=>f==='hr.html'||f.endsWith('.js'))){
  let text=fs.readFileSync(path.join(root,file),'utf8').replace(/\r\n/g,'\n');
  if(file==='hr.html')text=text.replace(source('render'),'');
  assert.deepEqual(directMainCalls(text),[],file);
 }
});
test('구조 검사는 새로 추가되는 직접 재그리기와 공백·쌍따옴표도 잡는다',()=>{
 for(const text of ["function next(){renderInbox($('#main'));}",'async function next(){await renderConfid( $ ( "#main" ) );}'])assert.equal(directMainCalls(text).length,1);
});
// 기존 허브 하네스의 함수 추출기로 실제 hr.html 함수를 실행합니다.
// 조회·저장만 모의 응답으로 바꾸며 실제 브라우저 DOM은 별도 work 시험으로 확인합니다.
function screenHarness(){
 let current;const pending=[],writes=[],requests=[],statuses=[],mounted=[],records=new Map();
 function element(){
  const fields=new Map();let html='';
  function register(markup){for(const match of String(markup).matchAll(/<[^>]*\bid="([^"]+)"[^>]*>/g))fields.set('#'+match[1],{value:match[0].match(/\bvalue="([^"]*)"/)?.[1]||'',textContent:'',checked:false,disabled:false,innerHTML:'',dataset:{},parentElement:{insertAdjacentHTML(where,value){register(value);}},addEventListener(){},querySelectorAll:()=>[]});}
  const m={isConnected:true,querySelector:s=>fields.get(s)||null,querySelectorAll:()=>[],
   cloneNode:()=>element(),replaceWith(next){this.isConnected=false;current=next;}};
  Object.defineProperty(m,'innerHTML',{get:()=>html,set(v){html=String(v);fields.clear();register(html);}});return m;
 }
 current=element();
 const c={TAB:'notice',INBOX_DETAIL_GENERATION:0,INBOX_SUBTAB:'recall',RECALL_BUSY:false,ME:{id:'example-owner',name:'원장 예시',role:'owner'},
  $:s=>s==='#main'?current:current.querySelector(s),hubStaticFill(){},apprKindSelectFill(){},SCHEDULE_PEOPLE_ERROR:'',
  mountHubTabHelp(m){mounted.push({m,tab:c.TAB,subtab:c.INBOX_SUBTAB});},HubHelp:{watch(){},unwatch(){}},
  console:{error:e=>{throw e;}},window:{scrollTo(){}},document:{body:{scrollHeight:0}},esc:String,hubT:(k,d)=>d,hubN:(k,d)=>d,confFill:s=>s,setStatus:s=>statuses.push(s),filterConfid(){},
  revokeNoticeInlineObjectUrls(){},refreshBadges(){},recallEnabled:()=>true,recallCardHtml:()=>'<h2>📞 리콜 명단</h2><div id="recallList"></div>',recallLoad:async()=>{},
  canViewInbox:()=>true,aiBillingAlertCanView:()=>true,aiBillingAlertCard:()=>'',aiBillingRecipientPanel:()=>'',inboxCardHtml:()=>'<h2>📥 통합 문의함</h2><div id="inboxList"></div>',inboxLoad:async()=>{},
  cjT:(k,d)=>d,consultationRequestError:()=> '모의 저장 오류',CONSULTATION_EDIT_GENERATION:0,CONSULTATION_EDIT_ID:null,CONSULTATION_SHEETS:['원본'],CONSULTATION_STATUSES:['대기'],CONSULTATION_SOURCE_FIELDS:{},CONSULTATION_SOURCE_SAVED_FIELDS:{},CONSULTATION_FILTERS:{query:'',sheet:'',status:''},CONSULTATION_PAGE:0,PROFILES:[],canManageConsultation:()=>true,today:()=> '2026-10-10',hubFillHtml:s=>s,consultationKindLabel:s=>s,consultationStatusLabel:s=>s,consultationServerQueryPlan:()=>({from:0,to:19}),
  sb:{from(table){let op='select',id=null,row=null,single=false,proxy;proxy=new Proxy({},{get(_,method){if(method==='then')return (ok,bad)=>{
   if(op!=='select'){writes.push({table,op});requests.push({table,op,id,row:JSON.parse(JSON.stringify(row))});}
   if(c.hold?.table===table&&c.hold.op===op)return new Promise(done=>pending.push(done)).then(ok,bad);
   return Promise.resolve({data:single?records.get(id):[],error:null,count:0}).then(ok,bad);
  };return (...args)=>{if(['insert','update','upsert'].includes(method)){op=method;row=args[0];}if(method==='eq'&&args[0]==='id')id=args[1];if(method==='single')single=true;return proxy;};}});return proxy;}}
 };
 vm.createContext(c);vm.runInContext(['render','renderNotice','renderInbox','inboxSetSubtab','renderConfid','submitConfidRecord','renderConsultationJournal','saveConsultationJournal','consultationEdit','cjFillLiteral','consultationOptions','consultationActionAssigneeOptions','consultationAmount','consultationRenderSourceFields','consultationSourceFieldValues','consultationDraftFromForm','consultationResetForm','consultationRenderList','consultationRenderActionQueue'].map(source).join('\n'),c);
 return {c,pending,writes,requests,records,statuses,mounted,main:()=>current,async release(error=null,data=[]){c.hold=null;for(const done of pending.splice(0))done({data,error,count:0});}};
}
const tick=()=>new Promise(r=>setImmediate(r));
test('실제 문의함 하위 전환은 늦은 광고 응답 뒤에도 리콜 화면을 유지한다',async()=>{
 const h=screenHarness(),c=h.c;c.TAB='inbox';await c.render();
 c.hold={table:'ai_billing_events',op:'select'};const old=c.inboxSetSubtab('inbox');await tick();assert.equal(h.pending.length,2);
 await c.inboxSetSubtab('recall');const main=h.main();await h.release();await old;
 assert.equal(c.INBOX_SUBTAB,'recall');assert.equal(h.main(),main);assert.match(main.innerHTML,/리콜 명단/);assert.doesNotMatch(main.innerHTML,/통합 문의함/);
 assert.deepEqual(h.mounted.at(-1),{m:main,tab:'inbox',subtab:'recall'});
});
for(const [tab,table,save] of [['confid','confidential_records','submitConfidRecord'],['consult','consultation_journals','saveConsultationJournal']]){
 test('실제 '+tab+' 저장 중 탭 전환은 저장 성공 후 공지 화면과 입력을 유지한다',async()=>{
  const h=screenHarness(),c=h.c;c.TAB=tab;
  if(tab==='confid'){await c.render();c.$('#cfName').value='환자 예시';c.$('#cfBody').value='가짜 기록';}
  else{await c.render();c.$('#cjName').value='환자 예시';c.$('#cjNote').value='가짜 기록';c.$('#cjSheet').value='원본';c.$('#cjStatus').value='대기';}
  c.hold={table,op:'insert'};const saving=c[save]();await tick();assert.equal(h.pending.length,1);
  c.TAB='notice';await c.render();const main=h.main();main.innerHTML+='<!-- 새 화면 입력 유지 -->';
  await h.release();await saving;
  assert.equal(h.main(),main);assert.match(main.innerHTML,/공지/);assert.match(main.innerHTML,/새 화면 입력 유지/);
  assert.deepEqual(h.writes,[{table,op:'insert'}]);assert.ok(h.statuses.includes('saved'));
  assert.equal(h.mounted.at(-1).tab,'notice');
 });
}
test('실제 진료기록 정상 저장은 공용 render로 새 화면과 안내를 다시 연결한다',async()=>{
 const h=screenHarness(),c=h.c;c.TAB='confid';await c.render();const old=h.main();c.$('#cfName').value='환자 예시';c.$('#cfBody').value='가짜 기록';await c.submitConfidRecord();
 assert.notEqual(h.main(),old);assert.match(h.main().innerHTML,/진료기록/);assert.equal(h.mounted.at(-1).tab,'confid');assert.deepEqual(h.writes,[{table:'confidential_records',op:'insert'}]);
});
test('실제 진료기록 저장 오류는 입력을 보존하고 같은 화면에 실패를 표시한다',async()=>{
 const h=screenHarness(),c=h.c;c.TAB='confid';await c.render();const main=h.main();c.$('#cfName').value='환자 예시';c.$('#cfBody').value='가짜 기록';
 c.hold={table:'confidential_records',op:'insert'};const saving=c.submitConfidRecord();await tick();await h.release({message:'모의 오류'});await saving;
 assert.equal(h.main(),main);assert.equal(c.$('#cfBody').value,'가짜 기록');assert.match(c.$('#cfMsg').textContent,/저장 실패/);assert.ok(!h.statuses.includes('saved'));
});
test('실제 상담일지 정상 저장은 공용 render로 조회하고 안내를 다시 연결한다',async()=>{
 const h=screenHarness(),c=h.c;c.TAB='consult';await c.render();const old=h.main();c.$('#cjName').value='환자 예시';c.$('#cjNote').value='가짜 기록';c.$('#cjSheet').value='원본';c.$('#cjStatus').value='대기';await c.saveConsultationJournal();
 assert.notEqual(h.main(),old);assert.match(h.main().innerHTML,/상담일지/);assert.equal(h.mounted.at(-1).tab,'consult');assert.deepEqual(h.writes,[{table:'consultation_journals',op:'insert'}]);
});
const recordA='11111111-1111-4111-8111-111111111111',recordB='22222222-2222-4222-8222-222222222222';
async function consultationHarness(){
 const h=screenHarness();h.c.TAB='consult';await h.c.render();
 for(const [id,label] of [[recordA,'A'],[recordB,'B']])h.records.set(id,{id,patient_name:'환자 예시 '+label,consultation_note:'가짜 기록 '+label,source_sheet:'원본',consulted_on:'2026-10-10',status:'대기',source_fields:{memo:'원본 '+label}});
 return h;
}
function fillNewConsultation(c){c.$('#cjName').value='새 환자 예시';c.$('#cjNote').value='가짜 새 기록';c.$('#cjSheet').value='원본';c.$('#cjStatus').value='대기';}
test('상담일지 수정 저장 중 탭 전환 후 복귀한 새 기록은 기존 행 update 대신 insert한다',async()=>{
 const h=await consultationHarness(),c=h.c;await c.consultationEdit(recordA);
 c.hold={table:'consultation_journals',op:'update'};const job=c.saveConsultationJournal();await tick();assert.equal(h.pending.length,1);
 c.TAB='notice';await c.render();const notice=h.main();await h.release();await job;
 assert.equal(h.main(),notice);assert.equal(c.CONSULTATION_EDIT_ID,null);assert.deepEqual(Object.keys(c.CONSULTATION_SOURCE_SAVED_FIELDS),[]);
 c.TAB='consult';await c.render();fillNewConsultation(c);await c.saveConsultationJournal();
 assert.deepEqual(h.requests.map(({op,id})=>({op,id})),[{op:'update',id:recordA},{op:'insert',id:null}]);
 assert.equal(h.requests[0].row.patient_name,'환자 예시 A');assert.equal(h.requests[1].row.patient_name,'새 환자 예시');
});
for(const id of [recordA,recordB])for(const switchTab of [false,true])test('상담일지 저장 중 '+(id===recordA?'같은 기록 다시':'다른 기록')+' 편집은 유지하고 후속 저장은 update한다'+(switchTab?' (탭 복귀)':' (같은 화면)'),async()=>{
 const h=await consultationHarness(),c=h.c;await c.consultationEdit(recordA);
 c.hold={table:'consultation_journals',op:'update'};const job=c.saveConsultationJournal();await tick();
 if(switchTab){c.TAB='notice';await c.render();c.TAB='consult';await c.render();}
 const label=id===recordA?'A':'B';await c.consultationEdit(id);c.$('#cjNote').value='가짜 편집 계속';const main=h.main();await h.release();await job;
 assert.equal(h.main(),main);assert.equal(c.CONSULTATION_EDIT_ID,id);assert.equal(c.$('#cjName').value,'환자 예시 '+label);assert.equal(c.$('#cjNote').value,'가짜 편집 계속');assert.equal(c.CONSULTATION_SOURCE_SAVED_FIELDS.memo,'원본 '+label);assert.match(c.$('#cjSave').textContent,/수정 저장/);
 await c.saveConsultationJournal();assert.equal(h.requests.at(-1).op,'update');assert.equal(h.requests.at(-1).id,id);assert.equal(h.requests.at(-1).row.source_fields.memo,'원본 '+label);
});
test('상담일지 새 입력 화면은 저장 대상과 원본 필드를 함께 초기화한다',async()=>{
 const h=await consultationHarness(),c=h.c;await c.consultationEdit(recordA);c.TAB='notice';await c.render();c.TAB='consult';await c.render();
 assert.equal(c.CONSULTATION_EDIT_ID,null);assert.deepEqual(Object.keys(c.CONSULTATION_SOURCE_SAVED_FIELDS),[]);assert.match(c.$('#cjFormTitle').textContent||h.main().innerHTML,/새 상담 기록/);
 fillNewConsultation(c);await c.saveConsultationJournal();assert.equal(h.requests[0].op,'insert');
});
test('상담일지 수정 저장 오류는 수정 대상과 입력을 유지한다',async()=>{
 const h=await consultationHarness(),c=h.c;await c.consultationEdit(recordA);c.$('#cjNote').value='가짜 수정 입력';
 c.hold={table:'consultation_journals',op:'update'};const job=c.saveConsultationJournal();await tick();await h.release({message:'모의 오류'});await job;
 assert.equal(c.CONSULTATION_EDIT_ID,recordA);assert.equal(c.$('#cjNote').value,'가짜 수정 입력');assert.ok(h.statuses.includes('error'));
});
test('상담일지 수정 저장이 늦게 끝나도 복귀 화면에서 작성 중인 새 입력은 유지한다',async()=>{
 const h=await consultationHarness(),c=h.c;await c.consultationEdit(recordA);
 c.hold={table:'consultation_journals',op:'update'};const job=c.saveConsultationJournal();await tick();c.TAB='notice';await c.render();c.TAB='consult';await c.render();fillNewConsultation(c);const main=h.main();
 await h.release();await job;assert.equal(h.main(),main);assert.equal(c.$('#cjNote').value,'가짜 새 기록');assert.equal(c.CONSULTATION_EDIT_ID,null);await c.saveConsultationJournal();assert.equal(h.requests.at(-1).op,'insert');
});
test('상담일지 수정 조회의 늦은 응답은 복귀 후 새로 시작한 편집 대상을 바꾸지 않는다',async()=>{
 const h=await consultationHarness(),c=h.c;c.hold={table:'consultation_journals',op:'select'};const job=c.consultationEdit(recordA);await tick();assert.equal(h.pending.length,1);
 c.hold=null;c.TAB='notice';await c.render();c.TAB='consult';await c.render();await c.consultationEdit(recordB);c.$('#cjNote').value='가짜 B 편집 계속';
 await h.release(null,h.records.get(recordA));await job;assert.equal(c.CONSULTATION_EDIT_ID,recordB);assert.equal(c.$('#cjName').value,'환자 예시 B');assert.equal(c.$('#cjNote').value,'가짜 B 편집 계속');
});
