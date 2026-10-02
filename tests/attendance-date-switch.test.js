const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const html = fs.readFileSync(path.join(__dirname, '..', 'hr.html'), 'utf8');
const ids = ['manualWorkDate','manualClockInHour','manualClockInMinute','manualClockOutHour','manualClockOutMinute',
  'manualClockInTime','manualClockOutTime','manualLate','manualEarly','manualLunchOvertimeRaw',
  'manualClockoutOvertimeRaw','manualEveningOvertimeRaw','manualHalfDay','manualReasonRequired','manualReason','manualNote',
  'manualWeekday','manualOvertimeTotal','manualAttMsg','manualAttendanceCalendar','manualAttendanceDayDetailText',
  'manualAttendanceDayDetail','manualAttendanceSubmit'];
function harness(rows = [], width = 900) {
  const nodes = Object.fromEntries(ids.map(id => [id, {value:'',checked:false,textContent:'',innerHTML:'',disabled:false,
    removeAttribute(){},querySelector(){return {focus(){}};}}]));
  const queries = [], calls = [], prompts = [];
  let result = {data:null,error:null};
  const query = {select(){return this;},eq(k,v){queries.push([k,v]);return this;},order(){return this;},limit(){return this;},
    maybeSingle(){return Promise.resolve(result);}};
  const context = {$:id=>nodes[id.slice(1)],ME:{id:'self',role:'owner'},today:()=> '2026-10-03',
    esc:s=>String(s),confirm:s=>{prompts.push(s);return context.accept;},accept:true,
    matchMedia:()=>({matches:width<=640}),setTimeout(){},render(){},
    sb:{from:()=>query,rpc:async(name,payload)=>{calls.push([name,payload]);return {error:null};}}};
  vm.createContext(context);
  vm.runInContext(html.slice(html.indexOf('let MANUAL_DETAIL_OPEN'),html.indexOf('// 기존 submit_manual_attendance_v2 RPC 계약')),context);
  context.manualAttendanceFormHtml(rows);
  nodes.manualWorkDate.value='2026-10-03';
  nodes.manualHalfDay.value='없음';
  return {context,nodes,queries,calls,prompts,setResult:r=>result=r};
}

test('날짜 클릭은 새 날짜의 저장값 전체를 복원하고 원자료를 바꾸지 않는다', async()=>{
  const h=harness(), row={user_id:'self',work_date:'2026-10-02',clock_in:'09:07:00',clock_out:'18:03:00',
    late_min:7,early_min:3,lunch_overtime_raw_text:'01:09',clockout_overtime_raw_text:'19',evening_overtime_raw_text:'9',
    half_day:'오후 반차',reason_required:true,reason:'정정',manual_note:'비고'};
  h.setResult({data:row,error:null});
  h.nodes.manualClockInHour.value='11';h.nodes.manualLunchOvertimeRaw.value='999';
  await h.context.selectManualAttendanceDate('2026-10-02');
  assert.equal(h.nodes.manualClockInHour.value,'09');assert.equal(h.nodes.manualClockInMinute.value,'07');
  assert.equal(h.nodes.manualClockOutHour.value,'18');assert.equal(h.nodes.manualClockOutMinute.value,'03');
  assert.equal(h.nodes.manualClockInTime.value,'09:07');assert.equal(h.nodes.manualClockOutTime.value,'18:03');
  assert.equal(h.nodes.manualLate.value,'7');assert.equal(h.nodes.manualEarly.value,'3');
  assert.equal(h.nodes.manualLunchOvertimeRaw.value,'01:09');assert.equal(h.nodes.manualClockoutOvertimeRaw.value,'19');
  assert.equal(h.nodes.manualEveningOvertimeRaw.value,'9');assert.equal(h.nodes.manualOvertimeTotal.textContent,'70분');
  assert.equal(h.nodes.manualHalfDay.value,'오후 반차');assert.equal(h.nodes.manualReasonRequired.checked,true);
  assert.equal(h.nodes.manualReason.value,'정정');assert.equal(h.nodes.manualNote.value,'비고');
  assert.deepEqual(h.queries,[['user_id','self'],['work_date','2026-10-02']]);
  assert.equal(row.clock_in,'09:07:00');assert.equal(row.lunch_overtime_raw_text,'01:09');
});

