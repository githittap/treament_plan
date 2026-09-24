import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';

const packageRoot=process.env.PGLITE_PACKAGE_ROOT;
if(!packageRoot){console.log('PGLITE_INTEGRATED_CONTRACT_SKIP: package path missing');process.exit(2);}
const {PGlite}=await import(pathToFileURL(path.join(packageRoot,'dist/index.js')).href);
const db=new PGlite();
const query=sql=>db.query(sql).then(result=>result.rows);
const uid='11111111-1111-1111-1111-111111111111';
const template='<div>사직 희망일로부터 3주 전, 퇴사일 이후 돌아오는 익월 임금지급일<span data-sign-slot="employee">(직원 서명)</span></div>';
const png=Buffer.concat([Buffer.from('89504e470d0a1a0a','hex'),Buffer.alloc(120)]).toString('base64');
const sign=part=>({part,signature_png:`data:image/png;base64,${png}`,signature_id:null});
const all=JSON.stringify(['employment','medical','privacy'].map(sign));
const qjson=value=>`'${JSON.stringify(value).replaceAll("'","''")}'::jsonb`;
const draft=fs.readFileSync(path.resolve('db/integrated_contract_three_signatures_draft.sql'),'utf8');
try{
  await db.exec(`
    create role anon;create role authenticated;create role service_role bypassrls;create schema auth;
    create or replace function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('app.test_uid',true),'')::uuid$$;
    create table public.profiles(user_id uuid primary key,role text);
    create or replace function public.my_role() returns text language sql stable as $$select role from public.profiles where user_id=auth.uid()$$;
    create table public.employee_signature_vault(id bigint primary key,user_id uuid,revoked_at timestamptz);
    create table public.employee_signature_uses(id bigint generated always as identity primary key,contract_id bigint,signature_id bigint,document_kind text,confirmed_at timestamptz,used_by uuid);
    create table public.doc_templates(id bigint primary key,body_html text,sign_slots jsonb,fields jsonb);
    create table public.contracts(id bigint primary key,user_id uuid,merged_html text,sign_slots jsonb,status text,signed_at timestamptz,due_at timestamptz,source_pdf_path text,signed_pdf_path text,signed_pdf_sha256 text);
    create or replace function public.record_contract_pdf_signature(p_contract_id bigint,p_user_id uuid,p_attempt_id uuid,p_source_sha256 text,p_signed_path text,p_signed_sha256 text,p_signature_sha256 text,p_page_no integer,p_x numeric,p_y numeric,p_width numeric,p_height numeric)
    returns public.contracts language plpgsql security definer set search_path=public,pg_temp as $$declare r public.contracts;begin
      update public.contracts set status='서명완료',signed_at=now(),signed_pdf_path=p_signed_path,signed_pdf_sha256=p_signed_sha256 where id=p_contract_id and user_id=p_user_id and status='대기' returning * into r;
      if not found then raise exception 'not pending';end if;return r;end$$;
    insert into public.profiles values('${uid}','staff');
    insert into public.doc_templates values(1,'${template}','[]'::jsonb,'[]'::jsonb);
    grant usage on schema auth to authenticated;grant execute on function auth.uid() to authenticated;
    grant select on public.contracts,public.employee_signature_vault to authenticated;
    grant select on public.contracts to service_role;
  `);
  await db.exec(draft);
  const updatedTemplate=(await query('select body_html,fields from public.doc_templates where id=1'))[0];
  const body=updatedTemplate.body_html;
  assert.ok(['employment','medical','privacy'].every(part=>body.includes(`data-sign-slot="${part}"`)));
  assert.ok(body.includes('{{사직서제출기한}}')&&body.includes('{{퇴직임금지급기준}}'));
  assert.ok(!body.includes('사직 희망일로부터 3주 전')&&!body.includes('익월 임금지급일'));
  assert.ok(body.includes('data-contract-part="employment-addenda"')&&body.includes('{{임금구성표}}'));
  assert.ok(['사직서제출기한','퇴직임금지급기준','기본급','주 소정근로시간'].every(key=>updatedTemplate.fields.some(field=>field.key===key&&field.required)));
  await query(`insert into public.contracts(id,user_id,merged_html,status,due_at) values(1,'${uid}','${template}','대기',now()+interval '1 day'),(2,'${uid}',${"'"+body.replaceAll("'","''")+"'"},'대기',now()+interval '1 day'),(3,'${uid}',${"'"+body.replaceAll("'","''")+"'"},'대기',now()+interval '1 day'),(4,'${uid}',${"'"+body.replaceAll("'","''")+"'"},'대기',now()+interval '1 day')`);
  await db.exec('set role authenticated');await query(`select set_config('app.test_uid','${uid}',false)`);
  await query(`select public.apply_employee_contract_signature(1,'legacy','[]'::jsonb,now(),null)`);
  let error='';try{await query(`select public.apply_employee_contract_signature(2,'bypass','[]'::jsonb,now(),null)`);}catch(e){error=String(e);}assert.match(error,/three independent signatures/);
  error='';try{await query(`select public.apply_integrated_contract_signatures(2,${qjson([sign('employment'),sign('medical')])})`);}catch(e){error=String(e);}assert.match(error,/three signatures required/);
  assert.equal((await query('select status from public.contracts where id=2'))[0].status,'대기');
  await query(`select public.apply_integrated_contract_signatures(2,'${all}'::jsonb)`);
  await db.exec('reset role');
  assert.equal((await query('select status from public.contracts where id=2'))[0].status,'서명완료');
  assert.equal((await query('select count(*)::int n from public.contract_part_signatures where contract_id=2'))[0].n,3);
  await db.exec('set role authenticated');await query(`select set_config('app.test_uid','${uid}',false)`);
  error='';try{await query(`update public.contracts set status='서명완료' where id=3`);}catch(e){error=String(e);}assert.match(error,/three recorded signatures|permission denied/);
  await db.exec('reset role');
  error='';try{await query(`update public.contracts set status='서명완료' where id=4`);}catch(e){error=String(e);}assert.match(error,/three recorded signatures/);
  assert.equal((await query('select status from public.contracts where id=4'))[0].status,'대기');
  const hashes=['employment','medical','privacy'].map(part=>({part,signature_id:null,signature_hash:'a'.repeat(64)}));
  const record=parts=>`select public.record_integrated_contract_pdf_signatures(3,'${uid}','00000000-0000-0000-0000-000000000003','${'b'.repeat(64)}','contracts/3/signed.pdf','${'c'.repeat(64)}','${'d'.repeat(64)}',1,72,72,150,50,${qjson(parts)})`;
  await db.exec('set role service_role');
  error='';try{await query(record(hashes.slice(0,2)));}catch(e){error=String(e);}assert.match(error,/three signatures required/);
  assert.equal((await query('select status from public.contracts where id=3'))[0].status,'대기');
  await query(record(hashes));
  await db.exec('reset role');
  assert.equal((await query('select status from public.contracts where id=3'))[0].status,'서명완료');
  assert.equal((await query('select count(*)::int n from public.contract_part_signatures where contract_id=3'))[0].n,3);
  console.log('PGLITE_INTEGRATED_CONTRACT_PASS: legacy preserved, partial rejected, HTML/PDF three recorded, direct completion blocked');
}finally{await db.close();}
