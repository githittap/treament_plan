const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const html = fs.readFileSync(path.join(__dirname, '..', 'hr.html'), 'utf8');
const block = html.match(/\/\* onboarding-evidence:test-start \*\/([\s\S]*?)\/\* onboarding-evidence:test-end \*\//);

test('입사 증빙 완료 기준은 공통 함수로 고정한다', () => {
  assert.ok(block, '입사 증빙 완료 규칙 블록이 없습니다.');
  const context = {}; vm.createContext(context); vm.runInContext(block[1], context);
  const done = context.onboardingEvidenceComplete;
  assert.equal(done('계좌', { bank_name: '국민', account_number: '123' }, []), true);
  assert.equal(done('계좌', { bank_name: '국민', account_number: '' }, []), false);
  assert.equal(done('Notion', { notion_id: 'a', notion_app_installed: true, notion_workspace_logged_in: true }, []), true);
  assert.equal(done('Notion', { notion_id: 'a', notion_app_installed: true, notion_workspace_logged_in: false }, []), false);
  assert.equal(done('잠복결핵', {}, [{ document_type: '잠복결핵 검사서' }]), true);
  assert.equal(done('자격증', {}, []), false);
  assert.equal(done('보안서약', {}, [{ document_type: '보안서약서' }]), true);
});
