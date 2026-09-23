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
create table public.profiles(
  user_id uuid primary key,
  name text,
  hire_date date,
  role text,
  active boolean not null default true,
  approved boolean not null default true,
  employment_status text not null default '재직',
  employment_effective_date date
);
create or replace function public.my_role() returns text language sql stable security definer set search_path=public as $$ select coalesce((select role from public.profiles where user_id=auth.uid()),'') $$;
create table public.leave_ledger(id bigint generated always as identity primary key,user_id uuid not null,kind text not null,days numeric(3,1) not null,note text);
alter table public.leave_ledger enable row level security;
create policy leave_ledger_select_owner on public.leave_ledger for select to authenticated using (public.my_role()='owner');
create policy leave_ledger_insert_owner on public.leave_ledger for insert to authenticated with check (public.my_role()='owner');
grant usage on schema auth to authenticated;
grant execute on function auth.uid(),public.my_role() to authenticated;
grant select on public.profiles to authenticated;
grant select,insert on public.leave_ledger to authenticated;
grant usage,select on sequence public.leave_ledger_id_seq to authenticated;
`;
const owner='33333333-3333-3333-3333-333333333333';
const staff='11111111-1111-1111-1111-111111111111';
const manager='22222222-2222-2222-2222-222222222222';
const annualStaff='44444444-4444-4444-4444-444444444444';
const monthEndStaff='55555555-5555-5555-5555-555555555555';
const formerStaff='66666666-6666-6666-6666-666666666666';
const iso = value => new Date(value).toISOString().slice(0,10);
const confirmationJson = rows => JSON.stringify(rows.map(row => ({
  user_id: row.user_id,
  due_date: iso(row.due_date),
  full_attendance: true
})));
const sqlJson = value => `'${value.replaceAll("'", "''")}'::jsonb`;
try {
  await db.exec(prelude + draft);
  await query(`insert into public.profiles values
    ('${owner}','합성원장',null,'owner',true,true,'재직',null),
    ('${staff}','이채연','2026-09-18','staff',true,true,'재직',null),
    ('${manager}','합성관리자',null,'manager',true,true,'재직',null),
    ('${annualStaff}','365일직원','2025-09-24','staff',true,true,'재직',null),
    ('${monthEndStaff}','월말직원','2026-01-31','staff',true,true,'재직',null),
    ('${formerStaff}','중도퇴사직원','2026-01-15','staff',false,false,'자진퇴사','2026-03-10')`);
  await query('set role authenticated'); await query(`select set_config('app.test_uid','${staff}',false)`);
  let previewDenied=''; try { await query("select * from public.preview_monthly_leave_accruals('2026-10-18')"); } catch(error) { previewDenied=String(error); } assert.match(previewDenied,/owner execution required/);
  await query(`select set_config('app.test_uid','${manager}',false)`); previewDenied=''; try { await query("select * from public.preview_monthly_leave_accruals('2026-10-18')"); } catch(error) { previewDenied=String(error); } assert.match(previewDenied,/owner execution required/);
  await query(`select set_config('app.test_uid','${owner}',false)`);
  let preview = (await query("select * from public.preview_monthly_leave_accruals('2026-10-17')")).filter(row=>row.user_id===staff); assert.equal(preview.length,0);
  preview = (await query("select * from public.preview_monthly_leave_accruals('2026-10-18')")).filter(row=>row.user_id===staff);
  assert.equal(preview.length,1); assert.equal(preview[0].months_completed,1); assert.equal(iso(preview[0].due_date),'2026-10-18'); assert.equal(Number(preview[0].target_days),1); assert.equal(Number(preview[0].grant_days),1);
  preview = (await query("select * from public.preview_monthly_leave_accruals('2026-11-17')")).filter(row=>row.user_id===staff); assert.equal(preview.length,1);
  preview = (await query("select * from public.preview_monthly_leave_accruals('2026-11-18')")).filter(row=>row.user_id===staff);
  assert.equal(preview.length,2); assert.deepEqual(preview.map(row=>Number(row.target_days)),[1,2]); assert.deepEqual(preview.map(row=>Number(row.grant_days)),[1,1]);

  let monthEnd = (await query("select * from public.preview_monthly_leave_accruals('2026-02-27')")).filter(row=>row.user_id===monthEndStaff); assert.equal(monthEnd.length,0);
  monthEnd = (await query("select * from public.preview_monthly_leave_accruals('2026-02-28')")).filter(row=>row.user_id===monthEndStaff); assert.deepEqual(monthEnd.map(row=>iso(row.due_date)),['2026-02-28']);
  monthEnd = (await query("select * from public.preview_monthly_leave_accruals('2026-03-31')")).filter(row=>row.user_id===monthEndStaff); assert.deepEqual(monthEnd.map(row=>iso(row.due_date)),['2026-02-28','2026-03-31']);

  const former = (await query("select * from public.preview_monthly_leave_accruals('2026-04-15')")).filter(row=>row.user_id===formerStaff);
  assert.deepEqual(former.map(row=>iso(row.due_date)),['2026-02-15']);

  const annualPreview = (await query("select * from public.preview_monthly_leave_accruals('2026-09-24')")).filter(row=>row.user_id===annualStaff);
  assert.equal(annualPreview.length,12); assert.equal(annualPreview.at(-1).accrual_kind,'annual'); assert.equal(annualPreview.at(-1).months_completed,12); assert.equal(iso(annualPreview.at(-1).due_date),'2026-09-24'); assert.equal(Number(annualPreview.at(-1).target_days),15); assert.equal(Number(annualPreview.at(-1).grant_days),4);

  let blocked=''; try { await query("select * from public.apply_monthly_leave_accruals('2026-10-18')"); } catch(error) { blocked=String(error); } assert.match(blocked,/explicit apply confirmation required; preview only/);
  const firstConfirmation=confirmationJson(preview.filter(row=>row.months_completed===1));
  blocked=''; try { await query(`select * from public.apply_monthly_leave_accruals('2026-10-18',${sqlJson(firstConfirmation)},false)`); } catch(error) { blocked=String(error); } assert.match(blocked,/explicit apply confirmation required; preview only/);
  const falseConfirmation=JSON.stringify([{user_id:staff,due_date:'2026-10-18',full_attendance:false}]);
  blocked=''; try { await query(`select * from public.apply_monthly_leave_accruals('2026-10-18',${sqlJson(falseConfirmation)},true)`); } catch(error) { blocked=String(error); } assert.match(blocked,/full attendance confirmation required/);

  let applied = await query(`select * from public.apply_monthly_leave_accruals('2026-10-18',${sqlJson(firstConfirmation)},true)`);
  assert.deepEqual(applied.map(row=>({user_id:row.user_id,days:Number(row.granted_days),runs:row.created_runs})),[{user_id:staff,days:1,runs:1}]);
  assert.equal((await query(`select count(*)::int n from public.leave_ledger where user_id='${staff}'`))[0].n,1);
  applied = await query(`select * from public.apply_monthly_leave_accruals('2026-10-18',${sqlJson(firstConfirmation)},true)`); assert.equal(applied.length,0);

  await query(`insert into public.leave_ledger(user_id,kind,days,note) values('${staff}','부여',1,'기존 수기 월차')`);
  const secondPreview=(await query("select * from public.preview_monthly_leave_accruals('2026-11-18')")).filter(row=>row.user_id===staff&&row.months_completed===2);
  assert.equal(secondPreview.length,1); assert.equal(Number(secondPreview[0].existing_credit_days),2); assert.equal(Number(secondPreview[0].grant_days),0);
  applied=await query(`select * from public.apply_monthly_leave_accruals('2026-11-18',${sqlJson(confirmationJson(secondPreview))},true)`);
  assert.deepEqual(applied.map(row=>({days:Number(row.granted_days),runs:row.created_runs})),[{days:0,runs:1}]);
  assert.equal((await query(`select count(*)::int n from public.leave_ledger where user_id='${staff}'`))[0].n,2);

  applied=await query(`select * from public.apply_monthly_leave_accruals('2026-09-24',${sqlJson(confirmationJson(annualPreview))},true)`);
  assert.deepEqual(applied.map(row=>({user_id:row.user_id,days:Number(row.granted_days),runs:row.created_runs})),[{user_id:annualStaff,days:15,runs:12}]);
  assert.equal(Number((await query(`select coalesce(sum(days),0) total from public.leave_ledger where user_id='${annualStaff}' and kind in('부여','조정')`))[0].total),15);

  preview = (await query("select * from public.preview_monthly_leave_accruals('2027-09-18')")).filter(row=>row.user_id===staff);
  assert.equal(preview.length,12); assert.equal(preview.at(-1).accrual_kind,'annual'); assert.equal(Number(preview.at(-1).target_days),15);
  await query(`select set_config('app.test_uid','${manager}',false)`); let denied=''; try { await query("select * from public.apply_monthly_leave_accruals('2026-12-18')"); } catch(error) { denied=String(error); } assert.match(denied,/owner execution required/);
  console.log('PGLITE_MONTHLY_LEAVE_PASS: 월말·퇴사·365일·수기상계·명시 개근확인 적용');
} finally { await db.close(); }
