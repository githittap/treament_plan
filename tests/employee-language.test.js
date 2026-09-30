const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const html = fs.readFileSync('hr.html', 'utf8');

test('근태 기록 설명은 생체 원본 대신 직원이 이해하는 지문 기록 표현을 쓴다', () => {
  assert.match(html, /지문 기록과 별도 대조 원장/);
  assert.doesNotMatch(html, /생체/);
});
