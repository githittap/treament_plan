import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
const root=process.env.PGLITE_PACKAGE_ROOT;
if(!root)throw new Error('PGLITE_PACKAGE_ROOT required');
const {PGlite}=await import(pathToFileURL(path.join(root,'dist/index.js')).href);
const migration=fs.readFileSync('db/suggestion_asks_20261006.sql','utf8'),rollback=fs.readFileSync('db/suggestion_asks_20261006_rollback.sql','utf8');
const uid=n=>`00000000-0000-0000-0000-00000000000${n}`;
async function setup(){
 const db=new PGlite();
 await db.exec(`create role anon; create role authenticated; create schema auth;
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('test.uid',true),'')::uuid$$;
 create table profiles(user_id uuid primary key,name text,role text,active boolean default true,approved boolean default true);
 create function my_role() returns text language sql security definer as $$select role from profiles where user_id=auth.uid()$$;
 create function employee_hub_access_allowed() returns boolean language sql security definer as $$select coalesce((select active and approved from profiles where user_id=auth.uid()),false)$$;
 create table leave_requests(id bigint primary key,user_id uuid,type text,type_note text,date_from date,date_to date,days numeric,status text,cancelled_by text,cancelled_at timestamptz);
 create table leave_ledger(id bigint generated always as identity,user_id uuid,kind text,days numeric,ref bigint,note text);
 create table push_events(event_key text unique,recipient_id uuid,event_type text,payload jsonb);
 create function p7_notify_recipients(text,uuid[],uuid) returns table(user_id uuid) language sql as $$select unnest($2)$$;
 create function enqueue_push_event(text,uuid,text,jsonb) returns void language sql as $$insert into push_events values($1,$2,$3,$4) on conflict do nothing$$;
 grant usage on schema public,auth to authenticated; grant execute on function auth.uid(),my_role(),employee_hub_access_allowed() to authenticated;
 insert into profiles values('${uid(1)}','직원','staff',true,true),('${uid(2)}','다른 직원','staff',true,true),('${uid(3)}','실장','chief',true,true),('${uid(4)}','원장','owner',true,true),('${uid(5)}','대기','staff',true,false);
 insert into leave_requests(id,user_id,type,date_from,date_to,days,status) values
 (1,'${uid(1)}','연차',current_date+10,current_date+10,1,'승인'),(2,'${uid(1)}','연차',current_date+11,current_date+11,1,'승인'),(3,'${uid(1)}','연차',current_date-10,current_date-10,1,'승인'),(4,'${uid(1)}','연차',current_date+12,current_date+12,1,'승인');
 insert into leave_ledger(user_id,kind,days,ref) values('${uid(1)}','부여',10,null),('${uid(1)}','사용',1,1),('${uid(1)}','사용',1,2),('${uid(1)}','사용',1,3),('${uid(1)}','사용',1,4);
 `);
 return db;
}
async function as(db,n){await db.exec(`reset role; select set_config('test.uid','${uid(n)}',false); set role authenticated;`);}
async function fails(db,sql,regex){await assert.rejects(db.query(sql),regex);}
let checks=0;const db=await setup();
try{
 await db.exec(migration);await db.exec(migration);checks++;
 await as(db,2);await fails(db,"select request_leave_change(1,'cancel','사유')",/own future/);checks++;
 await as(db,5);await fails(db,"select request_leave_change(1,'cancel','사유')",/approved/);checks++;
 await as(db,1);
 await fails(db,"select request_leave_change(3,'cancel','사유')",/own future/);checks++;
 await fails(db,"select request_leave_change(1,'cancel',' ')",/reason required/);checks++;
 await fails(db,"select request_leave_change(1,'half','사유','13:00~09:00')",/invalid half/);checks++;
 const id=(await db.query("select request_leave_change(1,'half','오전 휴가','09:00~13:00') id")).rows[0].id;
 await fails(db,"select request_leave_change(1,'cancel','중복')",/unique/);checks++;
 assert.equal((await db.query('select count(*)::int n from leave_change_requests')).rows[0].n,1);checks++;
 await as(db,2);assert.equal((await db.query('select * from leave_change_requests')).rows.length,0);checks++;
 await as(db,4);await fails(db,`select * from process_leave_change(${id},'approve')`,/chief/);checks++;
 await as(db,3);await db.query(`select * from process_leave_change(${id},'approve')`);
 await db.exec('reset role');assert.equal(Number((await db.query('select days from leave_requests where id=1')).rows[0].days),0.5);checks++;
 assert.equal(Number((await db.query("select sum(case when kind='사용' then -days else days end) balance from leave_ledger")).rows[0].balance),6.5);checks++;
 await as(db,3);await fails(db,`select * from process_leave_change(${id},'approve')`,/pending/);checks++;
 await as(db,1);const cancel=(await db.query("select request_leave_change(2,'cancel','취소') id")).rows[0].id;
 await as(db,3);await db.query(`select * from process_leave_change(${cancel},'approve')`);
 await db.exec('reset role');assert.equal((await db.query('select status from leave_requests where id=2')).rows[0].status,'취소');checks++;
 await as(db,1);const reject=(await db.query("select request_leave_change(4,'cancel','반려시험') id")).rows[0].id;
 await as(db,4);await db.query(`select * from process_leave_change(${reject},'reject')`);
 await db.exec('reset role');assert.equal((await db.query('select status from leave_requests where id=4')).rows[0].status,'승인');checks++;
 assert.equal((await db.query("select count(*)::int n from push_events where event_type='leave_submitted'")).rows[0].n,6);checks++;
 assert.equal((await db.query("select count(*)::int n from push_events where event_type='leave_status_changed'")).rows[0].n,3);checks++;
 await assert.rejects(db.exec(rollback),/history exists/);await db.exec('rollback');checks++;
}finally{await db.close();}
const empty=await setup();try{await empty.exec(migration);await empty.exec(rollback);assert.equal((await empty.query("select to_regclass('public.leave_change_requests') t")).rows[0].t,null);checks++;}finally{await empty.close();}
console.log(`PGLITE_SUGGESTION_SIX_PASS ${checks} checks`);
