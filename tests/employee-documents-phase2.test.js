const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const html = fs.readFileSync('hr.html', 'utf8');
const schema = fs.readFileSync('db/hr_schema.sql', 'utf8');
const policies = fs.readFileSync('db/hr_policies.sql', 'utf8');
const vm = require('node:vm');

function inlineFunction(name) {
  const patterns = {
    filterEmployeeDocuments: /function filterEmployeeDocuments\(kind\)\{[\s\S]*?\r?\n}/,
    setEmployeeDocumentUploadScope: /function setEmployeeDocumentUploadScope\(\)\{[\s\S]*?\r?\n}/,
    submitApproval: /async function submitApproval\(\)\{[\s\S]*?\r?\n}/
  };
  const match = html.match(patterns[name]);
  assert.ok(match, `${name} 실제 인라인 함수가 없습니다.`);
  return match[0];
}

function classList() {
  const values = new Set();
  return { toggle(name, on) { on ? values.add(name) : values.delete(name); }, has(name) { return values.has(name); } };
}

test('서류함은 승인된 4개 필터를 한 화면에 제공한다', () => {
  for (const label of ['전체 문서', '직원서류', '연차증빙', '결재 요청']) {
    assert.match(html, new RegExp(`data-doc-filter-button="${label}"`));
  }
  assert.deepEqual([...html.matchAll(/data-doc-filter-button="([^"]+)"/g)].map(match => match[1]), ['전체 문서','직원서류','연차증빙','결재 요청']);
  assert.match(html, /function filterEmployeeDocuments\(kind\)/);
});

test('직원서류와 연차증빙은 하나의 파일 입력·전송 버튼에서 종류별로 저장한다', () => {
  const card = html.match(/function employeeDocumentsCard\([\s\S]*?\n}\nfunction filterEmployeeDocuments/);
  assert.ok(card);
  assert.match(card[0], /id="edScope"[\s\S]*value="직원서류"[\s\S]*value="연차증빙"/);
  assert.match(card[0], /id="edLeaveRequest"/);
  assert.equal((card[0].match(/type="file"/g)||[]).length, 1);
  assert.match(card[0], /onclick="submitEmployeeDocumentUpload\(\)"/);
  assert.match(card[0], /data-doc-filter="연차증빙"/);
});

test('업로드 종류를 바꾸면 해당 서류 종류·연차 신청 선택기만 보인다', () => {
  const values = {
    '#edScope': { value: '연차증빙' }, '#edTypeWrap': { style: {} }, '#edUserWrap': { style: {} },
    '#edLeaveRequestWrap': { style: {} }, '#edUploadButton': { textContent: '' }
  };
  const context = { $: selector => values[selector] };
  vm.runInNewContext(`${inlineFunction('setEmployeeDocumentUploadScope')};this.setEmployeeDocumentUploadScope=setEmployeeDocumentUploadScope;`, context);
  context.setEmployeeDocumentUploadScope();
  assert.equal(values['#edTypeWrap'].style.display, 'none');
  assert.equal(values['#edUserWrap'].style.display, 'none');
  assert.equal(values['#edLeaveRequestWrap'].style.display, '');
  assert.equal(values['#edUploadButton'].textContent, '연차 증빙 올리기');
  values['#edScope'].value = '직원서류';
  context.setEmployeeDocumentUploadScope();
  assert.equal(values['#edTypeWrap'].style.display, '');
  assert.equal(values['#edUserWrap'].style.display, '');
  assert.equal(values['#edLeaveRequestWrap'].style.display, 'none');
  assert.equal(values['#edUploadButton'].textContent, '서류 올리기');
});

test('서류함 상단에서 연차 신청과 결재 올리기를 시작할 수 있다', () => {
  const block = html.match(/function employeeDocumentsCard\([\s\S]*?\n}\nfunction filterEmployeeDocuments/);
  assert.ok(block);
  assert.match(block[0], /onclick="openLeave\(\)"/);
  assert.match(block[0], /onclick="show\('apMask'\)/);
});

test('결재 종류에는 연차 신청·사직서·재직증명서 발급이 포함된다', () => {
  assert.match(html, /<select id="apKind"><option>연차 신청<\/option><option>사직서<\/option><option>재직증명서 발급<\/option>/);
});

test('표시 라벨은 approval_docs CHECK 허용값으로 매핑되고 재직증명서 요청 표지가 보존된다', () => {
  const block = html.match(/\/\* approval-request:test-start \*\/([\s\S]*?)\/\* approval-request:test-end \*\//);
  assert.ok(block);
  const context = {};
  require('node:vm').runInNewContext(`${block[1]};this.h={approvalKindValue,approvalRequestTitle,approvalRequestBody};`, context);
  assert.deepEqual(['연차','사직서','기타','보고','소명','기타'], ['연차 신청','사직서','재직증명서 발급','보고','소명','기타'].map(context.h.approvalKindValue));
  assert.equal(context.h.approvalRequestTitle('재직증명서 발급', '발급 요청'), '[재직증명서 발급] 발급 요청');
  assert.match(context.h.approvalRequestBody('재직증명서 발급', '대상 기간'), /^\[재직증명서 발급 요청\]/);
  assert.match(schema, /kind text not null[\s\S]*check \(kind in \('연차', '소명', '사직서', '보고', '기타'\)\)/);
});

test('연차 신청 라벨은 별도 연차 신청 흐름으로 전환되고 실제 approval_docs 저장은 허용값만 사용한다', () => {
  assert.match(html, /if\(label==='연차 신청'\)\{hide\('apMask'\);openLeave\(\);return;\}/);
  assert.match(html, /insert\(\{kind,title:storedTitle,body:storedBody,author:ME\.id\}\)/);
});

test('작성자 표시와 approval_docs 권한 경계가 실제 필드·정책과 맞는다', () => {
  assert.match(html, /nameOf\(d\.user_id\|\|d\.author\)/);
  assert.match(policies, /author = auth\.uid\(\)/);
  assert.match(policies, /public\.my_role\(\) in \('chief', 'owner'\)/);
  assert.doesNotMatch(policies, /public\.my_role\(\) in \('staff', 'manager', 'chief', 'owner'\)/);
});

test('재직증명서는 자동 발급 완료로 가장하지 않고 신청·결재 요청 상태로 안내한다', () => {
  assert.match(html, /재직증명서는 결재 요청만 기록되며/);
  assert.doesNotMatch(html, /재직증명서.*발급 완료/);
});

test('계정·Notion 체크는 통합 서류함 뒤쪽에 렌더링된다', () => {
  const onbo = html.match(/async function renderOnbo\(m\)\{([\s\S]*?)\n}\nfunction onboardingChecklistCard/);
  assert.ok(onbo);
  assert.ok(onbo[1].indexOf('employeeDocumentsCard') < onbo[1].indexOf('onboardingChecklistCard'));
});

test('필터에 해당 문서가 없으면 빈 결과 문구를 표시한다', () => {
  assert.match(html, /id="employeeDocumentEmpty" style="display:none"/);
  assert.match(html, /해당 종류의 문서가 없습니다/);
});

test('실제 filterEmployeeDocuments가 4필터 행·활성 버튼·EMPTY를 실행한다', () => {
  const rows = ['직원서류', '연차증빙', '결재 요청'].map(kind => ({ dataset: { docFilter: kind }, style: {} }));
  const buttons = ['전체 문서', '직원서류', '연차증빙', '결재 요청'].map(kind => ({ dataset: { docFilterButton: kind }, classList: classList() }));
  const empty = { style: { display: 'none' } };
  const box = { querySelectorAll(selector) { return selector === '[data-doc-filter]' ? rows : buttons; } };
  const context = { $: selector => selector === '#employeeDocumentBox' ? box : selector === '#employeeDocumentEmpty' ? empty : null };
  vm.runInNewContext(`${inlineFunction('filterEmployeeDocuments')};this.filterEmployeeDocuments=filterEmployeeDocuments;`, context);
  for (const kind of ['전체 문서', '직원서류', '연차증빙', '결재 요청']) {
    context.filterEmployeeDocuments(kind);
    assert.deepEqual(rows.map(row => row.style.display), rows.map(row => kind === '전체 문서' || row.dataset.docFilter === kind ? '' : 'none'));
    assert.deepEqual(buttons.map(button => button.classList.has('stamp')), buttons.map(button => button.dataset.docFilterButton === kind));
    assert.equal(empty.style.display, 'none');
  }
  context.filterEmployeeDocuments('없는 종류');
  assert.ok(rows.every(row => row.style.display === 'none'));
  assert.equal(empty.style.display, '');
});

test('실제 submitApproval은 연차 흐름과 재직증명서 저장 payload를 실행한다', async () => {
  const submitSource = inlineFunction('submitApproval');
  const helperBlock = html.match(/\/\* approval-request:test-start \*\/([\s\S]*?)\/\* approval-request:test-end \*\//);
  assert.ok(helperBlock);
  const calls = [];
  const values = { '#apKind': { value: '연차 신청' }, '#apTitle': { value: '휴가' }, '#apBody': { value: '7월 휴가' }, '#apMsg': { textContent: '' } };
  const context = {
    $: selector => values[selector],
    hide: () => calls.push(['hide']), openLeave: () => calls.push(['openLeave']), setStatus: () => {}, render: () => {},
    refreshBadges: () => {}, ME: { id: 'staff-1' },
    sb: { from: table => { calls.push(['from', table]); return { insert: payload => { calls.push(['insert', payload]); return { select: () => ({ single: async () => ({ data: { id: 7 }, error: null }) }) }; } }; } }
  };
  vm.runInNewContext(`${helperBlock[1]};${submitSource};this.submitApproval=submitApproval;`, context);
  await context.submitApproval();
  assert.equal(calls.filter(call => call[0] === 'insert').length, 0);
  assert.deepEqual(calls.filter(call => call[0] === 'openLeave'), [['openLeave']]);

  calls.length = 0; values['#apKind'].value = '재직증명서 발급'; values['#apTitle'].value = '발급 요청'; values['#apBody'].value = '2026년 재직 확인';
  await context.submitApproval();
  const docInsert = calls.find(call => call[0] === 'insert')[1];
  assert.deepEqual(JSON.parse(JSON.stringify(docInsert)), { kind: '기타', title: '[재직증명서 발급] 발급 요청', body: '[재직증명서 발급 요청]\n2026년 재직 확인', author: 'staff-1' });
  assert.equal(calls.filter(call => call[0] === 'insert').length, 2);
});
