const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const html = fs.readFileSync(path.join(__dirname, '..', 'hr.html'), 'utf8');
const block = html.match(/\/\* employee-documents-contract:test-start \*\/([\s\S]*?)\/\* employee-documents-contract:test-end \*\//);
const home = html.match(/async function renderOnbo\(m\)\{([\s\S]*?)\/\* employee-documents:test-start \*\//);

function loadHelpers() {
  assert.ok(block, '직원 서류·계약 통합 테스트 경계가 없습니다.');
  const context = {};
  vm.runInNewContext(`${block[1]};this.helpers={signedContractRows,mergeEmployeeDocumentRows,employeeDocumentsErrorMessages,contractPreviewHtml};`, context);
  return context.helpers;
}

test('서명완료 계약서만 조회하고 staff는 자기 계약, 관리자는 전체 계약을 본다', () => {
  assert.ok(home, 'renderOnbo 경계를 찾을 수 없습니다.');
  assert.match(home[1], /status','서명완료|status', '서명완료/);
  assert.match(home[1], /\.eq\('user_id',ME\.id\)/);
  assert.match(home[1], /isMgr\(\)\?/);

  const { signedContractRows } = loadHelpers();
  const contracts = [
    { id: 1, user_id: 'a', status: '서명완료', signed_at: '2026-09-18', merged_html: '<p>A</p>' },
    { id: 2, user_id: 'b', status: '대기', signed_at: null, merged_html: '<p>B</p>' },
    { id: 3, user_id: 'b', status: '서명완료', signed_at: '2026-09-17', merged_html: '<p>C</p>' }
  ];
  assert.deepEqual(signedContractRows(contracts, false, 'a', () => '근로계약서').map(r => r.id), [1]);
  assert.deepEqual(signedContractRows(contracts, true, 'a', () => '근로계약서').map(r => r.id), [1, 3]);
});

test('일반 문서와 계약서를 날짜순으로 통합하고 계약서 표시값을 만든다', () => {
  const { signedContractRows, mergeEmployeeDocumentRows } = loadHelpers();
  const contracts = signedContractRows([
    { id: 4, user_id: 'a', status: '서명완료', signed_at: '2026-09-19', merged_html: '<p>signed</p>' }
  ], false, 'a', () => '위생사 근로계약서');
  const rows = mergeEmployeeDocumentRows([
    { id: 9, user_id: 'a', document_type: '자격증', original_name: 'license.pdf', created_at: '2026-09-18' }
  ], contracts);
  assert.equal(rows[0].document_type, '근로계약서');
  assert.equal(rows[0].original_name, '위생사 근로계약서');
  assert.equal(rows[0].created_at, '2026-09-19');
  assert.equal(rows[1].original_name, 'license.pdf');
  assert.match(loadHelpers().contractPreviewHtml(contracts[0]), /signed/);
});

test('서류함과 계약서 조회 오류는 각각 표시하고 반대 목록을 숨기지 않는다', () => {
  const { employeeDocumentsErrorMessages } = loadHelpers();
  const docsFailure=employeeDocumentsErrorMessages({message:'문서 오류'}, null);
  const contractsFailure=employeeDocumentsErrorMessages(null, {message:'계약 오류'});
  assert.equal(docsFailure.documents, '문서 오류');
  assert.equal(docsFailure.contracts, '');
  assert.equal(contractsFailure.documents, '');
  assert.equal(contractsFailure.contracts, '계약 오류');
  assert.match(html, /docsError/);
  assert.match(html, /contractsError/);
  assert.match(html, /merged_html/);
  assert.match(html, /iframe title="근로계약서 미리보기" sandbox/);
});
