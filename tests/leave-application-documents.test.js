const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const html = fs.readFileSync(path.join(__dirname, '..', 'hr.html'), 'utf8');
const sql = fs.readFileSync(path.join(__dirname, '..', 'db', 'leave_application_documents_draft.sql'), 'utf8');

test('연차 신청 증빙은 직원 서류함 안에서 일반 서류와 분리된다', () => {
  assert.match(html, /EMPLOYEE_DOCUMENTS_VIEW/);
  assert.match(html, /연차 신청 증빙/);
  assert.match(html, /일반 직원서류/);
  assert.match(html, /employeeDocumentsForView/);
});

test('연차 신청 증빙은 본인과 manager chief owner로만 한정한다', () => {
  assert.match(sql, /employee_documents_select_scoped/);
  assert.match(sql, /user_id = auth\.uid\(\) or public\.my_role\(\) in \('manager','chief','owner'\)/);
  assert.match(sql, /leave_application_document_category_check/);
  assert.match(sql, /연차 신청 증빙/);
});
