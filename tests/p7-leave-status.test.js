const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const html=fs.readFileSync('hr.html','utf8');
function setup(options={}){
  const start=html.indexOf('/* leave-status:test-start */'),end=html.indexOf('/* leave-status:test-end */');
  assert.ok(start>=0&&end>start,'직원별 잔액·미리보기 실행 코드가 있어야 함');
  const elements={},calls=[],alerts=[],settings=options.settings||{};
  const $=id=>elements[id]||(elements[id]={value:'',textContent:'',innerHTML:'',hidden:true,disabled:false});
  const profiles=[{user_id:'a',name:'이채연',hire_date:'2026-09-18',active:true},{user_id:'b',name:'abc',hire_date:'2025-01-01',active:true},{user_id:'c',name:'입사일없음',active:true},{user_id:'d',name:'퇴사',hire_date:'2025-01-01',active:false}];
  const balances=[{user_id:'a',balance:8},{user_id:'b',balance:3}];
  const ledger=[{user_id:'a',kind:'부여',days:10},{user_id:'a',kind:'사용',days:2},{user_id:'a',kind:'조정',days:1}];
  const c={ME:{role:options.role||'owner'},PROFILES:profiles,today:()=> '2026-10-03',suggestGrantDays:()=>15,esc:s=>String(s??'').replaceAll('<','&lt;').replaceAll('"','&quot;'),
    hubT:(key,def,vars)=>Object.entries(vars||{}).reduce((s,[k,v])=>s.replaceAll('{'+k+'}',v),(options.texts||{})[key]||def),
    hubSetting:(key,def)=>settings[key]??def,$,alert:s=>alerts.push(s),confirm:()=>options.confirm!==false,render:async()=>calls.push("render"),setStatus:()=>{},sb:{
      from(table){calls.push(table);const chain={select:()=>chain,gte:()=>chain,lt:()=>chain,then(resolve){return Promise.resolve({data:table==='v_leave_balance'?balances:ledger,error:options.loadError?{message:'조회실패'}:null}).then(resolve);}};return chain;},
      async rpc(name,args){calls.push([name,args]);if(name==='get_monthly_leave_accrual_candidates')return options.candidateError?{error:{message:'후보조회실패'}}:{data:options.candidates||[],error:null};return options.rpcError?{error:{message:'저장실패'}}:{data:[{target_balance:args.p_target}],error:null};}
    }};
  vm.createContext(c);vm.runInContext(html.slice(start,end)+';this.api={renderEmployeeLeaveStatus,openLeaveBalanceEditor,updateLeaveBalancePreview,saveLeaveBalance,monthlyLeaveCandidatesHtml,revokeMonthlyLeaveAccrual};',c);
  return {c,$,calls,alerts,api:c.api};
}
test('직원별 실제 잔액·올해 발생·사용을 보여 주고 기타 계정은 접는다',async()=>{
  const t=setup(),out=await t.api.renderEmployeeLeaveStatus();
  assert.match(out,/👥 직원별 연차 현황/);assert.match(out,/지금 남은 연차/);assert.match(out,/>8일</);assert.match(out,/>10일</);assert.match(out,/>2일</);
  assert.match(out,/<details[^>]*><summary>그 밖의 계정 2개/);assert.doesNotMatch(out,/제안일수|>부여<|>조정</);assert.doesNotMatch(out,/퇴사/);
  assert.match(out,/법정 기준 15일/);assert.ok(t.calls.includes('v_leave_balance'));
});
test('바꾸기 클릭 뒤 즉시 증감 미리보기·0일 저장·즉시 표 갱신',async()=>{
  const t=setup();await t.api.renderEmployeeLeaveStatus();t.api.openLeaveBalanceEditor(0);
  assert.equal(t.$('#leaveEditRow_0').hidden,false);assert.equal(t.$('#leaveTarget_0').value,8);
  t.$('#leaveTarget_0').value='10';t.api.updateLeaveBalancePreview(0);assert.equal(t.$('#leavePreview_0').textContent,'지금 8일 → 바꾸면 10일 (+2일)');
  t.$('#leaveTarget_0').value='0';t.api.updateLeaveBalancePreview(0);assert.equal(t.$('#leavePreview_0').textContent,'지금 8일 → 바꾸면 0일 (-8일)');
  await t.api.saveLeaveBalance(0);assert.equal(t.calls.at(-1)[0],'set_leave_balance');assert.equal(t.calls.at(-1)[1].p_target,0);assert.equal(t.$('#leaveBalance_0').textContent,'0일');
});
test('빈값·음수·무한대·잘못된 단위는 저장하지 않고 실패하면 기존 잔액을 보존한다',async()=>{
  const t=setup({rpcError:true});await t.api.renderEmployeeLeaveStatus();
  for(const val of ['', '-1','Infinity','0.25','abc']){t.$('#leaveTarget_0').value=val;await t.api.saveLeaveBalance(0);}
  assert.equal(t.calls.filter(c=>Array.isArray(c)&&c[0]==='set_leave_balance').length,0);
  t.$('#leaveTarget_0').value='10';await t.api.saveLeaveBalance(0);assert.equal(t.$('#leaveSave_0').disabled,false);assert.match(t.alerts.at(-1),/저장실패/);assert.equal(t.$('#leaveBalance_0').textContent,'');
});
test('숨길 계정 목록을 설정에서 바꾸며 글 변경과 조회 실패도 처리한다',async()=>{
  const t=setup({settings:{'leave.hidden_accounts':'[]'},texts:{'leave.grant.title':'우리 연차'}});assert.match(await t.api.renderEmployeeLeaveStatus(),/우리 연차/);assert.match(await t.api.renderEmployeeLeaveStatus(),/그 밖의 계정 1개/);
  const e=setup({loadError:true});assert.match(await e.api.renderEmployeeLeaveStatus(),/조회실패/);assert.doesNotMatch(await e.api.renderEmployeeLeaveStatus(),/onclick="openLeaveBalanceEditor/);
  const s=setup({role:'staff'});assert.equal(await s.api.renderEmployeeLeaveStatus(),'');await s.api.saveLeaveBalance(0);assert.equal(s.calls.length,0);
});
test('숨김 설정은 빈 목록과 와일드카드를 지원하고 잘못된 목록은 기본값으로 돌아간다',()=>{
  const code=fs.readFileSync('hub-texts.js','utf8').match(/\/\* hub-texts:test-start \*\/[\s\S]*?\/\* hub-texts:test-end \*\//)[0];
  const c={};vm.createContext(c);vm.runInContext(code+';this.validate=hubSettingValidate;this.def=hubSettingDefByKey("leave.hidden_accounts");',c);
  for(const value of ['[]','["*_test","공용1"]'])assert.equal(c.validate(c.def,value).ok,true);
  for(const value of ['oops','[1]','[""]','null','{}'])assert.equal(c.validate(c.def,value).ok,false);
});

const candidateRun={run_id:1,user_id:'a',due_date:'2026-10-18',days:1,candidate_dates:['2026-09-21','2026-09-22'],revoked_at:null};
test('자동 월차 후보는 원장만 날짜 목록과 취소 버튼을 볼 수 있고 취소 확인 뒤 RPC를 부른다',async()=>{
  const t=setup({candidates:[candidateRun]}),out=await t.api.renderEmployeeLeaveStatus();
  assert.match(out,/결근 후보 2일/);assert.match(out,/2026-09-21, 2026-09-22/);assert.match(out,/onclick="revokeMonthlyLeaveAccrual\(0\)"/);
  await t.api.revokeMonthlyLeaveAccrual(0);
  const call=t.calls.find(c=>Array.isArray(c)&&c[0]==='revoke_monthly_leave_accrual');assert.equal(call[1].p_run_id,1);assert.equal(call[1].p_reason,'결근 후보 확인 후 월차 취소');assert.equal(t.calls.at(-1),'render');
  for(const role of ['chief','manager','staff']){
    const other=setup({role,candidates:[candidateRun]});assert.equal(await other.api.renderEmployeeLeaveStatus(),'');assert.equal(other.api.monthlyLeaveCandidatesHtml('a'),'');await other.api.revokeMonthlyLeaveAccrual(0);assert.equal(other.calls.length,0);
  }
});
test('월차 빼기 확인 취소·이미 뺀 기록·RPC 실패·빠른 중복 클릭을 구분한다',async()=>{
  const cancelled=setup({confirm:false,candidates:[candidateRun]});await cancelled.api.renderEmployeeLeaveStatus();await cancelled.api.revokeMonthlyLeaveAccrual(0);
  assert.equal(cancelled.calls.some(c=>Array.isArray(c)&&c[0]==='revoke_monthly_leave_accrual'),false);
  const revoked=setup({candidates:[{...candidateRun,revoked_at:'2026-10-19'}]});const out=await revoked.api.renderEmployeeLeaveStatus();assert.match(out,/월차를 뺐습니다/);assert.doesNotMatch(out,/monthlyRevoke_/);await revoked.api.revokeMonthlyLeaveAccrual(0);assert.equal(revoked.calls.length,3);
  const failed=setup({rpcError:true,candidates:[candidateRun]});await failed.api.renderEmployeeLeaveStatus();await failed.api.revokeMonthlyLeaveAccrual(0);assert.match(failed.alerts[0],/월차를 빼지 못했습니다: 저장실패/);assert.equal(failed.$('#monthlyRevoke_0').disabled,false);
  const duplicate=setup({candidates:[candidateRun]});await duplicate.api.renderEmployeeLeaveStatus();await Promise.all([duplicate.api.revokeMonthlyLeaveAccrual(0),duplicate.api.revokeMonthlyLeaveAccrual(0)]);assert.equal(duplicate.calls.filter(c=>Array.isArray(c)&&c[0]==='revoke_monthly_leave_accrual').length,1);
  const missing=setup({candidateError:true});assert.match(await missing.api.renderEmployeeLeaveStatus(),/후보조회실패/);
});
test('월차 방식은 두 값만 저장하고 글·설명·선택지 이름을 허브 글 설정에서 읽는다',()=>{
  const code=fs.readFileSync('hub-texts.js','utf8').match(/\/\* hub-texts:test-start \*\/[\s\S]*?\/\* hub-texts:test-end \*\//)[0];
  const c={};vm.createContext(c);vm.runInContext(code+';this.validate=hubSettingValidate;this.def=hubSettingDefByKey("monthly_leave_attendance_mode");this.textDef=hubTextDefByKey;',c);
  assert.equal(c.def.def,'auto');for(const value of ['auto','published_schedule'])assert.equal(c.validate(c.def,value).ok,true);for(const value of ['','unknown','true'])assert.equal(c.validate(c.def,value).ok,false);
  for(const key of [c.def.labelKey,c.def.whereKey,...c.def.options.map(o=>o.labelKey)])assert.ok(c.textDef(key));
});
