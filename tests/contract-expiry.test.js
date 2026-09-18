const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const html = fs.readFileSync(path.join(__dirname, '..', 'hr.html'), 'utf8');
const block = html.match(/\/\* contract-expiry:test-start \*\/([\s\S]*?)\/\* contract-expiry:test-end \*\//);
const scheduleBlock = html.match(/\/\* contract-schedule:test-start \*\/([\s\S]*?)\/\* contract-schedule:test-end \*\//);

test('계약 종료 알림 계산 코드가 포함되어 있다', () => {
  assert.ok(block, '계약 종료 알림 계산 코드 블록이 없습니다.');
});

test('요일별 근무시간표 입력 코드가 포함되어 있다', () => {
  assert.ok(scheduleBlock, '근무시간표 계산 코드 블록이 없습니다.');
  assert.match(html, /상기 주 5일 중 평일 야간 2회/);
  assert.doesNotMatch(html, /data-schedule-days[^>]*disabled/);
});

test('요일은 체크박스뿐 아니라 표시 영역 전체를 클릭할 수 있다', () => {
  assert.match(html, /class="contract-day-check"/);
  assert.match(html, /\.contract-day-check input\[type=checkbox\]/);
});

if (scheduleBlock) {
  const scheduleContext = {};
  vm.createContext(scheduleContext);
  vm.runInContext(`${scheduleBlock[1]};this.contractScheduleRows=contractScheduleRows;this.validContractSchedule=validContractSchedule;this.contractScheduleNeedsReview=contractScheduleNeedsReview;`, scheduleContext);

  test('근무시간표는 월~일, 주간·야간·별도 구분을 보존한다', () => {
    const rows = scheduleContext.contractScheduleRows([{ days: ['월', '수', '일'], kind: '야간', start: '18:30', end: '20:30', break_time: '18:00 ~ 18:30', note: '야간진료' }]);
    assert.deepEqual({ ...rows[0], days: [...rows[0].days] }, { days: ['월', '수', '일'], day_mode: 'fixed', kind: '야간', start: '18:30', end: '20:30', break_time: '18:00 ~ 18:30', note: '야간진료' });
    assert.equal(scheduleContext.validContractSchedule(rows), true);
    assert.equal(scheduleContext.validContractSchedule([{ days: [], start: '10:00', end: '18:00' }]), false);
  });

  test('깨진 이전 시간표 문자열은 원장 검토 대상으로 표시한다', () => {
    assert.equal(scheduleContext.contractScheduleNeedsReview('[object Object]'), true);
    assert.equal(scheduleContext.contractScheduleNeedsReview('[{"days":["월"]}]'), false);
  });

  test('주 5일 교대근무는 주말 가능 상태로 저장하고 요일 미선택도 허용한다', () => {
    const rows = scheduleContext.contractScheduleRows([{ days: [], day_mode: 'rotating_5', kind: '주간', start: '10:00', end: '19:00' }]);
    assert.equal(rows[0].day_mode, 'rotating_5');
    assert.equal(scheduleContext.validContractSchedule(rows), true);
  });

  test('평일 중 주 2회 야간근무도 고정 요일 없이 허용한다', () => {
    const rows = scheduleContext.contractScheduleRows([{ days: ['월', '화', '수', '목', '금'], day_mode: 'weekday_twice', kind: '야간', start: '10:00', end: '20:00' }]);
    assert.equal(rows[0].day_mode, 'weekday_twice');
    assert.equal(scheduleContext.validContractSchedule(rows), true);
  });
}

if (block) {
  const context = {};
  vm.createContext(context);
  vm.runInContext(block[1], context);
  const info = (end, status = '서명완료') => context.contractExpiryInfo({ fields: { 계약종료: end }, status }, '2026-09-17');

  test('빈 종료일과 잘못된 날짜는 관리자 확인 필요로 분류한다', () => {
    assert.equal(info('').kind, 'review');
    assert.equal(info('날짜 미정').kind, 'review');
  });

  test('기간의 정함 없음과 취소 계약은 알림에서 제외한다', () => {
    assert.equal(info('기간의 정함 없음'), null);
    assert.equal(info('2026-09-20', '취소'), null);
  });

  test('D-60, D-30, D-14와 만료를 경계값대로 분류한다', () => {
    assert.deepEqual({ ...info('2026-11-16') }, { kind: 'upcoming', days: 60, end: '2026-11-16' });
    assert.deepEqual({ ...info('2026-10-17') }, { kind: 'warning', days: 30, end: '2026-10-17' });
    assert.deepEqual({ ...info('2026-10-01') }, { kind: 'urgent', days: 14, end: '2026-10-01' });
    assert.deepEqual({ ...info('2026-09-16') }, { kind: 'expired', days: -1, end: '2026-09-16' });
    assert.equal(info('2026-11-17'), null);
  });

  test('직원별 최신 계약 한 건만 알림 대상으로 삼는다', () => {
    const rows = [
      { id: 1, user_id: 'a', created_at: '2026-01-01', status: '서명완료', fields: { 계약종료: '2026-09-16' } },
      { id: 2, user_id: 'a', created_at: '2026-09-01', status: '서명완료', fields: { 계약종료: '2027-09-01' } },
      { id: 3, user_id: 'b', created_at: '2026-02-01', status: '서명완료', fields: { 계약종료: '' } }
    ];
    const alerts = context.contractExpiryRows(rows, '2026-09-17');
    assert.equal(alerts.length, 1);
    assert.equal(alerts[0].row.id, 3);
    assert.equal(alerts[0].kind, 'review');
  });

  test('새 계약 작성 화면에 종료조건 선택과 필수 검증 문구가 있다', () => {
    assert.match(html, /id="contractNoEnd"/);
    assert.match(html, /계약 종료일을 입력하거나 '기간의 정함 없음'을 선택하세요\./);
  });

  test('기존 계약의 종료일 보완은 다른 계약 필드를 보존한다', () => {
    const row = { fields: { 계약시작: '2026-01-01', 직무: '치과위생사', 계약종료: '' } };
    assert.deepEqual(
      { ...context.contractEndFields(row, '2026-12-31', false) },
      { 계약시작: '2026-01-01', 직무: '치과위생사', 계약종료: '2026-12-31' }
    );
    assert.deepEqual(
      { ...context.contractEndFields(row, '', true) },
      { 계약시작: '2026-01-01', 직무: '치과위생사', 계약종료: '기간의 정함 없음' }
    );
    assert.match(html, /function saveContractEnd\(/);
  });
}
