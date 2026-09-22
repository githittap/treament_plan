// 회원가입 승인제 게이트 패치 시험: 신규 가입자가 자기 미승인 profiles 행만 만들 수 있고,
// approved=true·role 상승으로는 만들 수 없으며, 미승인자는 다른 표에 여전히 접근하지 못하는지 확인한다.
// 실행: PGLITE_PACKAGE_ROOT=<pglite> node tests/sql/pglite-signup-approval-gate.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';

const root = process.env.PGLITE_PACKAGE_ROOT;
if (!root) throw new Error('PGLITE_PACKAGE_ROOT is required');
const {PGlite} = await import(pathToFileURL(path.join(root, 'dist/index.js')).href);
const patch = fs.readFileSync(path.resolve('db/signup_approval_gate_patch.sql'), 'utf8');
const undo = fs.readFileSync(path.resolve('db/signup_approval_gate_patch_rollback.sql'), 'utf8');

const owner = '11111111-1111-1111-1111-111111111111';
const staff = '22222222-2222-2222-2222-222222222222';
const newbie = '33333333-3333-3333-3333-333333333333';
const hacker = '44444444-4444-4444-4444-444444444444';
const hired = '55555555-5555-5555-5555-555555555555';

// 운영 "적용 전" 상태 재현: phase A 컬럼 + phase B 게이트 + phase C 권한(profiles UPDATE/DELETE 없음).
const before = `
create role anon;create role authenticated;create schema auth;
create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('app.test_uid',true),'')::uuid$$;
create table public.profiles(user_id uuid primary key,name text not null,role text not null default 'staff' check(role in('owner','chief','manager','staff')),dept text,fp_id text,active boolean not null default true,approved boolean not null default false,employment_status text not null default '재직' check(employment_status in('재직','자진퇴사','계약만료','권고사직')),account_access_status text not null default '활성' check(account_access_status in('활성','차단')));
create table public.schedules(id bigint generated always as identity primary key,memo text);
create table public.leave_requests(id bigint generated always as identity primary key,user_id uuid,memo text);
create function public.employee_hub_access_allowed() returns boolean language sql stable security definer set search_path='' as $$select exists(select 1 from public.profiles p where p.user_id=auth.uid() and p.active and p.approved and p.account_access_status='활성')$$;
create function public.my_role() returns text language sql stable security definer set search_path='' as $$select case when public.employee_hub_access_allowed() then coalesce((select p.role from public.profiles p where p.user_id=auth.uid()),'staff') else 'pending' end$$;
revoke all on function public.employee_hub_access_allowed(),public.my_role() from public,anon;
grant usage on schema auth to authenticated;grant execute on function auth.uid(),public.employee_hub_access_allowed(),public.my_role() to authenticated;
grant select,insert on public.profiles to authenticated;
grant select,insert,update,delete on public.schedules,public.leave_requests to authenticated;
alter table public.profiles enable row level security;alter table public.schedules enable row level security;alter table public.leave_requests enable row level security;
create policy employee_hub_access_gate on public.profiles as restrictive for all to authenticated using(public.employee_hub_access_allowed()) with check(public.employee_hub_access_allowed());
create policy employee_hub_access_gate on public.schedules as restrictive for all to authenticated using(public.employee_hub_access_allowed()) with check(public.employee_hub_access_allowed());
create policy employee_hub_access_gate on public.leave_requests as restrictive for all to authenticated using(public.employee_hub_access_allowed()) with check(public.employee_hub_access_allowed());
create policy profiles_select_authenticated on public.profiles for select to authenticated using(true);
create policy profiles_insert_self on public.profiles for insert to authenticated with check(user_id = auth.uid() and role = 'staff');
create policy profiles_insert_owner on public.profiles for insert to authenticated with check(public.my_role() = 'owner');
create policy schedules_baseline on public.schedules for all to authenticated using(true) with check(true);
create policy leave_requests_baseline on public.leave_requests for all to authenticated using(true) with check(true);
insert into public.profiles(user_id,name,role,active,approved) values('${owner}','원장','owner',true,true),('${staff}','직원','staff',true,true);
insert into public.schedules(memo) values('보존 근무표');
insert into public.leave_requests(user_id,memo) values('${staff}','보존 연차');
`;

