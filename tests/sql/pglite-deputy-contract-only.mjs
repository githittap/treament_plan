import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';

const packageRoot=process.env.PGLITE_PACKAGE_ROOT;
if(!packageRoot){console.log('PGLITE_DEPUTY_SKIP: PGLITE_PACKAGE_ROOT is not set');process.exit(2);}
const {PGlite}=await import(pathToFileURL(path.join(packageRoot,'dist/index.js')).href);
const db=new PGlite(); const q=sql=>db.query(sql).then(r=>r.rows);
const deputy='11111111-1111-1111-1111-111111111111',chief='22222222-2222-2222-2222-222222222222';
const tables=['attendance','att_months','attendance_issues','schedule_weeks','schedules','leave_requests','leave_ledger','holidays','calendar_events','notices','notice_reads','approval_docs','approval_steps','payroll_rows','payslips','monthly_reviews','bonus_rules','ledger_files','employee_documents','fingerprint_registration_requests'];
const prelude=`create role anon; create role authenticated; create schema auth; create or replace function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('app.test_uid',true),'')::uuid$$; create table public.profiles(user_id uuid primary key,role text,active boolean default true,approved boolean default true); create table public.contracts(id int primary key,user_id uuid,status text default '대기',signed_at timestamptz); create or replace function public.my_role() returns text language sql stable as $$select role from public.profiles where user_id=auth.uid()$$; create or replace function public.employee_hub_access_allowed() returns boolean language sql stable as $$select true$$;`+tables.map(t=>`create table public.${t}(id int,user_id uuid);`).join('')+`insert into public.profiles values('${deputy}','deputy',true,true),('${chief}','chief',true,true); insert into public.contracts values(1,'${deputy}','대기',null),(2,'${chief}','대기',null); insert into public.attendance values(1,'${deputy}'); grant usage on schema public,auth to authenticated; grant select on all tables in schema public to authenticated;`;
const draft=fs.readFileSync(path.resolve('db/deputy_contract_only_draft.sql'),'utf8');
await db.exec(prelude+draft);
await db.exec(`set role authenticated; select set_config('app.test_uid','${deputy}',false)`);
assert.equal((await q(`select id from public.contracts order by id`)).length,1);
assert.equal((await q(`select id from public.attendance`)).length,0);
await db.exec(`select set_config('app.test_uid','${chief}',false)`);
assert.equal((await q(`select id from public.contracts order by id`)).length,2);
console.log('PGLITE_DEPUTY_PASS: deputy contract-only RLS and chief regression');
