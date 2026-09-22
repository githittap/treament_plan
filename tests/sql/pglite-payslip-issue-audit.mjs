import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';

const root=process.cwd(),pkg=process.env.PGLITE_PACKAGE_ROOT;
if(!pkg)throw new Error('PGLITE_PACKAGE_ROOT required');
const {PGlite}=await import(pathToFileURL(path.join(pkg,'dist/index.js')).href),db=new PGlite(),q=s=>db.query(s).then(x=>x.rows);
const owner='11111111-1111-1111-1111-111111111111',staff='22222222-2222-2222-2222-222222222222',
  otherStaff='33333333-3333-3333-3333-333333333333',blockedStaff='44444444-4444-4444-4444-444444444444';
const setUser=async id=>db.exec(`set role authenticated;select set_config('app.test_uid','${id}',false);`);
try{
  // profiles/my_role()/employee_hub_access_allowed()는 employment_status_access_block_phase_b.sql의
  // 실제 정의를 그대로 복제한 최소 하네스다. payslips 표·정책 3종은 hr_schema.sql/hr_policies.sql이
  // 이미 프로덕션에 적용해 둔 것과 동일하게(2026-09-22 supabase-full로 직접 대조 확인) 여기서 재현한다 —
  // 이 마이그레이션이 그 위에 issued_by 한 칸만 얹는다는 전제를 검증하기 위해서다.
  await db.exec(`
    create role anon;create role authenticated;create role service_role;
    create schema auth;
    create or replace function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('app.test_uid',true),'')::uuid$$;
    grant usage on schema auth to authenticated;grant execute on function auth.uid() to authenticated;
    create table auth.users(id uuid primary key);
    create table public.profiles(user_id uuid primary key,role text,active boolean default true,approved boolean default true,account_access_status text default '활성');
    create or replace function public.employee_hub_access_allowed() returns boolean language sql stable security definer as
      $$select exists(select 1 from public.profiles p where p.user_id=auth.uid() and p.active and p.approved and p.account_access_status='활성')$$;
    create or replace function public.my_role() returns text language sql stable security definer as
      $$select case when public.employee_hub_access_allowed() then coalesce((select p.role from public.profiles p where p.user_id=auth.uid()),'staff') else 'pending' end$$;
    create table public.payslips(
      id bigint generated always as identity primary key,
      month text not null, user_id uuid not null, html text,
      issued boolean not null default false, issued_at timestamptz,
      unique (month, user_id)
    );
    alter table public.payslips enable row level security;
    create policy employee_hub_access_gate on public.payslips as restrictive for all to authenticated
      using(public.employee_hub_access_allowed()) with check(public.employee_hub_access_allowed());
    create policy payslips_select_scoped on public.payslips for select to authenticated
      using (public.my_role()='owner' or (user_id=auth.uid() and issued=true));
    create policy payslips_insert_owner on public.payslips for insert to authenticated
      with check (public.my_role()='owner');
    create policy payslips_update_owner on public.payslips for update to authenticated
      using (public.my_role()='owner') with check (public.my_role()='owner');
    grant usage on schema public to authenticated;
    grant select,insert,update on public.payslips to authenticated;
  `);

  const migration=fs.readFileSync(path.join(root,'db/payslip_issue_audit_draft.sql'),'utf8');
  await db.exec(migration);await db.exec(migration); // 두 번 실행해도 안전(멱등)해야 한다

  const cols=await q("select column_name,is_nullable from information_schema.columns where table_schema='public' and table_name='payslips' and column_name='issued_by'");
  assert.equal(cols.length,1);assert.equal(cols[0].is_nullable,'YES');

  await db.exec('reset role;');
  await q(`insert into auth.users values ('${owner}'),('${staff}'),('${otherStaff}'),('${blockedStaff}')`);
  await q(`insert into public.profiles values
    ('${owner}','owner',true,true,'활성'),
    ('${staff}','staff',true,true,'활성'),
    ('${otherStaff}','staff',true,true,'활성'),
    ('${blockedStaff}','staff',true,true,'차단')`);

  // 직원은 자기 명세서를 insert/issue 할 수 없다 (owner 전용)
  await setUser(staff);
  await assert.rejects(q(`insert into public.payslips(month,user_id,html,issued) values('2026-08','${staff}','<div>x</div>',false)`),/row-level security/);
  await db.exec('rollback');

  // owner가 초안(미발행) 생성
  await setUser(owner);
  const draft=(await q(`insert into public.payslips(month,user_id,html,issued) values('2026-08','${staff}','<div>초안</div>',false) returning id`))[0];

  // 미발행 상태에서는 본인도 못 본다
  await setUser(staff);
  assert.equal((await q('select * from public.payslips')).length,0);

  // owner가 issued_by와 함께 발행(잠금)
  await setUser(owner);
  await q(`update public.payslips set issued=true,issued_at=now(),issued_by='원장',html='<div>발행본</div>' where id=${draft.id}`);
  const issued=(await q(`select issued,issued_by,html from public.payslips where id=${draft.id}`))[0];
  assert.equal(issued.issued,true);assert.equal(issued.issued_by,'원장');assert.equal(issued.html,'<div>발행본</div>');

  // owner는 다른 직원 몫도 함께 발행해 전체를 본다
  await q(`insert into public.payslips(month,user_id,html,issued,issued_by,issued_at) values('2026-08','${otherStaff}','<div>b</div>',true,'원장',now())`);
  assert.equal((await q('select * from public.payslips')).length,2);

  // 본인은 발행된 자기 것만 본다
  await setUser(staff);
  const mine=await q('select month,user_id,issued_by from public.payslips');
  assert.equal(mine.length,1);assert.equal(mine[0].user_id,staff);assert.equal(mine[0].issued_by,'원장');

  // 남의 명세서는 발행돼도 안 보인다
  assert.equal((await q(`select * from public.payslips where user_id='${otherStaff}'`)).length,0);

  // 직원은 자기 것도 수정(재발행·issued_by 조작 등) 못 한다 — update의 USING이 막으면
  // 에러가 아니라 "0행 갱신"으로 조용히 무시되므로, 영향행 0건 + 값 불변을 함께 확인한다.
  await setUser(staff);
  const tamper=await q(`update public.payslips set issued_by='내가 발행' where id=${draft.id} returning id`);
  assert.equal(tamper.length,0);
  await setUser(owner);
  assert.equal((await q(`select issued_by from public.payslips where id=${draft.id}`))[0].issued_by,'원장');

  // 차단된 계정은 이중 방어(employee_hub_access_gate)로 자기 발행분도 못 본다
  await setUser(blockedStaff);
  assert.equal((await q('select * from public.payslips')).length,0);

  // owner는 항상 전체를 본다(issued 여부 무관)
  await setUser(owner);
  await q(`insert into public.payslips(month,user_id,html,issued) values('2026-09','${staff}','<div>c</div>',false)`);
  assert.equal((await q('select * from public.payslips')).length,3);

  // 롤백: issued_by 컬럼만 제거되고 표·데이터·기존 정책은 남는다
  await db.exec('reset role;');
  const rollback=fs.readFileSync(path.join(root,'db/payslip_issue_audit_rollback.sql'),'utf8');
  await db.exec(rollback);await db.exec(rollback); // 멱등
  assert.equal((await q("select count(*)::int n from information_schema.columns where table_schema='public' and table_name='payslips' and column_name='issued_by'"))[0].n,0);
  assert.equal((await q("select to_regclass('public.payslips') is not null still_here"))[0].still_here,true);
  assert.equal((await q('select count(*)::int n from public.payslips'))[0].n,3);
  assert.equal((await q("select count(*)::int n from pg_policies where tablename='payslips'"))[0].n,4);

  console.log('PGLITE_PAYSLIP_ISSUE_AUDIT_PASS');
}finally{await db.close();}
