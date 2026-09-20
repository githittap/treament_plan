const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'hr.html'), 'utf8');
const sql = fs.readFileSync(path.join(root, 'db', 'attendance_issue_resolution_release.sql'), 'utf8');

test('출석 수직 경로 프론트 연결이 포함되어 있다', () => {
  for (const marker of ['applyAttendanceResolutions', 'submitManualAttendance', 'reviewManualAttendance', "sb.rpc('review_attendance_issue'", "sb.rpc('submit_manual_attendance'"]) {
    assert.match(html, new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
  assert.match(html, /attendance_issue_resolutions/);
  assert.match(html, /attendanceMonthBounds/);
  const renderStart = html.indexOf('async function renderAtt');
  const renderEnd = html.indexOf('function issueBtns', renderStart);
  assert.ok(renderStart >= 0 && renderEnd > renderStart);
  assert.doesNotMatch(html.slice(renderStart, renderEnd), /\.lte\('work_date',month\+'-31'\)/);
  assert.match(html, /rule_label:label/);
  assert.match(html, /p_type:'정정',p_rule_label:label/);
  assert.match(html, /\.in\('user_id',manualUsers\)\.in\('work_date',manualDates\)/);
  assert.match(html, /fetchAttendancePages/);
  assert.match(html, /record_auto_attendance_issue/);
  assert.doesNotMatch(html, /from\('attendance_issues'\)\.insert/);
  assert.match(html, /bounds\.start\)\.lt\('work_date',bounds\.next\)/);
  assert.match(html, /소명 저장 실패/);
  assert.match(html, /a\.source==='manual'/);
});

test('월 조회 범위는 한국 현지 월의 반개구간으로 계산한다', () => {
  const start = html.indexOf('function attendanceMonthBounds');
  const end = html.indexOf('async function renderAtt', start);
  assert.ok(start >= 0 && end > start);
  const context = {};
  vm.createContext(context);
  vm.runInContext(`${html.slice(start, end)}\nthis.attendanceMonthBounds=attendanceMonthBounds;`, context);
  for (const [month,startDate,nextDate] of [['2026-09','2026-09-01','2026-10-01'],['2024-02','2024-02-01','2024-03-01'],['2026-12','2026-12-01','2027-01-01']]) {
    const result=context.attendanceMonthBounds(month);
    assert.equal(result.start,startDate);assert.equal(result.next,nextDate);
  }
});

test('출석 수직 경로 SQL의 승인·보정·원본보호 경계가 고정되어 있다', () => {
  for (const marker of [
    'create table if not exists public.attendance_issue_resolutions',
    "check (source='issue_adjustment')",
    "source='fp'",
    'review_attendance_issue',
    'review_manual_attendance',
    'revoke all on table',
    'enable row level security',
    'fingerprint evidence requires approved recognition-error issue',
    'pg_advisory_xact_lock',
    'obsolete manual attendance version',
    'different recognition-error resolution already exists',
    'revoke update on table public.attendance_issues',
    "new.type not in ('시업누락','종업누락','정정')",
    'attendance_issues_insert_self',
    'guard_attendance_issue_insert',
    'pending self submission',
    'record_auto_attendance_issue',
    "public.my_role() in ('manager','chief','owner')",
    'revoke insert on table public.attendance_issues',
  ]) assert.match(sql, new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.doesNotMatch(sql, /drop table/i);
});

test('릴리스 후보의 필수 파일과 출석 SQL 범위를 검증한다', () => {
  for (const file of [
    'hr.html',
    'db/attendance_issue_resolution_release.sql',
    'tests/sql/pglite-attendance-resolution-release.mjs',
    'tests/attendance-resolution-release-static.test.js',
  ]) assert.ok(fs.existsSync(path.join(root, file)), `필수 후보 파일 없음: ${file}`);
  // hr.html은 여러 기능이 공유하는 장기 파일이므로 전체 문자열을 출석 릴리스 범위로 판정하지 않는다.
  // 무관 기능 혼입 검사는 출석 전용 SQL에만 적용하고, 프런트 연결은 위의 출석 렌더 계약으로 검증한다.
  assert.doesNotMatch(sql, /pushSubscription|contract-pdf-sign|consultation/i);
});
