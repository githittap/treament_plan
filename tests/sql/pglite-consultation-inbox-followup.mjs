import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';import {pathToFileURL} from 'node:url';
const {PGlite}=await import(pathToFileURL(path.join(process.env.PGLITE_PACKAGE_ROOT,'dist/index.js')).href);
const db=new PGlite(),q=sql=>db.query(sql).then(r=>r.rows),owner='11111111-1111-1111-1111-111111111111',chief='22222222-2222-2222-2222-222222222222',staff='33333333-3333-3333-3333-333333333333',inbox='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const as=async id=>db.exec(`set role authenticated;select set_config('app.uid','${id}',false)`);
try{
  await db.exec(`create role anon;create role authenticated;create schema auth;create table auth.users(id uuid primary key);insert into auth.users values('${owner}'),('${chief}'),('${staff}');
  create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('app.uid',true),'')::uuid$$;
  create function public.my_role() returns text language sql stable as $$select case when auth.uid()='${owner}' then 'owner' when auth.uid()='${chief}' then 'chief' else 'staff' end$$;
  create function public.employee_hub_access_allowed() returns boolean language sql stable as $$select auth.uid() is not null$$;
  create function public.consultation_inbox_assignee_allowed(uuid) returns boolean language sql stable as $$select true$$;
  create table public.consultation_inbox(id uuid primary key,status text not null constraint consultation_inbox_status_check check(status in ('new','in_progress','closed','converted')),journal_id uuid,assigned_to uuid);
  insert into public.consultation_inbox values('${inbox}','new',null,null);
  alter table public.consultation_inbox enable row level security;create policy inbox_read on public.consultation_inbox for select to authenticated using(true);
  grant usage on schema auth to authenticated;grant execute on function auth.uid(),public.my_role(),public.employee_hub_access_allowed(),public.consultation_inbox_assignee_allowed(uuid) to authenticated;
  grant select,update on public.consultation_inbox to authenticated;`);
  await db.exec(fs.readFileSync('db/consultation_inbox_followup_draft.sql','utf8'));
  await as(chief);
  await q(`select public.consultation_inbox_record_view('${inbox}')`);
  await q(`select public.consultation_inbox_record_reply('${inbox}','실제 답변 내용')`);
  assert.equal((await q(`select count(*)::int n from public.consultation_inbox_views`))[0].n,0);
  assert.equal((await q(`select reply from public.consultation_inbox_replies`))[0].reply,'실제 답변 내용');
  await db.exec('reset role');assert.equal((await q(`select viewer_id from public.consultation_inbox_views`))[0].viewer_id,chief);
  await as(staff);await assert.rejects(q(`select public.consultation_inbox_record_reply('${inbox}','위조')`),/write access required/);await db.exec('rollback');
  await as(owner);assert.equal((await q(`select viewer_id from public.consultation_inbox_views`))[0].viewer_id,chief);
  await q(`update public.consultation_inbox set status='recall_3' where id='${inbox}'`);
  assert.equal((await q(`select status from public.consultation_inbox`))[0].status,'recall_3');
  console.log('PGLITE_CONSULTATION_INBOX_FOLLOWUP_PASS');
}finally{await db.close();}
