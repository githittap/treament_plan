const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {fnSrc}=require('./fixtures/hub7-harness.cjs');
const hr=fs.readFileSync('hr.html','utf8').replace(/\r\n/g,'\n'),tick=()=>new Promise(r=>setImmediate(r));
function harness(names){
 const nodes={},pending=[],calls=[],hidden=[],statuses=[],c={ME:{id:'example-owner',name:'원장 예시',role:'owner'},
  LEAVE_EDIT_GENERATION:0,SUGGESTION_EDIT_GENERATION:0,SUGGESTION_COMMENT_EDIT_GENERATION:0,CONTRACT_EDIT_GENERATION:0,INBOX_DETAIL_GENERATION:0,LEAVE_ACCRUAL_GENERATION:0,
  $:id=>nodes[id]||(nodes[id]={value:'가짜 입력',textContent:'',innerHTML:'',style:{},isConnected:true,querySelectorAll:()=>[]}),hubT:(k,d)=>d,ctT:(k,d)=>d,inboxT:(k,d)=>d,esc:String,
  today:()=> '2026-10-10',setStatus:s=>statuses.push(s),render:async()=>{},refreshBadges(){},show(){},hide:id=>hidden.push(id),alert(){},confirm:()=>true,
  sb:{rpc:async(name,args)=>{calls.push({name,args});if(c.hold)await new Promise(r=>pending.push(r));return {data:[],error:null};},from(table){let op,row,id,returning=false;const filters=[];const q=new Proxy({},{get(_,key){if(key==='then')return (ok,bad)=>{
   if(table==='contracts'){
    c.contractDb??=structuredClone(c.CONTRACT_ROWS||[]);
    const finish=()=>{const matched=c.contractDb.filter(r=>filters.every(([k,v])=>r[k]===v));if(op==='update')matched.forEach(r=>Object.assign(r,structuredClone(row)));if(op)calls.push({table,op,row,id,affected:matched.length});return {data:op?(returning?matched.map(r=>({id:r.id})):null):matched[0]||null,error:null};};
    return (c.hold&&op?new Promise(r=>pending.push(r)):Promise.resolve()).then(finish).then(ok,bad);
   }
   if(op){calls.push({table,op,row,id});return (c.hold?new Promise(r=>pending.push(r)):Promise.resolve({data:{id:'new'},error:null})).then(ok,bad);}
   return Promise.resolve({data:{id,status:'대기',date_from:'2026-10-01',date_to:'2026-10-01',type:'연차'},error:null}).then(ok,bad);
  };return (...args)=>{if(['update','insert','delete'].includes(key)){op=key;row=args[0];}if(key==='select')returning=true;if(key==='eq'){filters.push(args);if(args[0]==='id')id=args[1];}return q;};}});return q;}}};
 vm.createContext(c);vm.runInContext(names.map(n=>fnSrc(hr,n)).join('\n'),c);
 return {c,nodes,pending,calls,hidden,statuses,release(){c.hold=false;pending.splice(0).forEach(r=>r({error:null}));}};
}
for(const target of ['A','B',null])test('연차 신청 저장 중 '+(target||'새 신청')+' 다시 열기는 이전 성공이 수정 대상과 모달을 지우지 않는다',async()=>{
 const h=harness(['openLeave','openLeaveEdit','submitLeave']),c=h.c;
 Object.assign(c,{LEAVE_EDIT_ID:null,leaveApplyModalPrepare(){},refreshLeaveTypeFields(){},checkClash(){},leaveConflict:async()=>0,leaveSameDayRules:()=>({limit:2,reasonFrom:1}),computeLeaveDays:async()=>1});
 await c.openLeaveEdit('A');c.hold=true;const job=c.submitLeave();await tick();assert.equal(h.pending.length,1);
 if(target)await c.openLeaveEdit(target);else c.openLeave();h.release();await job;
 assert.equal(c.LEAVE_EDIT_ID,target);assert.equal(h.hidden.length,0);
});
for(const comment of [false,true])test('건의'+(comment?' 댓글':'')+' 저장 중 같은/다른 대상 다시 편집은 유지한다',async()=>{
 for(const target of ['A','B']){
  const h=harness(comment?['beginSuggestionCommentEdit','saveSuggestionComment','validateSuggestionComment']:['beginSuggestionEdit','saveSuggestion']),c=h.c;
  Object.assign(c,{SUGGESTION_EDIT_ID:null,SUGGESTION_CAMPAIGN_ID:'example-campaign',SUGGESTION_COMMENT_EDIT_ID:null,SUGGESTION_COMMENT_OPEN:new Set(),SUGGESTION_COMMENT_SAVING:new Set(),suggestionRenderKeep:async()=>{}});
  if(comment)c.beginSuggestionCommentEdit('example','A');else c.beginSuggestionEdit('A');c.hold=true;
  const job=comment?c.saveSuggestionComment('example','A'):c.saveSuggestion('A');await tick();assert.equal(h.pending.length,1);
  if(comment)c.beginSuggestionCommentEdit('example',target);else c.beginSuggestionEdit(target);h.release();await job;
  assert.equal(comment?c.SUGGESTION_COMMENT_EDIT_ID:c.SUGGESTION_EDIT_ID,target);
 }
});
test('계약 수정 전송 성공이 다시 연 같은/다른 계약 원본 필드를 지우지 않는다',async()=>{
 for(const target of ['A','B']){
  const h=harness(['editContractRequest','sendContract']),c=h.c;
  Object.assign(c,{CONTRACT_ROWS:['A','B'].map((id,i)=>({id:i+1,status:'발송요청',user_id:id,template_id:1,fields:{memo:id}})),CONTRACT_EDIT_ID:null,CONTRACT_EDIT_FIELDS:null,contractObject:x=>x,contractArray:x=>x||[],mergeContractHtml:()=>'<p>가짜 계약</p>',currentContractDraft:()=>({template:{id:1,fields:[]},employeeId:'example',due:'2026-10-20',fields:{'계약종료':'기간의 정함 없음'}})});
  c.editContractRequest(1);c.hold=true;const job=c.sendContract();await tick();assert.equal(h.pending.length,1);c.editContractRequest(target==='A'?1:2);h.release();await job;
  assert.equal(c.CONTRACT_EDIT_ID,target==='A'?1:2);assert.equal(c.CONTRACT_EDIT_FIELDS.memo,target);
 }
});
test('계약 수정 전송 중 새로 쓰기를 연 경우 새 초안과 빈 대상은 유지한다',async()=>{
 const h=harness(['editContractRequest','clearContractDraft','sendContract']),c=h.c;
 Object.assign(c,{CONTRACT_ROWS:[{id:1,status:'발송요청',user_id:'A',template_id:1,fields:{memo:'A'}}],CONTRACT_EDIT_ID:null,CONTRACT_EDIT_FIELDS:null,CONTRACT_DRAFT_FIELDS:{fields:{}},contractObject:x=>x,contractArray:x=>x||[],mergeContractHtml:()=>'<p>가짜 계약</p>',currentContractDraft:()=>({template:{id:1,fields:[]},employeeId:'example',due:'2026-10-20',fields:{'계약종료':'기간의 정함 없음'}})});
 c.editContractRequest(1);c.hold=true;const job=c.sendContract();await tick();c.clearContractDraft();c.CONTRACT_DRAFT_FIELDS={fields:{memo:'새 초안'}};h.release();await job;
 assert.equal(c.CONTRACT_EDIT_ID,null);assert.equal(c.CONTRACT_EDIT_FIELDS,null);assert.equal(c.CONTRACT_DRAFT_FIELDS.fields.memo,'새 초안');
});
test('문의 전환 완료가 새로 연 상세 선택을 지우지 않는다',async()=>{
 const h=harness(['inboxConvert']),c=h.c;
 Object.assign(c,{INBOX_SELECTED:{ids:['A'],messages:[{id:'A'}]},inboxProcessableRows:x=>x,inboxFillEmptyAssignee:async()=>{},inboxLoad:async()=>{}});
 c.hold=true;const job=c.inboxConvert();await tick();assert.equal(h.pending.length,1);
 // 실제 상세 진입·화면 그리기 함수에 편집 차례 증가가 연결돼 있는지도 확인합니다.
 assert.match(fnSrc(hr,'inboxSelect'),/\+\+INBOX_DETAIL_GENERATION/);assert.match(fnSrc(hr,'renderInbox'),/INBOX_DETAIL_GENERATION\+\+/);
 c.INBOX_DETAIL_GENERATION++;c.INBOX_SELECTED={ids:['B'],messages:[{id:'B'}]};h.release();await job;assert.deepEqual(c.INBOX_SELECTED.ids,['B']);
});
test('계정 목록의 일괄 적용 대기 중 새 선택은 이전 응답이 지우지 않는다',async()=>{
 const h=harness(['toggleBulkRoleSelect','applyBulkRole']),c=h.c;
 Object.assign(c,{BULK_ROLE_EDIT_GENERATION:0,BULK_ROLE_SELECTED:new Set(['A']),PROFILES:[],bulkRoleApplyTargets:(_,selected)=>[...selected],loadProfiles:async()=>{},showScheduleRosterError(){}});
 c.hold=true;const job=c.applyBulkRole();await tick();assert.equal(h.pending.length,1);
 c.toggleBulkRoleSelect('B',true);h.release();await job;
 assert.ok(c.BULK_ROLE_SELECTED.has('B'));assert.deepEqual(h.calls.map(x=>x.args.p_user_id),['A']);
});
