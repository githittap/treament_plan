import assert from 'node:assert/strict';
import reply from '../../payroll-reply.js';
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
if(!process.env.PGLITE_PACKAGE_ROOT)throw new Error('PGLITE_PACKAGE_ROOT required');
const {PGlite}=await import(pathToFileURL(path.join(process.env.PGLITE_PACKAGE_ROOT,'dist/index.js')).href);
const db=new PGlite(),q=s=>db.query(s).then(r=>r.rows);
const ids={owner:'11111111-1111-1111-1111-111111111111',staff:'22222222-2222-2222-2222-222222222222',chief:'33333333-3333-3333-3333-333333333333',other:'44444444-4444-4444-4444-444444444444',deputy:'55555555-5555-5555-5555-555555555555'};
let checks=0;
const eq=(a,b)=>{assert.deepEqual(a,b);checks++;};
const deny=async(s,re=/required|denied|invalid|missing|disabled/)=>{await assert.rejects(q(s),re);checks++;};
const as=async role=>{await db.exec('reset role');await q(`select set_config('app.uid','${ids[role]}',false)`);await db.exec('set role authenticated');};
const month=async(m='2026-10',uid=ids.staff)=>(await q(`select public.wage_hourly_month('${m}','${uid}') result`))[0].result;
try{
  await db.exec(`create role anon;create role authenticated;create schema auth;create table auth.users(id uuid primary key);
  create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('app.uid',true),'')::uuid$$;
  create table public.profiles(user_id uuid primary key,name text,role text,active boolean default true,approved boolean default true);
  create function public.my_role() returns text language sql stable as $$select role from public.profiles where user_id=auth.uid()$$;
  create function public.employee_hub_access_allowed() returns boolean language sql stable security definer set search_path='' as $$select exists(select 1 from public.profiles where user_id=auth.uid() and active and approved)$$;
  create table public.app_settings(key text primary key,value text not null);
  create table public.attendance(user_id uuid,work_date date,clock_in time,clock_out time,source text,late_min int default 0,early_min int default 0,overtime_min int default 0,memo text,primary key(user_id,work_date));
  create table public.attendance_issues(id bigint generated always as identity primary key,user_id uuid,work_date date,type text,reason text,rule_label text,status text default '대기',chief_by text,chief_at timestamptz,owner_by text,owner_at timestamptz,created_at timestamptz default now());
  create table public.payroll_rows(month text,user_id uuid,items jsonb,net numeric);create table public.payslips(id bigint,month text,user_id uuid,html text,issued boolean);
  grant usage on schema auth to authenticated;grant select on profiles to authenticated;
  insert into public.profiles values ${Object.entries(ids).map(([role,id])=>`('${id}','${'합성'+role}','${role==='other'?'staff':role}',true,true)`).join(',')};
  insert into auth.users select user_id from public.profiles;
  insert into public.payroll_rows values('2026-10','${ids.other}','{"base_pay":3200000,"net_pay":2900000}',2900000);
  insert into public.payslips values(1,'2026-10','${ids.other}','기존 명세서',true);`);
  await db.exec(fs.readFileSync('db/payroll.sql','utf8'));
  await db.exec(fs.readFileSync('db/attendance_issue_resolution_release.sql','utf8'));
  await db.exec(fs.readFileSync('db/wage_hourly_20261004.sql','utf8'));
  await db.exec(fs.readFileSync('db/wage_hourly_20261004.sql','utf8'));
  const uid=ids.other;
  await as('owner');const originalConfig=(await q('select wage_hourly_config() v'))[0].v.settings;
  const overnight={date:'2026-10-09',clockIn:'23:00',clockOut:'08:00'},boundary={date:'2026-09-30',clockIn:'23:00',clockOut:'02:00'};
  const cases=[
   {month:'2026-10',days:[overnight],expected:[1,0,8,0]},
   {month:'2026-09',days:[boundary],expected:[1,0,0,0]},
   {month:'2026-10',days:[boundary],expected:[2,0,0,0]},
   {month:'2026-10',days:[overnight],flip:false,expected:[1,0,0,0]},
   {month:'2026-10',days:[overnight],initial:false,flip:true,expected:[0,0,8,0]},
   {month:'2026-10',days:[overnight,{date:'2026-10-10',clockIn:'18:00',clockOut:'20:00'}],special:true,expected:[9,2,0,0]}
  ];
  for(const item of cases){
   await db.exec('reset role');await q(`delete from attendance where user_id='${uid}'`);await q(`delete from wage_info where user_id='${uid}'`);
   await as('owner');const categories=item.special?[...originalConfig.categories,{code:'special',label:'합성 공휴일',days:[],dates:['2026-10-10'],reply_column:'weekday'}]:originalConfig.categories;
   await db.query('select wage_hourly_save_config($1::jsonb)',[JSON.stringify({...originalConfig,categories})]);
   const rates=JSON.stringify({weekday:10000,weekend:15000,...(item.special?{special:18000}:{})});
   await db.query('select wage_hourly_save_employee($1,$2,$3,$4::jsonb,false)',[uid,'2026-01-01',item.initial!==false,rates]);
   if(item.flip!=null)await db.query('select wage_hourly_save_employee($1,$2,$3,$4::jsonb,false)',[uid,'2026-10-10',item.flip,rates]);
   await db.exec('reset role');for(const d of item.days)await db.query("insert into attendance(user_id,work_date,clock_in,clock_out,source) values($1,$2,$3,$4,'fp')",[uid,d.date,d.clockIn,d.clockOut]);
   await as('owner');const rpc=await month(item.month,uid);await db.exec('reset role');const wages=await q(`select user_id,effective_from::text,hourly_enabled from wage_info where user_id='${uid}'`);
   const model={month:item.month,employees:[{userId:uid,name:'합성퇴사자',days:item.days.filter(d=>d.date.startsWith(item.month)),carryDays:item.days.filter(d=>!d.date.startsWith(item.month))}]},settings={categories};
   const fromRpc=reply.payrollReplyModel(model,wages,[],[],settings,rpc).hourly[0];
   // 퇴사 처리로 실제 RPC가 대상을 빼면 월근태 대체 경로가 같은 구간·칸을 만들어야 한다.
   await db.exec('reset role');await q(`update profiles set active=false where user_id='${uid}'`);await as('owner');eq((await month(item.month,uid)).users.length,0);
   const fallback=reply.payrollReplyModel(model,wages,[],[],settings).hourly[0];eq(fallback,fromRpc);
   eq(['weekdayWork','weekdayOver','weekendWork','weekendOver'].map(k=>fallback[k]),item.expected);
   const segments=reply.payrollReplyHourlySegments(item.days,wages,uid,item.month,categories);
   eq(segments.map(d=>[d.date,d.category,d.minutes]),rpc.users[0].days.map(d=>[d.date,d.category,d.minutes]));
   await db.exec('reset role');await q(`update profiles set active=true where user_id='${uid}'`);
  }
  // 실제 회신 조회와 정정 RPC를 연결한다. 합성 자료만 사용한다.
  await db.exec('reset role');
  await db.exec("alter table attendance add column evening boolean default false;alter table attendance add column is_holiday boolean default false;alter table attendance_manual_entries add column if not exists evening_overtime_min int default 0;create table att_months(month text primary key,status text);create table bonus_entries(month text,user_id uuid);create table holidays(date date,name text);grant select on attendance,att_months,wage_info,bonus_entries,holidays to authenticated;");
  await q(`update profiles set active=true where user_id='${uid}'`);
  await q(`delete from attendance where user_id='${uid}'`);await q(`delete from wage_info where user_id='${uid}'`);
  await as('owner');await db.query('select wage_hourly_save_config($1::jsonb)',[JSON.stringify(originalConfig)]);
  await db.query('select wage_hourly_save_employee($1,$2,true,$3::jsonb,false)',[uid,'2026-01-01',JSON.stringify({weekday:10000,weekend:15000})]);
  await db.exec('reset role');await db.query("insert into attendance(user_id,work_date,clock_in,clock_out,source) values($1,'2026-10-09','23:00','08:00','fp')",[uid]);await as('owner');
  const html=fs.readFileSync('hr.html','utf8'),section=tag=>html.match(new RegExp('/\\* '+tag+':start \\*/[\\s\\S]*?/\\* '+tag+':end \\*/'))[0];
  const functionLine=name=>html.slice(html.indexOf(name),html.indexOf('\n',html.indexOf(name)));
  const sb={from(table){let fields='*';const clauses=[],values=[],orders=[];
   const query={select(f){fields=f;return query;},gte(k,v){values.push(v);clauses.push(`${k} >= $${values.length}`);return query;},lt(k,v){values.push(v);clauses.push(`${k} < $${values.length}`);return query;},eq(k,v){values.push(v);clauses.push(`${k} = $${values.length}`);return query;},order(k,{ascending=true}={}){orders.push(k+(ascending?' asc':' desc'));return query;},
    async range(a,b){return execute(` limit ${b-a+1} offset ${a}`);},async maybeSingle(){const r=await execute(' limit 1');return {...r,data:r.data?.[0]||null};},then(resolve,reject){return execute('').then(resolve,reject);}};
   async function execute(tail){const selected=fields.split(',').map(f=>['work_date','effective_from','date'].includes(f)?`${f}::text as ${f}`:f).join(',');try{return {data:(await db.query(`select ${selected} from ${table}${clauses.length?' where '+clauses.join(' and '):''}${orders.length?' order by '+orders.join(','):''}${tail}`,values)).rows.map(r=>Object.fromEntries(Object.entries(r).map(([k,v])=>[k,v instanceof Date?v.toISOString().slice(0,['work_date','effective_from','date'].includes(k)?10:24):v])))};}catch(error){return {error};}}
   return query;},async rpc(name,args={}){try{return {data:(await db.query(name==='wage_hourly_month'?'select wage_hourly_month($1,$2) v':'select wage_hourly_config() v',name==='wage_hourly_month'?[args.p_month,args.p_user_id]:[])).rows[0].v};}catch(error){return {error};}}};
  const screen={sb,ME:{role:'owner'},PROFILES:await q('select * from profiles'),bonusOwner:()=>true,hubN:(k,d)=>d,hubT:(k,d)=>d};vm.createContext(screen);
  vm.runInContext(html.slice(html.indexOf('function applyAttendanceResolutions('),html.indexOf('let MANUAL_DETAIL_OPEN'))+functionLine('function attendanceMonthBounds(')+functionLine('async function fetchAttendancePages(')+html.match(/\/\* payroll-payslip:test-start \*[\s\S]*?\/\* payroll-payslip:test-end \*\//)[0]+section('attendance-monthly-summary')+fs.readFileSync('payroll-reply.js','utf8'),screen);
  await db.query("select wage_hourly_correct($1,'2026-10-09','23:00','07:00','합성 정정')",[uid]);
  const activeReply=await screen.payrollFetchReply('2026-10'),activeRow=activeReply.hourly.find(r=>r.userId===uid);
  eq([activeRow.weekdayWork,activeRow.weekendWork],[1,7]);
  await db.exec('reset role');await q(`update profiles set active=false where user_id='${uid}'`);await as('owner');screen.PROFILES=await q('select * from profiles');
  eq((await month('2026-10',uid)).users.length,0);
  const retiredReply=await screen.payrollFetchReply('2026-10'),retiredRow=retiredReply.hourly.find(r=>r.userId===uid);
  eq([retiredRow.weekdayWork,retiredRow.weekendWork],[1,7]);
  eq(retiredRow,activeRow);
  eq((await screen.fetchAttMonthlyData('2026-10')).employees.find(r=>r.userId===uid).days[0].clockOut,'08:00:00');
  console.log(`PGLITE_REPLY_HOURLY_BOUNDARIES_PASS checks=${checks}: actual RPC/fallback segment dates, categories and minutes; midnight/month edges/wage changes/date precedence/daily grouping/inactive employee`);
}finally{await db.close();}
