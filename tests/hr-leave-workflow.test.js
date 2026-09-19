const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const html = fs.readFileSync('hr.html', 'utf8');
const sql = fs.readFileSync('db/hr_leave_workflow.sql', 'utf8');
const policies = fs.readFileSync('db/hr_policies.sql', 'utf8');

test('연차 처리는 원자적 RPC를 사용한다', () => {
  assert.match(html, /rpc\('process_leave_request'/);
  assert.match(html, /rpc\('replace_pending_leave_request'/);
  assert.match(html, /'set_leave_balance'/);
  assert.match(html, /rpc\(kind==='조정'\?'set_leave_balance':'grant_leave_entry'/);
  assert.match(sql, /select \* into r[\s\S]+for update/);
  assert.match(sql, /not exists\(select 1 from public\.leave_ledger as ll where ll\.ref=p_id and ll\.kind='사용'\)/);
  assert.match(sql, /pg_advisory_xact_lock\(hashtextextended\(r\.user_id::text,0\)\)/);
});

test('권한과 상태 가드가 RPC·INSERT 정책에 있다', () => {
  assert.match(sql, /p_action='cancel'[\s\S]+r\.user_id<>auth\.uid\(\)/);
  assert.match(sql, /role_name not in \('chief','owner'\)/);
  assert.match(sql, /role_name<>'chief' or r\.status not in \('대기','1차승인'\)/);
  assert.match(sql, /r\.user_id<>auth\.uid\(\) or r\.status<>'대기'/);
  assert.match(policies, /user_id = auth\.uid\(\)[\s\S]+status = '대기'[\s\S]+chief_by is null/);
  assert.match(policies, /leave_ledger_insert_owner[\s\S]+my_role\(\) = 'owner'/);
  assert.match(policies, /leave_requests_insert_self[\s\S]+profiles p where p\.user_id = auth\.uid\(\) and p\.active and p\.approved/);
  assert.match(policies, /leave_ledger_update_owner[\s\S]+profiles p where p\.user_id = auth\.uid\(\) and p\.active and p\.approved/);
  assert.match(sql, /p_action='cancel_approved'[\s\S]+role_name<>'owner'[\s\S]+r\.status<>'승인'/);
  assert.match(sql, /승인취소 복구:/);
  assert.match(sql, /grant_leave_entry[\s\S]+not exists\(select 1 from public\.profiles as p where p\.user_id=auth\.uid\(\) and p\.active and p\.approved\)/);
  assert.match(sql, /revoke all on function public\.replace_pending_leave_request[\s\S]+from public, anon/);
  assert.match(sql, /revoke all on function public\.process_leave_request[\s\S]+from public, anon/);
  assert.match(sql, /revoke all on function public\.grant_leave_entry[\s\S]+from public, anon/);
  assert.match(sql, /revoke all on function public\.set_leave_balance[\s\S]+from public, anon/);
});

test('0일은 유효하고 음수는 거절한다', () => {
  assert.match(html, /Number\.isNaN\(days\)\|\|days<0/);
  assert.match(sql, /p_target<0/);
  assert.match(sql, /d:=p_target-prev/);
  assert.match(sql, /coalesce\(public\.my_role\(\),''\)/);
});

test('승인 시각은 chief_at을 사용하고 월말 범위는 다음 달 미만이다', () => {
  assert.match(html, /owner_at\|\|row\.chief_at/);
  assert.match(html, /\.lt\('date_from',archiveEnd\)/);
});

test('연차 인쇄 CSS는 전역 인쇄가 아니라 전용 상태에만 적용된다', () => {
  assert.match(html, /body\.leave-printing> \*\{display:none!important\}/);
  assert.match(html, /body\.leave-printing>#lvFormMask\{display:block!important/);
  assert.match(html, /afterprint/);
  assert.doesNotMatch(html, /@media print\{[^}]*body \*\{visibility:hidden/);
});

test('chief는 대기와 1차승인 모두 조회하고 승인 RPC로 처리한다', () => {
  assert.match(html, /BADGE\.leave=\(lv\|\|\[\]\)\.filter\(r=>r\.status==='대기'\|\|r\.status==='1차승인'\)/);
  assert.match(html, /const forme=\(pend\|\|\[\]\)\.filter\(r=>r\.status==='대기'\|\|r\.status==='1차승인'\)/);
  assert.match(html, /p_action:act==='ok'\?'approve':'reject'/);
});

test('승인완료 취소는 owner RPC로 복구하고 오류를 확인한다', () => {
  assert.match(html, /ME\.role==='owner'\?`<button[^`]+cancelApprovedLeave/);
  assert.match(html, /p_action:'cancel_approved'/);
  assert.match(html, /승인 취소·복구 실패/);
});
