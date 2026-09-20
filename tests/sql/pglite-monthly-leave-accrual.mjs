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
  const draft = fs.readFileSync(path.resolve('db/monthly_leave_accrual_draft.sql'), 'utf8');
  await db.exec(`create role anon; create role authenticated; create schema auth; create or replace function auth.uid() returns uuid language sql stable as $$ select '22222222-2222-2222-2222-222222222222'::uuid $$; create table public.profiles(user_id uuid primary key, hire_date date, active boolean default true, approved boolean default true, role text); create or replace function public.my_role() returns text language sql stable as $$ select 'owner' $$; create table public.leave_ledger(id bigint generated always as identity primary key,user_id uuid,kind text,days numeric,note text); ${draft}`);
  await db.query("insert into public.profiles values ('11111111-1111-1111-1111-111111111111','2026-09-18',true,true,'staff')");
  await db.query("select * from public.accrue_monthly_leave('2026-10-17')");
  assert.equal((await db.query('select count(*)::int as count from public.leave_ledger')).rows[0].count, 0);
  await db.query("select * from public.accrue_monthly_leave('2026-10-18')");
  await db.query("select * from public.accrue_monthly_leave('2026-10-18')");
  assert.equal((await db.query('select count(*)::int as count from public.leave_ledger')).rows[0].count, 1);
  assert.equal(Number((await db.query('select days from public.leave_ledger')).rows[0].days), 1);
  console.log('PGLITE_MONTHLY_LEAVE_ACCRUAL_PASS: before anniversary blocked, first anniversary grants once, rerun is idempotent');
} finally { await db.close(); }
