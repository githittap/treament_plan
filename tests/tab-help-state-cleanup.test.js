const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {fnSrc}=require('./fixtures/hub7-harness.cjs');
const read=f=>fs.readFileSync(path.join(__dirname,'..',f),'utf8').replace(/\r\n/g,'\n');
function leaveHarness(){
 let resolve;const button={disabled:false},main={isConnected:true},rows={querySelectorAll:()=>[{dataset:{laIndex:'0'}}]},message={textContent:''};
 const elements={main,laAsOf:{value:'2026-10-10'},laRows:rows,laApply:button,laMsg:message};
 const c={ME:{role:'owner'},LEAVE_ACCRUAL_GENERATION:0,LEAVE_ACCRUAL_AS_OF:'2026-10-10',LEAVE_ACCRUAL_PREVIEW:[{user_id:'example-staff',due_date:'2026-10-10',grant_days:1}],$:s=>elements[s.slice(1)],confirm:()=>true,hubT:(k,d)=>d,setStatus(){},render(){throw Error('분리된 화면 다시 그리기');},sb:{rpc:()=>new Promise(r=>resolve=r)}};
 vm.createContext(c);vm.runInContext(fnSrc(read('hr.html'),'applyLeaveAccrual'),c);
 return {c,main,button,release:error=>resolve({data:[{granted_days:1,created_runs:1}],error})};
}
test('연차 적용 성공 후 분리된 화면의 적용 미리보기와 버튼 잠금도 정리한다',async()=>{
 const h=leaveHarness(),job=h.c.applyLeaveAccrual();assert.equal(h.button.disabled,true);h.main.isConnected=false;h.release(null);await job;
 assert.equal(h.c.LEAVE_ACCRUAL_AS_OF,'');assert.equal(h.c.LEAVE_ACCRUAL_PREVIEW.length,0);assert.equal(h.button.disabled,false);
});
test('연차 적용 중 다른 화면에서 새 미리보기를 시작했다면 새 상태는 보존한다',async()=>{
 const h=leaveHarness(),job=h.c.applyLeaveAccrual();h.main.isConnected=false;
 const next=[{user_id:'example-other',due_date:'2026-10-09',grant_days:1}];h.c.LEAVE_ACCRUAL_GENERATION++;h.c.LEAVE_ACCRUAL_PREVIEW=next;h.c.LEAVE_ACCRUAL_AS_OF='2026-10-09';h.release(null);await job;
 assert.equal(h.c.LEAVE_ACCRUAL_PREVIEW,next);assert.equal(h.c.LEAVE_ACCRUAL_AS_OF,'2026-10-09');assert.equal(h.button.disabled,false);
});
test('연차 적용 오류는 미리보기 자료를 유지하고 분리된 옛 버튼 잠금만 해제한다',async()=>{
 const h=leaveHarness(),preview=h.c.LEAVE_ACCRUAL_PREVIEW,job=h.c.applyLeaveAccrual();h.main.isConnected=false;h.release({message:'모의 오류'});await job;
 assert.equal(h.c.LEAVE_ACCRUAL_PREVIEW,preview);assert.equal(h.c.LEAVE_ACCRUAL_AS_OF,'2026-10-10');assert.equal(h.button.disabled,false);
});
test('사용 기록 지연 조회의 조기 종료에도 옛 조회 버튼 잠금을 해제한다',async()=>{
 let resolve;const fields=new Map(),get=id=>{if(!fields.has(id))fields.set(id,{value:'',textContent:'',disabled:false});return fields.get(id);},container={isConnected:true,querySelector:s=>get(s)};
 const model={container,rows:[],offset:0,sb:{rpc:()=>new Promise(r=>resolve=r)}},c={ui:model,uiGeneration:0,T:k=>k,filteredArgs:()=>({})};
 vm.createContext(c);vm.runInContext(fnSrc(read('hub-activity.js'),'loadPage'),c);
 const job=c.loadPage(false);assert.equal(get('#actlog-more').disabled,true);container.isConnected=false;c.ui={container:{isConnected:true}};c.uiGeneration++;
 resolve({data:[],error:null});await job;assert.equal(get('#actlog-more').disabled,false);assert.equal(model.rows.length,0);
});
