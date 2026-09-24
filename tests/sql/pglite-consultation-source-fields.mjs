import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';

const root=process.env.PGLITE_PACKAGE_ROOT;
if(!root)throw new Error('PGLITE_PACKAGE_ROOT is required');
const {PGlite}=await import(pathToFileURL(path.join(root,'dist/index.js')).href);
const db=new PGlite();
const q=async sql=>(await db.query(sql)).rows;
try{
  await db.exec(`create table public.consultation_journals(id bigint generated always as identity primary key,patient_name text not null);
    insert into public.consultation_journals(patient_name) values('합성 기존 행');`);
  const migration=fs.readFileSync('db/consultation_journal_source_fields_draft.sql','utf8');
  await db.exec(migration);
  await db.exec(migration);
  assert.deepEqual((await q('select id,patient_name,source_fields from public.consultation_journals'))[0],{id:1,patient_name:'합성 기존 행',source_fields:{}});
  await q(`update public.consultation_journals set source_fields='{"recall_1":"전화 예정","planned_treatment":"합성 진료"}'::jsonb where id=1`);
  assert.equal((await q('select source_fields from public.consultation_journals where id=1'))[0].source_fields.recall_1,'전화 예정');
  await assert.rejects(q(`update public.consultation_journals set source_fields='[]'::jsonb where id=1`),/consultation_journals_source_fields_object_check/);
  console.log('PGLITE_CONSULTATION_SOURCE_FIELDS_PASS: 기존 행 보존·재적용·값 저장·형식 차단');
}finally{await db.close();}
