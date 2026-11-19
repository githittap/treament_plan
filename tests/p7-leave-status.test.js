const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const html=fs.readFileSync('hr.html','utf8');
function setup(options={}){
  const start=html.indexOf('/* leave-status:test-start */'),end=html.indexOf('/* leave-status:test-end */'),paginationStart=html.indexOf('async function fetchAttendancePages('),paginationEnd=html.indexOf('\nlet ATT_DIFF_LAST',paginationStart);
  assert.ok(start>=0&&end>start,'직원별 잔액·미리보기 실행 코드가 있어야 함');
  const elements={},calls=[],alerts=[],settings=options.settings||{};
  const $=id=>elements[id]||(elements[id]={value:'',textContent:'',innerHTML:'',hidden:true,disabled:false});
  const profiles=[{user_id:'a',name:'이채연',hire_date:'2026-09-18',active:true},{user_id:'b',name:'abc',hire_date:'2025-01-01',active:true},{user_id:'c',name:'입사일없음',active:true},{user_id:'d',name:'퇴사',hire_date:'2025-01-01',active:false}];
  const balances=[{user_id:'a',balance:8},{user_id:'b',balance:3}],ledgerHistory=options.ledgerHistory||[{user_id:'a',kind:'부여',days:10,note:'기존 연차',created_at:'2026-09-18T00:00:00Z'}];
  const ledger=[{user_id:'a',kind:'부여',days:10},{user_id:'a',kind:'사용',days:2},{user_id:'a',kind:'조정',days:1}];
  const c={Date:class extends Date{constructor(...args){super(...(args.length?args:[options.now||'2026-10-03T09:00:00+09:00']));}},ME:{role:options.role||'owner',id:options.userId},SETTINGS:Object.assign({'leave.manager_access_enabled':'false','leave.manager_can_approve':'false'},settings),SETTINGS_LOAD_OK:true,PROFILES:profiles,nameOf:id=>profiles.find(p=>p.user_id===id)?.name||id,today:()=> '2026-10-03',suggestGrantDays:()=>15,esc:s=>String(s??'').replaceAll('<','&lt;').replaceAll('"','&quot;'),
    hubT:(key,def,vars)=>Object.entries(vars||{}).reduce((s,[k,v])=>s.replaceAll('{'+k+'}',v),(options.texts||{})[key]||def),
    stampDate:s=>String(s).startsWith('2026-09-18')?'2026.09.18':String(s).slice(0,10),prompt:()=>options.prompts?.shift()??null,
    hubSetting:(key,def)=>settings[key]??def,$,alert:s=>alerts.push(s),confirm:()=>options.confirm!==false,render:async()=>calls.push("render"),setStatus:()=>{},sb:{
       from(table){calls.push(table);const query={columns:'',start:0,size:1000},chain={select(columns){query.columns=columns;return chain;},gte(key,value){query['gte_'+key]=value;return chain;},lte(key,value){query['lte_'+key]=value;return chain;},neq(key,value){query['neq_'+key]=value;return chain;},lt:()=>chain,eq(key,value){query[key]=value;return chain;},order:()=>chain,limit(n){query.size=n;return chain;},range(start,end){query.start=start;query.size=end-start+1;return chain;},maybeSingle(){return Promise.resolve({data:(options.requests||[]).find(r=>r.id===query.id)||null,error:null});},then(resolve){const all=table==='leave_requests'?(options.requests||[]).filter(r=>(!query.status||r.status===query.status)&&(!query.user_id||r.user_id===query.user_id)&&(query.neq_id==null||r.id!==query.neq_id)&&(!query.lte_date_from||r.date_from<=query.lte_date_from)&&(!query.gte_date_to||r.date_to>=query.gte_date_to)):table==='v_leave_balance'?balances:table==='leave_accrual_runs'?(options.accrualRuns||[]):table==='leave_year_earned_override'?(options.earnedRows||[]).filter(r=>r.year===query.year):(table==='leave_ledger'&&query.columns.includes('created_at')?ledgerHistory:ledger),data=all.slice(query.start,query.start+query.size),error=table==='leave_year_earned_override'&&options.earnedLoadError?{message:'보정 조회 실패'}:table==='leave_ledger'&&query.columns.includes('created_at')&&options.ledgerHistoryError?{message:'상세 조회실패'}:options.loadError?{message:'조회실패'}:null;return Promise.resolve({data,error}).then(resolve);}};return chain;},
      rpc(name,args){calls.push([name,args]);if(name==='leave_protected_ledger_ids')return {order(){return this;},range(start,end){return Promise.resolve(options.protectedError?{error:{message:'보호 목록 실패'}}:{data:(options.protectedIds||[]).slice(start,end+1).map(ledger_id=>({ledger_id})),error:null});}};if(name==='get_monthly_leave_accrual_candidates')return Promise.resolve(options.candidateError?{error:{message:'후보조회실패'}}:{data:options.candidates||[],error:null});return Promise.resolve(options.rpcError?{error:{message:'저장실패'}}:{data:name==='set_leave_year_earned'?[{earned_days:args.p_days,updated_by_name:'수정자'}]:[{target_balance:args.p_target}],error:null});}
    }};
  const accessStart=html.indexOf('/* leave-manager-access-ui:test-start */'),accessEnd=html.indexOf('/* leave-manager-access-ui:test-end */');
  vm.createContext(c);vm.runInContext(html.slice(paginationStart,paginationEnd)+'\n'+html.slice(accessStart,accessEnd)+'\n'+html.slice(start,end)+';this.api={renderEmployeeLeaveStatus,openLeaveBalanceEditor,updateLeaveBalancePreview,saveLeaveBalance,saveLeaveYearEarned:typeof saveLeaveYearEarned==="function"?saveLeaveYearEarned:null,monthlyLeaveCandidatesHtml,revokeMonthlyLeaveAccrual,editLeaveLedger,editApprovedLeaveDates};',c);
  return {c,$,calls,alerts,api:c.api};
}
test('매니저 연차관리만 켜도 승인 기록만 날짜 버튼, 자동 적립은 보호하고 수기 수정은 저장한다',async()=>{
 const requests=[{id:11,user_id:'a',status:'승인',type:'반차',type_note:null,date_from:'2026-10-01',date_to:'2026-10-01',days:0.5},{id:12,user_id:'a',status:'취소'}];
 const ledgerHistory=[{id:1,user_id:'a',kind:'사용',days:0.5,ref:11,created_at:'2026-09-18T00:00:00Z'},{id:2,user_id:'a',kind:'사용',days:1,ref:12,created_at:'2026-09-18T00:00:00Z'},{id:3,user_id:'a',kind:'부여',days:1,ref:null,created_at:'2026-09-18T00:00:00Z'},{id:4,user_id:'a',kind:'조정',days:1,note:'수기',effective_date:null,ref:null,created_at:'2026-09-18T00:00:00Z'}];
 const t=setup({role:'manager',userId:'b',settings:{'leave.manager_access_enabled':'true','leave.manager_can_accrue':'false'},requests,ledgerHistory,protectedIds:[3],prompts:['조정','-1','2026-10-02','수정']});
 const out=await t.api.renderEmployeeLeaveStatus();assert.match(out,/editApprovedLeaveDates\(11\)/);assert.doesNotMatch(out,/editApprovedLeaveDates\(12\)|editLeaveLedger\(2\)/);assert.match(out,/editLeaveLedger\(3\)/);
 await t.api.editLeaveLedger(3);const call=t.calls.find(x=>Array.isArray(x)&&x[0]==='update_leave_ledger_entry');assert.equal(call[1].p_days,-1);assert.equal(call[1].p_effective_date,'2026-10-02');
 const overlap=setup({role:'manager',userId:'b',settings:{'leave.manager_access_enabled':'true'},requests:[...requests,{id:13,user_id:'a',status:'승인',date_from:'2026-10-05',date_to:'2026-10-05'}],confirm:false,prompts:['2026-10-05','2026-10-05','반차','']});await overlap.api.editApprovedLeaveDates(11);assert.equal(overlap.calls.some(x=>Array.isArray(x)&&x[0]==='edit_approved_leave_dates'),false);
 const failed=setup({role:'manager',settings:{'leave.manager_access_enabled':'true'},protectedError:true,ledgerHistory});const failedHtml=await failed.api.renderEmployeeLeaveStatus();assert.match(failedHtml,/기록만 표시/);assert.match(failedHtml,/수기/);assert.doesNotMatch(failedHtml,/editLeaveLedger\(/);
});
test('직원별 실제 잔액·올해 발생·사용을 보여 주고 기타 계정은 접는다',async()=>{
  const t=setup(),out=await t.api.renderEmployeeLeaveStatus();
  assert.match(out,/👥 직원별 연차 현황/);assert.match(out,/지금 남은 연차/);assert.match(out,/>8일</);assert.match(out,/>10일</);assert.match(out,/>2일</);
  assert.match(out,/<details[^>]*><summary>그 밖의 계정 2개/);assert.doesNotMatch(out,/제안일수/);assert.doesNotMatch(out,/퇴사/);
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
test('자동 월차 후보는 원장과 허용된 매니저가 날짜 목록과 취소 버튼을 볼 수 있고 취소 확인 뒤 RPC를 부른다',async()=>{
  const t=setup({candidates:[candidateRun]}),out=await t.api.renderEmployeeLeaveStatus();
  assert.match(out,/결근 후보 2일/);assert.match(out,/2026-09-21, 2026-09-22/);assert.match(out,/onclick="revokeMonthlyLeaveAccrual\(0\)"/);
  await t.api.revokeMonthlyLeaveAccrual(0);
  const call=t.calls.find(c=>Array.isArray(c)&&c[0]==='revoke_monthly_leave_accrual');assert.equal(call[1].p_run_id,1);assert.equal(call[1].p_reason,'결근 후보 확인 후 월차 취소');assert.equal(t.calls.at(-1),'render');
  for(const role of ['chief','staff']){
    const other=setup({role,candidates:[candidateRun]});assert.equal(await other.api.renderEmployeeLeaveStatus(),'');assert.equal(other.api.monthlyLeaveCandidatesHtml('a'),'');await other.api.revokeMonthlyLeaveAccrual(0);assert.equal(other.calls.length,0);
  }
  const manager=setup({role:'manager',settings:{'leave.manager_access_enabled':'true','leave.manager_can_approve':'true'},candidates:[candidateRun],texts:{'leave.ledger.history_title':'설정한 기록 제목','leave.ledger.history_th_name':'설정한 직원 머리','leave.ledger.history_th_date':'설정한 일자 머리','leave.ledger.history_th_kind':'설정한 종류 머리','leave.ledger.history_th_days':'설정한 일수 머리','leave.ledger.history_th_note':'설정한 메모 머리'}});
  const managerHtml=await manager.api.renderEmployeeLeaveStatus();assert.match(managerHtml,/직원별 연차 현황/);assert.match(managerHtml,/설정한 기록 제목 \(1건\)[\s\S]*2026\.09\.18[\s\S]*기존 연차/);for(const label of ['설정한 직원 머리','설정한 일자 머리','설정한 종류 머리','설정한 일수 머리','설정한 메모 머리'])assert.match(managerHtml,new RegExp(label));assert.doesNotMatch(managerHtml,/monthlyRevoke_/);
  const empty=setup({role:'manager',settings:{'leave.manager_access_enabled':'true'},ledgerHistory:[],texts:{'leave.ledger.history_empty':'설정한 빈 목록 안내'}});assert.match(await empty.api.renderEmployeeLeaveStatus(),/설정한 빈 목록 안내/);
  const failed=setup({role:'manager',settings:{'leave.manager_access_enabled':'true'},ledgerHistoryError:true,texts:{'leave.ledger.history_load_fail':'설정한 조회 실패 안내'}});assert.match(await failed.api.renderEmployeeLeaveStatus(),/설정한 조회 실패 안내/);
  const manyRows=Array.from({length:501},(_,i)=>({user_id:'a',kind:'부여',days:1,note:'page-'+i,created_at:'2026-09-18T00:00:00Z'}));
  const paginated=setup({role:'manager',settings:{'leave.manager_access_enabled':'true'},ledgerHistory:manyRows}),paginatedHtml=await paginated.api.renderEmployeeLeaveStatus();
  assert.match(paginatedHtml,/개별 연차 기록 \(501건\)/);assert.equal(paginated.calls.filter(name=>name==='leave_ledger').length,3,'요약 1회와 상세 2페이지를 조회');
  assert.equal(manager.api.monthlyLeaveCandidatesHtml('a'),'');await manager.api.revokeMonthlyLeaveAccrual(0);
  assert.equal(manager.calls.some(c=>Array.isArray(c)&&c[0]==='revoke_monthly_leave_accrual'),false);
});
test('월차 빼기 확인 취소·이미 뺀 기록·RPC 실패·빠른 중복 클릭을 구분한다',async()=>{
  const cancelled=setup({confirm:false,candidates:[candidateRun]});await cancelled.api.renderEmployeeLeaveStatus();await cancelled.api.revokeMonthlyLeaveAccrual(0);
  assert.equal(cancelled.calls.some(c=>Array.isArray(c)&&c[0]==='revoke_monthly_leave_accrual'),false);
   const revoked=setup({candidates:[{...candidateRun,revoked_at:'2026-10-19'}]});const out=await revoked.api.renderEmployeeLeaveStatus();assert.match(out,/월차를 뺐습니다/);assert.doesNotMatch(out,/monthlyRevoke_/);const before=revoked.calls.length;await revoked.api.revokeMonthlyLeaveAccrual(0);assert.equal(revoked.calls.length,before);
  const failed=setup({rpcError:true,candidates:[candidateRun]});await failed.api.renderEmployeeLeaveStatus();await failed.api.revokeMonthlyLeaveAccrual(0);assert.match(failed.alerts[0],/월차를 빼지 못했습니다: 저장실패/);assert.equal(failed.$('#monthlyRevoke_0').disabled,false);
  const duplicate=setup({candidates:[candidateRun]});await duplicate.api.renderEmployeeLeaveStatus();await Promise.all([duplicate.api.revokeMonthlyLeaveAccrual(0),duplicate.api.revokeMonthlyLeaveAccrual(0)]);assert.equal(duplicate.calls.filter(c=>Array.isArray(c)&&c[0]==='revoke_monthly_leave_accrual').length,1);
  const missing=setup({candidateError:true});assert.match(await missing.api.renderEmployeeLeaveStatus(),/후보조회실패/);
});
test('매니저 월 적립 스위치를 켜면 후보·실행 기록이 보이고 끄면 사라진다',async()=>{
  const settings={'leave.manager_access_enabled':'true','leave.manager_can_accrue':'true'};
  const run={id:3,user_id:'a',due_date:'2026-10-18',days:1,attendance_confirmed_by:'b',executed_by_name:'이매니저',executed_by_role:'manager'};
  const t=setup({role:'manager',settings,candidates:[candidateRun],accrualRuns:[run]});
  const html=await t.api.renderEmployeeLeaveStatus();
  assert.match(html,/monthlyRevoke_0/);assert.match(html,/실행: 매니저 이매니저/);
  await t.api.revokeMonthlyLeaveAccrual(0);
  assert.equal(t.calls.some(c=>Array.isArray(c)&&c[0]==='revoke_monthly_leave_accrual'),true);
  t.c.SETTINGS['leave.manager_can_accrue']='false';
  const blocked=await t.api.renderEmployeeLeaveStatus();
  assert.doesNotMatch(blocked,/monthlyRevoke_0|실행: 매니저/);
});
test('월차 방식은 두 값만 저장하고 글·설명·선택지 이름을 허브 글 설정에서 읽는다',()=>{
  const code=fs.readFileSync('hub-texts.js','utf8').match(/\/\* hub-texts:test-start \*\/[\s\S]*?\/\* hub-texts:test-end \*\//)[0];
  const c={};vm.createContext(c);vm.runInContext(code+';this.validate=hubSettingValidate;this.def=hubSettingDefByKey("monthly_leave_attendance_mode");this.textDef=hubTextDefByKey;',c);
  assert.equal(c.def.def,'auto');for(const value of ['auto','published_schedule'])assert.equal(c.validate(c.def,value).ok,true);for(const value of ['','unknown','true'])assert.equal(c.validate(c.def,value).ok,false);
  for(const key of [c.def.labelKey,c.def.whereKey,...c.def.options.map(o=>o.labelKey)])assert.ok(c.textDef(key));
});

test('올해 생긴 보정값은 0도 표시하고 해당 연도의 편집자와 설정 문구를 표시한다',async()=>{
  const t=setup({earnedRows:[{user_id:'a',year:2026,earned_days:'0',updated_by_name:'<수정자>'},{user_id:'b',year:2025,earned_days:'99'}],texts:{'leave.status.earned_manual':'편집 {name}'}});
  const out=await t.api.renderEmployeeLeaveStatus();
  assert.match(out,/<th>사용함<\/th>/);
  assert.match(out,/id="leaveEarned_0">0일<div class="sub">편집 &lt;수정자>/);
  assert.doesNotMatch(out,/>99일</);
  assert.match(out,/id="leaveEarnedClear_0"[^>]*onclick="saveLeaveYearEarned\(0,true\)"/);
  t.api.openLeaveBalanceEditor(0);
  assert.equal(t.$('#leaveEarnedTarget_0').value,'');
});

test('올해 생긴 값 저장과 초기화는 잔액 RPC 없이 동작하고 0일도 저장한다',async()=>{
  const t=setup();await t.api.renderEmployeeLeaveStatus();
  t.api.openLeaveBalanceEditor(0);
  await t.api.saveLeaveYearEarned(0);
  assert.equal(t.calls.filter(c=>Array.isArray(c)&&c[0]==='set_leave_year_earned').length,0);
  t.$('#leaveEarnedTarget_0').value='0.25';await t.api.saveLeaveYearEarned(0);
  assert.match(t.alerts.at(-1),/0\.5일/);
  assert.equal(t.calls.filter(c=>Array.isArray(c)&&c[0]==='set_leave_year_earned').length,0);
  t.$('#leaveEarnedTarget_0').value='0';t.$('#leaveNote_0').value='메모';
  t.$('#leaveTarget_0').value='12';
  await Promise.all([t.api.saveLeaveYearEarned(0),t.api.saveLeaveYearEarned(0)]);
  const writes=t.calls.filter(c=>Array.isArray(c)&&c[0]==='set_leave_year_earned');
  assert.equal(writes.length,1);assert.equal(writes[0][1].p_days,0);
  assert.equal(writes[0][1].p_year,2026);assert.equal('p_note' in writes[0][1],false);
  assert.match(t.$('#leaveEarned_0').innerHTML,/0일.*직접 고침 · 수정자/);
  assert.equal(t.$('#leaveEarnedClear_0').hidden,false);
  assert.equal(t.$('#leaveTarget_0').value,'12');
  await t.api.saveLeaveYearEarned(0,true);
  assert.equal(t.calls.at(-1)[0],'clear_leave_year_earned');
  assert.equal(t.$('#leaveEarned_0').innerHTML,'10일');
  assert.equal(t.$('#leaveEarnedClear_0').hidden,true);
  assert.equal(t.calls.some(c=>Array.isArray(c)&&c[0]==='set_leave_balance'),false);
});

test('매니저 본인 행과 보정 조회 실패에서는 올해 생긴 값을 바꿀 수 없다',async()=>{
  const m=setup({role:'manager',userId:'a',settings:{'leave.manager_access_enabled':'true'}});
  const out=await m.api.renderEmployeeLeaveStatus();
  assert.doesNotMatch(out,/openLeaveBalanceEditor\(0\)|leaveEarnedSave_0/);
  assert.match(out,/openLeaveBalanceEditor\(1\)/);
  m.$('#leaveEarnedTarget_0').value='5';await m.api.saveLeaveYearEarned(0);
  assert.equal(m.calls.some(c=>Array.isArray(c)&&c[0]==='set_leave_year_earned'),false);
  const f=setup({earnedLoadError:true});const error=await f.api.renderEmployeeLeaveStatus();
  assert.match(error,/올해 생긴 연차를 확인하지 못했습니다/);
  assert.match(error,/saveLeaveBalance\(0\)/);
  assert.doesNotMatch(error,/leaveEarnedSave_0/);
  f.$('#leaveEarnedTarget_0').value='5';await f.api.saveLeaveYearEarned(0);
  assert.equal(f.calls.some(c=>Array.isArray(c)&&c[0]==='set_leave_year_earned'),false);
});

test('연도는 서울 자정 기준과 같고 보정 쓰기 오류는 기존 표시를 유지한다',async()=>{
  const t=setup({now:'2026-12-31T15:30:00Z',earnedRows:[{user_id:'a',year:2027,earned_days:7,updated_by_name:'전임자'}],rpcError:true});
  const html=await t.api.renderEmployeeLeaveStatus();
  assert.match(html,/id="leaveEarned_0">7일/);
  assert.match(html,/2027년에 생긴 연차를/);
  const cell=t.$('#leaveEarned_0'),before=html.match(/<td id="leaveEarned_0">([\s\S]*?)<\/td>/)[1];
  assert.match(before,/7일.*직접 고침 · 전임자/);
  cell.innerHTML=before;
  t.$('#leaveEarnedTarget_0').value='8';await t.api.saveLeaveYearEarned(0);
  assert.equal(t.calls.at(-1)[1].p_year,2027);
  assert.match(t.alerts.at(-1),/올해 생긴 연차를 저장하지 못했습니다/);
  assert.equal(cell.innerHTML,before);
  assert.equal(t.$('#leaveEarnedSave_0').disabled,false);
});

test('올해 생긴 연차 문구 전부를 설정에서 편집할 수 있고 자리표시자 계약이 일치한다',()=>{
  const code=fs.readFileSync('hub-texts.js','utf8').match(/\/\* hub-texts:test-start \*\/[\s\S]*?\/\* hub-texts:test-end \*\//)[0];
  const c={};vm.createContext(c);vm.runInContext(code+';this.textDef=hubTextDefByKey;',c);
  const keys=[...new Set([...html.matchAll(/hubT\('(leave\.status\.earned_[a-z_]+)'/g)].map(m=>m[1]))];
  assert.ok(keys.length>0);
  for(const key of keys){
    const def=c.textDef(key);assert.ok(def,key);
    assert.deepEqual(Array.from(def.vars||[]),[...def.def.matchAll(/\{([a-z_]+)\}/g)].map(m=>m[1]),key);
  }
  assert.equal(c.textDef('leave.status.used').def,'사용함');
});