async function fresh(extra = '') {
  const db = new PGlite();
  const q = sql => db.query(sql).then(r => r.rows);
  await db.exec(before + extra);
  const as = async uid => { await q('set role authenticated'); await q(`select set_config('app.test_uid','${uid}',false)`); };
  const fails = async (uid, sql) => { let m = ''; try { await q(sql); } catch (e) { m = String(e); await q('rollback').catch(() => {}); } await as(uid); return m; };
  const count = async name => Number((await q(`select count(*)::int n from public.${name}`))[0].n);
  const policies = () => q(`select tablename,policyname,permissive,cmd,array_to_string(roles,',') roles,qual,with_check from pg_policies where schemaname='public' order by tablename,policyname`);
  return {db, q, as, fails, count, policies};
}

const main = await fresh();
try {
  const baseline = await main.policies();
  await main.db.exec(patch);

  // ① 신규 가입자(프로필 없음)가 자기 미승인 staff 행을 만들 수 있다. approved 는 기본값 false.
  await main.as(newbie);
  assert.equal(await main.fails(newbie, `insert into public.profiles(user_id,name,role) values('${newbie}','신입','staff')`), '',
    '① 신규 가입자의 자기 미승인 staff 행 INSERT 는 성공해야 합니다.');
  await main.q('reset role');
  assert.deepEqual((await main.q(`select role,approved,active,account_access_status from public.profiles where user_id='${newbie}'`))[0],
    {role: 'staff', approved: false, active: true, account_access_status: '활성'},
    '① 신규 가입자의 자기 행은 미승인 staff 로 만들어져야 합니다.');

  // ② 승인·권한을 스스로 올려서는 행을 만들 수 없다.
  await main.as(hacker);
  for (const [label, cols, vals] of [
    ['approved=true', 'user_id,name,role,approved', `'${hacker}','침입','staff',true`],
    ["role='chief'", 'user_id,name,role', `'${hacker}','침입','chief'`],
    ["role='owner'", 'user_id,name,role', `'${hacker}','침입','owner'`],
    ["account_access_status='차단'", 'user_id,name,role,account_access_status', `'${hacker}','침입','staff','차단'`],
    ['남의 user_id', 'user_id,name,role', `'${newbie}','도용','staff'`],
  ]) {
    assert.match(await main.fails(hacker, `insert into public.profiles(${cols}) values(${vals})`), /row-level security/,
      `② ${label} 로는 자기 행을 만들 수 없어야 합니다.`);
  }
  await main.q('reset role');
  assert.equal((await main.q(`select count(*)::int n from public.profiles where user_id='${hacker}'`))[0].n, 0);

  // ③ 미승인자는 다른 표를 여전히 못 읽고 못 쓴다.
  await main.as(newbie);
  assert.equal(await main.count('schedules'), 0, '③ 미승인자에게 schedules 가 보이면 안 됩니다.');
  assert.equal(await main.count('leave_requests'), 0, '③ 미승인자에게 leave_requests 가 보이면 안 됩니다.');
  assert.match(await main.fails(newbie, `insert into public.schedules(memo) values('미승인 쓰기')`), /row-level security/, '③ 미승인자의 schedules 쓰기는 막혀야 합니다.');
  assert.match(await main.fails(newbie, `insert into public.leave_requests(user_id,memo) values('${newbie}','미승인 연차')`), /row-level security/, '③ 미승인자의 leave_requests 쓰기는 막혀야 합니다.');
  assert.equal(await main.count('profiles'), 0, '③ 미승인자에게 profiles 목록이 보이면 안 됩니다.');

  // ⑤ 미승인자는 자기 profiles 행을 UPDATE 로 승인할 수 없다.
  assert.match(await main.fails(newbie, `update public.profiles set approved=true where user_id='${newbie}'`), /permission denied/,
    '⑤ 미승인자의 자기 행 UPDATE 는 막혀야 합니다.');

  // ④ 승인된 직원·원장 동작은 그대로다.
  await main.as(staff);
  assert.equal(await main.count('schedules'), 1, '④ 승인 직원은 schedules 를 읽어야 합니다.');
  assert.equal(await main.count('leave_requests'), 1, '④ 승인 직원은 leave_requests 를 읽어야 합니다.');
  await main.q(`insert into public.schedules(memo) values('승인 직원 쓰기')`);
  assert.equal(await main.count('schedules'), 2);
  await main.as(owner);
  assert.equal(await main.count('profiles'), 3, '④ 원장은 profiles 전체를 읽어야 합니다.');
  await main.q(`insert into public.profiles(user_id,name,role,approved) values('${hired}','실장','chief',true)`);
  assert.equal(await main.count('profiles'), 4, '④ 원장은 승인된 chief 행을 만들 수 있어야 합니다.');
  await main.q('reset role');

  // ⑥ 두 번 적용해도 같은 상태(멱등).
  const applied = await main.policies();
  await main.db.exec(patch);
  assert.deepEqual(await main.policies(), applied, '⑥ 패치를 두 번 적용하면 상태가 같아야 합니다.');

  // ⑦ 되돌리기로 원래 정책 정의가 정확히 복원된다.
  await main.db.exec(undo);
  assert.deepEqual(await main.policies(), baseline, '⑦ 되돌리기 뒤 정책 정의가 적용 전과 같아야 합니다.');
  await main.db.exec(undo);
  assert.deepEqual(await main.policies(), baseline, '⑦ 되돌리기를 두 번 해도 상태가 같아야 합니다.');
} finally {
  await main.db.close();
}