test('저장값 없는 날짜 클릭은 앞 날짜의 모든 입력을 비운다', async()=>{
  const h=harness();
  for(const id of ids.filter(id=>!['manualWorkDate','manualHalfDay'].includes(id)))h.nodes[id].value='old';
  h.nodes.manualReasonRequired.checked=true;
  await h.context.selectManualAttendanceDate('2026-09-01');
  for(const id of ['manualClockInHour','manualClockInMinute','manualClockOutHour','manualClockOutMinute','manualLate',
    'manualEarly','manualLunchOvertimeRaw','manualClockoutOvertimeRaw','manualEveningOvertimeRaw','manualReason','manualNote'])
    assert.equal(h.nodes[id].value,'',id);
  assert.equal(h.nodes.manualHalfDay.value,'없음');assert.equal(h.nodes.manualReasonRequired.checked,false);
  assert.equal(h.nodes.manualOvertimeTotal.textContent,'0분');
});

test('미저장 변경이 있으면 취소 시 날짜·내용·조회 모두 유지한다',async()=>{
  const h=harness();
  await h.context.loadManualAttendanceDate('2026-10-03');
  h.nodes.manualNote.value='저장 전 메모';h.context.accept=false;
  const count=h.queries.length;
  await h.context.selectManualAttendanceDate('2026-10-02');
  assert.equal(h.nodes.manualWorkDate.value,'2026-10-03');assert.equal(h.nodes.manualNote.value,'저장 전 메모');
  assert.equal(h.queries.length,count);assert.equal(h.prompts.length,1);assert.match(h.prompts[0],/저장 안 한/);
  h.context.accept=true;
  await h.context.selectManualAttendanceDate('2026-10-02');
  assert.equal(h.nodes.manualWorkDate.value,'2026-10-02');assert.equal(h.nodes.manualNote.value,'');
});

test('관리자 최초 화면은 다른 직원 반차·메모를 본인 입력에 섞지 않는다',()=>{
  const h=harness([{user_id:'other',work_date:'2026-10-03',half_day:'오후 반차',manual_note:'다른 직원'}]);
  const output=h.context.manualAttendanceFormHtml([{user_id:'other',work_date:'2026-10-03',half_day:'오후 반차',manual_note:'다른 직원'}]);
  assert.doesNotMatch(output,/다른 직원/);assert.doesNotMatch(output,/<option selected>오후 반차/);
});

test('같은 날짜를 다시 눌러도 미저장 입력은 지워지지 않는다',async()=>{
  const h=harness();await h.context.loadManualAttendanceDate('2026-10-03');
  h.nodes.manualNote.value='진행 중';const count=h.queries.length;
  await h.context.selectManualAttendanceDate('2026-10-03');
  assert.equal(h.nodes.manualNote.value,'진행 중');assert.equal(h.queries.length,count);
});

test('조회 지연 중 제출을 막고 늦게 온 이전 날짜 응답은 새 날짜를 덮지 않는다',async()=>{
  const h=harness();let resolve;
  h.setResult(new Promise(r=>resolve=r));
  const old=h.context.selectManualAttendanceDate('2026-10-01');
  assert.equal(h.nodes.manualAttendanceSubmit.disabled,true);
  await h.context.submitManualAttendance();assert.equal(h.calls.length,0);
  h.setResult({data:{user_id:'self',work_date:'2026-10-02',manual_note:'새 날짜'},error:null});
  await h.context.selectManualAttendanceDate('2026-10-02');
  resolve({data:{user_id:'self',work_date:'2026-10-01',manual_note:'옛 날짜'},error:null});await old;
  assert.equal(h.nodes.manualWorkDate.value,'2026-10-02');assert.equal(h.nodes.manualNote.value,'새 날짜');
  assert.equal(h.nodes.manualAttendanceSubmit.disabled,false);
});

test('조회 실패는 빈 기록으로 저장하지 않고 다시 날짜 선택하면 복구한다',async()=>{
  const h=harness();h.setResult({data:null,error:{message:'offline'}});
  await h.context.loadManualAttendanceDate('2026-10-03');
  assert.match(h.nodes.manualAttMsg.textContent,/offline/);assert.equal(h.nodes.manualAttendanceSubmit.disabled,true);
  await h.context.submitManualAttendance();assert.equal(h.calls.length,0);
  h.setResult({data:null,error:null});await h.context.selectManualAttendanceDate('2026-10-03');
  assert.equal(h.nodes.manualAttendanceSubmit.disabled,false);
});

