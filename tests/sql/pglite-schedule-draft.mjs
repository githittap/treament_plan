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
const query = sql => db.query(sql).then(result => result.rows);
const draft = fs.readFileSync(path.resolve('db/unified_schedule_transaction_draft.sql'), 'utf8');
const prelude = `
create role anon;
create role authenticated;
create schema auth;
create or replace function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('app.test_uid',true),'')::uuid $$;
create table public.profiles(user_id uuid primary key,name text,active boolean not null default true,approved boolean not null default true,role text);
create or replace function public.my_role() returns text language sql stable as $$ select coalesce((select role from public.profiles where user_id=auth.uid()),'') $$;
create table public.schedule_people(id uuid primary key,profile_user_id uuid,included_in_schedule boolean not null default true);
create table public.schedule_weeks(week_start date primary key,status text not null,confirmed_by uuid,confirmed_at timestamptz);
create table public.schedules(week_start date not null,person_id uuid not null,user_id uuid,day int not null,shift text not null,note text,primary key(week_start,person_id,day));
alter table public.schedule_people enable row level security;
alter table public.schedule_weeks enable row level security;
alter table public.schedules enable row level security;
grant select on public.profiles,public.schedule_people,public.schedule_weeks,public.schedules to authenticated;
grant insert,update,delete on public.schedule_weeks,public.schedules to authenticated;
create policy schedule_people_select on public.schedule_people for select to authenticated using (exists (select 1 from public.profiles p where p.user_id=auth.uid() and p.approved));
create policy schedule_weeks_select on public.schedule_weeks for select to authenticated using (exists (select 1 from public.profiles p where p.user_id=auth.uid() and p.approved));
create policy schedule_weeks_insert on public.schedule_weeks for insert to authenticated with check ((status='초안' and exists (select 1 from public.profiles p where p.user_id=auth.uid() and p.approved)) or public.my_role() in ('chief','owner'));
create policy schedule_weeks_update on public.schedule_weeks for update to authenticated using (public.my_role() in ('chief','owner') or status='초안') with check (public.my_role() in ('chief','owner') or status='초안');
create policy schedules_select on public.schedules for select to authenticated using (exists (select 1 from public.profiles p where p.user_id=auth.uid() and p.approved));
create policy schedules_insert on public.schedules for insert to authenticated with check (public.my_role() in ('chief','owner') or exists (select 1 from public.schedule_weeks sw where sw.week_start=schedules.week_start and sw.status='초안'));
create policy schedules_update on public.schedules for update to authenticated using (public.my_role() in ('chief','owner') or exists (select 1 from public.schedule_weeks sw where sw.week_start=schedules.week_start and sw.status='초안')) with check (public.my_role() in ('chief','owner') or exists (select 1 from public.schedule_weeks sw where sw.week_start=schedules.week_start and sw.status='초안'));
create policy schedules_delete on public.schedules for delete to authenticated using (public.my_role() in ('chief','owner') or exists (select 1 from public.schedule_weeks sw where sw.week_start=schedules.week_start and sw.status='초안'));
create or replace function public.reject_day_five() returns trigger language plpgsql as $$ begin if new.day=5 then raise exception 'synthetic second write failure'; end if; return new; end $$;
create trigger reject_day_five before insert or update on public.schedules for each row execute function public.reject_day_five();
grant usage on schema auth to authenticated;
grant execute on function auth.uid() to authenticated;
grant execute on function public.my_role() to authenticated;
`;

try {
  await db.exec(prelude + draft);
  const staff = '22222222-2222-2222-2222-222222222222';
  const owner = '33333333-3333-3333-3333-333333333333';
  const person = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  await query(`insert into public.profiles values ('${staff}','합성직원',true,true,'staff'),('${owner}','합성원장',true,true,'owner')`);
  await query(`insert into public.schedule_people values ('${person}','${staff}',true)`);
  await query("select set_config('app.test_uid', '22222222-2222-2222-2222-222222222222', false)");
  await query("set role authenticated");

  const draftRow = await query(`select * from public.set_schedule_cell('2026-09-21','${person}','${staff}',1,'work')`);
  assert.equal(draftRow[0].shift, 'work');
  assert.equal((await query("select status from public.schedule_weeks where week_start='2026-09-21'"))[0].status, '초안');

  await query(`select set_config('app.test_uid', '${owner}', false)`);
  await query("update public.schedule_weeks set status='공표' where week_start='2026-09-21'");
  await query(`select set_config('app.test_uid', '${staff}', false)`);
  let staffPublishedError = '';
  try { await query(`select * from public.set_schedule_cell('2026-09-21','${person}','${staff}',1,'off')`); } catch (error) { staffPublishedError = String(error); }
  assert.match(staffPublishedError, /published schedule is not editable|row-level security/);
  assert.equal((await query("select shift from public.schedules where week_start='2026-09-21' and person_id='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' and day=1"))[0].shift, 'work');

  await query(`select set_config('app.test_uid', '${owner}', false)`);
  const ownerRow = await query(`select * from public.set_schedule_cell('2026-09-21','${person}','${staff}',1,'off')`);
  assert.equal(ownerRow[0].shift, 'off');
  assert.equal((await query("select status from public.schedule_weeks where week_start='2026-09-21'"))[0].status, '초안');

  await query("update public.schedule_weeks set status='공표' where week_start='2026-09-21'");
  let invalidShiftError = '';
  try { await query(`select * from public.set_schedule_cell('2026-09-21','${person}','${staff}',1,'invalid')`); } catch (error) { invalidShiftError = String(error); }
  assert.match(invalidShiftError, /invalid schedule shift/);
  assert.equal((await query("select status from public.schedule_weeks where week_start='2026-09-21'"))[0].status, '공표');

  await query(`update public.schedule_weeks set confirmed_by='${owner}' where week_start='2026-09-21'`);
  let partialError = '';
  try { await query(`select * from public.set_schedule_cell('2026-09-21','${person}','${staff}',5,'work')`); } catch (error) { partialError = String(error); }
  assert.match(partialError, /synthetic second write failure/);
  const preserved = await query("select sw.status,sw.confirmed_by,s.shift from public.schedule_weeks sw join public.schedules s on s.week_start=sw.week_start and s.person_id='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' and s.day=1 where sw.week_start='2026-09-21'");
  assert.deepEqual(preserved[0], { status: '공표', confirmed_by: owner, shift: 'off' });

  let badKeyError = '';
  try { await query(`select * from public.set_schedule_cell('2026-09-21','${person}','00000000-0000-0000-0000-000000000000',1,'work')`); } catch (error) { badKeyError = String(error); }
  assert.match(badKeyError, /profile key mismatch/);
  let nonMondayError = '';
  try { await query(`select * from public.set_schedule_cell('2026-09-22','${person}','${staff}',1,'work')`); } catch (error) { nonMondayError = String(error); }
  assert.match(nonMondayError, /invalid schedule cell key/);
  const raceSafe = await query("select status from public.schedule_weeks where week_start='2026-09-21'");
  assert.equal(raceSafe[0].status, '공표');
  console.log('PGLITE_SCHEDULE_DRAFT_PASS: RLS, draft write, staff published rejection, owner unpublish, partial-write rollback, Monday guard, profile-key guard');
} finally {
  await db.close();
}


