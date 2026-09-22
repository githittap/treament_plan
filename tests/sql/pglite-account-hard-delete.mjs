// 퇴사자 로그인 계정 영구 삭제(하드 삭제) 마이그레이션 시험.
// 실제 auth.users 표(가짜)를 두고 검증한다 — 다른 pglite 시험들은 auth.uid() 함수만 흉내내지만,
// 이 시험은 "auth.users 행을 지워도 profiles와 그 자식 행이 살아남는지"가 핵심이라 진짜 FK가 필요하다.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const packageRoot = process.env.PGLITE_PACKAGE_ROOT;
if (!packageRoot) throw new Error('PGLITE_PACKAGE_ROOT is required');
const { PGlite } = await import(pathToFileURL(path.join(packageRoot, 'dist/index.js')).href);

const read = name => fs.readFileSync(path.resolve('db', name), 'utf8');
const phaseA = read('employment_status_access_block_phase_a.sql');
const phaseB = read('employment_status_access_block_phase_b.sql');
const migration = read('account_hard_delete_draft.sql');
const rollback = read('account_hard_delete_rollback.sql');

const owner = '11111111-1111-1111-1111-111111111111';
const owner2 = '66666666-6666-6666-6666-666666666666';
const nonOwnerCaller = '77777777-7777-7777-7777-777777777777';
const unblockedStaff = '88888888-8888-8888-8888-888888888888';
const target = '22222222-2222-2222-2222-222222222222';
const targetName = '김직원';

// base(): auth.users/profiles(기본 칼럼만)/schedule_people/attendance/leave_requests/consultation_inbox/consultation_journals까지
// 만들고 시드를 넣는다. profilesFk로 profiles.user_id의 FK 정의를 바꿔치기할 수 있게 해 "예상과 다른 FK" 음성 시험에 재사용한다.
function base(profilesFk = 'references auth.users(id) on delete cascade') {
  return `
create role anon; create role authenticated; create role service_role;
create schema auth; create schema storage;
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('app.test_uid',true),'')::uuid $$;
create table auth.users(id uuid primary key, email text);
create table storage.objects(bucket_id text, name text);
create table public.profiles(
  user_id uuid primary key ${profilesFk},
  name text not null,
  role text not null default 'staff',
  active boolean not null default true,
  approved boolean not null default true
);
create table public.schedule_people(profile_user_id uuid primary key, active boolean not null default true, included_in_schedule boolean not null default true);
create table public.attendance(id bigint generated always as identity primary key, user_id uuid not null references public.profiles(user_id) on delete cascade, work_date date not null);
create table public.leave_requests(id bigint generated always as identity primary key, user_id uuid not null, date_from date not null);
create table public.consultation_inbox(id uuid primary key, created_by uuid references auth.users(id), message text not null);
create table public.consultation_journals(id uuid primary key, author_id uuid not null references auth.users(id), note text not null);
alter table public.profiles enable row level security;
create policy profiles_test_select on public.profiles for select to authenticated using (true);
grant usage on schema auth, storage to authenticated;
grant execute on function auth.uid() to authenticated;
grant select on public.profiles to authenticated;
insert into auth.users(id, email) values
  ('${owner}','owner@example.com'),('${owner2}','owner2@example.com'),
  ('${nonOwnerCaller}','manager@example.com'),('${unblockedStaff}','staff@example.com'),
  ('${target}','target@example.com');
insert into public.profiles(user_id, name, role, active, approved) values
  ('${owner}','원장','owner',true,true),
  ('${owner2}','부원장','owner',true,true),
  ('${nonOwnerCaller}','실장','manager',true,true),
  ('${unblockedStaff}','재직직원','staff',true,true),
  ('${target}','${targetName}','staff',true,true);
insert into public.attendance(user_id, work_date) values ('${target}','2026-09-01');
insert into public.leave_requests(user_id, date_from) values ('${target}','2026-09-01');
insert into public.consultation_inbox(id, created_by, message) values ('aaaaaaaa-0000-0000-0000-000000000001','${target}','상담 메모');
insert into public.consultation_journals(id, author_id, note) values ('aaaaaaaa-0000-0000-0000-000000000002','${target}','상담 일지');
`;
}

