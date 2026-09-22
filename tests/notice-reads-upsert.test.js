const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const html = fs.readFileSync(path.join(__dirname, '..', 'hr.html'), 'utf8');

const calls = [...html.matchAll(/\.from\('notice_reads'\)\.upsert\(\{[^{}]*\},\s*\{([^{}]*)\}\)/g)];

// 2026-09-23 메뉴 재편: 홈의 '📢 최근 공지' 카드가 빠지면서 홈에서 하던 읽음 처리도 함께 없어졌다.
// 이제 읽음 처리는 공지 탭 한 곳에서만 한다(안 보여 준 공지를 읽음으로 만들지 않는다).
test('notice_reads upsert 호출은 공지 탭 한 곳에만 존재한다', () => {
  assert.equal(calls.length, 1, `notice_reads upsert 호출 개수가 다르다 (실제 ${calls.length})`);
});

test('모든 notice_reads upsert는 onConflict와 ignoreDuplicates:true를 함께 써서 재열람 403을 막는다', () => {
  assert.ok(calls.length > 0, 'notice_reads upsert 호출을 찾지 못했다');
  for (const m of calls) {
    const opts = m[1];
    assert.match(opts, /onConflict\s*:\s*'notice_id,user_id'/, `onConflict 누락: ${m[0]}`);
    assert.match(opts, /ignoreDuplicates\s*:\s*true/, `ignoreDuplicates:true 누락 → UPDATE 정책 없이 403 재발: ${m[0]}`);
  }
});

console.log('NOTICE_READS_UPSERT_PASS');
