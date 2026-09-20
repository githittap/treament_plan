const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const html = fs.readFileSync(path.join(__dirname, '..', 'hr.html'), 'utf8');
const block = html.match(/\/\* employee-documents:test-start \*\/([\s\S]*?)\/\* employee-documents:test-end \*\//);

test('직원 서류 업로드 검증 코드가 포함되어 있다', () => {
  assert.ok(block, '직원 서류 업로드 검증 코드 블록이 없습니다.');
});

if (block) {
  const context = {}; vm.createContext(context); vm.runInContext(block[1], context);
  test('PDF·JPG·PNG 10MB 이하만 허용한다', () => {
    assert.equal(context.validateEmployeeDocument({ type: 'application/pdf', size: 10 * 1024 * 1024 }), '');
    assert.equal(context.validateEmployeeDocument({ type: 'image/jpeg', size: 1 }), '');
    assert.match(context.validateEmployeeDocument({ type: 'image/gif', size: 1 }), /PDF/);
    assert.match(context.validateEmployeeDocument({ type: 'image/png', size: 10 * 1024 * 1024 + 1 }), /10MB/);
  });
  test('입사 서류는 문서 형식을 허용하되 실행·압축 파일은 거부한다', () => {
    assert.equal(context.validateEmployeeDocument({ type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', size: 1 }), '');
    assert.equal(context.validateEmployeeDocument({ type: 'application/x-hwp', size: 1 }), '');
    assert.match(context.validateEmployeeDocument({ type: 'application/zip', size: 1 }), /PDF/);
    assert.match(context.validateEmployeeDocument({ type: 'application/x-msdownload', size: 1 }), /PDF/);
  });
  test('화면에 업로드·열람 함수가 있다', () => {
    assert.match(html, /function uploadEmployeeDocument\(/);
    assert.match(html, /function downloadEmployeeDocument\(/);
  });
}
