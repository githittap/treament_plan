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

test('입사서류 첫 화면은 공통 체크리스트와 관리자 점검을 함께 제공한다', () => {
  assert.match(html, /공통 입사 체크리스트/);
  assert.match(html, /onboardingEvidenceComplete\(/);
  assert.match(html, /isMgr\(\)\?await onboOverview\(\):''/);
  assert.match(html, /계좌번호는 은행명과 계좌번호가 모두 있어야 완료/);
  assert.match(html, /Notion은 ID, 앱 설치, 워크스페이스 로그인 확인이 모두 있어야 완료/);
  assert.match(html, /from\('onboarding_evidence_completion'\)\.select\('\*'\)/);
  assert.doesNotMatch(html, /rpc\('onboarding_evidence_completion'\)/);
});
