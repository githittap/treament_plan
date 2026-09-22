const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const sqlPath = path.join(root, 'db', 'employment_status_access_block.sql');
const rollbackPath = path.join(root, 'db', 'employment_status_access_block_rollback.sql');
const html = fs.readFileSync(path.join(root, 'hr.html'), 'utf8');

test('재직 상태와 계정 차단 migration 및 rollback이 있다', () => {
  assert.ok(fs.existsSync(sqlPath), '재직 상태 migration이 없습니다.');
  assert.ok(fs.existsSync(rollbackPath), '재직 상태 rollback이 없습니다.');
});

test('migration은 상태·보존 이력·삭제 차단을 함께 적용한다', () => {
  const sql = fs.readFileSync(sqlPath, 'utf8');
  for (const column of ['employment_status', 'employment_effective_date', 'employment_reason', 'account_access_status', 'account_disabled_at', 'account_disabled_by', 'account_disabled_reason']) assert.match(sql, new RegExp(`add column if not exists ${column}`, 'i'));
  assert.match(sql, /create table if not exists public\.profile_employment_history/i);
  assert.match(sql, /when active\s*=\s*true then '재직'/i);
  assert.match(sql, /else '자진퇴사' end/i);
  assert.match(sql, /drop policy if exists profiles_delete_owner/i);
  assert.match(sql, /revoke delete on table public\.profiles from authenticated/i);
  assert.doesNotMatch(sql, /delete from public\.(?:profiles|contracts|attendance|leave_requests|payroll_rows)/i);
});

test('이력은 chief/owner만 읽고 직접 쓰기 권한은 없다', () => {
  const sql = fs.readFileSync(sqlPath, 'utf8');
  assert.match(sql, /create policy profile_employment_history_select_lead/i);
  assert.match(sql, /p\.active\s*=\s*true[\s\S]*p\.approved\s*=\s*true[\s\S]*p\.role in \('chief', 'owner'\)/i);
  assert.match(sql, /revoke insert, update, delete on table public\.profile_employment_history from authenticated/i);
  assert.doesNotMatch(sql, /create policy profile_employment_history_.*(?:insert|update|delete)/i);
});

test('상태 RPC는 SECURITY DEFINER·빈 search_path·원장 활성승인·자기자신/마지막원장 차단과 차단계정 복귀 거부를 강제한다', () => {
  const sql = fs.readFileSync(sqlPath, 'utf8');
  for (const name of ['set_employment_status', 'disable_employee_account_preserve_records']) {
    assert.match(sql, new RegExp(`create or replace function public\\.${name}`, 'i'));
  }
  assert.match(sql, /security definer\s+set search_path\s*=\s*''/i);
  assert.match(sql, /v_actor\s*=\s*p_user_id/i);
  assert.match(sql, /last active owner/i);
  assert.match(sql, /p\.active\s*=\s*true[\s\S]*p\.approved\s*=\s*true[\s\S]*p\.role\s*=\s*'owner'/i);
  assert.match(sql, /update public\.schedule_people[\s\S]*included_in_schedule\s*=\s*false/i);
  assert.match(sql, /approved\s*=\s*false/i);
  assert.match(sql, /v_access_status\s*=\s*'차단' then raise exception 'blocked account cannot return to employed status'/i);
  assert.match(sql, /grant execute on function public\.set_employment_status/i);
});

test('승인은 직접 profiles 갱신이 아닌 차단 계정 거부 RPC를 사용한다', () => {
  const sql = fs.readFileSync(sqlPath, 'utf8');
  assert.match(sql, /create or replace function public\.approve_employee_profile/i);
  assert.match(sql, /active approved chief or owner required/i);
  assert.match(sql, /blocked account cannot be approved/i);
  assert.match(sql, /grant execute on function public\.approve_employee_profile/i);
  assert.match(html, /sb\.rpc\('approve_employee_profile'/);
  assert.doesNotMatch(html, /function approveProfile\(uid\)\{[\s\S]*?from\('profiles'\)\.update\(\{approved:true\}\)/);
  assert.match(html, /blocked=p\.account_access_status==='차단'/);
  assert.match(html, /blocked\?'disabled':''/);
});

test('차단 JWT gate와 UI profile 변경 RPC가 직접 갱신을 대체한다', () => {
  const sql = fs.readFileSync(sqlPath, 'utf8');
  assert.match(sql, /create or replace function public\.employee_hub_access_allowed\(\)[\s\S]*account_access_status\s*=\s*'활성'/i);
  assert.match(sql, /create policy employee_hub_access_gate[\s\S]*as restrictive for all to authenticated/i);
  assert.match(sql, /employee-signatures','leave-docs','notice-attachments/i);
  assert.match(sql, /revoke update on table public\.profiles from authenticated/i);
  for (const rpc of ['update_employee_profile_field', 'revoke_employee_profile_approval']) assert.match(sql, new RegExp(`create or replace function public\\.${rpc}`, 'i'));
  assert.doesNotMatch(html, /from\('profiles'\)\.update\(/);
  assert.match(html, /sb\.rpc\('update_employee_profile_field'/);
  assert.match(html, /sb\.rpc\('revoke_employee_profile_approval'/);
});

test('rollback은 이력 또는 비재직·차단 데이터가 있으면 보존 중단한다', () => {
  const rollback = fs.readFileSync(rollbackPath, 'utf8');
  assert.match(rollback, /profile_employment_history/i);
  assert.match(rollback, /employment_status\s*<>\s*'재직'/i);
  assert.match(rollback, /account_access_status\s*<>\s*'활성'/i);
  assert.match(rollback, /raise exception/i);
});

test('원장 UI는 상태·유효일·사유 저장과 영구 접속 차단 오류복구를 제공한다', () => {
  assert.match(html, /setEmploymentStatus\(/);
  assert.match(html, /disableEmployeeAccountPreserveRecords\(/);
  assert.match(html, /접속 영구 차단\(인사기록 보존\)/);
  assert.match(html, /employment_effective_date|employment-.*-effective/i);
  assert.match(html, /employment_reason|employment-.*-reason/i);
  assert.match(html, /sb\.rpc\('set_employment_status'/);
  assert.match(html, /sb\.rpc\('disable_employee_account_preserve_records'/);
  assert.match(html, /재직 상태 저장 실패:/);
  assert.match(html, /계정 차단 실패:/);
  assert.doesNotMatch(html, /from\('profiles'\)\.delete\(/);
  assert.doesNotMatch(html, /from\('auth\.users'\)\.delete\(/);
});