// ⑤-추가: profiles UPDATE 권한이 있더라도 게이트 using 이 미승인자의 자기 행 UPDATE 를 막는다.
const grantedUpdate = await fresh('grant update on public.profiles to authenticated;');
try {
  await grantedUpdate.db.exec(patch);
  await grantedUpdate.as(newbie);
  await grantedUpdate.q(`insert into public.profiles(user_id,name,role) values('${newbie}','신입','staff')`);
  assert.equal(Number((await grantedUpdate.q(`update public.profiles set approved=true where user_id='${newbie}' returning 1`)).length), 0,
    '⑤ 게이트 using 이 미승인자의 자기 행 UPDATE 를 0행으로 막아야 합니다.');
  await grantedUpdate.q('reset role');
  assert.equal((await grantedUpdate.q(`select approved from public.profiles where user_id='${newbie}'`))[0].approved, false);
} finally {
  await grantedUpdate.db.close();
}

// ⑥-추가: 드리프트(예상과 다른 정책 정의)면 패치가 멈춘다.
for (const [label, tamper] of [
  ['게이트 check 변경', `drop policy employee_hub_access_gate on public.profiles;create policy employee_hub_access_gate on public.profiles as restrictive for all to authenticated using(public.employee_hub_access_allowed()) with check(true);`],
  ['게이트 using 변경', `drop policy employee_hub_access_gate on public.profiles;create policy employee_hub_access_gate on public.profiles as restrictive for all to authenticated using(true) with check(public.employee_hub_access_allowed());`],
  ['insert_self check 변경', `drop policy profiles_insert_self on public.profiles;create policy profiles_insert_self on public.profiles for insert to authenticated with check(user_id = auth.uid());`],
  ['select 정책 변경', `drop policy profiles_select_authenticated on public.profiles;create policy profiles_select_authenticated on public.profiles for select to authenticated using(public.employee_hub_access_allowed());`],
  ['UPDATE 정책 추가', `create policy profiles_update_self on public.profiles for update to authenticated using(user_id = auth.uid()) with check(user_id = auth.uid());`],
  ['게이트 없음', `drop policy employee_hub_access_gate on public.profiles;`],
]) {
  const drifted = await fresh(tamper);
  try {
    let stopped = '';
    try { await drifted.db.exec(patch); } catch (e) { stopped = String(e); }
    assert.match(stopped, /drift|required/, `⑥ 드리프트(${label}) 면 패치가 멈춰야 합니다.`);
  } finally { await drifted.db.close(); }
}

// ⑥-추가: 되돌리기도 드리프트면 멈춘다.
const undoDrift = await fresh(`drop policy profiles_insert_self on public.profiles;create policy profiles_insert_self on public.profiles for insert to authenticated with check(user_id = auth.uid());`);
try {
  let stopped = '';
  try { await undoDrift.db.exec(undo); } catch (e) { stopped = String(e); }
  assert.match(stopped, /drift|required/, '⑥ 되돌리기도 드리프트면 멈춰야 합니다.');
} finally { await undoDrift.db.close(); }

// 다른 표의 게이트는 건드리지 않는다.
const untouched = await fresh();
try {
  const gatesBefore = await untouched.q(`select tablename,qual,with_check from pg_policies where policyname='employee_hub_access_gate' and tablename<>'profiles' order by tablename`);
  await untouched.db.exec(patch);
  assert.deepEqual(await untouched.q(`select tablename,qual,with_check from pg_policies where policyname='employee_hub_access_gate' and tablename<>'profiles' order by tablename`), gatesBefore,
    'profiles 외 다른 표의 게이트는 그대로여야 합니다.');
} finally { await untouched.db.close(); }

console.log('PGLITE_SIGNUP_APPROVAL_GATE_PASS: 미승인 자기행-insert/승인·권한상승-차단/타표-차단/승인자-정상/self-update-차단/멱등·드리프트-정지/되돌리기-복원');
