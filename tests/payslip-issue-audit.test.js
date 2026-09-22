const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const root=path.join(__dirname,'..'),read=p=>fs.readFileSync(path.join(root,p),'utf8');
test('payslip 발행 감사 컬럼 draft는 fail-closed 선행조건·멱등 추가·트랜잭션을 갖추고 payslips 표·기존 RLS는 건드리지 않는다',()=>{
  const sql=read('db/payslip_issue_audit_draft.sql');
  assert.match(sql,/^begin;/m);
  assert.match(sql,/to_regclass\('public\.payslips'\) is null/);
  assert.match(sql,/raise exception/);
  assert.match(sql,/column_name\s*=\s*'issued'/);
  assert.match(sql,/column_name\s*=\s*'issued_at'/);
  assert.match(sql,/alter table public\.payslips add column if not exists issued_by text;/);
  assert.match(sql,/^commit;/m);
  assert.doesNotMatch(sql,/drop table/i);
  assert.doesNotMatch(sql,/create policy/i);
  assert.doesNotMatch(sql,/alter policy/i);
});
test('payslip 발행 감사 컬럼 rollback은 issued_by만 제거하고 payslips 표·데이터는 남긴다',()=>{
  const sql=read('db/payslip_issue_audit_rollback.sql');
  assert.match(sql,/^begin;/m);
  assert.match(sql,/alter table public\.payslips drop column if exists issued_by;/);
  assert.match(sql,/^commit;/m);
  assert.doesNotMatch(sql,/drop table/i);
  assert.doesNotMatch(sql,/delete from/i);
});
