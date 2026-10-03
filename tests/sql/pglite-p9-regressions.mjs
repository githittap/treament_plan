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
  await db.exec(fs.readFileSync('db/p9_security_pledge_20261003.sql','utf8'));
  await db.exec(fs.readFileSync('db/p9_push_status_20261003.sql','utf8'));
}
const qstr=s=>"'"+s.replaceAll("'","''")+"'";

const cases=[];
const add=(name,fn)=>cases.push({name,fn});
async function employee(){await db.exec('set role authenticated');await query(`select set_config('app.test_uid','${uid}',false)`);}
async function pending(id, pdf=false){
  await query(`insert into contracts(id,user_id,merged_html,status,due_at) values(${id},'${uid}',${qstr(template)},'대기',now()+interval '1 day')`);
  if(pdf){await query("select set_config('app.contract_pdf_mutation','source_register',false)");await query(`update contracts set source_pdf_path='contracts/${id}/source.pdf',source_pdf_sha256=repeat('a',64) where id=${id}`);await query("select set_config('app.contract_pdf_mutation','',false)");}
}
const coords=[{part:'employment',page_no:1,x:72,y:72,width:150,height:50}];
const single=[sign('employment')];
async function stage(id,coordinates=null){await query(`select stage_contract_pledge_signatures(${id},${qjson(single)},${coordinates?qjson(coordinates):'null'})`);return (await query(`select * from contract_security_pledges where contract_id=${id}`))[0];}
const submit=(id,p)=>`select submit_contract_security_pledge(${id},'data:image/png;base64,${png}',true,true,'${p.version}')`;
async function validate(id,coordinates=coords){await db.exec('reset role;set role service_role');await query(`select validate_contract_pledge_pdf(${id},'${uid}',${qjson(single)},${qjson(coordinates)},repeat('a',64),'data:image/png;base64,${png}')`);await employee();}
add('pending-migration-with-deferred-events',async()=>{
  await setup(true);
  assert.deepEqual((await query('select pledge_required from contracts where id in (20,21,22) order by id')).map(r=>r.pledge_required),[true,true,true]);
  assert.equal((await query('select pledge_required from contracts where id=9'))[0].pledge_required,false);
});
add('single-html-contract-and-pledge-complete-together',async()=>{
  await setup();await pending(30);await employee();
  const p=await stage(30);assert.equal((await query('select status from contracts where id=30'))[0].status,'대기');
  await assert.rejects(()=>query(`select apply_employee_contract_signature(30,'bypass','[]',now(),null)`),/security pledge/);
  await query(submit(30,p));
  const c=(await query('select * from contracts where id=30'))[0];assert.equal(c.status,'서명완료');assert.match(c.merged_html,/data-contract-part="security-pledge"/);assert.ok(!c.merged_html.includes('data-sign-slot="employee"'));
});
add('legacy-pending-and-final-send-single-contracts',async()=>{
  await setup(true);
  await query("update contracts set status='대기' where id=22");await employee();
  for(const id of [21,22]){const p=await stage(id);await query(submit(id,p));assert.equal((await query(`select status from contracts where id=${id}`))[0].status,'서명완료');}
});
add('old-completed-contract-card-without-body-access',async()=>{
  await setup();await db.exec(fs.readFileSync('db/contract_final_send.sql','utf8'));
  await query("update contracts set signed_at=now()-interval '30 days' where id=9");await employee();
  assert.equal((await query('select * from contracts where id=9')).length,0);
  const cards=await query('select * from get_my_contract_security_pledges()');assert.equal(cards.length,1);assert.equal(Number(cards[0].contract_id),9);assert.ok(!Object.keys(cards[0]).includes('merged_html'));
  const p=(await query('select prepare_contract_security_pledge(9)')).length;assert.equal(p,1);
  await query("select set_config('app.test_uid','33333333-3333-3333-3333-333333333333',false)");assert.equal((await query('select * from get_my_contract_security_pledges()')).length,0);
});
add('pdf-pledge-requires-server-prevalidation',async()=>{
  await setup();await pending(31,true);await employee();
  const p=await stage(31,[{...coords[0],page_no:999,x:999999}]);
  await assert.rejects(()=>query(submit(31,p)),/PDF prevalidation required/);
  assert.equal((await query('select signed_at from contract_security_pledges where contract_id=31'))[0].signed_at,null);
  await stage(31,coords);await validate(31);await query(submit(31,p));
  assert.equal((await query('select status from contracts where id=31'))[0].status,'대기');
  await assert.rejects(()=>query(`select validate_contract_pledge_pdf(31,'${uid}',${qjson(single)},${qjson(coords)},repeat('a',64),'data:image/png;base64,${png}')`),/permission denied/);
});
add('signed-pledge-coordinate-correction-preserves-evidence',async()=>{
  await setup();await pending(32,true);await employee();const p=await stage(32,coords);await validate(32);await query(submit(32,p));
  const before=(await query('select * from contract_security_pledges where contract_id=32'))[0];
  const changed=[{...coords[0],x:85}];await validate(32,changed);
  const after=(await query('select * from contract_security_pledges where contract_id=32'))[0];
  for(const key of ['signature_png','signed_at','document','version','contract_signatures','staged_at'])assert.deepEqual(after[key],before[key]);
  assert.deepEqual(after.pdf_coordinates,changed);assert.equal(after.coordinate_corrections.length,1);assert.deepEqual(after.coordinate_corrections[0].before,coords);
});
add('pending-apply-rollback-reapply-preserves-evidence',async()=>{
  await setup(true);await employee();const p=await stage(21);await query(submit(21,p));await db.exec('reset role');
  const before=(await query('select * from contract_security_pledges where contract_id=21'))[0];
  await db.exec(fs.readFileSync('db/p9_security_pledge_20261003_rollback.sql','utf8'));await db.exec(fs.readFileSync('db/p9_security_pledge_20261003.sql','utf8'));
  assert.deepEqual((await query('select * from contract_security_pledges where contract_id=21'))[0],before);
  await query("update contracts set status='대기' where id=22");await employee();const again=await stage(22);assert.ok(again.staged_at);
});
let failures=0;
for(const {name,fn} of cases){try{await fn();console.log('PASS '+name);}catch(e){failures++;console.log('FAIL '+name+': '+e.message);if(e.internalQuery)console.log(e.internalQuery,e.internalPosition);}finally{if(db)await db.close();}}
console.log(`PGLITE_P9_REGRESSIONS: ${cases.length-failures}/${cases.length} scenarios passed`);
if(failures)process.exitCode=1;
