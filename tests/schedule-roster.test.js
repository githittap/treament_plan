const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const html = fs.readFileSync(path.join(__dirname, '..', 'hr.html'), 'utf8');
const block = html.match(/\/\* schedule-roster:test-start \*\/([\s\S]*?)\/\* schedule-roster:test-end \*\//);

test('근무표는 person_id 명부와 person_id 저장 계약을 사용한다', () => {
  const schedule = html.match(/\/\* ── 근무표\(M2\) ── \*\/([\s\S]*?)\/\* 엑셀 파싱 \*\//);
  assert.ok(schedule, '근무표 코드 블록이 없습니다.');
  const source = schedule[1];
  assert.match(source, /select\('person_id,user_id,week_start,day,shift,note'\)/);
  assert.match(source, /schedulePeopleForWeek\(SCHEDULE_PEOPLE,rows\)/);
  assert.match(source, /smap\[r\.person_id\+'\|'\+r\.day\]/);
  assert.match(source, /data-person-id=/);
  assert.match(source, /data-profile-user-id=/);
  assert.match(source, /async function setShift\(personId,profileUserId,day,ws,shift\)/);
  assert.match(source, /onConflict:'week_start,person_id,day'/);
});

test('근무표 저장 실패는 성공 상태로 표시하지 않는다', () => {
  const setShift = html.match(/async function setShift\([\s\S]*?async function publishSched/);
  assert.ok(setShift, 'setShift 함수를 찾을 수 없습니다.');
  assert.match(setShift[0], /if\(weekError\)\{setStatus\('error'\);return;\}/);
  assert.match(setShift[0], /if\(error\)\{setStatus\('error'\);return;\}/);
});

test('통합 명부 순수 함수 코드 블록이 포함되어 있다', () => {
  assert.ok(block, '통합 명부 순수 함수 코드 블록이 없습니다.');
});

if (block) {
  const context = {};
  vm.createContext(context);
  vm.runInContext(`${block[1]};this.schedulePersonLabel=schedulePersonLabel;this.schedulePeopleForWeek=schedulePeopleForWeek;this.scheduleDate=scheduleDate;this.scheduleCalendarIndex=scheduleCalendarIndex;`, context);

  test('의사 부서는 표시 이름에만 Dr. 접두사를 붙인다', () => {
    assert.equal(context.schedulePersonLabel({ name: '홍길동', department: 'Dr.' }), 'Dr. 홍길동');
    assert.equal(context.schedulePersonLabel({ name: '홍길동', department: '진료실' }), '홍길동');
    assert.equal(context.schedulePersonLabel({ name: '홍길동', department: 'Dr' }), '홍길동');
  });

  test('새 주차는 활성화되고 포함된 명부만 표시한다', () => {
    const people = [
      { id: 'active', active: true, included_in_schedule: true },
      { id: 'inactive', active: false, included_in_schedule: true },
      { id: 'excluded', active: true, included_in_schedule: false }
    ];
    assert.deepEqual([...context.schedulePeopleForWeek(people, [])].map(p => p.id), ['active']);
  });

  test('과거 일정은 포함된 비활성 명부도 보존하되 제외 명부는 숨긴다', () => {
    const people = [
      { id: 'active', active: true, included_in_schedule: true },
      { id: 'inactive-history', active: false, included_in_schedule: true },
      { id: 'inactive-empty', active: false, included_in_schedule: true },
      { id: 'excluded-history', active: false, included_in_schedule: false }
    ];
    const rows = [{ person_id: 'inactive-history' }, { person_id: 'excluded-history' }];
    assert.deepEqual([...context.schedulePeopleForWeek(people, rows)].map(p => p.id), ['active', 'inactive-history']);
  });

  test('월요일 week_start를 DB 요일 날짜로 변환한다', () => {
    assert.equal(context.scheduleDate('2026-09-14', 0), '2026-09-20');
    assert.equal(context.scheduleDate('2026-09-14', 1), '2026-09-14');
    assert.equal(context.scheduleDate('2026-09-14', 6), '2026-09-19');
  });

  test('캘린더 인덱스는 부서별 근무와 상태를 중복 없이 정렬한다', () => {
    const people = [
      { id: 'dr-b', name: '나의사', department: 'Dr.', sort_order: 2, included_in_schedule: true },
      { id: 'dr-a', name: '가의사', department: 'Dr.', sort_order: 1, included_in_schedule: true },
      { id: 'desk', name: '김데스크', department: '데스크', sort_order: 1, included_in_schedule: true },
      { id: 'off', name: '박휴무', department: '진료실', sort_order: 1, included_in_schedule: true },
      { id: 'etc', name: '최기타', department: '기공실', sort_order: 1, included_in_schedule: true },
      { id: 'excluded', name: '숨김', department: '진료실', sort_order: 0, included_in_schedule: false }
    ];
    const rows = [
      { week_start: '2026-09-14', day: 1, person_id: 'dr-b', shift: 'work' },
      { week_start: '2026-09-14', day: 1, person_id: 'dr-a', shift: 'evening' },
      { week_start: '2026-09-14', day: 1, person_id: 'dr-a', shift: 'evening' },
      { week_start: '2026-09-14', day: 1, person_id: 'desk', shift: 'work' },
      { week_start: '2026-09-14', day: 1, person_id: 'off', shift: 'off' },
      { week_start: '2026-09-14', day: 1, person_id: 'etc', shift: 'etc' },
      { week_start: '2026-09-14', day: 1, person_id: 'excluded', shift: 'work' }
    ];
    const index = context.scheduleCalendarIndex(rows, people, [{ week_start: '2026-09-14', status: '공표' }]);
    const day = index['2026-09-14'];
    assert.deepEqual(JSON.parse(JSON.stringify(day.departments['Dr.'])), ['Dr. 가의사', 'Dr. 나의사']);
    assert.deepEqual(JSON.parse(JSON.stringify(day.departments['데스크'])), ['김데스크']);
    assert.deepEqual(JSON.parse(JSON.stringify(day.departments['진료실'])), []);
    assert.deepEqual(JSON.parse(JSON.stringify(day.departments['기공실'])), []);
    assert.deepEqual(JSON.parse(JSON.stringify(day.departments['미지정'])), []);
    assert.deepEqual(JSON.parse(JSON.stringify(day.evening)), ['Dr. 가의사']);
    assert.deepEqual(JSON.parse(JSON.stringify(day.off)), ['박휴무']);
    assert.deepEqual(JSON.parse(JSON.stringify(day.etc)), ['최기타']);
    assert.equal(day.weekStatus, 'published');
  });

  test('캘린더 인덱스는 초안을 draft로 정규화하고 미지정 부서를 수용한다', () => {
    const index = context.scheduleCalendarIndex(
      [{ week_start: '2026-09-14', day: 0, person_id: 'unassigned', shift: 'work' }],
      [{ id: 'unassigned', name: '무소속', department: null, sort_order: 0, included_in_schedule: true }],
      [{ week_start: '2026-09-14', status: '초안' }]
    );
    assert.deepEqual(JSON.parse(JSON.stringify(index['2026-09-20'].departments['미지정'])), ['무소속']);
    assert.equal(index['2026-09-20'].weekStatus, 'draft');
  });
}
