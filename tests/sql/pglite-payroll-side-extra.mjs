import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {pathToFileURL} from 'node:url';
const {PGlite}=await import(pathToFileURL(path.join(process.env.PGLITE_PACKAGE_ROOT,'dist/index.js')).href);
const db=new PGlite(),q=sql=>db.query(sql).then(r=>r.rows);
const owner='11111111-1111-1111-1111-111111111111',staff='22222222-2222-2222-2222-222222222222';
try{
  await db.exec(`create role anon;create role authenticated;create schema auth;create table auth.users(id uuid primary key);insert into auth.users values('${owner}'),('${staff}');
  create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('app.uid',true),'')::uuid$$;
  create function public.my_role() returns text language sql stable as $$select coalesce(nullif(current_setting('app.role',true),''),case when auth.uid()='${owner}' then 'owner' else 'staff' end)$$;
  create function public.employee_hub_access_allowed() returns boolean language sql stable as $$select auth.uid() is not null$$;
  create table public.payroll_rows(id bigint generated always as identity primary key,month text,user_id uuid,items jsonb,net numeric,imported_at timestamptz,imported_by text,unique(month,user_id));
  create table public.payslips(month text,issued boolean);
  create schema storage;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
  create table storage.objects(bucket_id text,name text,metadata jsonb);alter table storage.objects enable row level security;
  create policy storage_other_permissive on storage.objects for select to authenticated using(true);
  insert into storage.objects values('payroll-originals','owner/original.xlsx','{"size":100}'::jsonb);
  grant usage on schema auth,storage to authenticated;grant select,insert,update on public.payroll_rows to authenticated;grant usage on sequence public.payroll_rows_id_seq to authenticated;grant select on storage.objects to authenticated;grant execute on function auth.uid(),public.my_role(),public.employee_hub_access_allowed() to authenticated;
  insert into public.payroll_rows(month,user_id,items,net,imported_by) values('2026-09','${staff}','{"net_pay":100}'::jsonb,100,'원장');`);
  await db.exec(fs.readFileSync('db/payroll_month_tools_draft.sql','utf8'));
  const migration=fs.readFileSync('db/payroll_side_extra_20261010.sql','utf8'), rollback=fs.readFileSync('db/payroll_side_extra_20261010_rollback.sql','utf8');
  await db.exec(migration);await db.exec(migration);await db.exec(rollback);
  for(const signature of ['text,jsonb','text,jsonb,boolean'])assert.equal((await q(`select to_regprocedure('public.payroll_extra_replace_month(${signature})') v`))[0].v,null);
  assert.equal((await q("select to_regprocedure('public.payroll_save_month(text,jsonb,jsonb,boolean)') v"))[0].v,null);
  await db.exec(migration);
  await q("update payroll_rows set side='{\"OT시간(시간)\":0.5,\"급여구성·기본급\":100}'");
  await q("insert into payroll_extra_rows(month,source_sheet,source_name,items,side) values('2026-09','급여대장','계정없음','{\"bonus\":500}','{\"비고\":\"보존\"}'),('2026-09','일용대장','가짜일용','{\"net_pay\":200}','{}')");
  await db.exec(`set role authenticated;select set_config('app.uid','${staff}',false)`);
  assert.equal((await q("select count(*)::int n from storage.objects where bucket_id='payroll-originals'"))[0].n,0);
  assert.equal((await q('select count(*)::int n from public.payroll_extra_rows'))[0].n,0);
  await assert.rejects(q("insert into public.payroll_extra_rows(month,source_sheet,source_name) values('2026-09','급여대장','forbidden')"),/row-level security/);
  await assert.rejects(q("select public.payroll_archive_month('2026-09')"),/owner required/);
  await db.exec('rollback');
  await db.exec(`set role authenticated;select set_config('app.uid','${owner}',false)`);
  assert.equal((await q("select count(*)::int n from storage.objects where bucket_id='payroll-originals'"))[0].n,1);
  assert.equal((await q("select public.payroll_move_month('2026-09','2026-10') n"))[0].n,3);
  assert.equal((await q("select month from public.payroll_rows"))[0].month,'2026-10');
  assert.equal((await q("select public.payroll_archive_month('2026-10') n"))[0].n,3);
  assert.equal((await q("select count(*)::int n from public.payroll_rows"))[0].n,0);
  assert.equal((await q("select count(*)::int n from public.payroll_row_archive"))[0].n,1);
  assert.equal((await q("select public.payroll_restore_month('2026-10') n"))[0].n,3);
  assert.equal((await q("select items->>'net_pay' n from public.payroll_rows"))[0].n,'100');
  await db.exec('reset role');
  // 보관 3회: 이전 묶음은 남기고 마지막 묶음만 복구한다.
  for(let cycle=1;cycle<=3;cycle++){
    await q(`insert into payroll_rows(month,user_id,items,net,imported_by) values('2026-11','${staff}','{"bonus":${cycle*1000}}',${cycle*1000},'가짜원장')`);
    await q(`insert into payroll_extra_rows(month,source_sheet,source_name,items) values('2026-11','급여대장','반복인원','{"bonus":${cycle*1000}}')`);
    await db.exec(`set role authenticated;select set_config('app.uid','${owner}',false)`);
    assert.equal((await q("select payroll_archive_month('2026-11') n"))[0].n,2);
    await db.exec('reset role');
  }
  await db.exec(`set role authenticated;select set_config('app.uid','${owner}',false)`);
  assert.equal((await q("select payroll_restore_month('2026-11') n"))[0].n,2);
  await assert.rejects(q("select payroll_restore_month('2026-11')"),/destination month/);
  await db.exec('reset role');
  assert.equal((await q("select items->>'bonus' v from payroll_rows where month='2026-11'"))[0].v,'3000');
  assert.equal((await q("select items->>'bonus' v from payroll_extra_rows where month='2026-11' and not archived"))[0].v,'3000');
  assert.equal((await q("select count(*)::int n from payroll_row_archive where month='2026-11'"))[0].n,2);
  assert.equal((await q("select count(*)::int n from payroll_extra_rows where month='2026-11' and archived"))[0].n,2);
  await q("insert into payroll_extra_rows(month,source_sheet,source_name) values('2026-12','급여대장','단독인원')");
  await db.exec(`set role authenticated;select set_config('app.uid','${owner}',false)`);
  assert.equal((await q("select payroll_archive_month('2026-12') n"))[0].n,1);
  assert.equal((await q("select payroll_restore_month('2026-12') n"))[0].n,1);
  await db.exec('reset role');
  // 다시 올림은 그 달 살아 있는 3종 줄만 교체하고 보관분은 유지한다.
  const replaceRows=[{source_sheet:'급여대장',source_name:'새인원',items:{bonus:4000},side:{비고:'새값'}},{source_sheet:'일용대장',source_name:'새일용',items:{net_pay:300}},{source_sheet:'사업소득대장',source_name:'새사업',items:{net_pay:500}}];
  const replace=(month,rows)=>q(`select payroll_extra_replace_month('${month}','${JSON.stringify(rows)}'::jsonb) n`);
  await db.exec(`set role authenticated;select set_config('app.uid','${owner}',false)`);
  assert.equal((await replace('2026-11',replaceRows))[0].n,3);
  assert.equal((await q("select count(*)::int n from payroll_extra_rows where month='2026-11' and source_name='반복인원' and not archived"))[0].n,0);
  assert.equal((await q("select count(*)::int n from payroll_extra_rows where month='2026-11' and archived"))[0].n,2);
  await assert.rejects(replace('2026-11',[replaceRows[0],replaceRows[0]]),/duplicate key/);
  assert.equal((await q("select count(*)::int n from payroll_extra_rows where month='2026-11' and not archived"))[0].n,3);
  await assert.rejects(replace('2026-11',[{source_sheet:'금지시트',source_name:'거절'}]),/check constraint/);
  assert.equal((await q("select count(*)::int n from payroll_extra_rows where month='2026-11' and not archived"))[0].n,3);
  assert.equal((await replace('2026-11',[]))[0].n,0);
  assert.equal((await q("select count(*)::int n from payroll_extra_rows where month='2026-11' and not archived"))[0].n,0);
  assert.equal((await q("select count(*)::int n from payroll_extra_rows where month='2026-11' and archived"))[0].n,2);
  // 실제 hr.html 저장 함수 → 실제 RPC: 엑셀/수기 4단계와 동일 키 갱신.
  const hr=fs.readFileSync('hr.html','utf8'),rpcModes=[],screen={
    ME:{id:owner,name:'가짜원장',role:'owner'},PAY_MONTH:'2027-01',PAY_ROWS:[],PAY_EXTRA_PREVIEW:[],PAY_SOURCE_FILE:null,SETTINGS:{},PROFILES:[{user_id:staff}],
    payrollActiveProfiles:p=>p,hubT:(k,d)=>d,setStatus:()=>{},render:()=>{},uploadPayrollOriginal:async()=>{},
    sb:{from:table=>({upsert:async rows=>{
      if(table==='payroll_rows')for(const r of rows)await db.query('insert into payroll_rows(month,user_id,items,side,net,imported_by) values($1,$2,$3,$4,$5,$6) on conflict(month,user_id) do update set items=excluded.items,side=excluded.side,net=excluded.net',[r.month,r.user_id,JSON.stringify(r.items),JSON.stringify(r.side),r.net,r.imported_by]);
      else assert.equal(table,'app_settings');return {};
    }}),rpc:async(name,args)=>{
      assert.equal(name,'payroll_save_month');rpcModes.push(args.p_replace);
      const result=await db.query('select payroll_save_month($1,$2::jsonb,$3::jsonb,$4) n',[args.p_month,JSON.stringify(args.p_rows),JSON.stringify(args.p_extra_rows),args.p_replace]);return {data:result.rows[0].n};
    }}
  };
  vm.createContext(screen);vm.runInContext(hr.slice(hr.indexOf('async function savePayrollRows()'),hr.indexOf('async function uploadPayrollOriginal(')),screen);
  const liveScreen=()=>q("select id,source_sheet,source_name,items,side,imported_at,imported_by from payroll_extra_rows where month='2027-01' and not archived order by source_sheet,source_name");
  screen.PAY_SOURCE_FILE={name:'가짜1.xlsx'};screen.PAY_ROWS=[{name:'계정없음',items:{bonus:100}}];screen.PAY_EXTRA_PREVIEW=replaceRows.slice(1);
  await screen.savePayrollRows();assert.equal((await liveScreen()).length,3);
  const screenOriginal=await liveScreen();
  screen.PAY_EXTRA_PREVIEW=[];screen.PAY_ROWS=[{name:'연결수기',user_id:staff,items:{bonus:200},manual:true}];
  await screen.savePayrollRows();assert.deepEqual(await liveScreen(),screenOriginal);
  screen.PAY_ROWS=[{name:'가짜수기',items:{bonus:300},manual:true}];await screen.savePayrollRows();assert.equal((await liveScreen()).length,4);
  const manualId=(await liveScreen()).find(r=>r.source_name==='가짜수기').id;
  screen.PAY_ROWS[0].items.bonus=400;await screen.savePayrollRows();assert.equal((await liveScreen()).length,4);
  assert.equal((await liveScreen()).find(r=>r.source_name==='가짜수기').id,manualId);assert.equal((await liveScreen()).find(r=>r.source_name==='가짜수기').items.bonus,400);
  screen.PAY_SOURCE_FILE={name:'가짜2.xlsx'};screen.PAY_ROWS=[{name:'새인원',items:{bonus:500}}];screen.PAY_EXTRA_PREVIEW=replaceRows.slice(1);
  await screen.savePayrollRows();assert.equal((await liveScreen()).length,3);assert.ok(!(await liveScreen()).some(r=>['계정없음','가짜수기'].includes(r.source_name)));
  assert.deepEqual(rpcModes,[true,false,false,false,true]);
  // 수기 직원 저장은 입력한 항목만 합치고 보조 칸은 보존, 0은 실제 갱신한다.
  await db.query("insert into payroll_rows(month,user_id,items,side,net) values('2027-02',$1,'{\"base_pay\":100,\"bonus\":50,\"net_pay\":150}','{\"비고\":\"보존\"}',150)",[staff]);
  const saveStaff=rows=>db.query('select payroll_save_month($1,$2::jsonb) n',['2027-02',JSON.stringify(rows)]);
  await saveStaff([{user_id:staff,manual:true,items:{net_pay:200},side:{}}]);
  let manual=(await q("select items,side,net from payroll_rows where month='2027-02'"))[0];
  assert.deepEqual(manual.items,{base_pay:100,bonus:50,net_pay:200});assert.deepEqual(manual.side,{비고:'보존'});assert.equal(Number(manual.net),200);
  await saveStaff([{user_id:staff,manual:true,items:{bonus:0,base_pay:null,net_pay:''}}]);
  manual=(await q("select items,side,net from payroll_rows where month='2027-02'"))[0];assert.equal(manual.items.bonus,0);assert.equal(manual.items.base_pay,100);assert.equal(Number(manual.net),200);
  await saveStaff([{user_id:staff,manual:false,items:{net_pay:500},side:{}}]);
  manual=(await q("select items,side,net from payroll_rows where month='2027-02'"))[0];assert.deepEqual(manual.items,{net_pay:500});assert.deepEqual(manual.side,{});
  // 실제 화면 저장: 별도 시트 실패 시 직원 변경까지 취소해야 한다.
  const employeeBefore=await q("select items,side,net from payroll_rows where month='2027-01'");
  screen.PAY_ROWS=[{user_id:staff,name:'가짜직원',items:{net_pay:999},manual:true}];screen.PAY_SOURCE_FILE={name:'잘못된.xlsx'};
  screen.PAY_EXTRA_PREVIEW=[{source_sheet:'금지시트',source_name:'거절'}];
  const extrasBefore=await liveScreen();await screen.savePayrollRows();
  assert.deepEqual(await q("select items,side,net from payroll_rows where month='2027-01'"),employeeBefore);
  assert.deepEqual(await liveScreen(),extrasBefore);
  // 저장 후 연결 기억을 기다리는 사이 월 이동이 행·원본 월을 갈라놓는 반례.
  vm.runInContext(hr.slice(hr.indexOf('async function movePayrollMonth()'),hr.indexOf('/* ── 명세서')),screen);
  screen.PAY_MONTH='2027-03';screen.PAY_ROWS=[{user_id:staff,name:'가짜직원',items:{net_pay:100}}];screen.PAY_EXTRA_PREVIEW=[];screen.PAY_SOURCE_FILE={name:'3월.xlsx'};screen.confirm=()=>true;screen.$=()=>({value:'2027-04'});
  const realSave=screen.sb.rpc,mutationCalls=[],originals=[];let releaseMap;
  screen.sb.rpc=async(name,args)=>{if(name==='payroll_save_month')return realSave(name,args);mutationCalls.push(name);const r=await db.query('select payroll_move_month($1,$2) n',[args.p_from,args.p_to]);return {data:r.rows[0].n};};
  screen.sb.from=()=>({upsert:()=>new Promise(r=>releaseMap=r)});screen.uploadPayrollOriginal=async(f,month)=>originals.push({file:f.name,month});
  let saveFinished=false;const pendingSave=screen.savePayrollRows().finally(()=>saveFinished=true);while(!releaseMap){await new Promise(r=>setImmediate(r));assert.equal(saveFinished,false,'저장이 연결 기억 단계에 도달하기 전에 종료됨');}
  await screen.movePayrollMonth();releaseMap({});await pendingSave;
  assert.equal(mutationCalls.length,0);assert.deepEqual(originals,[{file:'3월.xlsx',month:'2027-03'}]);
  assert.equal((await q("select month from payroll_rows where month in ('2027-03','2027-04')"))[0].month,'2027-03');
  const merge=(rows)=>db.query('select payroll_extra_replace_month($1,$2::jsonb,false) n',['2026-11',JSON.stringify(rows)]);
  const archivedBefore=await q("select * from payroll_extra_rows where month='2026-11' and archived order by id");
  await merge(replaceRows);await merge([{...replaceRows[0],items:{bonus:7000},side:{비고:'갱신'}}]);
  assert.equal((await q("select count(*)::int n from payroll_extra_rows where month='2026-11' and not archived"))[0].n,3);
  assert.equal((await q("select items->>'bonus' v from payroll_extra_rows where month='2026-11' and not archived and source_name='새인원'"))[0].v,'7000');
  const liveBefore=await q("select * from payroll_extra_rows where month='2026-11' and not archived order by id");
  await merge([]);assert.deepEqual(await q("select * from payroll_extra_rows where month='2026-11' and not archived order by id"),liveBefore);
  await assert.rejects(merge([replaceRows[0],{source_sheet:'금지시트',source_name:'거절'}]),/check constraint/);
  assert.deepEqual(await q("select * from payroll_extra_rows where month='2026-11' and not archived order by id"),liveBefore);
  assert.deepEqual(await q("select * from payroll_extra_rows where month='2026-11' and archived order by id"),archivedBefore);
  for(const role of ['staff','chief','manager','deputy']){
    await q(`select set_config('app.role','${role}',false)`);
    await assert.rejects(replace('2026-10',replaceRows),/owner required/);
    await assert.rejects(merge(replaceRows),/owner required/);
    await assert.rejects(db.query('select payroll_save_month($1,$2::jsonb,$3::jsonb,$4)',['2027-01','[]','[]',true]),/owner required/);
  }
  await q("select set_config('app.role','',false)");
  await q("select set_config('app.uid','',false)");
  await assert.rejects(replace('2026-10',replaceRows),/owner required/);
  await assert.rejects(merge(replaceRows),/owner required/);
  await q(`select set_config('app.uid','${owner}',false)`);
  await assert.rejects(replace('not-month',[]),/invalid month/);
  await assert.rejects(q("select payroll_extra_replace_month(null,'[]'::jsonb)"),/invalid month/);
  await assert.rejects(q("select payroll_extra_replace_month('2026-10','{}'::jsonb)"),/array required/);
  await assert.rejects(q("select payroll_extra_replace_month('2026-10','[]'::jsonb,null)"),/replace mode required/);
  assert.equal((await q("select count(*)::int n from payroll_extra_rows where month='2026-10' and not archived"))[0].n,2);
  await db.exec('reset role');
  await q("insert into public.payslips values('2026-10',true)");
  await db.exec(`set role authenticated;select set_config('app.uid','${owner}',false)`);
  await assert.rejects(q("select public.payroll_archive_month('2026-10')"),/payslip already exists/);
  await db.exec('reset role');
  assert.equal((await q("select side->>'OT시간(시간)' v from payroll_rows"))[0].v,'0.5');
  assert.equal((await q("select count(*)::int n from payroll_extra_rows where month='2026-10' and not archived"))[0].n,2);
  await assert.rejects(db.exec(rollback),/rollback stopped/);await db.exec('rollback');
  assert.equal((await q("select count(*)::int n from payroll_extra_rows where month='2026-10'"))[0].n,2);
  console.log('PGLITE_PAYROLL_SIDE_EXTRA_PASS: idempotence + both RPC signatures rollback/reapply + owner/staff + 3 archive batches/latest restore/counts + atomic replace 3 sheets/empty/errors/owner roles + actual hr save 4 stages 3/3/4/3 + append/update/empty/error atomicity/archive preservation + side/extra archive/restore + populated rollback refusal');
}finally{await db.close();}
