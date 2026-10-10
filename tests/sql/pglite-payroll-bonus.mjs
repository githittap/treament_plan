import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';import path from 'node:path';import {pathToFileURL} from 'node:url';
const {PGlite}=await import(pathToFileURL(path.join(process.env.PGLITE_PACKAGE_ROOT,'dist/index.js')).href);
const db=new PGlite(),q=s=>db.query(s).then(r=>r.rows);
const ids={owner:'11111111-1111-1111-1111-111111111111',staff:'22222222-2222-2222-2222-222222222222',chief:'33333333-3333-3333-3333-333333333333',manager:'44444444-4444-4444-4444-444444444444',deputy:'55555555-5555-5555-5555-555555555555',blocked:'66666666-6666-6666-6666-666666666666'};
const sql=fs.readFileSync('db/bonus_monthly_20261010.sql','utf8'),rollback=fs.readFileSync('db/bonus_monthly_20261010_rollback.sql','utf8');let checks=0;
const as=async who=>{await db.exec('reset role');await q(`select set_config('app.uid','${ids[who]}',false)`);await db.exec('set role authenticated');};
try{
 await db.exec(`create role anon;create role authenticated;create schema auth;create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('app.uid',true),'')::uuid$$;
 create table public.profiles(user_id uuid primary key,role text,active boolean);
 create function public.my_role() returns text language sql stable security definer set search_path='' as $$select role from public.profiles where user_id=auth.uid()$$;
 create function public.employee_hub_access_allowed() returns boolean language sql stable security definer set search_path='' as $$select coalesce((select active from public.profiles where user_id=auth.uid()),false)$$;
 grant usage on schema auth to authenticated;
 insert into public.profiles values ${Object.entries(ids).map(([k,id])=>`('${id}','${k==='blocked'?'owner':k}',${k!=='blocked'})`).join(',')};`);
 await db.exec(sql);await db.exec(sql);await db.exec(rollback);checks++;
 // 기존 4차 상여 행이 있는 상태에서 새 칸을 추가해도 금액과 근거는 보존되고 미확정으로 시작한다.
 await db.exec(sql.slice(sql.indexOf('create table if not exists public.bonus_entries'),sql.indexOf('create table if not exists public.bonus_defaults')));
 await q("insert into bonus_entries(month,person_key,source_name,amount,memo) values('2025-01','name:legacy','legacy',17,'옛 자료')");
 await db.exec(sql);let legacy=(await q("select * from bonus_entries where source_name='legacy'"))[0];
 assert.equal(legacy.amount,'17');assert.equal(legacy.memo,'옛 자료');assert.equal(legacy.confirmed,false);checks++;
 await as('owner');
 const c=(await q("insert into bonus_criteria(name,kind,value,updated_by) values('가짜기준','amount',1000,'22222222-2222-2222-2222-222222222222') returning *"))[0];
 assert.equal(c.updated_by,ids.owner);checks++;
 await q(`insert into bonus_entries(month,person_key,user_id,source_name,amount,criteria_snapshot) values('2026-09','${ids.staff}','${ids.staff}','합성직원',1000,'[{"name":"옛 기준","value":1000}]')`);
 await q(`update bonus_entries set amount=2000,updated_by='${ids.staff}' where month='2026-09'`);
 const hist=await q("select * from bonus_history where table_name='bonus_entries' order by id");
 assert.equal(hist.length,2);assert.equal(hist[1].actor,ids.owner);assert.equal(hist[1].before_row.amount,1000);assert.equal(hist[1].after_row.amount,2000);checks++;
 await q(`insert into bonus_entries(month,person_key,user_id,source_name,amount) values('2026-10','${ids.staff}','${ids.staff}','합성직원',0)`);
 assert.equal((await q("select amount from bonus_entries where month='2026-09'"))[0].amount,'2000');checks++;
 await q(`update bonus_criteria set name='새 기준',value=9999 where id='${c.id}'`);
 assert.equal((await q("select criteria_snapshot->0->>'name' n from bonus_entries where month='2026-09'"))[0].n,'옛 기준');checks++;
 for(const op of ["insert into bonus_history(table_name,row_id) values('forged',gen_random_uuid())","update bonus_history set actor=null","delete from bonus_history"]){await assert.rejects(q(op),/permission denied/);checks++;}
 for(const role of ['staff','chief','manager','deputy','blocked']){await as(role);for(const t of ['bonus_entries','bonus_criteria','bonus_history']){assert.equal((await q(`select count(*)::int n from ${t}`))[0].n,0);checks++;}await assert.rejects(q("insert into bonus_criteria(name,kind) values('forbidden','amount')"),/row-level security/);checks++;assert.equal((await q("update bonus_entries set amount=9000 returning id")).length,0);checks++;}
 await db.exec('reset role;set role anon');await assert.rejects(q('select * from bonus_entries'),/permission denied/);checks++;
 await db.exec('reset role');await assert.rejects(db.exec(rollback),/rollback stopped/);await db.exec('rollback');checks++;
 assert.equal((await q('select count(*)::int n from bonus_entries'))[0].n,3);checks++;
 // 실제 화면의 복사 저장을 늦추고 다른 연결에서 먼저 999를 저장한 반례.
 await as('owner');
 await q(`insert into bonus_entries(month,person_key,user_id,source_name,amount,memo,selections,criteria_snapshot) values('2026-08','${ids.staff}','${ids.staff}','합성직원',100,'지난달','{"x":true}','[{"id":"x","value":100}]')`);
 await q(`update bonus_entries set amount=null,memo='',selections='{}' where month='2026-09'`);
 let release,copied=0;const message={},locks=[{disabled:false,dataset:{}}];
 const screen={ME:{role:'owner'},hubT:(k,d)=>d,confirm:()=>true,render:()=>{},$:()=>message,document:{querySelectorAll:()=>locks},sb:{from:()=>({select:()=>({eq:async()=>({data:await q("select * from bonus_entries where month='2026-08'")})}),upsert:rows=>new Promise(r=>release=async()=>{for(const row of rows)await q(`update bonus_entries set amount=${row.amount} where month='${row.month}' and person_key='${row.person_key}'`);r({});})}),rpc:(name,args)=>new Promise(r=>release=async()=>{copied=Number((await q(`select public.${name}('${args.p_month}') n`))[0].n);r({data:copied});})}};
 vm.createContext(screen);vm.runInContext(fs.readFileSync('payroll-bonus.js','utf8'),screen);vm.runInContext(`BONUS.month='2026-09';BONUS.people=[{person_key:'${ids.staff}',user_id:'${ids.staff}',source_name:'합성직원'}]`,screen);
 const copying=screen.bonusCopyPrevious();await new Promise(r=>setImmediate(r));
 await q(`update bonus_entries set amount=999 where month='2026-09' and person_key='${ids.staff}'`);
 await release();await copying;
 assert.equal((await q(`select amount from bonus_entries where month='2026-09' and person_key='${ids.staff}'`))[0].amount,'999');checks++;
 assert.equal((await q("select count(*)::int n from bonus_history where before_row->>'amount'='999' and after_row->>'amount'='100'"))[0].n,0);checks++;
 assert.equal(copied,0);checks++;
// DB 저장 순간 기준: 0원·메모·체크는 보존하고 빈 행·없는 행만 채움.
 for(const [name,amount,memo,selections] of [['zero',0,'','{}'],['memo',null,'기록','{}'],['choice',null,'','{"x":false}'],['blank',null,' \t\n','{}'],['new',null,'','{}']]){
  await db.query("insert into bonus_entries(month,person_key,source_name,amount,selections,criteria_snapshot) values('2026-08',$1,$2,100,'{\"x\":true}','[{\"id\":\"x\",\"value\":100}]')",['name:'+name,name]);
  if(name!=='new')await db.query("insert into bonus_entries(month,person_key,source_name,amount,memo,selections) values('2026-09',$1,$2,$3,$4,$5::jsonb)",['name:'+name,name,amount,memo,selections]);
 }
 assert.equal(Number((await q("select bonus_copy_previous('2026-09') n"))[0].n),2);checks++;
 const filled=await q("select * from bonus_entries where month='2026-09' and source_name in ('blank','new')");
 assert.equal(filled.length,2);assert.ok(filled.every(r=>r.amount==='100'&&r.criteria_snapshot.length===0&&r.selections.x===true));checks++;
 assert.equal(Number((await q("select bonus_copy_previous('2026-09') n"))[0].n),0);checks++;
 for(const role of ['staff','chief','manager','deputy','blocked']){await as(role);await assert.rejects(q("select bonus_copy_previous('2026-09')"),/owner only/);checks++;}
 await db.exec('reset role;set role anon');await assert.rejects(q("select bonus_copy_previous('2026-09')"),/permission denied/);checks++;
 await as('owner');await assert.rejects(q("select bonus_copy_previous('bad')"),/invalid month/);checks++;
 await as('owner');
 assert.equal((await q("select confirmed from bonus_entries where month='2026-09' and source_name='blank'"))[0].confirmed,false);checks++;
 assert.equal(Number((await q("select bonus_confirm('2026-09',array['name:blank']) n"))[0].n),1);checks++;
 let confirmed=(await q("select * from bonus_entries where month='2026-09' and source_name='blank'"))[0];
 assert.equal(confirmed.confirmed,true);assert.equal(confirmed.confirmed_by,ids.owner);assert.ok(confirmed.confirmed_at);checks++;
 await q("update bonus_entries set amount=101 where id='"+confirmed.id+"'");
 confirmed=(await q("select * from bonus_entries where id='"+confirmed.id+"'"))[0];
 assert.equal(confirmed.confirmed,false);assert.equal(confirmed.confirmed_at,null);assert.equal(confirmed.confirmed_by,null);checks++;
 await q("update bonus_entries set confirmed=true where id='"+confirmed.id+"'");
 assert.equal((await q("select confirmed from bonus_entries where id='"+confirmed.id+"'"))[0].confirmed,false);checks++;
 await q("insert into bonus_entries(month,person_key,source_name,amount,confirmed) values('2026-12','name:forged','forged',42,true) on conflict(month,person_key) do update set confirmed=true");
 assert.equal((await q("select confirmed from bonus_entries where source_name='forged'"))[0].confirmed,false);checks++;
 await q("select bonus_confirm('2026-09',array['name:blank'])");
 await q("update bonus_entries set memo='고친 메모' where id='"+confirmed.id+"'");
 assert.equal((await q("select confirmed from bonus_entries where id='"+confirmed.id+"'"))[0].confirmed,false);checks++;
 await q("select bonus_confirm('2026-09',array['name:blank'])");
 await q("update bonus_entries set selections='{\"c\":true}' where id='"+confirmed.id+"'");
 assert.equal((await q("select confirmed from bonus_entries where id='"+confirmed.id+"'"))[0].confirmed,false);checks++;
 await q("select bonus_confirm('2026-09',array['name:blank'])");
 await q("update bonus_entries set amount=amount,confirmed=false,confirmed_at=null where id='"+confirmed.id+"'");
 assert.equal((await q("select confirmed from bonus_entries where id='"+confirmed.id+"'"))[0].confirmed,true);checks++;
 for(const keys of ['null',"array[]::text[]"]){assert.ok(Number((await q("select bonus_confirm('2026-09',"+keys+") n"))[0].n)>=0);checks++;}
 for(const role of ['staff','chief','manager','deputy','blocked']){await as(role);await assert.rejects(q("select bonus_confirm('2026-09',null)"),/owner only/);checks++;}
 await as('owner');await assert.rejects(q("select bonus_confirm('bad',null)"),/invalid month/);checks++;
 await q("select set_config('app.bonus_confirming','on',false)");await q("update bonus_entries set confirmed=true,confirmed_by='"+ids.staff+"',confirmed_at=now() where source_name='legacy'");
 assert.equal((await q("select confirmed from bonus_entries where source_name='legacy'"))[0].confirmed,false);checks++;
 await q("select set_config('app.bonus_confirming','',false)");
 await as('owner');
 await q("insert into bonus_defaults(person_key,source_name,amount,memo) values('name:default','default',100,'기본 제안')");
 assert.equal(Number((await q("select bonus_apply_defaults('2027-01') n"))[0].n),1);checks++;
 assert.equal((await q("select amount,confirmed from bonus_entries where month='2027-01' and source_name='default'"))[0].amount,'100');
 assert.equal((await q("select confirmed from bonus_entries where month='2027-01' and source_name='default'"))[0].confirmed,false);checks++;
 await q("insert into bonus_entries(month,person_key,source_name,amount) values('2027-02','name:default','default',0)");
 assert.equal(Number((await q("select bonus_apply_defaults('2027-02') n"))[0].n),0);checks++;
 await q("update bonus_defaults set amount=200 where person_key='name:default'");
 assert.equal(Number((await q("select bonus_apply_defaults('2027-01') n"))[0].n),0);checks++;
 assert.equal((await q("select amount from bonus_entries where month='2027-01' and source_name='default'"))[0].amount,'100');checks++;
 await q("update bonus_defaults set active=false where person_key='name:default'");
 assert.equal(Number((await q("select bonus_apply_defaults('2027-03') n"))[0].n),0);checks++;
 await q("update bonus_defaults set amount=0,active=true where person_key='name:default'");
 assert.equal(Number((await q("select bonus_apply_defaults('2027-03') n"))[0].n),1);checks++;
 assert.equal((await q("select amount from bonus_entries where month='2027-03' and source_name='default'"))[0].amount,'0');checks++;
 await q("insert into bonus_entries(month,person_key,source_name,amount) values('2027-04','name:default','default',null)");
 await q("select bonus_confirm('2027-04',null)");
 assert.equal(Number((await q("select bonus_apply_defaults('2027-04') n"))[0].n),0);checks++;
 assert.ok((await q("select * from bonus_history where table_name='bonus_defaults'")).length>=4);checks++;
 for(const role of ['staff','chief','manager','deputy','blocked']){await as(role);assert.equal((await q('select * from bonus_defaults')).length,0);await assert.rejects(q("insert into bonus_defaults(person_key,source_name,amount) values('name:forbidden','forbidden',1)"),/row-level security/);await assert.rejects(q("select bonus_apply_defaults('2027-01')"),/owner only/);checks++;}
 await as('owner');await assert.rejects(q("select bonus_apply_defaults('bad')"),/invalid month/);checks++;
 await as('owner');
 const suggestions=[{month:'2027-05',person_key:'name:csv1',source_name:'csv1',amount:100,memo:'제안'},{month:'2027-05',person_key:'name:csv2',source_name:'csv2',amount:200,memo:''},{month:'2027-06',person_key:'name:csv3',source_name:'csv3',amount:0,memo:''}];
 await q("insert into bonus_entries(month,person_key,source_name,amount) values('2027-05','name:csv1','csv1',42)");await q("select bonus_confirm('2027-05',null)");
 let imported=(await db.query('select bonus_import_suggestions($1::jsonb) r',[JSON.stringify(suggestions)])).rows[0].r;
 assert.deepEqual(imported,{inserted:2,skipped:1});checks++;
 assert.equal((await q("select amount,confirmed from bonus_entries where source_name='csv1'"))[0].amount,'42');assert.equal((await q("select confirmed from bonus_entries where source_name='csv1'"))[0].confirmed,true);checks++;
 assert.ok((await q("select * from bonus_entries where source_name in ('csv2','csv3')")).every(r=>!r.confirmed));checks++;
 imported=(await db.query('select bonus_import_suggestions($1::jsonb) r',[JSON.stringify(suggestions)])).rows[0].r;assert.deepEqual(imported,{inserted:0,skipped:3});checks++;
 const duplicate={month:'2027-07',person_key:'name:duplicate',source_name:'duplicate',amount:8};
 imported=(await db.query('select bonus_import_suggestions($1::jsonb) r',[JSON.stringify([duplicate,duplicate])])).rows[0].r;assert.deepEqual(imported,{inserted:1,skipped:1});checks++;
 for(const rows of [[{...duplicate,month:'bad'}],[{...duplicate,amount:-1}],[{...duplicate,source_name:'mismatch'}]])await assert.rejects(db.query('select bonus_import_suggestions($1::jsonb)',[JSON.stringify(rows)]));checks++;
 await assert.rejects(q("select bonus_import_suggestions('{}')"),/invalid suggestions/);checks++;
 for(const role of ['staff','chief','manager','deputy','blocked']){await as(role);await assert.rejects(q("select bonus_import_suggestions('[]')"),/owner only/);checks++;}
 await db.exec('reset role;set role anon');
 for(const op of ['select * from bonus_defaults',"select bonus_confirm('2026-09',null)","select bonus_apply_defaults('2026-09')","select bonus_import_suggestions('[]')"]){await assert.rejects(q(op),/permission denied/);checks++;}
 // 새 표의 기본값만 있고 월별 상여가 없는 경우도 롤백이 자료를 지우지 않는다.
 const defaultsOnly=new PGlite();try{
  await defaultsOnly.exec(`create role anon;create role authenticated;create schema auth;create function auth.uid() returns uuid language sql as $$select '11111111-1111-1111-1111-111111111111'::uuid$$;create function public.my_role() returns text language sql as $$select 'owner'::text$$;create function public.employee_hub_access_allowed() returns boolean language sql as $$select true$$;`);
  await defaultsOnly.exec(sql);await defaultsOnly.exec("insert into bonus_defaults(person_key,source_name,amount) values('name:only-default','only-default',0)");
  await assert.rejects(defaultsOnly.exec(rollback),/rollback stopped/);await defaultsOnly.exec('rollback');
  assert.equal((await defaultsOnly.query("select amount from bonus_defaults where person_key='name:only-default'")).rows[0].amount,'0');checks++;
 }finally{await defaultsOnly.close();}
 // 다른 RPC의 security definer 문맥으로 확정 표지를 흉내 내는 두 반례.
 await as('owner');await q('update bonus_defaults set active=false');
 await q("insert into bonus_entries(month,person_key,source_name) values('2028-01','name:marker-copy','marker-copy'),('2028-02','name:marker-copy','marker-copy')");
 await q("select set_config('app.bonus_confirming','on',false)");
 await q("select bonus_copy_previous('2028-02')");
 const copyState=(await q("select confirmed from bonus_entries where month='2028-02' and source_name='marker-copy'"))[0].confirmed;
 const blankSuggestion={month:'2028-03',person_key:'name:marker-import',source_name:'marker-import',amount:null,memo:''};
 for(let i=0;i<2;i++){
  await q("select set_config('app.bonus_confirming','on',false)");
  await db.query('select bonus_import_suggestions($1::jsonb)',[JSON.stringify([blankSuggestion])]);
 }
 const importState=(await q("select confirmed from bonus_entries where source_name='marker-import'"))[0].confirmed;
 assert.deepEqual([copyState,importState],[false,false]);checks+=2;
 for(const [month,name] of [['2028-02','marker-copy'],['2028-03','marker-import']]){
  await q('update bonus_defaults set active=false');
  await db.query('insert into bonus_defaults(person_key,source_name,amount) values($1,$2,100)',['name:'+name,name]);
  await q("select set_config('app.bonus_confirming','on',false)");
  assert.equal(Number((await q(`select bonus_apply_defaults('${month}') n`))[0].n),1);checks++;
  let row=(await db.query('select * from bonus_entries where month=$1 and source_name=$2',[month,name])).rows[0];
  assert.equal(row.amount,'100');assert.equal(row.confirmed,false);assert.equal(row.confirmed_by,null);checks++;
  assert.equal(Number((await db.query('select bonus_confirm($1,$2::text[]) n',[month,['name:'+name]])).rows[0].n),1);checks++;
  row=(await db.query('select * from bonus_entries where id=$1',[row.id])).rows[0];assert.equal(row.confirmed,true);assert.equal(row.confirmed_by,ids.owner);assert.ok(row.confirmed_at);checks++;
  await db.query("update bonus_entries set memo='고친 합성 메모' where id=$1",[row.id]);
  row=(await db.query('select * from bonus_entries where id=$1',[row.id])).rows[0];assert.equal(row.confirmed,false);assert.equal(row.confirmed_by,null);assert.equal(row.confirmed_at,null);checks++;
 }
 console.log('PGLITE_PAYROLL_BONUS_PASS',checks);
}finally{await db.close();}
