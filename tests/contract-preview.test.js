const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const html = fs.readFileSync(path.join(__dirname, '..', 'contract-preview.html'), 'utf8');
const block = html.match(/\/\* contract-preview:test-start \*\/([\s\S]*?)\/\* contract-preview:test-end \*\//);

test('역할별 수행업무와 무기한 계약 상태 도우미가 있다', () => {
  assert.ok(block, '계약서 미리보기 도우미 블록이 없습니다.');
});

if (block) {
  const context = {};
  vm.createContext(context);
  vm.runInContext(`${block[1]};this.ROLE_DUTIES=ROLE_DUTIES;this.indefiniteContractState=indefiniteContractState;`, context);

  test('마케터 역할은 확장된 수행업무를 자동 반환한다', () => {
    assert.match(context.ROLE_DUTIES.마케터, /광고심의/);
    assert.match(context.ROLE_DUTIES.마케터, /내부 사이니지/);
  });

  test('종료일이 있으면 기간의 정함 없음을 해제하고 비활성화한다', () => {
    assert.deepEqual({ ...context.indefiniteContractState('2026-12-31') }, { checked: false, disabled: true });
    assert.deepEqual({ ...context.indefiniteContractState('') }, { checked: false, disabled: false });
  });
}

test('근무표 입력은 월~일과 주간·야간·별도 구분 및 고정 공휴일 문구를 제공한다', () => {
  assert.match(html, /월/);
  assert.match(html, /일/);
  assert.match(html, /주간/);
  assert.match(html, /야간/);
  assert.match(html, /별도/);
  assert.match(html, /공휴일 근무 포함/);
});
