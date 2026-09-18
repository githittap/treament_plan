const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'hr.html'), 'utf8');
const schema = fs.readFileSync(path.join(root, 'db', 'hr_schema.sql'), 'utf8');
const migrationPath = path.join(root, 'db', 'contract_status_workflow.sql');
const migration = fs.existsSync(migrationPath) ? fs.readFileSync(migrationPath, 'utf8') : '';
const statuses = ['발송요청', '대기', '서명완료', '취소'];

function constraintStatuses(sql) {
  const match = sql.match(/contracts_status_check[\s\S]*?check\s*\(\s*status\s+in\s*\(([^)]+)\)\s*\)/i)
    || sql.match(/status\s+text[\s\S]*?check\s*\(\s*status\s+in\s*\(([^)]+)\)\s*\)/i);
  assert.ok(match, 'contracts 상태 CHECK 제약이 있어야 한다.');
  return [...match[1].matchAll(/'([^']+)'/g)].map(item => item[1]);
}

test('계약 상태 마이그레이션은 화면의 전체 워크플로 상태를 허용한다', () => {
  assert.deepEqual(constraintStatuses(migration), statuses);
  assert.match(migration, /drop constraint if exists contracts_status_check/i);
  assert.match(migration, /add constraint contracts_status_check/i);
});

test('신규 설치 스키마도 같은 계약 상태를 허용한다', () => {
  const contractsTable = schema.match(/create table if not exists public\.contracts\s*\(([\s\S]*?)\n\);/i);
  assert.ok(contractsTable, 'contracts 테이블 선언이 있어야 한다.');
  assert.deepEqual(constraintStatuses(contractsTable[1]), statuses);
});

test('직원 허브는 네 계약 상태를 실제 워크플로에서 사용한다', () => {
  for (const status of statuses) assert.match(html, new RegExp(`['"]${status}['"]`));
});
