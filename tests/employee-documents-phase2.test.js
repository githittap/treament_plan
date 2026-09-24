const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const html = fs.readFileSync('hr.html', 'utf8');
const schema = fs.readFileSync('db/hr_schema.sql', 'utf8');
const policies = fs.readFileSync('db/hr_policies.sql', 'utf8');

test('서류함은 승인된 4개 필터를 한 화면에 제공한다', () => {
  for (const label of ['전체 문서', '직원서류', '연차증빙', '결재 요청']) {
    assert.match(html, new RegExp(`data-doc-filter-button="${label}"`));
  }
  assert.match(html, /function filterEmployeeDocuments\(kind\)/);
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
