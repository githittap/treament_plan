const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const html = fs.readFileSync(path.join(__dirname, '..', 'hr.html'), 'utf8');
const block = html.match(/\/\* employee-documents:test-start \*\/([\s\S]*?)\/\* employee-documents:test-end \*\//);
const onboardingBlock = html.match(/\/\* onboarding-evidence:test-start \*\/([\s\S]*?)\/\* onboarding-evidence:test-end \*\//);

test('직원 서류 업로드 검증 코드가 포함되어 있다', () => {
  assert.ok(block, '직원 서류 업로드 검증 코드 블록이 없습니다.');
});

if (block) {
  const context = {}; vm.createContext(context);
  if (onboardingBlock) vm.runInContext(onboardingBlock[1], context);
  vm.runInContext(block[1], context);
  test('PDF·JPG·PNG 10MB 이하만 허용한다', () => {
    assert.equal(context.validateEmployeeDocument({ type: 'application/pdf', size: 10 * 1024 * 1024 }), '');
    assert.equal(context.validateEmployeeDocument({ type: 'image/jpeg', size: 1 }), '');
    assert.equal(context.validateEmployeeDocument({ type: 'image/gif', size: 1 }), '');
    assert.match(context.validateEmployeeDocument({ type: 'application/pdf', size: 0 }), /0바이트/);
    assert.match(context.validateEmployeeDocument({ type: 'image/png', size: 10 * 1024 * 1024 + 1 }), /10MB/);
  });
  test('입사 서류는 문서 형식을 허용하되 실행·압축 파일은 거부한다', () => {
    assert.equal(context.validateEmployeeDocument({ type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', size: 1 }), '');
    assert.equal(context.validateEmployeeDocument({ type: 'application/x-hwp', size: 1 }), '');
    assert.match(context.validateEmployeeDocument({ type: 'application/zip', size: 1 }), /실행|압축|PDF/);
    assert.match(context.validateEmployeeDocument({ type: 'application/x-msdownload', size: 1 }), /실행|압축|PDF/);
  });
  test('잠복결핵 검사서는 PDF·이미지만 허용하고 다른 직원서류 형식은 유지한다', () => {
    for (const [type, name] of [['application/pdf','검사서.pdf'], ['image/png','검사서.png'], ['image/jpeg','검사서.jpg'], ['image/gif','검사서.gif']]) {
      assert.equal(context.validateEmployeeDocument({name,type,size:1},'잠복결핵 검사서'), '');
    }
    assert.match(context.validateEmployeeDocument({name:'검사서.txt',type:'text/plain',size:1},'잠복결핵 검사서'), /PDF|이미지/);
    assert.match(context.validateEmployeeDocument({name:'검사서',type:'',size:1},'잠복결핵 검사서'), /PDF|이미지/);
    assert.match(context.validateEmployeeDocument({name:'검사서.txt',type:'application/pdf',size:1},'잠복결핵 검사서'), /PDF|이미지/);
    assert.match(context.validateEmployeeDocument({name:'검사서.pdf',type:'application/pdf',size:0},'잠복결핵 검사서'), /0바이트/);
    assert.equal(context.validateEmployeeDocument({name:'일반서류.txt',type:'text/plain',size:1},'기타'), '');
    assert.equal(context.validateEmployeeDocument({name:'일반서류.docx',type:'application/vnd.openxmlformats-officedocument.wordprocessingml.document',size:1},'자격증'), '');
  });
  test('화면에 업로드·열람 함수가 있다', () => {
    assert.match(html, /function uploadEmployeeDocument\(/);
    assert.match(html, /validateEmployeeDocument\(file,type\)/);
    assert.match(html, /function downloadEmployeeDocument\(/);
    assert.match(html, /await sb\.storage\.from\('hr-docs'\)\.remove\(\[path\]\)/);
    assert.match(html.match(/id="edFile"[^>]+/)[0], /accept="\*\/\*"/);
  });
  test('보안서약서를 기존 직원 서류함에서 선택해 올릴 수 있다', () => {
    assert.match(html, /<select id="edType"><option>잠복결핵 검사서<\/option><option>자격증<\/option><option>보안서약서<\/option>/);
  });
}