// 실제 disable_employee_account_preserve_records가 하는 것과 같은 모양으로 target을 "이미 차단된 퇴사자"로 만든다
// (그 RPC 자체를 부르지 않고 직접 UPDATE하는 이유: schedule_people 연동 등 이 시험과 무관한 표면을 늘리지 않기 위함).
const blockTarget = `
update public.profiles set employment_status='자진퇴사', employment_effective_date='2026-09-01',
  account_access_status='차단', account_disabled_at=now(), account_disabled_by='${owner}',
  active=false, approved=false where user_id='${target}';
`;

async function fresh(extraSql, profilesFk) {
  const d = new PGlite();
  const q = sql => d.query(sql).then(r => r.rows);
  await d.exec(base(profilesFk) + phaseA + phaseB + extraSql);
  return { d, q };
}

const asOwner = q => q(`select set_config('app.test_uid','${owner}',false)`);
const asTarget = q => q(`select set_config('app.test_uid','${target}',false)`);

async function main() {
  // ---- 1) 본 흐름: 마이그레이션 적용 -> 가드 거절들 -> 실제 auth.users 삭제 -> profiles/자식 행 보존 -> 기록 -> RLS 차단 유지 -> 롤백 거절 ----
  const { d, q } = await fresh(blockTarget + migration);
  try {
    await q('grant execute on function public.assert_can_hard_delete_account(uuid,text), public.record_account_hard_deleted(uuid) to authenticated');

    // 마이그레이션이 profiles_user_id_fkey 등 auth.users FK 세 개를 끊었는지 먼저 확인한다.
    assert.equal((await q("select count(*)::int n from pg_constraint where conrelid='public.profiles'::regclass and conname='profiles_user_id_fkey'"))[0].n, 0, 'profiles_user_id_fkey가 남아있음');
    assert.equal((await q("select count(*)::int n from pg_constraint where conrelid='public.consultation_inbox'::regclass and conname='consultation_inbox_created_by_fkey'"))[0].n, 0, 'consultation_inbox FK가 남아있음');
    assert.equal((await q("select count(*)::int n from pg_constraint where conrelid='public.consultation_journals'::regclass and conname='consultation_journals_author_id_fkey'"))[0].n, 0, 'consultation_journals FK가 남아있음');

    // 가드 거절들(어느 것도 상태를 바꾸지 않는다) — RPC는 authenticated 세션에서만 의미가 있으므로 set role로 전환한다.
    await q('set role authenticated');
    await asTarget(q); // 차단된 계정이 호출자면: employee hub access 자체가 없다.
    await assert.rejects(q(`select public.assert_can_hard_delete_account('${unblockedStaff}','재직직원')`), /employee hub access required/);
    await asOwner(q);
    await assert.rejects(q(`select public.assert_can_hard_delete_account('${owner}','원장')`), /cannot change your own employment status/, '본인 대상 거절 안 됨');
    await q('reset role');
    await q(`select set_config('app.test_uid','${nonOwnerCaller}',false)`);
    await q('set role authenticated');
    await assert.rejects(q(`select public.assert_can_hard_delete_account('${target}','${targetName}')`), /active approved owner required/, '원장 아닌 호출자 거절 안 됨');
    await q('reset role');
    await asOwner(q);
    await q('set role authenticated');
    await assert.rejects(q(`select public.assert_can_hard_delete_account('${unblockedStaff}','재직직원')`), /account must be blocked before hard delete/, '차단 안 된 대상 거절 안 됨');
    await assert.rejects(q(`select public.assert_can_hard_delete_account('${owner2}','부원장')`), /owner account cannot be hard-deleted/, '원장 대상 거절 안 됨');
    await assert.rejects(q(`select public.assert_can_hard_delete_account('${target}','다른이름')`), /confirmation name mismatch/, '확인 문구 불일치 거절 안 됨');

    // 사전 검증 통과 확인(아직 아무것도 지우지 않았다).
    const okRow = await q(`select public.assert_can_hard_delete_account('${target}','${targetName}') actor`);
    assert.equal(okRow[0].actor, owner);
    await q('reset role');

    assert.equal((await q(`select count(*)::int n from auth.users where id='${target}'`))[0].n, 1, '아직 auth.users에 남아있어야 함');

    // 실제 삭제는 서비스 롤(=여기서는 테이블 소유자) 권한으로 한다 — GoTrue 관리자 API가 하는 일을 흉내낸다.
    await q(`delete from auth.users where id='${target}'`);

    assert.equal((await q(`select count(*)::int n from auth.users where id='${target}'`))[0].n, 0, 'auth.users 행이 지워지지 않음');
    assert.equal((await q(`select count(*)::int n from public.profiles where user_id='${target}'`))[0].n, 1, 'profiles 행이 함께 지워짐(안 돼야 함)');
    assert.equal((await q(`select count(*)::int n from public.attendance where user_id='${target}'`))[0].n, 1, 'attendance 행이 함께 지워짐(안 돼야 함)');
    assert.equal((await q(`select count(*)::int n from public.leave_requests where user_id='${target}'`))[0].n, 1, 'leave_requests 행이 함께 지워짐(안 돼야 함)');
    assert.equal((await q(`select count(*)::int n from public.consultation_inbox where created_by='${target}'`))[0].n, 1, 'consultation_inbox 행이 함께 지워짐(안 돼야 함)');
    assert.equal((await q(`select count(*)::int n from public.consultation_journals where author_id='${target}'`))[0].n, 1, 'consultation_journals 행이 함께 지워짐(안 돼야 함)');

    // 기록 RPC: profiles.auth_deleted_at/by + profile_employment_history에 계정영구삭제 한 줄.
    await q('set role authenticated');
    await asOwner(q);
    await q(`select public.record_account_hard_deleted('${target}')`);
    await q('reset role');
    const marked = await q(`select auth_deleted_at is not null as deleted, auth_deleted_by from public.profiles where user_id='${target}'`);
    assert.equal(marked[0].deleted, true);
    assert.equal(marked[0].auth_deleted_by, owner);
    const hist = await q(`select acted_by, to_status, from_status from public.profile_employment_history where user_id='${target}' and account_action='계정영구삭제'`);
    assert.equal(hist.length, 1, '계정영구삭제 이력이 정확히 한 줄 남아야 함');
    assert.equal(hist[0].acted_by, owner);
    assert.equal(hist[0].to_status, '자진퇴사');

    // 다시 지우려 하면 막힌다.
    await q('set role authenticated');
    await assert.rejects(q(`select public.assert_can_hard_delete_account('${target}','${targetName}')`), /account already hard-deleted/);
    await q('reset role');

    // RLS: 삭제된 계정은(이미 차단 상태였으므로) 여전히 자기 프로필을 못 본다 — employee_hub_access_gate가 계속 막는다.
    await q('set role authenticated');
    await asTarget(q);
    assert.equal((await q(`select count(*)::int n from public.profiles where user_id='${target}'`))[0].n, 0, '차단·삭제된 계정이 자기 프로필을 볼 수 있으면 안 됨');
    await asOwner(q);
    assert.equal((await q(`select count(*)::int n from public.profiles where user_id='${target}'`))[0].n, 1, '원장은 여전히 조회 가능해야 함(게이트가 전부 막은 게 아님을 확인)');
    await q('reset role');

    // 롤백: 실제 하드 삭제가 있었으므로 막혀야 한다.
    await assert.rejects(d.exec(rollback), /이미 하드 삭제가 실행됐다/);

    console.log('PGLITE_ACCOUNT_HARD_DELETE_PASS: FK 제거/가드 거절/실삭제 후 보존/기록/RLS 차단 유지/하드삭제후 롤백거절');
  } finally {
    await d.close();
  }

  // ---- 2) 깨끗한 롤백: 하드 삭제를 한 번도 하지 않은 상태에서는 제약조건이 정확히 원래대로 돌아온다 ----
  {
    const { d: d2, q: q2 } = await fresh(migration);
    try {
      await d2.exec(rollback);
      assert.equal((await q2("select column_name from information_schema.columns where table_schema='public' and table_name='profiles' and column_name in ('auth_deleted_at','auth_deleted_by')")).length, 0, '롤백 후 auth_deleted_* 칼럼이 남아있음');
      assert.equal((await q2("select to_regprocedure('public.assert_can_hard_delete_account(uuid,text)') r"))[0].r, null);
      assert.equal((await q2("select to_regprocedure('public.record_account_hard_deleted(uuid)') r"))[0].r, null);

      const fkDefs = await q2(`
        select conname, pg_get_constraintdef(oid) def from pg_constraint
        where (conrelid='public.profiles'::regclass and conname='profiles_user_id_fkey')
           or (conrelid='public.consultation_inbox'::regclass and conname='consultation_inbox_created_by_fkey')
           or (conrelid='public.consultation_journals'::regclass and conname='consultation_journals_author_id_fkey')
        order by conname`);
      const byName = Object.fromEntries(fkDefs.map(r => [r.conname, r.def]));
      assert.equal(byName.profiles_user_id_fkey, 'FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE', '원래 profiles FK로 정확히 복원되지 않음');
      assert.equal(byName.consultation_inbox_created_by_fkey, 'FOREIGN KEY (created_by) REFERENCES auth.users(id)', '원래 consultation_inbox FK로 정확히 복원되지 않음');
      assert.equal(byName.consultation_journals_author_id_fkey, 'FOREIGN KEY (author_id) REFERENCES auth.users(id)', '원래 consultation_journals FK로 정확히 복원되지 않음');

      const checkDef = (await q2("select pg_get_constraintdef(oid) def from pg_constraint where conrelid='public.profile_employment_history'::regclass and conname='profile_employment_history_account_action_check'"))[0].def;
      assert.equal(checkDef, "CHECK ((account_action = ANY (ARRAY['상태변경'::text, '계정차단'::text])))", 'account_action CHECK가 원래대로 좁혀지지 않음');

      // consultation_inbox/consultation_journals FK도 복원됐으므로(NO ACTION) target을 참조하는 행이 남아있으면
      // auth.users 삭제 자체가 막힌다 — 그 복원을 먼저 확인한 뒤, profiles CASCADE만 따로 검증하기 위해 참조 행을 치운다.
      await assert.rejects(q2(`delete from auth.users where id='${target}'`), /consultation_inbox_created_by_fkey/, 'consultation_inbox FK가 복원되지 않음(삭제가 막히지 않음)');
      await q2(`delete from public.consultation_inbox where created_by='${target}'`);
      await assert.rejects(q2(`delete from auth.users where id='${target}'`), /consultation_journals_author_id_fkey/, 'consultation_journals FK가 복원되지 않음(삭제가 막히지 않음)');
      await q2(`delete from public.consultation_journals where author_id='${target}'`);

      // 이제 막을 FK가 없으니 auth.users delete가 다시 profiles를 cascade로 지워야 정상(원래 동작으로 완전히 돌아왔음을 증명).
      await q2(`delete from auth.users where id='${target}'`);
      assert.equal((await q2(`select count(*)::int n from public.profiles where user_id='${target}'`))[0].n, 0, '롤백 후에도 CASCADE가 복원되지 않음');
      console.log('PGLITE_ACCOUNT_HARD_DELETE_ROLLBACK_PASS: 하드삭제 없었으면 제약조건이 원래 정의로 정확히 복원되고 CASCADE도 되살아남');
    } finally {
      await d2.close();
    }
  }

  // ---- 3) 음성 시험: profiles_user_id_fkey 정의가 예상과 다르면(on delete cascade가 아니면) 사전 점검에서 그대로 멈춘다 ----
  {
    const d3 = new PGlite();
    const q3 = sql => d3.query(sql).then(r => r.rows);
    try {
      await d3.exec(base('references auth.users(id) on delete restrict') + phaseA + phaseB);
      let blocked = '';
      try {
        await d3.exec(migration);
      } catch (caught) {
        blocked = String(caught);
      }
      assert.match(blocked, /profiles_user_id_fkey.*다르다|account hard delete preflight/);
      // begin;...commit;로 감싼 마이그레이션이 실패하면 세션이 aborted transaction 상태로 남는다 — 명시적으로 되돌린다.
      await d3.exec('rollback');
      // 트랜잭션이 통째로 롤백됐어야 한다 — FK도, 새 칼럼도 없어야 한다.
      assert.equal((await q3("select count(*)::int n from pg_constraint where conrelid='public.profiles'::regclass and conname='profiles_user_id_fkey'"))[0].n, 1, '실패한 마이그레이션인데 FK가 지워짐');
      assert.equal((await q3("select count(*)::int n from information_schema.columns where table_schema='public' and table_name='profiles' and column_name='auth_deleted_at'"))[0].n, 0, '실패한 마이그레이션인데 칼럼이 추가됨');
      console.log('PGLITE_ACCOUNT_HARD_DELETE_DRIFT_PASS: profiles_user_id_fkey 정의 어긋나면 사전 점검이 막고 아무 것도 바뀌지 않음');
    } finally {
      await d3.close();
    }
  }
}

await main();
