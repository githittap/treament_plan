/* 업무매뉴얼 DB 초안(db/manual_decks.sql)을 실제 로컬 DB(PGlite)에서 돌린다 — 미승인 0건·직원 공개본만·직원 쓰기 거절·원장실장 쓰기·롤백 */
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), { execFileSync } = require('node:child_process');
const pkg = process.env.PGLITE_PACKAGE_ROOT || 'Z:/09_claude-output/_tmp/pglite-0.5.8/node_modules/@electric-sql/pglite';
test('PGlite manual-decks: 접근 규칙·사진 규칙·롤백/재적용', { skip: !fs.existsSync(path.join(pkg, 'dist/index.js')) && 'PGLITE_PACKAGE_ROOT 없음' }, () => {
  const log = execFileSync(process.execPath, ['tests/sql/pglite-manual-decks.mjs'], { cwd: path.join(__dirname, '..'), env: { ...process.env, PGLITE_PACKAGE_ROOT: pkg }, encoding: 'utf8', timeout: 60000 });
  assert.match(log, /PGLITE_MANUAL_DECKS_PASS/);
});
