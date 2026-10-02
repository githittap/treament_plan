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
