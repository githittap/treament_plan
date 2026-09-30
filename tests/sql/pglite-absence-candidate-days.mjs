import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
const root=process.env.PGLITE_PACKAGE_ROOT;if(!root)process.exit(0);
const {PGlite}=await import(pathToFileURL(path.join(root,'dist/index.js')).href);const db=new PGlite();const q=s=>db.query(s).then(r=>r.rows);
try{
  await db.exec(`create role anon;create role authenticated;create table public.app_settings(key text primary key,value text not null,label text,updated_at timestamptz default now());insert into public.app_settings(key,value,label) values('absence_confirm_after_minutes','0','기존 분');`);
  await db.exec(fs.readFileSync('db/absence_candidate_days_draft.sql','utf8'));
  assert.equal((await q("select value from public.app_settings where key='absence_confirm_after_days'"))[0].value,'1');
  await q("update public.app_settings set value='2' where key='absence_confirm_after_days'");
  await assert.rejects(db.exec(fs.readFileSync('db/absence_candidate_days_rollback.sql','utf8')),/absence days changed|permission denied/);
  await q("update public.app_settings set value='1' where key='absence_confirm_after_days'");await db.exec(fs.readFileSync('db/absence_candidate_days_rollback.sql','utf8'));
  assert.equal((await q("select count(*)::int n from public.app_settings where key='absence_confirm_after_days'"))[0].n,0);
  console.log('PGLITE_ABSENCE_CANDIDATE_DAYS_PASS: draft/changed-value-stop/clean-rollback');
}finally{await db.close();}
