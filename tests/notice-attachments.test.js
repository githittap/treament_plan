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
assert.match(sql, /drop policy if exists notices_insert_approvers on public\.notices/i,
  '기존 permissive 공지 INSERT 정책을 제거해야 한다');
assert.match(sql, /create or replace function public\.guard_notice_immutable_fields/i,
  '공지 작성자·작성시각 불변 트리거가 필요하다');
assert.match(sql, /new\.created_at\s*:=\s*now\(\).*new\.updated_at\s*:=\s*now\(\)/is,
  '공지 INSERT 시각은 클라이언트 값 대신 서버 시각으로 고정해야 한다');
assert.match(sql, /revoke all on table public\.notice_attachments_migration_snapshot from public, anon, authenticated/i,
  '롤백 기준값 표는 일반 세션의 ACL 접근을 차단해야 한다');
assert.match(sql, /alter table public\.notice_attachments_migration_snapshot enable row level security/i,
  '롤백 기준값 표는 RLS 방어를 명시해야 한다');
assert.match(sql, /file_size_limits*=s*10485760/i,
  '비공개 버킷은 서버에서 10MB 제한을 강제해야 한다');
assert.match(sql, /allowed_mime_types/i,
  '비공개 버킷은 서버 허용 MIME 목록을 설정해야 한다');
assert.match(sql, /metadata->>'mimetype'/i,
  'Storage INSERT 정책은 서버 metadata MIME을 검증해야 한다');
assert.match(sql, /metadata->>'size'/i,
  'Storage INSERT 정책은 서버 metadata 크기를 검증해야 한다');
assert.match(html, /noticeAttachmentLinks\(/,
  '공지 렌더는 첨부 목록을 별도로 표시해야 한다');
assert.match(html, /downloadNoticeAttachment\(/,
  '첨부 열람은 private Storage download 경로를 사용해야 한다');
assert.match(html, /cleanupNoticeUploads\(/,
  '공지 저장 실패·부분 업로드는 이번 요청의 임시 객체만 정리해야 한다');
assert.match(html, /async function cleanupNoticeUploads\(paths\)\{if\(paths\.length\)await sb\.storage\.from\('notice-attachments'\)\.remove\(paths\);\}/,
  '정리 함수는 전용 버킷에서 전달된 이번 요청 경로만 삭제해야 한다');
assert.match(html, /if\(error\)\{await cleanupNoticeUploads\(uploaded\);\$\('#ntMsg'\)\.textContent='첨부 실패:/,
  '부분 업로드 실패 시 성공한 임시 경로를 정리해야 한다');
assert.match(html, /if\(error\)\{await cleanupNoticeUploads\(uploaded\);\$\('#ntMsg'\)\.textContent='공지 저장 실패:/,
  '공지 행 저장 실패 시 성공한 임시 경로를 정리해야 한다');
assert.match(sql, /notice_attachments_delete_own_tmp/i,
  '업로더 본인의 임시 첨부만 삭제하는 Storage DELETE 정책이 필요하다');
assert.match(sql, /deposits_select_desk_lead/,
  '예치금 조회 RLS가 공지 작성 RLS와 분리되어야 한다');
assert.match(sql, /p\.dept='데스크'.*p\.role in \('chief','owner'\)/s,
  '예치금은 데스크 직원·chief·owner만 조회할 수 있어야 한다');

console.log('NOTICE_ATTACHMENTS_ACCEPTANCE_PASS');
