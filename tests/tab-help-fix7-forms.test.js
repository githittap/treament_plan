const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {fnSrc}=require('./fixtures/hub7-harness.cjs');
const hr=fs.readFileSync('hr.html','utf8').replace(/\r\n/g,'\n'),tick=()=>new Promise(r=>setImmediate(r));
test('연차 수정 조회 응답은 그 사이 열린 새 신청·다른 수정과 안내를 덮지 않는다',async()=>{
 for(const target of ['new','B'])for(const failed of [false,true]){
  const nodes={},alerts=[],c={ME:{id:'example'},LEAVE_EDIT_GENERATION:0,LEAVE_EDIT_ID:null,$:id=>nodes[id]||(nodes[id]={value:'',textContent:'',style:{}}),today:()=> '2026-10-10',leaveApplyModalPrepare(){},refreshLeaveTypeFields(){},show(){},checkClash(){},alert:s=>alerts.push(s),hubT:(k,d)=>d};
  let release;const q=new Proxy({},{get:(_,key)=>key==='then'?(ok,bad)=>new Promise(r=>{release=r;}).then(ok,bad):()=>q});c.sb={from:()=>q};
  vm.createContext(c);vm.runInContext(['openLeave','openLeaveEdit'].map(n=>fnSrc(hr,n)).join('\n'),c);
  const pending=c.openLeaveEdit('A');await tick();c.openLeave();if(target==='B'){c.LEAVE_EDIT_GENERATION++;c.LEAVE_EDIT_ID='B';}
  nodes['#lvReason'].value='새 입력';release({data:{id:'A',status:'대기',date_from:'2026-10-01',date_to:'2026-10-01',type:'연차',reason:'옛 입력'},error:failed?{message:'가짜 오류'}:null});await pending;
  assert.equal(c.LEAVE_EDIT_ID,target==='new'?null:'B');assert.equal(nodes['#lvReason'].value,'새 입력');assert.equal(alerts.length,0);
 }
});
