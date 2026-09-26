import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';

const root=process.env.PGLITE_PACKAGE_ROOT;
if(!root)throw new Error('PGLITE_PACKAGE_ROOT is required');
const {PGlite}=await import(pathToFileURL(path.join(root,'dist/index.js')).href);
const db=new PGlite();
const q=async sql=>(await db.query(sql)).rows;
const owner='33333333-3333-3333-3333-333333333333';
const chief='77777777-7777-7777-7777-777777777777';
const staff='11111111-1111-1111-1111-111111111111';
const other='22222222-2222-2222-2222-222222222222';
const as=async id=>{await q('set role authenticated');await q(`select set_config('app.test_uid','${id}',false)`);};
try{
  await db.exec(`create role anon;create role authenticated;create schema auth;
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('app.test_uid',true),'')::uuid$$;
    create table public.profiles(user_id uuid primary key,name text,dept text,hire_date date,role text,active boolean,approved boolean,employment_status text);
    create function public.my_role() returns text language sql stable security definer set search_path=public as $$select role from public.profiles where user_id=auth.uid()$$;
    create table public.approval_docs(id bigint generated always as identity primary key,kind text,title text,body text,author uuid,status text default '진행');
    create table public.approval_steps(id bigint generated always as identity primary key,doc_id bigint,seq int,approver_role text,approver_id uuid,status text default '대기',stamp text,acted_at timestamptz);
    grant usage on schema auth to authenticated;grant execute on function auth.uid(),public.my_role() to authenticated;
    grant select on public.profiles,public.approval_docs,public.approval_steps to authenticated;
    insert into public.profiles values
      ('${owner}','합성원장',null,null,'owner',true,true,'재직'),
      ('${chief}','합성실장',null,null,'chief',true,true,'재직'),
      ('${staff}','합성직원','진료','2024-01-05','staff',true,true,'재직'),
      ('${other}','다른직원',null,null,'staff',true,true,'재직');
    insert into public.approval_docs(kind,title,body,author) values('기타','[재직증명서 발급] 요청','[재직증명서 발급 요청]','${staff}');
    insert into public.approval_steps(doc_id,seq,approver_role,status,approver_id,acted_at) values
      (1,1,'chief','승인','${chief}',now()),(1,2,'owner','대기',null,null);
  `);
  await db.exec(fs.readFileSync('db/employment_certificate_draft.sql','utf8'));
  assert.equal((await q(`select public.employment_certificate_escape('<script>&"') value`))[0].value,'&lt;script&gt;&amp;&quot;');
  await as(staff);
  await assert.rejects(q('select * from public.issue_employment_certificate(1)'),/owner approval required/);
  await as(owner);
  let row=(await q('select * from public.issue_employment_certificate(1)'))[0];
  assert.equal(row.employee_name,'합성직원');assert.equal(row.department,'진료');
  assert.equal(row.issuer_name,'아산정플란트치과의원');
  assert.match(row.issued_html,/재 직 증 명 서/);
  assert.match(row.issued_html,/합성직원/);
  assert.match(row.issued_html,/2024-01-05/);
  assert.match(row.issued_html,/대표자[：:]?\s*정용태/);
  assert.match(row.issued_html,/충청남도 아산시 온천대로 1065, 이안빌딩 4층 401~403호/);
  assert.doesNotMatch(row.issued_html,/<img|data:image|storage|C:\\Users/i,
    'the public SQL draft does not embed seal bytes, a storage object path, or a local filesystem path');
  const originalHtml=row.issued_html;
  assert.equal((await q('select status from public.approval_docs where id=1'))[0].status,'완결');
  assert.equal((await q('select count(*)::int n from public.employment_certificates'))[0].n,1);
  await q('select * from public.issue_employment_certificate(1)');
  assert.equal((await q('select count(*)::int n from public.employment_certificates'))[0].n,1);
  assert.equal((await q('select issued_html from public.employment_certificates'))[0].issued_html,originalHtml);
  await q('reset role');
  await q("update public.profiles set name='변경된이름',hire_date='2025-01-01' where user_id='"+staff+"'");
  await as(staff);
  assert.equal((await q('select employee_name from public.employment_certificates'))[0].employee_name,'합성직원');
  assert.equal((await q('select issued_html from public.employment_certificates'))[0].issued_html,originalHtml);
  await assert.rejects(q("update public.employment_certificates set issued_html='변조' where approval_doc_id=1"),/permission denied/);
  await as(other);
  assert.equal((await q('select count(*)::int n from public.employment_certificates'))[0].n,0);
  await as(chief);
  assert.equal((await q('select count(*)::int n from public.employment_certificates'))[0].n,1);
  await q('reset role');
  await q(`insert into public.approval_docs(kind,title,body,author) values('기타','[재직증명서 발급] 누락','[재직증명서 발급 요청]','${other}');`);
  await q(`insert into public.approval_steps(doc_id,seq,approver_role,status,approver_id,acted_at) values(2,1,'chief','승인','${chief}',now()),(2,2,'owner','대기',null,null);`);
  await q(`update public.profiles set hire_date=null where user_id='${other}'`);
  await as(owner);
  await assert.rejects(q('select * from public.issue_employment_certificate(2)'),/verified current employment data required/);
  assert.equal((await q('select status from public.approval_docs where id=2'))[0].status,'진행');
  console.log('PGLITE_EMPLOYMENT_CERTIFICATE_PASS: 승인·스냅샷·멱등·누락·열람권한');
}finally{await db.close();}
