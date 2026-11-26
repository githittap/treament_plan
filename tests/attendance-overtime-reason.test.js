const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {spawnSync} = require('node:child_process');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'hr.html'), 'utf8');

function helpers(me = {jobGroup: 'lab', department: ''}, settings = {}) {
  const start = html.indexOf('function overtimeReasonLen');
  const end = html.indexOf('function manualAttendanceDetailText', start);
  assert.ok(start > 0 && end > start);
  const context = {hubT: (k, d) => d, ME: me,
    hubSettingBoolean: (key, def) => Object.prototype.hasOwnProperty.call(settings, key) ? settings[key] === 'true' : def};
  vm.createContext(context);
  vm.runInContext(`${html.slice(start, end)};this.overtimeReasonMissing=overtimeReasonMissing;this.overtimeReasonErrorText=overtimeReasonErrorText;this.overtimeReasonRequired=overtimeReasonRequired;this.overtimeReasonGroup=overtimeReasonGroup;`, context);
  return context;
}

test('하루 입력 화면에 연장 사유·실제 한 일 칸이 있고 제출 전에 막는다', () => {
  assert.match(html, /id="manualOtPlanReason"/);
  assert.match(html, /id="manualOtActualWork"/);
  assert.match(html, /연장 사유 — 왜 연장하려 했나/);
  assert.match(html, /연장 시간에 실제로 한 일/);
  const submit = html.match(/async function submitManualAttendance\(\)\{[^\n]*/)[0];
  assert.ok(submit.indexOf('overtimeReasonMissing(lunch+clockout+evening') > 0);
  assert.ok(submit.indexOf('overtimeReasonMissing(lunch+clockout+evening') < submit.indexOf("sb.rpc('submit_manual_attendance_d'"));
  assert.match(submit, /p_overtime_plan_reason:otPlan\|\|null,p_overtime_actual_work:otActual\|\|null/);
});

test('연장 분이 있으면 두 칸 모두 공백 제외 5자 이상이어야 한다', () => {
  const c = helpers();
  assert.equal(c.overtimeReasonMissing(0, '', ''), false);
  assert.equal(c.overtimeReasonMissing(10, '', ''), true);
  assert.equal(c.overtimeReasonMissing(10, '환자 진료 지연', ''), true);
  assert.equal(c.overtimeReasonMissing(10, '늦 음', '정리함함함'), true);
  assert.equal(c.overtimeReasonMissing(10, '환자 진료 지연', '기구 소독 정리'), false);
  assert.match(c.overtimeReasonErrorText({message: 'overtime reason and actual work required'}), /연장 사유/);
});

test('2026-11-26 연장 사유 필수는 기공실만 — 진료실·직무 미지정은 사유 없이 저장, 원장 설정으로 바꿈', () => {
  const lab = helpers({jobGroup: 'lab'});
  assert.equal(lab.overtimeReasonRequired(), true);
  assert.equal(lab.overtimeReasonMissing(30, '', ''), true);
  const clinic = helpers({jobGroup: 'clinical_consult'});
  assert.equal(clinic.overtimeReasonRequired(), false);
  assert.equal(clinic.overtimeReasonMissing(30, '', ''), false);
  assert.equal(helpers({jobGroup: '', department: '기공팀'}).overtimeReasonGroup(), 'lab', '직무가 비면 부서로 보완');
  assert.equal(helpers({jobGroup: '', department: '진료실'}).overtimeReasonGroup(), 'clinical_consult');
  assert.equal(helpers({jobGroup: '', department: ''}).overtimeReasonGroup(), 'none');
  assert.equal(helpers({jobGroup: '', department: ''}).overtimeReasonMissing(30, '', ''), false, '직무 미지정(실장·원장)은 기본 선택');
  assert.equal(helpers({jobGroup: 'desk'}).overtimeReasonMissing(30, '', ''), false);
  // 원장이 설정을 바꾸면 그대로 따름
  assert.equal(helpers({jobGroup: 'clinical_consult'}, {'att.ot_reason_required.clinical_consult': 'true'}).overtimeReasonMissing(30, '', ''), true);
  assert.equal(helpers({jobGroup: 'lab'}, {'att.ot_reason_required.lab': 'false'}).overtimeReasonMissing(30, '', ''), false);
  // 칸 이름 옆 안내도 필수/선택으로 갈림
  assert.match(html, /overtimeReasonRequired\(\)\?hubT\('att\.manual\.f_ot_req','\(추가근무를 적으면 필수\)'\):hubT\('att\.manual\.f_ot_opt','\(선택 — 안 적어도 저장됨\)'\)/);
  const texts = fs.readFileSync(path.join(root, 'hub-texts.js'), 'utf8');
  for (const [g, d] of [['lab', 'true'], ['clinical_consult', 'false'], ['desk', 'false'], ['sterilization_admin', 'false'], ['none', 'false']])
    assert.match(texts, new RegExp(`key:'att\.ot_reason_required\.${g}',screen:'🕘 근태 기준'[^\n]*def:'${d}',kind:'bool'`), g);
});

test('한 주 입력도 연장 사유·실제 한 일 칸을 받고 빈 줄은 저장하지 않는다', () => {
  assert.match(html, /\['otPlan','연장 사유'\],\['otActual','연장 중 실제 한 일'\]/);
  assert.match(html, /p_overtime_plan_reason:r\.otPlan\?\.trim\(\)\|\|null/);
  const start = html.indexOf('function manualWeekValidate');
  const end = html.indexOf('async function saveManualWeekRows', start);
  const c = helpers();
  vm.runInContext(`${html.slice(start, end)};this.manualWeekValidate=manualWeekValidate;`, c);
  const base = {p_reason_required:false,p_reason:null,p_late_min:0,p_early_min:0,p_lunch_overtime_min:0,p_clockout_overtime_min:20,p_evening_overtime_min:0,p_clock_in:'09:00',p_clock_out:'19:00',p_half_day:'없음'};
  assert.match(c.manualWeekValidate({...base}), /연장 사유/);
  assert.equal(c.manualWeekValidate({...base, p_overtime_plan_reason:'환자 진료 지연', p_overtime_actual_work:'기구 소독 정리'}), '');
  assert.equal(c.manualWeekValidate({...base, p_clockout_overtime_min:0}), '');
});

test('검토표에 연장 사유와 실제 한 일이 보인다', () => {
  assert.match(html, /att\.review\.ot_total/);
  assert.match(html, /r\.overtime_plan_reason\|\|hubT\('att\.review\.ot_none'/);
});

test('DB 함수가 사유 필수 직무(기공실)만 연장 사유 없이 저장을 거부한다(PGlite)', () => {
  const sql = fs.readFileSync(path.join(root, 'db', 'attendance_manual_overtime_reason.sql'), 'utf8');
  assert.match(sql, /overtime reason and actual work required/);
  assert.match(sql, /revoke execute on function public\.submit_manual_attendance_v2/);
  const byGroup = fs.readFileSync(path.join(root, 'db', 'attendance_ot_reason_by_group_20261126.sql'), 'utf8');
  assert.match(byGroup, /and public\.attendance_ot_reason_required\(auth\.uid\(\)\)/);
  assert.match(byGroup, /\('att\.ot_reason_required\.lab','true'/);
  assert.match(byGroup, /\('att\.ot_reason_required\.clinical_consult','false'/);
  assert.match(byGroup, /revoke all on function public\.attendance_ot_reason_required\(uuid\) from public,anon,authenticated/);
  if (!process.env.PGLITE_PACKAGE_ROOT) return;
  const r = spawnSync(process.execPath, ['tests/sql/pglite-attendance-overtime-reason.mjs'], {cwd: root, env: process.env, encoding: 'utf8'});
  assert.equal(r.status, 0, r.stderr + r.stdout);
  assert.match(r.stdout, /PGLITE_ATTENDANCE_OVERTIME_REASON_PASS/);
});
