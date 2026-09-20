import assert from 'node:assert/strict';
import fs from 'node:fs';

const html = fs.readFileSync('hr.html', 'utf8');
const sql = fs.readFileSync('db/leave_application_documents_draft.sql', 'utf8');

assert.match(sql, /create table if not exists public\.leave_application_documents/);
assert.match(sql, /request_id bigint not null references public\.leave_requests/);
assert.match(sql, /storage_path text not null unique/);
assert.match(sql, /leave_application_documents_insert_self/);
assert.match(sql, /r\.id=request_id and r\.user_id=auth\.uid\(\)/);
assert.match(sql, /bucket_id='leave-docs'/);
assert.match(sql, /alter table public\.leave_application_documents enable row level security/);
assert.match(sql, /grant select,insert,delete on table public\.leave_application_documents to authenticated/);
assert.match(sql, /revoke all on table public\.leave_application_documents from public,anon/);
assert.match(sql, /insert into storage\.buckets \(id,name,public\) values \('leave-docs','leave-docs',false\) on conflict do nothing/);
assert.match(html, /function leaveApplicationDocumentsCard\(/);
assert.match(html, /function uploadLeaveApplicationDocument\(/);
assert.match(html, /leave_application_documents/);
assert.match(html, /leave-docs/);
assert.doesNotMatch(html, /document_category:documentCategory/);
console.log('LEAVE_APPLICATION_DOCUMENTS_STATIC_PASS: 직원서류함 내부 보기, 별도 신청 연결·비공개 경계');
