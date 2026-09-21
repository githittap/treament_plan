const assert = require('node:assert/strict');
const fs = require('node:fs');

const html = fs.readFileSync('hr.html', 'utf8');
const sql = fs.existsSync('db/notice_attachments_deposit_access_draft.sql')
  ? fs.readFileSync('db/notice_attachments_deposit_access_draft.sql', 'utf8') : '';

assert.match(html, /id="ntFiles"[^>]*type="file"[^>]*multiple/,
  '공지 작성 화면은 복수 업무파일 선택을 제공해야 한다');
assert.match(html, /NOTICE_ATTACHMENT_ALLOWED_TYPES/,
  '화면은 허용 MIME 형식을 검사해야 한다');
assert.match(html, /notice-attachments/,
  '첨부는 전용 비공개 버킷을 사용해야 한다');
assert.match(html, /canViewDeposit\(ME\)/,
  '예치금 화면은 공지 작성권과 별도 권한 검사를 사용해야 한다');
assert.match(sql, /notices_insert_authenticated/,
  '승인 직원의 공지 작성 RLS가 필요하다');
assert.match(sql, /deposits_select_desk_lead/,
  '예치금 조회 RLS가 공지 작성 RLS와 분리되어야 한다');
assert.match(sql, /p\.dept='데스크'.*p\.role in \('chief','owner'\)/s,
  '예치금은 데스크 직원·chief·owner만 조회할 수 있어야 한다');

console.log('NOTICE_ATTACHMENTS_ACCEPTANCE_PASS');
