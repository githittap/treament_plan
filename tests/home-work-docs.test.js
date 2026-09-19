const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const html = fs.readFileSync(path.join(__dirname, '..', 'hr.html'), 'utf8');
const home = html.match(/async function renderHome\(m\)\{([\s\S]*?)\/\* ── 입금 ── \*\//);

test('홈에 업무자료 바로가기 카드가 기존 업무자료 탭으로 연결된다', () => {
  assert.ok(home, 'renderHome 경계를 찾을 수 없다');
  assert.match(home[1], /📚 업무자료/);
  assert.match(home[1], /업무자료 열기/);
  assert.match(home[1], /onclick="go\('workdocs'\)"/);
  assert.doesNotMatch(home[1], /app\.notion\.com/);
});
