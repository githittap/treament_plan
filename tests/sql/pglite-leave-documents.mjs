import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const packageRoot = process.env.PGLITE_PACKAGE_ROOT;
if (!packageRoot) {
  console.log('PGLITE_SKIP: set PGLITE_PACKAGE_ROOT to the pinned @electric-sql/pglite package root');
  process.exit(0);
}

const { PGlite } = await import(pathToFileURL(path.join(packageRoot, 'dist/index.js')).href);
const db = new PGlite();
try {
  const draft = fs.readFileSync(path.resolve('db/leave_application_documents_draft.sql'), 'utf8');
  await db.exec(`create role authenticated; create schema auth; create or replace function auth.uid() returns uuid language sql stable as $$ select null::uuid $$; create or replace function public.my_role() returns text language sql stable as $$ select '' $$; create table public.employee_documents (id bigint primary key, user_id uuid not null, document_type text not null, original_name text, storage_path text, mime_type text, size_bytes bigint, uploaded_by uuid, created_at timestamptz default now()); ${draft}`);
  await db.query("insert into public.employee_documents(id,user_id,document_type,document_category) values (1, '11111111-1111-1111-1111-111111111111', '신청서', '연차 신청 증빙')");
  assert.equal((await db.query("select count(*)::int as count from public.employee_documents where document_category='연차 신청 증빙'")).rows[0].count, 1);
  console.log('PGLITE_LEAVE_DOCUMENTS_PASS: dedicated category is accepted');
} finally { await db.close(); }
