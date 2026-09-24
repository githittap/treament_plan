const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const html = fs.readFileSync('hr.html', 'utf8');

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

test('재직증명서는 자동 발급 완료로 가장하지 않고 신청·결재 요청 상태로 안내한다', () => {
  assert.match(html, /재직증명서는 결재 요청만 기록되며/);
  assert.doesNotMatch(html, /재직증명서.*발급 완료/);
});

test('계정·Notion 체크는 통합 서류함 뒤쪽에 렌더링된다', () => {
  const onbo = html.match(/async function renderOnbo\(m\)\{([\s\S]*?)\n}\nfunction onboardingChecklistCard/);
  assert.ok(onbo);
  assert.ok(onbo[1].indexOf('employeeDocumentsCard') < onbo[1].indexOf('onboardingChecklistCard'));
});
