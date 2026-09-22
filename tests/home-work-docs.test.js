const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const html = fs.readFileSync(path.join(__dirname, '..', 'hr.html'), 'utf8');
const home = html.match(/async function renderHome\(m\)\{([\s\S]*?)\/\* ── 입금 ── \*\//);
const workdocs = html.match(/\/\* work-documents:render-start \*\/([\s\S]*?)\/\* work-documents:render-end \*\//);

// 2026-09-23 메뉴 재편: 업무자료 바로가기 카드는 조직도 보드의 '안 쓰는 메뉴'로 옮겨져 홈에서 빠졌다.
// 업무자료 자체는 '🩺 환자관리·진료' 묶음의 업무자료 탭에 그대로 남는다(기능 이동 아님).
test('업무자료 바로가기 카드는 홈에서 빠졌다', () => {
  assert.ok(home, 'renderHome 경계를 찾을 수 없다');
  assert.doesNotMatch(home[1], /업무자료 열기/);
  assert.doesNotMatch(home[1], /go\('workdocs'\)/);
});

test('업무자료 기능은 원래 자리(업무자료 탭)에 그대로 있고 외부 노션으로 새지 않는다', () => {
  assert.ok(workdocs, '업무자료 렌더 경계를 찾을 수 없다');
  assert.match(html, /\{key:'workdocs',label:'📚 업무자료'/);
  assert.match(html, /TAB==='workdocs'\)renderWorkDocuments\(m\)/);
  assert.doesNotMatch(workdocs[1], /app\.notion\.com/);
});
