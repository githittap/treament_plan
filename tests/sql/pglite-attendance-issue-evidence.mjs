import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';

const packageRoot=process.env.PGLITE_PACKAGE_ROOT;
if(!packageRoot)throw new Error('PGLITE_PACKAGE_ROOT required');
const {PGlite}=await import(pathToFileURL(path.join(packageRoot,'dist/index.js')).href);
const db=new PGlite(),q=sql=>db.query(sql).then(result=>result.rows);
const staff='11111111-1111-1111-1111-111111111111',manager='22222222-2222-2222-2222-222222222222',chief='33333333-3333-3333-3333-333333333333',owner='44444444-4444-4444-4444-444444444444',other='55555555-5555-5555-5555-555555555555',deputy='66666666-6666-6666-6666-666666666666',inactive='77777777-7777-7777-7777-777777777777',unapproved='88888888-8888-8888-8888-888888888888',blocked='99999999-9999-9999-9999-999999999999';
const as=async id=>{await q('reset role');await q(`select set_config('app.test_uid','${id}',false)`);await q('set role authenticated');};
const denied=async sql=>{await assert.rejects(q(sql),/not allowed|invalid|permission denied|row-level security|fields|required|limit reached|type mismatch|object not found/i);};
const call=(name,args)=>q(`select * from public.${name}(${args})`);
const evidencePath=(id,token)=>`${staff}/${id}/evidence_${String(token).padStart(4,'0')}.pdf`;
const releaseSql=fs.readFileSync('db/attendance_issue_resolution_release.sql','utf8');
const functionSql=name=>{const match=releaseSql.match(new RegExp(`create or replace function public\\.${name}\\([\\s\\S]*?\\$\\$;`,'i'));assert.ok(match,`운영 릴리스 원본 함수 ${name}을 읽어야 한다`);return match[0];};
try{
  await db.exec(`
    create role anon;create role authenticated;create schema auth;
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('app.test_uid',true),'')::uuid$$;
    grant usage on schema auth to authenticated,anon;grant execute on function auth.uid() to authenticated,anon;
    create table public.profiles(user_id uuid primary key,name text,role text,active boolean default true,approved boolean default true,account_access_status text default '활성');
    create or replace function public.employee_hub_access_allowed() returns boolean language sql stable security definer set search_path='' as $$select exists(select 1 from public.profiles p where p.user_id=auth.uid() and p.active and p.approved and p.account_access_status='활성')$$;
    create or replace function public.my_role() returns text language sql stable security definer set search_path='' as $$select case when public.employee_hub_access_allowed() then coalesce((select p.role from public.profiles p where p.user_id=auth.uid()),'staff') else 'pending' end$$;
    grant execute on function public.employee_hub_access_allowed(),public.my_role() to authenticated,anon;
    create table public.attendance_issues(id bigint generated always as identity primary key,user_id uuid not null,work_date date not null,type text,reason text,rule_label text,status text not null default '대기',chief_by text,chief_at timestamptz,owner_by text,owner_at timestamptz,created_at timestamptz default now());
    
    grant select,delete,references,trigger,truncate on public.attendance_issues to anon,authenticated;
    alter table public.attendance_issues enable row level security;
    create policy attendance_issues_select on public.attendance_issues for select to authenticated using(user_id=auth.uid() or public.my_role() in('manager','chief','owner'));
    create policy attendance_issues_insert on public.attendance_issues for insert to authenticated with check((user_id=auth.uid() and rule_label<>'자동') or (rule_label='자동' and public.my_role() in('manager','chief','owner')));
    create policy attendance_issues_update on public.attendance_issues for update to authenticated using(public.my_role() in('chief','owner')) with check(public.my_role() in('chief','owner'));
    create policy deputy_contract_only_block on public.attendance_issues as restrictive for all to authenticated using(public.my_role()<>'deputy') with check(public.my_role()<>'deputy');
    create policy deputy_contract_only_v4_block on public.attendance_issues as restrictive for all to authenticated using(public.my_role()<>'deputy') with check(public.my_role()<>'deputy');
    create policy employee_hub_access_gate on public.attendance_issues as restrictive for all to authenticated using(public.employee_hub_access_allowed()) with check(public.employee_hub_access_allowed());
    create schema storage;
    create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
    create table storage.objects(id bigint generated always as identity primary key,bucket_id text,name text,owner_id text,metadata jsonb default '{}'::jsonb);
    grant usage on schema storage to authenticated;
    grant select,insert,delete on storage.objects to authenticated;
    alter table storage.objects enable row level security;
    create policy employee_hub_storage_access_gate on storage.objects as restrictive for all to authenticated using(bucket_id not in('hr-docs','employee-signatures','leave-docs','notice-attachments') or public.employee_hub_access_allowed()) with check(bucket_id not in('hr-docs','employee-signatures','leave-docs','notice-attachments') or public.employee_hub_access_allowed());
    insert into public.profiles(user_id,name,role) values
      ('${staff}','합성직원','staff'),('${manager}','합성매니저','manager'),('${chief}','합성실장','chief'),('${owner}','합성원장','owner'),('${other}','합성다른직원','staff'),('${deputy}','합성부원장','deputy');
    insert into public.profiles(user_id,role,active,approved,account_access_status) values
      ('${inactive}','staff',false,true,'활성'),('${unapproved}','staff',true,false,'활성'),('${blocked}','staff',true,true,'차단');
  `);
  await db.exec(functionSql('guard_attendance_issue_insert')+`create trigger guard_attendance_issue_insert before insert on public.attendance_issues for each row execute function public.guard_attendance_issue_insert();`+functionSql('submit_attendance_issue')+functionSql('record_auto_attendance_issue')+functionSql('review_attendance_issue'));
  for(const role of ['anon','authenticated']){
    for(const privilege of ['SELECT','DELETE','REFERENCES','TRIGGER','TRUNCATE']) assert.equal((await q(`select has_table_privilege('${role}','public.attendance_issues','${privilege}') ok`))[0].ok,true,`${role} must retain ${privilege}`);
    for(const privilege of ['INSERT','UPDATE']) assert.equal((await q(`select has_table_privilege('${role}','public.attendance_issues','${privilege}') ok`))[0].ok,false,`${role} must not have ${privilege}`);
  }
  const baseline=await q(`select
    (select string_agg(policyname||':'||permissive||':'||cmd||':'||coalesce(qual,'')||':'||coalesce(with_check,''),',' order by policyname) from pg_policies where schemaname='public' and tablename='attendance_issues') policies,
    (select string_agg(t.tgname||':'||pg_get_triggerdef(t.oid),',' order by t.tgname) from pg_trigger t where t.tgrelid='public.attendance_issues'::regclass and not t.tgisinternal) triggers,
    (select string_agg(p.oid::regprocedure::text||':'||pg_get_functiondef(p.oid),',' order by p.oid::regprocedure::text) from pg_proc p where p.oid in ('public.submit_attendance_issue(date,text,text,text)'::regprocedure,'public.record_auto_attendance_issue(uuid,date,text,text)'::regprocedure,'public.review_attendance_issue(bigint,text)'::regprocedure)) functions,
    (select string_agg(grantee||':'||privilege_type,',' order by grantee,privilege_type) from information_schema.role_table_grants where table_schema='public' and table_name='attendance_issues' and grantee in ('anon','authenticated')) grants`);
  await db.exec(fs.readFileSync('db/attendance_issue_evidence.sql','utf8'));
  const after=await q(`select
    (select string_agg(policyname||':'||permissive||':'||cmd||':'||coalesce(qual,'')||':'||coalesce(with_check,''),',' order by policyname) from pg_policies where schemaname='public' and tablename='attendance_issues') policies,
    (select string_agg(t.tgname||':'||pg_get_triggerdef(t.oid),',' order by t.tgname) from pg_trigger t where t.tgrelid='public.attendance_issues'::regclass and not t.tgisinternal) triggers,
    (select string_agg(p.oid::regprocedure::text||':'||pg_get_functiondef(p.oid),',' order by p.oid::regprocedure::text) from pg_proc p where p.oid in ('public.submit_attendance_issue(date,text,text,text)'::regprocedure,'public.record_auto_attendance_issue(uuid,date,text,text)'::regprocedure,'public.review_attendance_issue(bigint,text)'::regprocedure)) functions,
    (select string_agg(grantee||':'||privilege_type,',' order by grantee,privilege_type) from information_schema.role_table_grants where table_schema='public' and table_name='attendance_issues' and grantee in ('anon','authenticated')) grants`);
  assert.deepEqual(after,baseline,'기존 소명 정책·트리거·함수·권한은 그대로여야 한다');
  for(const role of ['anon','authenticated']){
    for(const privilege of ['SELECT','DELETE','REFERENCES','TRIGGER','TRUNCATE']) assert.equal((await q(`select has_table_privilege('${role}','public.attendance_issues','${privilege}') ok`))[0].ok,true,`${role} ${privilege} must remain after migration`);
    for(const privilege of ['INSERT','UPDATE']) assert.equal((await q(`select has_table_privilege('${role}','public.attendance_issues','${privilege}') ok`))[0].ok,false,`${role} ${privilege} must remain absent after migration`);
  }
  assert.deepEqual((await q(`select public,file_size_limit,allowed_mime_types from storage.buckets where id='attendance-evidence'`))[0],{public:false,file_size_limit:10485760,allowed_mime_types:['image/jpeg','image/png','image/webp','application/pdf']});

  await as(staff);
  const submitted=(await call('submit_attendance_issue_v2',`'2026-10-02','지문인식오류',' 출근 때 기계가 인식하지 않았음 '`))[0];
  const issueId=submitted.id;
  assert.deepEqual({user_id:submitted.user_id,type:submitted.type,rule_label:submitted.rule_label,reason:submitted.reason,staff_kind:submitted.staff_kind,staff_reason:submitted.staff_reason,status:submitted.status},{user_id:staff,type:'정정',rule_label:'지문인식오류',reason:'출근 때 기계가 인식하지 않았음',staff_kind:'지문인식오류',staff_reason:'출근 때 기계가 인식하지 않았음',status:'대기'});
  assert.ok(submitted.staff_responded_at);
  const legacy=(await call('submit_attendance_issue',`'2026-10-01','정정','입력오류','기존 제출 함수는 계속 작동함'`))[0];
  assert.deepEqual({user_id:legacy.user_id,type:legacy.type,rule_label:legacy.rule_label,status:legacy.status},{user_id:staff,type:'정정',rule_label:'입력오류',status:'대기'});
  await denied(`select public.submit_attendance_issue_v2('2026-10-02',null,'사유가 충분함')`);
  await denied(`select public.submit_attendance_issue_v2('2026-10-02','잘못된 종류','사유가 충분함')`);
  await denied(`select public.submit_attendance_issue_v2('2026-10-02','기타','   ')`);
  await denied(`select public.submit_attendance_issue_v2((now() at time zone 'Asia/Seoul')::date+2,'기타','미래 날짜 사유')`);
  await denied(`insert into public.attendance_issue_evidence(issue_id,storage_path,original_name,mime_type,size_bytes) values(${issueId},'x','x.pdf','application/pdf',100)`);

  await q('reset role');
  await as(chief);
  const auto=(await call('record_auto_attendance_issue',`'${staff}','2026-09-30','시업누락','자동 감지'`))[0].id;
  await as(staff);
  const answered=(await call('respond_attendance_issue',`${auto},'입력오류',' 출근 기록이 남아 있고 당시 기기가 꺼져 있었음 '`))[0];
  assert.equal(answered.staff_kind,'입력오류');assert.equal(answered.staff_reason,'출근 기록이 남아 있고 당시 기기가 꺼져 있었음');assert.equal(answered.type,'시업누락');assert.equal(answered.rule_label,'입력오류');assert.equal(answered.status,'대기');
  await denied(`select public.respond_attendance_issue(${auto},null,'충분히 긴 사유 내용')`);
  await denied(`select public.respond_attendance_issue(${auto},'기타','   ')`);
  await as(other);await denied(`select public.respond_attendance_issue(${auto},'기타','충분히 긴 사유 내용')`); // 다른 직원의 행
  await as(staff);
  await as(chief);await call('review_attendance_issue',`${auto},'approve'`);await as(staff);
  await denied(`select public.respond_attendance_issue(${auto},'기타','승인 뒤 수정 시도 사유')`);
  const invalidUsers=[inactive,unapproved,blocked,deputy];
  for(const id of invalidUsers){
    await as(id);
    await denied(`select public.submit_attendance_issue_v2('2026-10-02','기타','권한 검증용 충분한 사유')`);
    await denied(`select public.respond_attendance_issue(${issueId},'기타','권한 검증용 충분한 사유')`);
    await denied(`select public.attendance_issue_add_evidence(${issueId},'${id}/${issueId}/Abcdefgh.pdf','권한.pdf','application/pdf',100)`);
  }
  await as(staff);
  assert.equal((await q(`select count(*)::int n from public.attendance_issue_evidence`))[0].n,0);
  assert.equal((await q(`select count(*)::int n from public.attendance_issues where id=${issueId}`))[0].n,1);

  const firstPath=evidencePath(issueId,1);
  const addObject=async(name,metadata='{"mimetype":"application/pdf","size":100}')=>q(`insert into storage.objects(bucket_id,name,owner_id,metadata) values('attendance-evidence','${name}','${staff}','${metadata}'::jsonb)`);
  await addObject(firstPath,'{"mimetype":"application/pdf","contentLength":100}');
  assert.equal((await q(`select metadata ? 'size' present from storage.objects where name='${firstPath}'`))[0].present,false,'업로드 전 권한 시험 INSERT에는 metadata.size가 없어야 한다');
  await q('reset role');
  await q(`update storage.objects set metadata='{"size":100,"mimetype":"application/pdf"}'::jsonb where name='${firstPath}'`);
  await as(staff);
  const evidenceId=(await call('attendance_issue_add_evidence',`${issueId},'${firstPath}',' 근무기록.pdf ','application/pdf',100`))[0].attendance_issue_add_evidence;
  assert.equal((await q(`select count(*)::int n from public.attendance_issue_evidence where id=${evidenceId}`))[0].n,1);
  await denied(`select public.attendance_issue_add_evidence(${issueId},'${staff}/${issueId}/badpath.pdf','bad.pdf','application/pdf',100)`);
  const wrongMeta=evidencePath(issueId,100);
  await addObject(wrongMeta,'{"mimetype":"image/png","size":100}');
  await denied(`select public.attendance_issue_add_evidence(${issueId},'${wrongMeta}','wrong.pdf','application/pdf',100)`);
  const wrongSize=evidencePath(issueId,101);
  await addObject(wrongSize,'{"mimetype":"application/pdf","size":99}');
  await denied(`select public.attendance_issue_add_evidence(${issueId},'${wrongSize}','wrong-size.pdf','application/pdf',100)`);
  await denied(`select public.attendance_issue_add_evidence(${issueId},'${firstPath}','bad-name.pdf','application/zip',100)`);
  await denied(`select public.attendance_issue_add_evidence(${issueId},'${firstPath}','bad-size.pdf','application/pdf',10485761)`);
  await denied(`select public.attendance_issue_add_evidence(${issueId},null,'null-path.pdf','application/pdf',100)`);
  await denied(`select public.attendance_issue_add_evidence(${issueId},'${firstPath}',null,'application/pdf',100)`);
  await denied(`select public.attendance_issue_add_evidence(${issueId},'${firstPath}','null-type.pdf',null,100)`);
  await denied(`select public.attendance_issue_add_evidence(${issueId},'${firstPath}','null-size.pdf','application/pdf',null)`);
  const typeMismatch=evidencePath(issueId,102);await addObject(typeMismatch,'{"mimetype":"image/png","size":100}');
  await denied(`select public.attendance_issue_add_evidence(${issueId},'${typeMismatch}','wrong-extension.pdf','image/png',100)`);
  for(let i=2;i<=10;i++){
    const name=evidencePath(issueId,i);await addObject(name);
    await call('attendance_issue_add_evidence',`${issueId},'${name}','evidence-${i}.pdf','application/pdf',100`);
  }
  const eleventh=evidencePath(issueId,11);await addObject(eleventh);await denied(`select public.attendance_issue_add_evidence(${issueId},'${eleventh}','evidence-11.pdf','application/pdf',100)`);
  assert.equal((await q(`select count(*)::int n from public.attendance_issue_evidence where issue_id=${issueId}`))[0].n,10);

  const orphan=evidencePath(issueId,77);await addObject(orphan);
  assert.equal((await q(`select count(*)::int n from storage.objects where bucket_id='attendance-evidence' and name='${orphan}'`))[0].n,1,'직원은 연결 전 본인 폴더의 orphan도 조회할 수 있어야 한다');
  const orphanDeleted=await q(`delete from storage.objects where bucket_id='attendance-evidence' and name='${orphan}' returning id`);
  await q('reset role');
  const orphanRemaining=(await q(`select count(*)::int n from storage.objects where bucket_id='attendance-evidence' and name='${orphan}'`))[0].n;
  assert.equal(orphanDeleted.length,1,`본인 미연결 파일 삭제가 실제 1행을 지워야 한다 (DELETE=${orphanDeleted.length}, 삭제 뒤 객체=${orphanRemaining})`);
  assert.equal(orphanRemaining,0,'관리자 조회로 실제 삭제를 확인해야 한다');
  const otherOrphan=evidencePath(issueId,78).replace(staff,other);await q(`insert into storage.objects(bucket_id,name,owner_id,metadata) values('attendance-evidence','${otherOrphan}','${other}','{"mimetype":"application/pdf","size":100}'::jsonb)`);
  await as(staff);
  assert.equal((await q(`delete from storage.objects where bucket_id='attendance-evidence' and name='${otherOrphan}' returning id`)).length,0,'직원은 타인 orphan을 삭제할 수 없어야 한다');
  await q('reset role');
  assert.equal((await q(`select count(*)::int n from storage.objects where bucket_id='attendance-evidence' and name='${otherOrphan}'`))[0].n,1,'권한 우회 조회로 타인 orphan이 남았음을 확인해야 한다');
  await as(staff);
  assert.equal((await q(`delete from storage.objects where bucket_id='attendance-evidence' and name='${firstPath}' returning id`)).length,0,'연결 파일 삭제는 RLS로 0행이어야 한다');
  await q('reset role');assert.equal((await q(`select count(*)::int n from storage.objects where bucket_id='attendance-evidence' and name='${firstPath}'`))[0].n,1,'권한 우회 조회에서도 연결 파일이 보존돼야 한다');
  await as(staff);
  assert.equal((await q(`select count(*)::int n from storage.objects where bucket_id='attendance-evidence' and name='${firstPath}'`))[0].n,1,'연결된 파일은 직원이 지울 수 없어야 한다');

  await as(chief);
  assert.equal((await q(`select count(*)::int n from public.attendance_issue_evidence where issue_id=${issueId}`))[0].n,10);
  assert.equal((await q(`select count(*)::int n from storage.objects where bucket_id='attendance-evidence' and name like '${staff}/${issueId}/%'`))[0].n,10);
  await as(owner);
  assert.equal((await q(`select count(*)::int n from public.attendance_issue_evidence where issue_id=${issueId}`))[0].n,10);
  assert.equal((await q(`select count(*)::int n from storage.objects where bucket_id='attendance-evidence' and name like '${staff}/${issueId}/%'`))[0].n,10);
  assert.equal((await q(`select count(*)::int n from storage.objects where bucket_id='attendance-evidence' and name='${otherOrphan}'`))[0].n,0,'실장·원장은 연결되지 않은 타인 orphan을 볼 수 없어야 한다');
  await as(manager);
  assert.equal((await q(`select count(*)::int n from public.attendance_issues where id=${issueId}`))[0].n,1,'기존 소명 표 권한은 원래처럼 유지됨');
  assert.equal((await q(`select count(*)::int n from public.attendance_issue_evidence where issue_id=${issueId}`))[0].n,0);
  assert.equal((await q(`select count(*)::int n from storage.objects where bucket_id='attendance-evidence'`))[0].n,0,'매니저는 연결 전 파일을 볼 수 없어야 한다');
  await as(other);
  assert.equal((await q(`select count(*)::int n from public.attendance_issue_evidence`))[0].n,0);
  assert.equal((await q(`select count(*)::int n from storage.objects where bucket_id='attendance-evidence'`))[0].n,1,'다른 직원은 본인 orphan만 볼 수 있어야 한다');
  assert.equal((await q(`select count(*)::int n from storage.objects where bucket_id='attendance-evidence' and name like '${staff}/%'`))[0].n,0,'다른 직원은 staff 소유 파일을 볼 수 없어야 한다');
  await as(deputy);
  assert.equal((await q(`select count(*)::int n from public.attendance_issue_evidence`))[0].n,0);
  assert.equal((await q(`select count(*)::int n from storage.objects where bucket_id='attendance-evidence'`))[0].n,0);

  await q('reset role');
  let evidenceRollback='';try{await db.exec(fs.readFileSync('db/attendance_issue_evidence_rollback.sql','utf8'));}catch(error){evidenceRollback=String(error);await db.exec('rollback');}
  assert.match(evidenceRollback,/attendance issue evidence contains data; rollback stopped/i);
  assert.equal((await q(`select count(*)::int n from public.attendance_issue_evidence`))[0].n,10,'데이터가 있을 때 rollback은 표를 보존해야 한다');
  assert.equal((await q(`select count(*)::int n from storage.buckets where id='attendance-evidence'`))[0].n,1,'rollback 거부 뒤 버킷 설정도 보존해야 한다');
  await q(`delete from public.attendance_issue_evidence`);
  await q(`update public.attendance_issues set staff_kind='기타' where id=${issueId}`);
  let responseRollback='';try{await db.exec(fs.readFileSync('db/attendance_issue_evidence_rollback.sql','utf8'));}catch(error){responseRollback=String(error);await db.exec('rollback');}
  assert.match(responseRollback,/attendance issues contain staff response data; rollback stopped/i);
  assert.ok((await q(`select staff_kind from public.attendance_issues where id=${issueId}`))[0].staff_kind,'직원 답 데이터가 있으면 열과 값을 보존해야 한다');
  await q(`update public.attendance_issues set staff_kind=null,staff_reason=null,staff_responded_at=null`);
  let objectRollback='';try{await db.exec(fs.readFileSync('db/attendance_issue_evidence_rollback.sql','utf8'));}catch(error){objectRollback=String(error);await db.exec('rollback');}
  assert.match(objectRollback,/attendance evidence bucket contains objects; rollback stopped/i);
  assert.equal((await q(`select count(*)::int n from storage.objects where bucket_id='attendance-evidence'`))[0].n,15,'객체가 있을 때 rollback은 storage 객체와 버킷을 보존해야 한다');
  await q(`delete from storage.objects where bucket_id='attendance-evidence'`);
  await db.exec(fs.readFileSync('db/attendance_issue_evidence_rollback.sql','utf8'));
  assert.equal((await q(`select to_regclass('public.attendance_issue_evidence') is null gone`))[0].gone,true);
  assert.equal((await q(`select not exists(select 1 from information_schema.columns where table_schema='public' and table_name='attendance_issues' and column_name like 'staff_%') gone`))[0].gone,true);
  assert.equal((await q(`select count(*)::int n from storage.buckets where id='attendance-evidence'`))[0].n,0);
  await db.exec(fs.readFileSync('db/attendance_issue_evidence_rollback.sql','utf8'));
  await db.exec(fs.readFileSync('db/attendance_issue_evidence_rollback.sql','utf8'));
  await db.exec(fs.readFileSync('db/attendance_issue_evidence.sql','utf8'));
  assert.equal((await q(`select count(*)::int n from storage.buckets where id='attendance-evidence'`))[0].n,1);
  assert.equal((await q(`select count(*)::int n from information_schema.columns where table_schema='public' and table_name='attendance_issues' and column_name like 'staff_%'`))[0].n,3);
  console.log('PGLITE_ATTENDANCE_ISSUE_EVIDENCE_PASS: submit/respond gates, storage metadata/path/count, scoped RLS, preserved issue policies/functions/trigger/grants, rollback preflight/atomicity/idempotency/reapply');
}finally{await db.close();}
