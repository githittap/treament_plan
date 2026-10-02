const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'hr.html'), 'utf8');

test('E장 연차 유형·시간 범위·저장 어휘·계약기간만료 표시를 제공한다', () => {
  assert.match(html, /<option>조퇴<\/option>/);
  assert.match(html, /id="lvTimeFrom"/);
  assert.match(html, /id="lvTimeTo"/);
  assert.match(html, /type==='반차'\|\|type==='조퇴'/);
  assert.match(html, /onclick="saveLeaveBalance\(\$\{i\}\)">/);
  assert.match(html, />계약기간만료<\/option>/);
});

test('반차·조퇴 신청은 시간 범위를 type_note로 저장하고 조회·캘린더에 표시한다', () => {
  assert.match(html, /type_note:\(type==='반차'\|\|type==='조퇴'\)\?`\$\{timeFrom\}~\$\{timeTo\}`/);
  assert.match(html, /r\.type_note&&r\.type!==['"]기타['"]/);
  assert.match(html, /row\.type_note\?' · '\+row\.type_note/);
});

test('관리자 무단결근 기준에 일수·시간(분) 설정과 저장이 있다', () => {
  assert.match(html, /id="absenceDays"/);
  assert.match(html, /absence_confirm_after_days/);
  assert.match(html, /absence_confirm_after_minutes/);
});

test('무단결근 일수 설정은 로컬 SQL 초안과 안전 롤백을 가진다', () => {
  const sql = fs.readFileSync(path.join(root, 'db', 'absence_candidate_days_draft.sql'), 'utf8');
  assert.match(sql, /absence_confirm_after_days/);
  assert.match(sql, /migration_state/);
  assert.ok(fs.existsSync(path.join(root, 'db', 'absence_candidate_days_rollback.sql')));
});

function extractFunction(name, endName) {
  const asyncStart = html.indexOf(`async function ${name}`);
  const start = asyncStart >= 0 ? asyncStart : html.indexOf(`function ${name}`);
  const end = html.indexOf(`function ${endName}`, start);
  assert.ok(start >= 0 && end > start, `${name} extraction boundary`);
  return html.slice(start, end);
}

test('실제 조퇴 신청 함수가 조퇴 type과 시간범위 payload를 INSERT한다', async () => {
  const fields = new Map([
    ['lvFrom', {value:'2026-09-24'}], ['lvTo', {value:'2026-09-24'}],
    ['lvType', {value:'조퇴'}], ['lvTimeFrom', {value:'13:00'}], ['lvTimeTo', {value:'15:00'}],
    ['lvReason', {value:'병원 방문'}], ['lvContact', {value:''}], ['lvSpecial', {value:''}],
    ['lvNote', {value:''}], ['lvMsg', {textContent:'', innerHTML:''}], ['lvOverlap', {value:'',textContent:''}]
  ]);
  let inserted;
  const sb = {from(table){assert.equal(table,'leave_requests');return {insert(payload){inserted=payload;return {select:()=>({maybeSingle:async()=>({data:{id:1},error:null})})};}};}};
  const context = {sb, ME:{id:'user-1'}, LEAVE_EDIT_ID:null, $:id=>fields.get(String(id).replace(/^#/,'') ), leaveConflict:async()=>0,
    computeLeaveDays:async()=>0.5, hide:()=>{}, setStatus:()=>{}, render:()=>{}, refreshBadges:()=>{}};
  vm.runInNewContext('(async()=>{'+extractFunction('submitLeave','stampDate')+'; this.submitLeave=submitLeave;})()', context);
  await context.submitLeave();
  assert.equal(inserted.type,'조퇴');
  assert.equal(inserted.type_note,'13:00~15:00');
  assert.equal(inserted.user_id,'user-1');
});

test('실제 반차 신청 payload가 조회 결과를 거쳐 캘린더에 시간과 함께 표시된다', async () => {
  const fields = new Map([
    ['lvFrom', {value:'2026-09-24'}], ['lvTo', {value:'2026-09-24'}],
    ['lvType', {value:'반차'}], ['lvTimeFrom', {value:'09:00'}], ['lvTimeTo', {value:'13:00'}],
    ['lvReason', {value:'개인 일정'}], ['lvContact', {value:''}], ['lvSpecial', {value:''}],
    ['lvNote', {value:''}], ['lvMsg', {textContent:'', innerHTML:''}], ['lvOverlap', {value:'',textContent:''}]
  ]);
  let inserted;
  const sb = {from(table){assert.equal(table,'leave_requests');return {insert(payload){inserted=payload;return {select:()=>({maybeSingle:async()=>({data:{id:42},error:null})})};}};}};
  const context = {sb, ME:{id:'user-half-day'}, LEAVE_EDIT_ID:null, $:id=>fields.get(String(id).replace(/^#/,'') ), leaveConflict:async()=>0,
    computeLeaveDays:async()=>0.5, hide:()=>{}, setStatus:()=>{}, render:()=>{}, refreshBadges:()=>{}};
  vm.runInNewContext('(async()=>{'+extractFunction('submitLeave','stampDate')+'; this.submitLeave=submitLeave;})()', context);
  await context.submitLeave();

  assert.equal(inserted.type,'반차');
  assert.equal(inserted.type_note,'09:00~13:00');
  assert.equal(inserted.days,0.5);
  assert.match(html, /\.select\(['"]user_id,type,type_note,date_from,date_to['"]\)/);

  const calendarSource = html.slice(html.indexOf('function calendarLeaveIndex'), html.indexOf('function scheduleRowsWithoutApprovedLeave'))
    + extractFunction('leaveDisplayText','mondayStr')
    + '; this.calendarLeaveIndex=calendarLeaveIndex; this.leaveDisplayText=leaveDisplayText;';
  const calendarContext = {schedulePersonName:person=>person.name};
  vm.runInNewContext(calendarSource, calendarContext);
  const queriedRows = [{...inserted,status:'승인'}];
  const calendar = calendarContext.calendarLeaveIndex(queriedRows, [{id:'staff-1',profile_user_id:'user-half-day',name:'합성 직원'}],
    '2026-09-01','2026-09-30',()=> '합성 직원',true);
  assert.deepEqual(JSON.parse(JSON.stringify(calendar['2026-09-24'])), [{label:'합성 직원',type:'반차',type_note:'09:00~13:00'}]);
  assert.equal(calendarContext.leaveDisplayText(calendar['2026-09-24'][0].type,calendar['2026-09-24'][0].type_note),'반차 · 09:00~13:00');
});

test('실제 무단결근 후보 계산이 설정된 일수 1일과 10일을 구분한다', () => {
  const source = html.slice(html.indexOf('function absenceCandidateDecision'), html.indexOf('function absenceManualExcluded'))+'; this.absenceCandidateDecision=absenceCandidateDecision;';
  const context = {};
  vm.runInNewContext(source, context);
  const base = {ds:'2026-09-23', todaySeoul:'2026-09-24', nowSeoul:'12:00', siueop:'10:00', afterMinutes:'0', shift:'09:00', hasAttendance:false, leave:null, manualStatus:undefined, excludePendingManual:true, settingsLoaded:true};
  assert.equal(context.absenceCandidateDecision({...base,afterDays:'1'}).candidate,true);
  assert.equal(context.absenceCandidateDecision({...base,afterDays:'10'}).candidate,false);
});

test('실제 휴가 표시 함수가 조퇴 시간범위를 표시한다', () => {
  const start = html.indexOf('function leaveDisplayText');
  const source = html.slice(start, html.indexOf('\n', html.indexOf('}', start))+1);
  const context = {};
  vm.runInNewContext(source+'; this.leaveDisplayText=leaveDisplayText;', context);
  assert.equal(context.leaveDisplayText('조퇴','13:00~15:00'),'조퇴 · 13:00~15:00');
});
