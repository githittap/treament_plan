import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
const {PGlite}=await import(pathToFileURL(path.join(process.env.PGLITE_PACKAGE_ROOT,'dist/index.js')).href);
const db=new PGlite();
const read=name=>fs.readFileSync('db/'+name,'utf8');
const id=n=>`00000000-0000-0000-0000-${String(n).padStart(12,'0')}`;
let checks=0;
const equal=(actual,expected,message)=>{assert.deepEqual(actual,expected,message);checks++;};
const group=async(table,n)=> (await db.query(`select job_group from ${table} where ${table==='profiles'?'user_id':'id'}='${id(n)}'`)).rows[0]?.job_group;
try{
  await db.exec(`create table profiles(user_id uuid primary key,name text,dept text,job_group text);
    create table schedule_people(id uuid primary key,profile_user_id uuid,name text,department text,job_group text);
    create table contracts(id bigint primary key,user_id uuid,status text,fields jsonb);
    create table hub_ui_texts(key text primary key,value text);
    insert into profiles values
      ('${id(1)}','권은영','진료실',null),('${id(2)}','김수란','진료실',null),('${id(3)}','김수란','진료실',null),
      ('${id(4)}','신동광','데스크',null),('${id(5)}','유혜민','데스크','lab'),('${id(6)}','이지훈','Dr.',null),
      ('${id(7)}','Bakirova Meerim','데스크',null),('${id(8)}','bakirova','데스크',null),('${id(9)}','임은숙','진료실',null);
    insert into schedule_people values
      ('${id(101)}','${id(1)}','권은영','진료실',null),('${id(102)}',null,'김수연','진료실',null),
      ('${id(103)}',null,'김수연','진료실',null),('${id(104)}','${id(4)}','신동광','데스크',null),
      ('${id(105)}','${id(5)}','유혜민','데스크','lab'),('${id(106)}','${id(6)}','이지훈','Dr.',null),
      ('${id(107)}','${id(7)}','Bakirova Meerim','데스크',null),('${id(108)}',null,'bakirova','데스크',null),
      ('${id(109)}','${id(9)}','임은숙','Dr.',null);`);
  if(!process.argv.includes('--baseline'))await db.exec(read('p7_job_group_backfill_20261003.sql'));
  equal(await group('profiles',1),'clinical_consult','unique exact name is filled');
  equal(await group('schedule_people',101),'clinical_consult','linked roster also filled');
  equal(await group('profiles',2),null,'duplicate profile untouched');
  equal(await group('profiles',3),null,'all duplicate rows untouched');
  equal(await group('schedule_people',102),null,'duplicate roster untouched');
  equal(await group('schedule_people',103),null,'all duplicate roster rows untouched');
  equal(await group('profiles',4),'sterilization_admin','confirmed name wins over legacy desk department');
  equal(await group('schedule_people',104),'sterilization_admin','same confirmed value on roster');
  equal(await group('profiles',5),'lab','existing classification preserved');
  equal(await group('profiles',6),null,'doctor department untouched');
  equal(await group('profiles',9),null,'profile linked to Dr stays separate');
  equal(await group('profiles',7),'desk','exact full Meerim name accepted');
  equal(await group('profiles',8),null,'partial/lowercase name never guessed');
  equal(await group('schedule_people',108),null,'partial/lowercase roster name untouched');
  await db.exec(read('p7_job_group_backfill_20261003.sql'));
  equal((await db.query('select count(*)::int n from p7_job_group_backup_20261003')).rows[0].n,6,'rerun does not replace original backups');
  await db.exec(`update profiles set job_group='desk' where user_id='${id(1)}'`);
  await db.exec(read('p7_job_group_backfill_20261003_rollback.sql'));
  equal(await group('profiles',1),'desk','rollback preserves later manual change');
  equal(await group('profiles',4),null,'rollback restores empty original');
  equal(await group('schedule_people',101),null,'rollback restores roster original');
  equal(await group('profiles',5),'lab','rollback leaves preexisting groups');

  await db.exec(`insert into profiles values
    ('${id(20)}','계약직원','진료실',null),('${id(21)}','기존직무','데스크','desk'),
    ('${id(22)}','Dr계약','Dr.',null),('${id(23)}','설정직무','진료실',null),
    ('${id(24)}','서명직원','진료실',null),('${id(25)}','미확인직무','진료실',null),
    ('${id(26)}','실패계약','진료실',null),('${id(27)}','중복설정','진료실',null);`);
  if(!process.argv.includes('--baseline-contract'))await db.exec(read('p7_contract_job_group_20261003.sql'));
  const add=async(n,status,fields)=>db.query('insert into contracts values($1,$2,$3,$4)',[n,id(n),status,JSON.stringify(fields)]);
  await add(20,'발송요청',{직종:'위생사'});equal(await group('profiles',20),null,'request is not final send');
  await db.exec("update contracts set status='대기' where id=20");equal(await group('profiles',20),'clinical_consult','send transition fills blank');
  await add(21,'대기',{직무:'기공'});equal(await group('profiles',21),'desk','conflicting existing value preserved');
  await add(22,'대기',{직무:'기공'});equal(await group('profiles',22),null,'contract never classifies Dr');
  await db.exec("insert into hub_ui_texts values('contract_job.alias_lab','보철제작')");
  await add(23,'대기',{직종:'보철제작'});equal(await group('profiles',23),'lab','owner editable alias read by backend');
  await add(24,'발송요청',{직무:'소독·행정'});
  await db.exec("update contracts set status='서명완료' where id=24");equal(await group('profiles',24),'sterilization_admin','sign completion also fills blank');
  await add(25,'대기',{직종:'알 수 없는 직종'});equal(await group('profiles',25),null,'unknown title not guessed');
  await db.exec("insert into hub_ui_texts values('contract_job.alias_desk','위생사')");
  await add(27,'대기',{직종:'위생사'});equal(await group('profiles',27),null,'ambiguous configured alias not guessed');
  await db.exec(read('p7_contract_job_group_20261003.sql'));
  equal((await db.query("select count(*)::int n from pg_trigger where tgname='p7_contract_job_group_sync'")).rows[0].n,1,'repeat migration keeps a single trigger');
  await db.exec("update contracts set status='서명완료' where id=21");
  equal(await group('profiles',21),'desk','sign completion also preserves a conflicting existing value');
  await db.exec(`insert into profiles values('${id(28)}','별칭교체','진료실',null),('${id(29)}','직원서명','진료실',null)`);
  await add(28,'대기',{직종:'기공'});equal(await group('profiles',28),null,'replacing aliases disables old title matching');
  await add(29,'발송요청',{직무:'소독·행정'});
  await db.exec('create role p7_test_staff; grant select,update on contracts to p7_test_staff; grant select on profiles to p7_test_staff; set role p7_test_staff;');
  await assert.rejects(db.exec(`update profiles set job_group='desk' where user_id='${id(29)}'`),/permission denied/i);checks++;
  await db.exec("update contracts set status='서명완료' where id=29; reset role;");
  equal(await group('profiles',29),'sterilization_admin','employee signing can trigger the fill without direct profile update privilege');
  await db.exec("begin; insert into contracts values(26,'"+id(26)+"','대기','{\"job_group\":\"lab\"}'); rollback;");
  equal(await group('profiles',26),null,'failed/rolled back contract cannot leave profile mutation');
  await db.exec(read('p7_contract_job_group_20261003_rollback.sql'));
  equal(await group('profiles',20),'clinical_consult','contract rollback does not erase staff classification');
  await add(26,'대기',{job_group:'lab'});equal(await group('profiles',26),null,'rollback removes automatic propagation');
  console.log(`PASS ${checks} PGlite assertions (exact-name backfill, repeat, conditional rollback, send/sign, aliases, Dr, unknown, conflict, atomic rollback)`);
}finally{await db.close()}
