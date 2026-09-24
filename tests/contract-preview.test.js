const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const html = fs.readFileSync(path.join(__dirname, '..', 'contract-preview.html'), 'utf8');
const hrHtml = fs.readFileSync(path.join(__dirname, '..', 'hr.html'), 'utf8');
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

test('직원 계약 미리보기는 공통 분류를 참고 정보로만 표시하고 계약 문구는 건드리지 않는다', () => {
  assert.match(hrHtml, /function contractEmployeeJobGroupInfo\(/, '직원 계약 미리보기 분류 안내 함수가 있어야 한다');
  const preview = hrHtml.match(/function previewContract\(\)\{[\s\S]*?\n\}/);
  assert.ok(preview, '직원 계약 미리보기 함수가 있어야 한다');
  assert.match(preview[0], /contractEmployeeJobGroupInfo/);
  assert.match(preview[0], /mergeContractHtml\(d\.template,d\.fields\)/, '저장될 계약서 HTML은 기존 입력값으로만 합쳐야 한다');
  assert.match(hrHtml, /model\.label/, 'NULL 분류도 공통 모델의 미지정 라벨을 참고 표시해야 한다');
});
