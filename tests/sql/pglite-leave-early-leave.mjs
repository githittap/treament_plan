import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
const root=process.env.PGLITE_PACKAGE_ROOT;if(!root){console.error('PGLITE_SKIP: PGLITE_PACKAGE_ROOT required; leave-early-leave test not run');process.exit(2);}
const {PGlite}=await import(pathToFileURL(path.join(root,'dist/index.js')).href);const db=new PGlite();
const migration=fs.readFileSync('db/leave_request_early_leave_draft.sql','utf8');
const rollback=fs.readFileSync('db/leave_request_early_leave_rollback.sql','utf8');
try{
  await db.exec(`create table public.leave_requests(id integer generated always as identity primary key,type text not null default '연차',constraint leave_requests_type_check check(type in ('연차','반차','기타')));`);
  await db.exec("insert into public.leave_requests(type) values('연차'),('반차'),('기타')");
  assert.equal((await db.query("select count(*)::int n from public.leave_requests where type in ('연차','반차','기타')")).rows[0].n,3);
  await db.exec(migration);
  await db.exec("insert into public.leave_requests(type) values('연차'),('반차'),('기타')");
  assert.equal((await db.query("select count(*)::int n from public.leave_requests where type in ('연차','반차','기타')")).rows[0].n,6);
  await db.exec("insert into public.leave_requests(type) values('조퇴')");
  assert.equal((await db.query("select type from public.leave_requests where type='조퇴'")).rows[0].type,'조퇴');
  await assert.rejects(db.exec(rollback),/조퇴 데이터가 남아 있어 롤백을 중단/);
  await db.exec('rollback');
  assert.equal((await db.query("select count(*)::int n from public.leave_requests where type='조퇴'")).rows[0].n,1);
  await db.exec("delete from public.leave_requests where type='조퇴'");
  await db.exec(rollback);
  await assert.rejects(db.exec("insert into public.leave_requests(type) values('조퇴')"),/violates check constraint|check constraint/);
  console.log('PGLITE_LEAVE_EARLY_LEAVE_PASS: migration/insert/data-safe-rollback/clean-rollback');
}finally{await db.close();}
