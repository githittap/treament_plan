import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const packageRoot = process.env.PGLITE_PACKAGE_ROOT;
if (!packageRoot) throw new Error('PGLITE_PACKAGE_ROOT is required');
const { PGlite } = await import(pathToFileURL(path.join(packageRoot, 'dist/index.js')).href);
const db = new PGlite();
const query = sql => db.query(sql).then(result => result.rows);
const draft = fs.readFileSync(path.resolve('db/monthly_leave_accrual_draft.sql'), 'utf8');
const prelude = `
create role anon; create role authenticated; create schema auth;
create or replace function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('app.test_uid',true),'')::uuid $$;
create table public.profiles(user_id uuid primary key,name text,hire_date date,role text,active boolean not null default true,approved boolean not null default true);
create or replace function public.my_role() returns text language sql stable security definer set search_path=public as $$ select coalesce((select role from public.profiles where user_id=auth.uid()),'') $$;
create table public.leave_ledger(id bigint generated always as identity primary key,user_id uuid not null,kind text not null,days numeric(3,1) not null,note text);
grant usage on schema auth to authenticated; grant execute on function auth.uid(),public.my_role() to authenticated; grant select on public.profiles to authenticated; grant select,insert on public.leave_ledger to authenticated;
`;
const owner='33333333-3333-3333-3333-333333333333',staff='11111111-1111-1111-1111-111111111111',manager='22222222-2222-2222-2222-222222222222';
try {
  await db.exec(prelude + draft);
  await query(`insert into public.profiles values ('${owner}','합성원장',null,'owner',true,true),('${staff}','합성직원','2026-09-18','staff',true,true),('${manager}','합성관리자',null,'manager',true,true)`);
  await query('set role authenticated'); await query(`select set_config('app.test_uid','${staff}',false)`);
  let previewDenied=''; try { await query("select * from public.preview_monthly_leave_accruals('2026-10-18')"); } catch(error) { previewDenied=String(error); } assert.match(previewDenied,/owner execution required/);
  await query(`select set_config('app.test_uid','${manager}',false)`); previewDenied=''; try { await query("select * from public.preview_monthly_leave_accruals('2026-10-18')"); } catch(error) { previewDenied=String(error); } assert.match(previewDenied,/owner execution required/);
  await query(`select set_config('app.test_uid','${owner}',false)`);
  let preview = await query("select * from public.preview_monthly_leave_accruals('2026-10-17')"); assert.equal(preview.length,0);
  preview = await query("select * from public.preview_monthly_leave_accruals('2026-10-18')"); assert.equal(preview.length,1); assert.equal(preview[0].user_id,staff); assert.equal(preview[0].months_completed,1); assert.equal(new Date(preview[0].due_date).toISOString().slice(0,10),'2026-10-18');
  preview = await query("select * from public.preview_monthly_leave_accruals('2026-11-17')"); assert.equal(preview.length,1); assert.equal(preview[0].months_completed,1);
  preview = await query("select * from public.preview_monthly_leave_accruals('2026-11-18')"); assert.equal(preview.length,2); assert.equal(Math.max(...preview.map(row=>row.months_completed)),2);
  let blocked=''; try { await query("select * from public.apply_monthly_leave_accruals('2026-10-18')"); } catch(error) { blocked=String(error); } assert.match(blocked,/attendance confirmation required/); assert.equal((await query(`select count(*)::int n from public.leave_ledger where user_id='${staff}'`))[0].n,0);
  preview = await query("select * from public.preview_monthly_leave_accruals('2027-09-18')"); assert.equal(preview.length,11); assert.equal(Math.max(...preview.map(row=>row.months_completed)),11); assert.equal(preview.some(row=>new Date(row.due_date).toISOString().slice(0,10)==='2027-09-18'),false);
  await query(`select set_config('app.test_uid','${manager}',false)`); let denied=''; try { await query("select * from public.apply_monthly_leave_accruals('2026-12-18')"); } catch(error) { denied=String(error); } assert.match(denied,/owner execution required/);
  console.log('PGLITE_MONTHLY_LEAVE_PASS: 1~11회 후보, 첫 발생 경계, 개근 확인 전 지급 차단, 12회 자동 지급 없음');
} finally { await db.close(); }
