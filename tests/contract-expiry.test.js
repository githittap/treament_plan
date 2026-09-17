const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const html = fs.readFileSync(path.join(__dirname, '..', 'hr.html'), 'utf8');
const block = html.match(/\/\* contract-expiry:test-start \*\/([\s\S]*?)\/\* contract-expiry:test-end \*\//);

test('계약 종료 알림 계산 코드가 포함되어 있다', () => {
  assert.ok(block, '계약 종료 알림 계산 코드 블록이 없습니다.');
});

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