test('휴대폰 입력은 640px 이하에서만 기본 time 시계를 쓰고 PC 시·분은 유지한다',()=>{
  const h=harness(), output=h.context.manualAttendanceFormHtml();
  assert.match(output,/<input type="time"[^>]*id="manualClockInTime"/);
  assert.match(output,/<input type="time"[^>]*id="manualClockOutTime"/);
  assert.match(output,/id="manualClockInHour"/);assert.match(output,/id="manualClockOutMinute"/);
  assert.match(html,/@media\s*\(max-width:640px\)\{[^}]*manual-clock-desktop\{display:none\}/);
  assert.match(html,/\.manual-clock-mobile\{display:none/);
});

test('폰 원형 시계의 input 이벤트는 PC 칸과 동기화되고 HH:mm 값으로 저장된다',async()=>{
  for(const role of ['owner','staff']){
    const h=harness([],390);h.context.ME.role=role;await h.context.loadManualAttendanceDate('2026-10-03');
    const output=h.context.manualAttendanceFormHtml();
    await h.context.loadManualAttendanceDate('2026-10-03');
    for(const [kind,value] of [['In','09:07'],['Out','18:03']]){
      const node=h.nodes['manualClock'+kind+'Time'];node.value=value;
      const handler=output.match(new RegExp('<input type="time"[^>]*id="manualClock'+kind+'Time"[^>]*oninput="([^"]+)"'));
      assert.ok(handler);vm.runInContext(handler[1],h.context);
    }
    assert.equal(h.nodes.manualClockInHour.value,'09');assert.equal(h.nodes.manualClockOutMinute.value,'03');
    h.nodes.manualLunchOvertimeRaw.value='01:09';h.nodes.manualClockoutOvertimeRaw.value='19';
    await h.context.submitManualAttendance();assert.equal(h.calls.length,1);
    const payload=h.calls[0][1];assert.equal(payload.p_clock_in,'09:07');assert.equal(payload.p_clock_out,'18:03');
    assert.equal(payload.p_lunch_overtime_raw_text,'01:09');assert.equal(payload.p_lunch_overtime_min,60);
    assert.equal(payload.p_clockout_overtime_raw_text,'19');assert.equal(payload.p_clockout_overtime_min,10);
  }
});

test('PC에서 시·분 선택 후 폰 폭으로 바꿔도 같은 시각으로 저장된다',async()=>{
  const h=harness();await h.context.loadManualAttendanceDate('2026-10-03');
  h.nodes.manualClockInHour.value='00';h.nodes.manualClockInMinute.value='00';
  h.context.syncManualClock('In',false);
  assert.equal(h.nodes.manualClockInTime.value,'00:00');
  h.context.matchMedia=()=>({matches:true});
  await h.context.submitManualAttendance();assert.equal(h.calls[0][1].p_clock_in,'00:00');
  assert.equal(h.calls[0][1].p_clock_out,null);
});

test('날짜 전환 안내·확인·조회 오류 글 세 개를 허브 설정에서 바꿀 수 있다',async()=>{
  const h=harness();
  const js=fs.readFileSync(path.join(__dirname,'..','hub-texts.js'),'utf8');
  const block=js.match(/\/\* hub-texts:test-start \*\/[\s\S]*?\/\* hub-texts:test-end \*\//)[0];
  vm.runInContext(block,h.context);
  vm.runInContext("hubTextSetOverrides([{key:'att.manual.confirm_discard',value:'내용 버릴까요?'},{key:'att.manual.m_loading',value:'읽는 중'},{key:'att.manual.m_load_fail',value:'조회 오류 {msg}'}]);",h.context);
  await h.context.loadManualAttendanceDate('2026-10-03');h.nodes.manualNote.value='미저장';h.context.accept=false;
  await h.context.selectManualAttendanceDate('2026-10-02');assert.equal(h.prompts[0],'내용 버릴까요?');
  h.context.accept=true;let resolve;h.setResult(new Promise(r=>resolve=r));
  const pending=h.context.selectManualAttendanceDate('2026-10-02');assert.equal(h.nodes.manualAttMsg.textContent,'읽는 중');
  resolve({data:null,error:{message:'offline'}});await pending;assert.equal(h.nodes.manualAttMsg.textContent,'조회 오류 offline');
});
