/* 새 SQL의 원장 전용 접근·자료 보존·빈 롤백 왕복을 실제 로컬 DB에서 돌린다. */
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{execFileSync}=require('node:child_process');
const pkg=process.env.PGLITE_PACKAGE_ROOT||'Z:/09_claude-output/_tmp/pglite-0.5.8/node_modules/@electric-sql/pglite';
for(const name of ['payroll-bonus','payroll-side-extra','payroll-reply-inclusive'])test('PGlite '+name+': 접근·기존 값·롤백/재적용',()=>{assert.ok(fs.existsSync(path.join(pkg,'dist/index.js')),'PGLITE_PACKAGE_ROOT required');const log=execFileSync(process.execPath,['tests/sql/pglite-'+name+'.mjs'],{cwd:path.join(__dirname,'..'),env:{...process.env,PGLITE_PACKAGE_ROOT:pkg},encoding:'utf8',timeout:30000});assert.match(log,/PASS/);});
