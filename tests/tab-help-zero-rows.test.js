const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {fnSrc}=require('./fixtures/hub7-harness.cjs');
const hr=fs.readFileSync('hr.html','utf8').replace(/\r\n/g,'\n'),tick=()=>new Promise(r=>setImmediate(r));
function harness(){
 const nodes={},statuses=[],alerts=[],writes=[],pending=[],db=[1,2].map(id=>({id,status:'발송요청',user_id:'example-'+id,template_id:1,fields:{memo:'원본 '+id}}));
 const c={ME:{id:'example-owner',name:'원장 예시',role:'owner'},CONTRACT_ROWS:structuredClone(db),CONTRACT_EDIT_ID:null,CONTRACT_EDIT_FIELDS:null,CONTRACT_EDIT_GENERATION:0,CONTRACT_FLASH:'',
  $:id=>nodes[id]||(nodes[id]={value:'',textContent:'',isConnected:true}),ctT:(k,d,v)=>String(d).replace(/\{(\w+)\}/g,(m,n)=>v?.[n]??m),contractObject:x=>x,contractArray:x=>x||[],
  mergeContractHtml:()=>'<p>가짜 계약</p>',currentContractDraft:()=>({template:{id:1,fields:[]},employeeId:'example',due:'2026-10-20',fields:{'계약종료':'기간의 정함 없음',memo:nodes['#memo']?.value||'첫 입력'}}),
  render(){c.renders=(c.renders||0)+1;},setStatus:s=>statuses.push(s),alert:s=>alerts.push(s),confirm:()=>true,Blob,
  sb:{storage:{from:()=>({upload:async()=>({error:null})})},from(){let op='select',payload,selected=false,single=false;const filters=[];
   const q=new Proxy({},{get(_,key){if(key==='then')return (ok,bad)=>{const finish=()=>{
    const matches=db.filter(r=>filters.every(([k,v])=>r[k]===v));
    if(op==='update'){matches.forEach(r=>Object.assign(r,structuredClone(payload)));writes.push({filters:structuredClone(filters),rows:matches.length});}
    return {data:op==='update'?(selected?matches.map(r=>({id:r.id})):null):(single?structuredClone(matches[0]||null):structuredClone(matches)),error:c.dbError||null};
   };return (c.hold&&op==='update'?new Promise(r=>pending.push(()=>r(finish()))):Promise.resolve(finish())).then(ok,bad);};
   return (...args)=>{if(key==='update'){op=key;payload=args[0];}if(key==='select')selected=true;if(key==='eq')filters.push(args);if(key==='maybeSingle')single=true;return q;};}});return q;}}};
 vm.createContext(c);vm.runInContext(['editContractRequest','contractStateChangedMessage','sendContract','approveContractSend','rejectContractSend','cancelContract'].map(n=>fnSrc(hr,n)).join('\n'),c);
 return {c,nodes,statuses,alerts,writes,db,pending,release(){c.hold=false;pending.splice(0).forEach(r=>r());}};
}
test('계약 A 첫 발송 뒤 같은 A 후속 발송 0행은 성공 없이 두 번째 입력·대상을 보존한다',async()=>{
 const h=harness(),c=h.c;c.editContractRequest(1);c.hold=true;const first=c.sendContract();await tick();assert.equal(h.pending.length,1);
 c.editContractRequest(1);h.nodes['#memo']={value:'두 번째 입력'};h.release();await first;
 assert.equal(c.CONTRACT_EDIT_ID,1);assert.equal(h.db[0].status,'대기');assert.equal(h.db[0].fields.memo,'첫 입력');
 h.statuses.length=0;const renders=c.renders;await c.sendContract();
 assert.equal(h.writes.at(-1).rows,0);assert.ok(h.writes.at(-1).filters.some(([k,v])=>k==='status'&&v==='발송요청'));
 assert.ok(!h.statuses.includes('saved'));assert.equal(c.renders,renders);assert.equal(c.CONTRACT_EDIT_ID,1);assert.equal(c.CONTRACT_EDIT_FIELDS.memo,'원본 1');
 assert.equal(h.nodes['#memo'].value,'두 번째 입력');assert.equal(c.CONTRACT_FLASH,'');assert.match(h.nodes['#contractMsg'].textContent,/상태.*대기/);
 assertUnsavedMessage(h.nodes['#contractMsg'].textContent);
});
test('계약 A 첫 발송 뒤 다른 B 후속 발송 1행은 정상 완료한다',async()=>{
 const h=harness(),c=h.c;c.editContractRequest(1);c.hold=true;const first=c.sendContract();await tick();c.editContractRequest(2);h.nodes['#memo']={value:'B 입력'};h.release();await first;
 await c.sendContract();assert.equal(h.writes.at(-1).rows,1);assert.equal(h.db[1].fields.memo,'B 입력');assert.equal(c.CONTRACT_EDIT_ID,null);assert.equal(h.statuses.at(-1),'saved');
});
test('상태가 이미 바뀐 계약의 요청 승인 0행은 성공 알림·재그리기를 하지 않는다',async()=>{
 const h=harness();h.db[0].status='대기';await h.c.approveContractSend(1);
 assert.equal(h.writes.at(-1).rows,0);assert.ok(!h.statuses.includes('saved'));assert.equal(h.c.CONTRACT_FLASH,'');assert.equal(h.c.renders,undefined);assert.match(h.alerts.at(-1),/상태.*대기/);
});
test('계약 승인 1행은 정상 발송되고 반려·취소 0행도 성공하지 않는다',async()=>{
 const h=harness();await h.c.approveContractSend(1);assert.equal(h.writes.at(-1).rows,1);assert.equal(h.statuses.at(-1),'saved');
 for(const name of ['rejectContractSend','cancelContract']){const x=harness();if(name==='cancelContract')x.c.CONTRACT_ROWS[0].status='대기';x.db[0].status='서명완료';await x.c[name](1);assert.ok(!x.statuses.includes('saved'));}
});
test('계약 수정 DB 오류는 기존 입력을 보존한다',async()=>{
 const h=harness();h.c.editContractRequest(1);h.c.dbError={message:'가짜 오류'};await h.c.sendContract();assert.ok(!h.statuses.includes('saved'));assert.equal(h.c.CONTRACT_EDIT_ID,1);assert.match(h.nodes['#contractMsg'].textContent,/가짜 오류/);
});
function assertUnsavedMessage(message){
 assert.match(message,/저장되지 않았/);assert.match(message,/지금 화면에만 남아/);
 assert.match(message,/새로고침하기 전에 복사/);
 assert.doesNotMatch(message,/보존되었습니다|새로고침 후 다시 확인/);
}
test('계약 0행 기본 글은 저장 실패와 새로고침 전 복사를 안내한다',()=>{
 const source=fs.readFileSync('hub-texts.js','utf8'),c={};vm.createContext(c);
 vm.runInContext(source.match(/\/\* hub-texts:test-start \*\/[\s\S]*?\/\* hub-texts:test-end \*\//)[0],c);
 const definition=c.hubTextDefs().find(d=>d.key==='contract.m_update_zero');
 assertUnsavedMessage(definition.def);assert.match(definition.def,/\{status\}/);
 assert.equal(definition.def,fnSrc(hr,'contractStateChangedMessage').match(/ctT\('contract\.m_update_zero','([^']+)'/)[1]);
});
test('계약 0행 화면 대비 글은 상태 조회 성공·실패 모두 새로고침 전 복사를 안내한다',async()=>{
 const h=harness();h.db[0].status='대기';
 const message=await h.c.contractStateChangedMessage(1);assertUnsavedMessage(message);assert.match(message,/지금 상태: 대기/);
 h.c.dbError={message:'가짜 조회 오류'};
 const unknown=await h.c.contractStateChangedMessage(1);assertUnsavedMessage(unknown);assert.match(unknown,/지금 상태: 확인하지 못함/);
});
