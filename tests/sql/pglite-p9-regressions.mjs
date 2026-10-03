import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {createRequire} from 'node:module';
const {edgeSigningAttempt}=createRequire(import.meta.url)('../contract-pdf-sign-edge-helper.cjs');

const packageRoot=process.env.PGLITE_PACKAGE_ROOT;
if(!packageRoot){console.log('PGLITE_INTEGRATED_CONTRACT_SKIP: package path missing');process.exit(2);}
const {PGlite}=await import(pathToFileURL(path.join(packageRoot,'dist/index.js')).href);
let db;
const query=sql=>db.query(sql).then(result=>result.rows);
const uid='11111111-1111-1111-1111-111111111111';
const template='<div>사직 희망일로부터 3주 전, 퇴사일 이후 돌아오는 익월 임금지급일<div class="signrow"><span data-sign-slot="employee">(직원 서명)</span></div></div>';
const png=Buffer.concat([Buffer.from('89504e470d0a1a0a','hex'),Buffer.alloc(120)]).toString('base64');
const sign=part=>({part,signature_png:`data:image/png;base64,${png}`,signature_id:null,confirmed:true});
const all=JSON.stringify(['employment','medical','privacy'].map(sign));
const qjson=value=>`'${JSON.stringify(value).replaceAll("'","''")}'::jsonb`;
const draft=fs.readFileSync(path.resolve('db/integrated_contract_three_signatures_draft.sql'),'utf8');
const policies=fs.readFileSync(path.resolve('db/hr_policies.sql'),'utf8');
const pdfGuard=fs.readFileSync(path.resolve('db/contract_pdf_signing_production_snapshot.sql'),'utf8');
async function setup(seed=false){
  db=new PGlite();
  await db.exec(`
    create role anon;create role authenticated;create role service_role bypassrls;create schema auth;
    create or replace function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('app.test_uid',true),'')::uuid$$;
    create table public.profiles(user_id uuid primary key,role text);
    create or replace function public.my_role() returns text language sql stable as $$select role from public.profiles where user_id=auth.uid()$$;
    create table public.employee_signature_vault(id bigint primary key,user_id uuid,revoked_at timestamptz);
    create table public.employee_signature_uses(id bigint generated always as identity primary key,contract_id bigint,signature_id bigint,document_kind text,confirmed_at timestamptz,used_by uuid);
    create table public.doc_templates(id bigint primary key,body_html text,sign_slots jsonb,fields jsonb);
    create table public.contracts(id bigint primary key,user_id uuid,merged_html text,sign_slots jsonb,status text,signed_at timestamptz,due_at timestamptz,source_pdf_path text,source_pdf_sha256 text,source_pdf_version text,source_pdf_registered_at timestamptz,source_pdf_registered_by uuid,source_pdf_confirmed_at timestamptz,pdf_signing_attempt_id uuid,pdf_signing_started_at timestamptz,pdf_signing_signature_sha256 text,pdf_signing_page_no integer,pdf_signing_x numeric,pdf_signing_y numeric,pdf_signing_width numeric,pdf_signing_height numeric,signed_pdf_path text,signed_pdf_sha256 text,pdf_signed_at timestamptz,updated_at timestamptz);
    create or replace function public.record_contract_pdf_signature(p_contract_id bigint,p_user_id uuid,p_attempt_id uuid,p_source_sha256 text,p_signed_path text,p_signed_sha256 text,p_signature_sha256 text,p_page_no integer,p_x numeric,p_y numeric,p_width numeric,p_height numeric)
    returns public.contracts language plpgsql security definer set search_path=public,pg_temp as $$declare r public.contracts;begin
      perform set_config('app.contract_pdf_mutation','pdf_record',true);
      update public.contracts set status='서명완료',signed_at=now(),signed_pdf_path=p_signed_path,signed_pdf_sha256=p_signed_sha256 where id=p_contract_id and user_id=p_user_id and status='대기' returning * into r;
      if not found then raise exception 'not pending';end if;return r;end$$;
    insert into public.profiles values('${uid}','staff');
    insert into public.doc_templates values(1,'${template}','[]'::jsonb,'[]'::jsonb);
    grant usage on schema auth to authenticated;grant execute on function auth.uid() to authenticated;
    grant select,update on public.contracts to authenticated;grant select on public.employee_signature_vault,public.profiles to authenticated;
    grant select on public.contracts to service_role;
  `);
  await db.exec('alter table public.contracts enable row level security');
  await db.exec(policies.match(/drop policy if exists contracts_update_scoped[\s\S]*?(?=-- approval_docs)/)[0]);
  await db.exec('create policy contracts_select_scoped on public.contracts for select to authenticated using (user_id=auth.uid())');
  await db.exec(pdfGuard.match(/create or replace function public\.guard_contract_pdf_immutability\(\)[\s\S]*?(?=-- Production registers)/)[0]);
  await db.exec(pdfGuard.match(/drop trigger if exists contracts_pdf_immutability_guard[\s\S]*?execute function public\.guard_contract_pdf_immutability\(\);/)[0]);
  await db.exec(draft);

  await db.exec(`create function public.employee_hub_access_allowed() returns boolean language sql as $$select exists(select 1 from public.profiles where user_id=auth.uid())$$;
  create table public.hub_ui_texts(key text primary key,value text);
  create table public.push_subscriptions(id uuid primary key,user_id uuid,endpoint text,subscription jsonb,created_at timestamptz,updated_at timestamptz);
  insert into public.profiles values('22222222-2222-2222-2222-222222222222','owner'),('33333333-3333-3333-3333-333333333333','staff');
  insert into public.contracts(id,user_id,merged_html,status,due_at) values(9,'${uid}','legacy completed original','서명완료',now()+interval '1 day');`);
  await db.exec(fs.readFileSync('db/p9_pledge_texts_20261003.sql','utf8'));
  if(seed){
    const b=(await query('select body_html from doc_templates where id=1'))[0].body_html;
    await query(`insert into contracts(id,user_id,merged_html,status,due_at) values(20,'${uid}',${qstr(b)},'대기',now()+interval '1 day'),(21,'${uid}',${qstr(template)},'대기',now()+interval '1 day'),(22,'${uid}',${qstr(template)},'발송요청',now()+interval '1 day')`);
  }
  await db.exec(fs.readFileSync(process.env.P9_BASELINE_SQL||'db/p9_security_pledge_20261003.sql','utf8'));
  await db.exec(fs.readFileSync('db/p9_push_status_20261003.sql','utf8'));
}
const qstr=s=>"'"+s.replaceAll("'","''")+"'";

