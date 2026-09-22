const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const html = fs.readFileSync(path.join(__dirname, '..', 'hr.html'), 'utf8');
const schedule = html.match(/\/\* ── 근무표\(M2\) ── \*\/[\s\S]*?\/\* 엑셀 파싱 \*\//)?.[0] || '';

test('ZIP 근무표는 개인별 날짜 select가 아니라 직무 행·셀 체크박스 구조다', () => {
  for (const role of ['Dr.', '진료실', '데스크', '기공·행정', '상담', '야간', 'OFF', '연차·반차']) {
    assert.match(schedule, new RegExp(role.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
  assert.match(schedule, /scheduleRoleCell/);
  assert.match(schedule, /type="checkbox"/);
  assert.doesNotMatch(schedule, /data-person-id=.*<select/);
});

test('ZIP 근무표는 월요일부터 일요일 순서와 승인 연차 차단을 표현한다', () => {
  assert.match(schedule, /월.*화.*수.*목.*금.*토.*일/s);
  assert.match(schedule, /leave|연차/);
  assert.match(schedule, /disabled/);
});

test('ZIP 야간 행은 전체 직원 선택과 원래 직무 색 보존 계약을 표현한다', () => {
  assert.match(schedule, /야간/);
  assert.match(schedule, /all.*people|전체.*직원|SCHEDULE_PEOPLE/s);
  assert.match(schedule, /department.*color|role.*color|직무.*색/s);
});

test('5차 근무표계획은 월간 기본값과 주간 직무행 체크박스 경로를 함께 사용한다', () => {
  assert.match(html, /\{key:'sched',\s*label:'근무표계획'/);
  assert.match(schedule, /let SCHED_WEEK=null,SCHED_MONTH=null,SCHED_VIEW='month'/);
  const weekly = schedule.match(/async function renderSched\([\s\S]*?\/\* schedule-roster-admin:test-start \*\//)?.[0] || '';
  assert.match(weekly, /scheduleRoleCell/);
  assert.match(weekly, /schedule-role-table/);
  assert.doesNotMatch(weekly, /<select class="mini/);
});
