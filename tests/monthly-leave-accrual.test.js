const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const sql = fs.readFileSync(path.join(__dirname, '..', 'db', 'monthly_leave_accrual_draft.sql'), 'utf8');

test('월차 자동발생은 한 달 경과·1일·멱등·기존 잔액 보존을 명시한다', () => {
  assert.match(sql, /create or replace function public\.accrue_monthly_leave/);
  assert.match(sql, /p\.hire_date \+ interval '1 month' <= p_as_of/);
  assert.match(sql, /values \(p\.user_id,'부여',1/);
  assert.match(sql, /not exists\(select 1 from public\.leave_ledger/);
  assert.match(sql, /pg_advisory_xact_lock/);
  assert.doesNotMatch(sql, /update public\.leave_ledger/);
  assert.doesNotMatch(sql, /set_leave_balance/);
});

test('이채원 입사일은 2026-10-18부터 첫 월차 대상이다', () => {
  assert.match(sql, /2026-09-18/);
  assert.match(sql, /2026-10-18/);
});
