const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'hr.html'), 'utf8');

test('E장 연차 유형·시간 범위·저장 어휘·계약기간만료 표시를 제공한다', () => {
  assert.match(html, /<option>조퇴<\/option>/);
  assert.match(html, /id="lvTimeFrom"/);
  assert.match(html, /id="lvTimeTo"/);
  assert.match(html, /type==='반차'\|\|type==='조퇴'/);
  assert.match(html, /onclick="grantLeave\(\)">저장<\/button>/);
  assert.match(html, />계약기간만료<\/option>/);
});

test('반차·조퇴 신청은 시간 범위를 type_note로 저장하고 조회·캘린더에 표시한다', () => {
  assert.match(html, /type_note:\(type==='반차'\|\|type==='조퇴'\)\?`\$\{timeFrom\}~\$\{timeTo\}`/);
  assert.match(html, /r\.type_note&&r\.type!==['"]기타['"]/);
  assert.match(html, /row\.type_note\?' · '\+row\.type_note/);
});

test('관리자 무단결근 기준에 일수·시간(분) 설정과 저장이 있다', () => {
  assert.match(html, /id="absenceDays"/);
  assert.match(html, /absence_confirm_after_days/);
  assert.match(html, /absence_confirm_after_minutes/);
});

test('무단결근 일수 설정은 로컬 SQL 초안과 안전 롤백을 가진다', () => {
  const sql = fs.readFileSync(path.join(root, 'db', 'absence_candidate_days_draft.sql'), 'utf8');
  assert.match(sql, /absence_confirm_after_days/);
  assert.match(sql, /migration_state/);
  assert.ok(fs.existsSync(path.join(root, 'db', 'absence_candidate_days_rollback.sql')));
});
