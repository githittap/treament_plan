const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'hr.html'), 'utf8');
const sqlPath = path.join(root, 'db', 'attendance_manual_v2.sql');

test('수기 출퇴근 v2는 키보드로 고를 수 있는 월간 7열 달력과 분리 연장 입력을 제공한다', () => {
  assert.match(html, /manualAttendanceCalendar/);
  assert.match(html, /role="grid"/);
  assert.match(html, /type="hidden"[^>]*id="manualWorkDate"/);
  assert.match(html, /manualLunchOvertimeRaw/);
  assert.match(html, /manualClockoutOvertimeRaw/);
  assert.match(html, /submit_manual_attendance_v2/);
  assert.doesNotMatch(html.match(/function manualAttendanceFormHtml\(\)[\s\S]*?async function submitManualAttendance/)[0], /type="date"/);
});

test('v2 SQL은 총합 호환, 분리 원자료·분 필드, RPC-only/RLS 경계를 보존한다', () => {
  assert.ok(fs.existsSync(sqlPath), 'v2 apply SQL이 없습니다.');
  const sql = fs.readFileSync(sqlPath, 'utf8');
  for (const marker of [
    'lunch_overtime_raw_text', 'clockout_overtime_raw_text', 'lunch_overtime_min', 'clockout_overtime_min',
    'create or replace function public.submit_manual_attendance_v2', 'security definer set search_path=\'\'',
    'auth.uid()', "public.my_role()", 'p_lunch_overtime_min+p_clockout_overtime_min',
    "jsonb_build_object('lunch_overtime_raw_text'", 'revoke all on function public.submit_manual_attendance_v2',
    'grant execute on function public.submit_manual_attendance_v2', 'to authenticated',
  ]) assert.match(sql, new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.doesNotMatch(sql, /grant\s+(insert|update|all)\s+on\s+table\s+public\.attendance_manual_entries\s+to\s+authenticated/i);
  assert.doesNotMatch(sql, /drop\s+table/i);
  assert.ok(fs.existsSync(path.join(root, 'db', 'attendance_manual_v2_rollback.sql')), 'v2 rollback SQL이 없습니다.');
});
