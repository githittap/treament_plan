import assert from 'node:assert/strict';
import fs from 'node:fs';

const sql = fs.readFileSync('db/monthly_leave_accrual_draft.sql', 'utf8');
assert.match(sql, /create table if not exists public\.leave_accrual_runs/);
assert.match(sql, /unique \(user_id,due_date\)/);
assert.match(sql, /generate_series\(1,least\(11,e\.months_elapsed\)\)/);
assert.match(sql, /where c\.months_completed between 1 and 11/);
assert.match(sql, /attendance confirmation required; preview only/);
assert.match(sql, /revoke all on function public\.apply_monthly_leave_accruals\(date\) from public,anon/);
assert.doesNotMatch(sql, /insert into public\.leave_ledger[\s\S]*?values\(p\.user_id,'부여',1,format\('월차 자동발생/);
console.log('MONTHLY_LEAVE_STATIC_PASS: 1~11회 후보, 구조적 중복키, 근태 확인 전 지급 차단');