const cases=[];
const add=(name,fn)=>cases.push({name,fn});
async function employee(){await db.exec('set role authenticated');await query(`select set_config('app.test_uid','${uid}',false)`);}
async function pending(id, pdf=false,integrated=false){
  const html=integrated?(await query('select body_html from doc_templates where id=1'))[0].body_html:template;
  await query(`insert into contracts(id,user_id,merged_html,status,due_at) values(${id},'${uid}',${qstr(html)},'대기',now()+interval '1 day')`);
  if(pdf){await query("select set_config('app.contract_pdf_mutation','source_register',false)");await query(`update contracts set source_pdf_path='contracts/${id}/source.pdf',source_pdf_sha256=repeat('a',64) where id=${id}`);await query("select set_config('app.contract_pdf_mutation','',false)");}
}
const coords=[{part:'employment',page_no:1,x:72,y:72,width:150,height:50}];
const single=[sign('employment')];
async function stage(id,coordinates=null){await query(`select stage_contract_pledge_signatures(${id},${qjson(single)},${coordinates?qjson(coordinates):'null'})`);return (await query(`select * from contract_security_pledges where contract_id=${id}`))[0];}
const submit=(id,p)=>`select submit_contract_security_pledge(${id},'data:image/png;base64,${png}',true,true,'${p.version}')`;
async function validate(id,coordinates=coords){await db.exec('reset role;set role service_role');await query(`select validate_contract_pledge_pdf(${id},'${uid}',${qjson(single)},${qjson(coordinates)},repeat('a',64),'data:image/png;base64,${png}')`);await employee();}
async function prepare(id){await query(`select prepare_contract_security_pledge(${id})`);return (await query(`select * from contract_security_pledges where contract_id=${id}`))[0];}
async function pledgeFirst(id){const p=await prepare(id);await query(submit(id,p));return (await query(`select * from contract_security_pledges where contract_id=${id}`))[0];}
add('01-no-pledge-contract-rpc-and-legacy-rpc-denied',async()=>{
  await setup();await pending(30);await employee();
  await assert.rejects(()=>stage(30),/signed security pledge/);
  await assert.rejects(()=>query(`select apply_employee_contract_signature(30,'bypass','[]',now(),null)`),/security pledge/);
  await db.exec('reset role');await pending(33,false,true);await employee();
  await assert.rejects(()=>query(`select apply_integrated_contract_signatures(33,'${all}'::jsonb)`),/security pledge/);
});
add('02-both-confirmations-required',async()=>{
  await setup();await pending(30);await employee();const p=await prepare(30);
  for(const [read,rules] of [[true,false],[false,true]])await assert.rejects(()=>query(`select submit_contract_security_pledge(30,'data:image/png;base64,${png}',${read},${rules},'${p.version}')`),/both pledge confirmations/);
  await db.exec('reset role');await query(`update contract_security_pledges set signed_at=now(),read_confirmed=true,rules_confirmed=false where contract_id=30`);await employee();
  await assert.rejects(()=>stage(30),/signed security pledge/);
});
add('03-pledge-only-does-not-complete-four-contract-kinds',async()=>{
  await setup();
  for(const [id,pdf,integrated] of [[30,false,false],[31,false,true],[32,true,false],[33,true,true]]){
    await db.exec('reset role');await pending(id,pdf,integrated);await employee();
    const p=await pledgeFirst(id),c=(await query(`select * from contracts where id=${id}`))[0];
    assert.ok(p.signed_at);assert.equal(p.staged_at,null);assert.equal(c.status,'대기');assert.equal(c.signed_pdf_path,null);
    if(pdf){
      const signatures=integrated?JSON.parse(all):single,coordinates=integrated?['employment','medical','privacy'].map(part=>({...coords[0],part})):coords;
      await query(`select stage_contract_pledge_signatures(${id},${qjson(signatures)},${qjson(coordinates)})`);
      assert.equal((await query(`select status from contracts where id=${id}`))[0].status,'대기');
      await db.exec('reset role;set role service_role');
      await query(`select validate_contract_pledge_pdf(${id},'${uid}',${qjson(signatures)},${qjson(coordinates)},repeat('a',64),'data:image/png;base64,${png}')`);
      const hashRecords=signatures.map(v=>({part:v.part,signature_hash:'c'.repeat(64),signature_id:null,confirmed:true}));
      await query(`select ${integrated?'record_integrated_contract_pdf_signatures':'record_contract_pdf_signature'}(${id},'${uid}',null,repeat('a',64),'contracts/${id}/signed.pdf',repeat('b',64),repeat('c',64),1,72,72,150,50${integrated?','+qjson(hashRecords):''})`);
      const done=(await query(`select * from contracts where id=${id}`))[0];assert.equal(done.status,'서명완료');assert.equal(done.signed_pdf_path,`contracts/${id}/signed.pdf`);
      await db.exec('reset role');
      if(integrated)assert.equal((await query(`select count(*)::int n from contract_part_signatures where contract_id=${id}`))[0].n,3);
      await employee();
    }
    else{
      await query(`select stage_contract_pledge_signatures(${id},${integrated?"'"+all+"'::jsonb":qjson(single)},null)`);
      const done=(await query(`select * from contracts where id=${id}`))[0];assert.equal(done.status,'서명완료');
      assert.ok(done.merged_html.indexOf('data-contract-part="security-pledge"')<done.merged_html.indexOf(integrated?'data-contract-part="medical"':'사직 희망일'));
      if(integrated)assert.ok(done.merged_html.indexOf('data-contract-part="privacy"')<done.merged_html.indexOf('사직 희망일'));
      assert.ok(!done.merged_html.includes('data-sign-slot='));assert.ok(new Date(done.signed_at)>=new Date(p.signed_at));
    }
  }
});
add('04-direct-completion-without-pledge-or-contract-signatures-denied',async()=>{
  await setup();await pending(30);await assert.rejects(()=>query("update contracts set status='서명완료' where id=30"),/security pledge/);
  await employee();await pledgeFirst(30);await assert.rejects(()=>query("update contracts set status='서명완료' where id=30"),/security pledge/);
  await assert.rejects(()=>query('update contracts set pledge_required=false where id=30'),/immutable/);
});
add('05-edge-no-pledge-and-missing-confirmation-denied',async()=>{
  for(const integrated of [false,true])for(const pledge of [null,{signed_at:null},{read_confirmed:false},{rules_confirmed:false}]){
    const r=await edgeSigningAttempt(undefined,integrated,{pledgeRequired:true,pledge});assert.equal(r.status,400);assert.equal(r.rpcCalls.length,0);assert.equal(r.uploadedBytes,null);
    const v=await edgeSigningAttempt(undefined,integrated,{pledgeRequired:true,pledge,validate:true});assert.equal(v.status,400);assert.equal(v.rpcCalls.length,0);
  }
});
add('06-bad-coordinates-preserve-pledge-then-correct-and-complete',async()=>{
  await setup();await pending(32,true);await employee();await pledgeFirst(32);
  await stage(32,[{...coords[0],page_no:999}]);const before=(await query('select * from contract_security_pledges where contract_id=32'))[0];
  const bad=await edgeSigningAttempt(undefined,false,{pledgeRequired:true,validate:true,body:{coordinates:[{...coords[0],page_no:999}]}});assert.equal(bad.status,400);assert.equal(bad.rpcCalls.length,0);
  assert.equal((await query('select status from contracts where id=32'))[0].status,'대기');
  await validate(32,coords);const after=(await query('select * from contract_security_pledges where contract_id=32'))[0];
  for(const key of ['signature_png','signed_at','document','version','read_confirmed','rules_confirmed','contract_signatures','staged_at'])assert.deepEqual(after[key],before[key]);
  assert.equal(after.coordinate_corrections.length,1);assert.equal(after.coordinate_corrections[0].before[0].page_no,999);
  const good=await edgeSigningAttempt(undefined,false,{pledgeRequired:true,validate:true});assert.equal(good.status,200);
  const final=await edgeSigningAttempt(undefined,false,{pledgeRequired:true});assert.equal(final.status,200);
  await db.exec('reset role;set role service_role');await query(`select record_contract_pdf_signature(32,'${uid}',null,repeat('a',64),'contracts/32/signed.pdf',repeat('b',64),repeat('c',64),1,72,72,150,50)`);
  assert.equal((await query('select status from contracts where id=32'))[0].status,'서명완료');
});
add('07-five-legacy-completed-contracts-and-document-cards-preserved',async()=>{
  await setup();await db.exec(fs.readFileSync('db/p9_security_pledge_20261003_rollback.sql','utf8'));
  for(const id of [10,11,12,13])await query(`insert into contracts(id,user_id,merged_html,status,due_at) values(${id},'${uid}','legacy completed original','서명완료',now()-interval '1 day')`);
  const before=await query('select * from contracts order by id');await db.exec(fs.readFileSync('db/p9_security_pledge_20261003.sql','utf8'));
  assert.deepEqual(await query('select * from contracts order by id'),before);
  await db.exec(fs.readFileSync('db/contract_final_send.sql','utf8'));await query("update contracts set signed_at=now()-interval '30 days'");await employee();
  assert.equal((await query('select * from contracts')).length,0);const cards=await query('select * from get_my_contract_security_pledges()');assert.equal(cards.length,5);
  const p=await pledgeFirst(9);assert.ok(p.signed_at);await db.exec('reset role');assert.equal((await query('select merged_html from contracts where id=9'))[0].merged_html,'legacy completed original');
  await employee();await query("select set_config('app.test_uid','33333333-3333-3333-3333-333333333333',false)");assert.equal((await query('select * from get_my_contract_security_pledges()')).length,0);
});
add('08-expired-contract-pledge-and-signature-denied',async()=>{
  await setup();await pending(30);await employee();const p=await prepare(30);await db.exec('reset role');await query("update contracts set due_at=now()-interval '1 day' where id=30");await employee();
  await assert.rejects(()=>query(submit(30,p)),/expired|not signable/);await assert.rejects(()=>stage(30),/expired|not signable/);await assert.rejects(()=>prepare(30),/expired|not signable/);
});
add('09-pending-apply-rollback-reapply-preserves-evidence',async()=>{
  await setup(true);assert.deepEqual((await query('select pledge_required from contracts where id in (20,21,22) order by id')).map(r=>r.pledge_required),[true,true,true]);
  await employee();await pledgeFirst(21);await stage(21);await db.exec('reset role');const before=(await query('select * from contract_security_pledges where contract_id=21'))[0];
  await db.exec(fs.readFileSync('db/p9_security_pledge_20261003_rollback.sql','utf8'));await db.exec(fs.readFileSync('db/p9_security_pledge_20261003.sql','utf8'));
  assert.deepEqual((await query('select * from contract_security_pledges where contract_id=21'))[0],before);
  await query("update contracts set status='대기' where id=22");await employee();await pledgeFirst(22);await stage(22);assert.equal((await query('select status from contracts where id=22'))[0].status,'서명완료');
});
add('single-html-original-slot-quote-compatibility',async()=>{
  await setup();await pending(34);await query(`update contracts set merged_html=${qstr(template.replace('data-sign-slot="employee"',"data-sign-slot = 'employee'"))} where id=34`);
  await employee();await pledgeFirst(34);await stage(34);assert.ok(!(await query('select merged_html from contracts where id=34'))[0].merged_html.includes("data-sign-slot = 'employee'"));
});
add('signed-pledge-restaging-preserves-evidence-and-coordinate-history',async()=>{
  await setup();await pending(32,true);await employee();await pledgeFirst(32);await stage(32,[{...coords[0],page_no:999}]);
  const before=(await query('select * from contract_security_pledges where contract_id=32'))[0];await stage(32,coords);
  const after=(await query('select * from contract_security_pledges where contract_id=32'))[0];for(const k of ['signature_png','signed_at','document','version'])assert.deepEqual(after[k],before[k]);assert.equal(after.coordinate_corrections.length,1);
});
add('old-order-staged-signatures-must-be-collected-after-pledge',async()=>{
  await setup();await pending(35);await employee();const p=await prepare(35);await db.exec('reset role');
  await query(`update contract_security_pledges set staged_at=now()-interval '1 hour',contract_signatures=${qjson(single)} where contract_id=35`);await employee();await query(submit(35,p));
  assert.equal((await query('select staged_at from contract_security_pledges where contract_id=35'))[0].staged_at,null);
  await assert.rejects(()=>query(`select apply_employee_contract_signature(35,'bypass','[]',now(),null)`),/security pledge/);
  await db.exec('reset role');await query("update contract_security_pledges set staged_at=signed_at-interval '1 hour' where contract_id=35");await employee();
  await assert.rejects(()=>query(`select apply_employee_contract_signature(35,'bypass','[]',now(),null)`),/security pledge/);
  await stage(35);assert.equal((await query('select status from contracts where id=35'))[0].status,'서명완료');
});
add('empty-pending-rollback-reapply',async()=>{
  await setup();await db.exec(fs.readFileSync('db/p9_security_pledge_20261003_rollback.sql','utf8'));await db.exec(fs.readFileSync('db/p9_security_pledge_20261003.sql','utf8'));assert.equal((await query('select count(*)::int n from contract_security_pledges'))[0].n,0);
});
let failures=0;
const selected=process.env.P9_CASE?cases.filter(c=>c.name===process.env.P9_CASE):cases;
for(const {name,fn} of selected){try{await fn();console.log('PASS '+name);}catch(e){failures++;console.log('FAIL '+name+': '+e.message);if(e.internalQuery)console.log(e.internalQuery,e.internalPosition);}finally{if(db){await db.close();db=null;}}}
console.log(`PGLITE_P9_REGRESSIONS: ${selected.length-failures}/${selected.length} scenarios passed`);
if(failures)process.exitCode=1;
