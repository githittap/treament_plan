const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const html = fs.readFileSync(path.join(__dirname, '..', 'hr.html'), 'utf8');
const leaveBlock = html.match(/\/\* leave-calendar:test-start \*\/([\s\S]*?)\/\* leave-calendar:test-end \*\//);
const leaveRender = html.match(/\/\* leave-calendar:render-start \*\/([\s\S]*?)\/\* leave-calendar:render-end \*\//);

function loadLeaveContext() {
  assert.ok(leaveBlock, '연차캘린더 테스트 경계가 없습니다.');
  const context = {};
  vm.createContext(context);
  vm.runInContext(`${leaveBlock[1]};this.buildLeaveCalendarIndex=buildLeaveCalendarIndex;this.leaveCalendarLabel=leaveCalendarLabel;this.compareLeaveRowsByCreatedAtThenId=compareLeaveRowsByCreatedAtThenId;this.leaveCalendarMonthEnd=leaveCalendarMonthEnd;this.formatLeaveTimestamp=formatLeaveTimestamp;`, context);
  return context;
}

function row(id, from, to, createdAt, extra = {}) {
  return {
    id,
    user_id: `user-${id}`,
    type: '연차',
    type_note: null,
    date_from: from,
    date_to: to,
    days: 1,
    status: '승인',
    owner_at: '2026-09-01T10:00:00Z',
    created_at: createdAt,
    ...extra
  };
}

test('승인 연차는 다일 날짜마다 created_at 후 id 순서와 순번을 만든다', () => {
  const context = loadLeaveContext();
  const index = context.buildLeaveCalendarIndex([
    row(9, '2026-09-11', '2026-09-12', '2026-09-01T09:00:00Z'),
    row(5, '2026-09-11', '2026-09-11', '2026-09-01T09:00:00Z'),
    row(20, '2026-09-11', '2026-09-11', '2026-09-01T08:00:00Z')
  ], '2026-09-01', '2026-09-30');
  assert.deepEqual(JSON.parse(JSON.stringify(index['2026-09-11'].map(item => [item.rank, item.row.id]))), [[1, 20], [2, 5], [3, 9]]);
  assert.deepEqual(JSON.parse(JSON.stringify(index['2026-09-12'].map(item => [item.rank, item.row.id]))), [[1, 9]]);
});

test('월 경계 연차는 선택 월 안에서만 확장한다', () => {
  const context = loadLeaveContext();
  const index = context.buildLeaveCalendarIndex([
    row(1, '2026-08-30', '2026-09-02', '2026-08-01T09:00:00Z'),
    row(2, '2026-09-29', '2026-10-02', '2026-09-01T09:00:00Z')
  ], '2026-09-01', '2026-09-30');
  assert.deepEqual(JSON.parse(JSON.stringify(Object.keys(index).sort())), ['2026-09-01', '2026-09-02', '2026-09-29', '2026-09-30']);
  assert.equal(index['2026-08-31'], undefined);
  assert.equal(index['2026-10-01'], undefined);
});

test('동률 created_at은 id 오름차순으로 정렬하고 null 시각은 마지막으로 둔다', () => {
  const context = loadLeaveContext();
  const index = context.buildLeaveCalendarIndex([
    row(8, '2026-09-05', '2026-09-05', null),
    row(3, '2026-09-05', '2026-09-05', '2026-09-01T09:00:00Z'),
    row(2, '2026-09-05', '2026-09-05', '2026-09-01T09:00:00Z')
  ], '2026-09-01', '2026-09-30');
  assert.deepEqual(JSON.parse(JSON.stringify(index['2026-09-05'].map(item => item.row.id))), [2, 3, 8]);
});

test('선택 월의 실제 말일을 윤년과 평년 기준으로 계산한다', () => {
  const context = loadLeaveContext();
  assert.equal(context.leaveCalendarMonthEnd('2024-02'), '2024-02-29');
  assert.equal(context.leaveCalendarMonthEnd('2026-02'), '2026-02-28');
  assert.equal(context.leaveCalendarMonthEnd('2026-09'), '2026-09-30');
});

test('owner 시각은 Asia/Seoul 기준 한국 시간으로 포맷한다', () => {
  const context = loadLeaveContext();
  assert.equal(context.formatLeaveTimestamp('2026-09-01T09:00:00Z'), '2026.09.01 18:00');
});

test('비원장 라벨은 순번과 이름만, 원장 라벨은 승인 상세를 포함한다', () => {
  const context = loadLeaveContext();
  const item = { rank: 1, row: row(1, '2026-09-05', '2026-09-05', '2026-09-01T09:00:00Z', { user_name: '홍길동' }) };
  assert.equal(context.leaveCalendarLabel(item, 'staff'), '① 홍길동');
  assert.equal(context.leaveCalendarLabel(item, 'manager'), '① 홍길동');
  assert.equal(context.leaveCalendarLabel(item, 'chief'), '① 홍길동');
  assert.match(context.leaveCalendarLabel(item, 'owner'), /① 홍길동/);
  assert.match(context.leaveCalendarLabel(item, 'owner'), /연차/);
});

test('상단 탭은 연차캘린더 라벨과 leavestatus 키를 유지한다', () => {
  assert.match(html, /\{key:'leavestatus',label:'연차캘린더'/);
});

test('연차 전용 조회는 승인 상태와 양방향 월 겹침 조건을 사용한다', () => {
  assert.ok(leaveRender, 'renderLeaveStatus 함수를 찾을 수 없습니다.');
  assert.match(leaveRender[1], /from\('leave_requests'\)/);
  assert.match(leaveRender[1], /\.eq\('status','승인'\)/);
  assert.match(leaveRender[1], /\.lte\('date_from',to\)/);
  assert.match(leaveRender[1], /\.gte\('date_to',from\)/);
});

test('조회 실패는 빈 상태가 아니라 오류를 표시한다', () => {
  assert.ok(leaveRender, 'renderLeaveStatus 함수를 찾을 수 없습니다.');
  assert.match(leaveRender[1], /연차 정보를 불러오지 못했습니다/);
  assert.doesNotMatch(leaveRender[1], /error\)\{[\s\S]*?rows=\[\]/);
});

test('승인 연차 0건은 달력에서도 정상 빈 상태 문구를 표시한다', () => {
  assert.ok(leaveRender, 'renderLeaveStatus 함수를 찾을 수 없습니다.');
  assert.match(leaveRender[1], /calendarView=rows\.length\?calendar/);
  assert.match(leaveRender[1], /선택한 달의 승인 연차가 없습니다\./);
});

test('비원장 목록에는 종류와 정확한 시각을 렌더링하지 않는다', () => {
  assert.ok(leaveRender, 'renderLeaveStatus 함수를 찾을 수 없습니다.');
  assert.match(leaveRender[1], /owner|ME\.role==='owner'/);
  assert.match(leaveRender[1], /created_at/);
  assert.match(leaveRender[1], /owner_at/);
});
