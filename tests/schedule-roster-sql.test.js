const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const migration = fs.readFileSync(path.join(__dirname, '..', 'db', 'unified_schedule_roster.sql'), 'utf8');
const finalize = fs.readFileSync(path.join(__dirname, '..', 'db', 'unified_schedule_roster_finalize.sql'), 'utf8');
const departmentCompatibility = fs.readFileSync(path.join(__dirname, '..', 'db', 'unified_schedule_department_compatibility.sql'), 'utf8');

function policyStatement(name) {
  const match = migration.match(new RegExp(`create policy ${name}\\b[\\s\\S]*?;`, 'i'));
  assert.ok(match, `${name} 정책이 있어야 한다`);
  return match[0];
}

function privilegeStatement(action, table, role) {
  const match = migration.match(new RegExp(`\\b${action}[^;]*on table public\\.${table} (?:to|from) ${role};`, 'i'));
  assert.ok(match, `${role}의 ${table} ${action} 권한 선언이 있어야 한다`);
  return match[0];
}

function functionStatement(name) {
  const match = migration.match(new RegExp(`create or replace function public\\.${name}\\b[\\s\\S]*?\\$\\$;`, 'i'));
  assert.ok(match, `${name} 함수가 있어야 한다`);
  return match[0];
}

test('통합 명부 테이블의 핵심 스키마를 선언한다', () => {
  assert.match(migration, /create table if not exists public\.schedule_people/i);
  assert.match(migration, /id\s+uuid[^\n]*primary key/i);
  assert.match(migration, /profile_user_id\s+uuid[^\n]*references public\.profiles\s*\(user_id\)\s+on delete set null/i);
  assert.match(migration, /profile_user_id\s+uuid\s+unique/i);
  assert.match(migration, /department[\s\S]*check[\s\S]*Dr\.[\s\S]*진료실[\s\S]*데스크[\s\S]*기공실[\s\S]*미지정/i);
  assert.match(migration, /included_in_schedule\s+boolean\s+not null/i);
  assert.match(migration, /active\s+boolean\s+not null/i);
  assert.match(migration, /sort_order\s+integer\s+not null/i);
  assert.match(migration, /created_at\s+timestamptz/i);
  assert.match(migration, /updated_at\s+timestamptz/i);
});

test('ZIP 직무 부서는 기존 값을 보존한 채 상담·행정을 최소 추가 허용한다', () => {
  assert.match(departmentCompatibility, /drop constraint if exists schedule_people_department_check/i);
  assert.match(departmentCompatibility, /add constraint schedule_people_department_check/i);
  assert.match(departmentCompatibility, /기공실[\s\S]*미지정[\s\S]*상담[\s\S]*행정/);
  assert.doesNotMatch(departmentCompatibility, /delete from|truncate|drop table|update public\.schedule_people/i);
});

test('기존 일정에 person_id를 추가하고 user_id를 nullable로 전환한다', () => {
  assert.match(migration, /alter table public\.schedules[\s\S]*add column if not exists person_id\s+uuid/i);
  assert.match(migration, /foreign key\s*\(person_id\)\s*references public\.schedule_people\s*\(id\)/i);
  assert.match(migration, /alter column user_id drop not null/i);
  assert.match(migration, /create unique index if not exists schedules_week_person_day_unique\s+on public\.schedules\s*\(\s*week_start\s*,\s*person_id\s*,\s*day\s*\)\s*;/i);
});

test('일정 명부 외래키 조회용 person_id 선두 인덱스를 선언한다', () => {
  assert.match(migration, /create index if not exists schedules_person_id_idx\s+on public\.schedules\s*\(\s*person_id\s*\)/i);
});

test('profiles와 기존 일정을 명부 기준으로 백필하고 누락 시 중단한다', () => {
  assert.match(migration, /insert into public\.schedule_people[\s\S]*from public\.profiles/i);
  assert.match(migration, /on conflict\s*\(profile_user_id\)\s*do nothing/i);
  assert.doesNotMatch(migration, /on conflict\s*\(profile_user_id\)\s*do update/i);
  assert.doesNotMatch(migration, /update public\.schedule_people[\s\S]*where name in \('abc', '테스트', '공용1'\)/i);
  assert.match(migration, /update public\.schedules[\s\S]*set person_id/i);
  assert.match(migration, /raise exception[\s\S]*backfill|raise exception[\s\S]*person_id/i);
  assert.match(migration, /abc/);
  assert.match(migration, /테스트/);
  assert.match(migration, /공용1/);
  assert.match(migration, /정용태/);
  assert.match(migration, /정도경/);
  assert.match(migration, /정규민/);
});

test('명부 전환은 전체 unique, 호환 트리거, 승인 접근과 주차 복사 RPC를 제공한다', () => {
  assert.match(migration, /from pg_catalog\.pg_index[\s\S]*schedules_week_person_day_unique[\s\S]*indpred is not null/i);
  assert.match(migration, /execute\s+'drop index public\.schedules_week_person_day_unique'/i);
  assert.match(migration, /create unique index if not exists schedules_week_person_day_unique\s+on public\.schedules\s*\(\s*week_start\s*,\s*person_id\s*,\s*day\s*\)\s*;/i);

  const normalizer = functionStatement('normalize_schedule_person');
  assert.match(normalizer, /if new\.person_id is null/i);
  assert.match(normalizer, /profile_user_id\s*=\s*new\.user_id/i);
  assert.match(normalizer, /where (?:sp\.)?id\s*=\s*new\.person_id/i);
  assert.match(normalizer, /raise exception/i);
  assert.match(migration, /drop trigger if exists schedules_normalize_person_before_write on public\.schedules/i);
  assert.match(migration, /create trigger schedules_normalize_person_before_write\s+before insert or update on public\.schedules/i);

  for (const name of [
    'schedule_people_select_authenticated',
    'schedule_people_write_leads_insert',
    'schedule_people_write_leads_update',
    'schedule_weeks_select_authenticated',
    'schedule_weeks_insert_authenticated',
    'schedule_weeks_update_approvers',
    'schedules_select_authenticated',
    'schedules_insert_authenticated',
    'schedules_update_authenticated',
    'schedules_delete_authenticated',
  ]) {
    assert.match(policyStatement(name), /from public\.profiles[\s\S]*approved\s*=\s*true/i);
  }

  const copyWeek = functionStatement('copy_schedule_week');
  assert.match(copyWeek, /security invoker/i);
  assert.doesNotMatch(copyWeek, /security definer/i);
  assert.match(copyWeek, /p_source_week\s*=\s*p_target_week/i);
  assert.match(copyWeek, /from public\.profiles[\s\S]*approved\s*=\s*true/i);
  assert.match(copyWeek, /insert into public\.schedule_weeks[\s\S]*status\s*\)\s*values\s*\(\s*p_target_week\s*,\s*'초안'\s*\)[\s\S]*on conflict/i);
  assert.match(copyWeek, /delete from public\.schedules[\s\S]*week_start\s*=\s*p_target_week/i);
  assert.match(copyWeek, /insert into public\.schedules[\s\S]*select[\s\S]*p_target_week[\s\S]*from public\.schedules/i);
  assert.match(copyWeek, /join public\.schedule_people sp on sp\.id\s*=\s*s\.person_id/i);
  assert.match(copyWeek, /sp\.active\s*=\s*true/i);
  assert.match(copyWeek, /sp\.included_in_schedule\s*=\s*true/i);
  assert.match(copyWeek, /declare\s+v_copied_count\s+integer/i);
  assert.match(copyWeek, /get diagnostics\s+v_copied_count\s*=\s*row_count/i);
  assert.match(copyWeek, /if v_copied_count\s*=\s*0 then[\s\S]*raise exception/i);
  assert.match(migration, /revoke all on function public\.copy_schedule_week\(date, date\) from public/i);
  assert.match(migration, /revoke all on function public\.copy_schedule_week\(date, date\) from anon/i);
  assert.match(migration, /grant execute on function public\.copy_schedule_week\(date, date\) to authenticated/i);

  const timestampTrigger = functionStatement('set_schedule_people_updated_at');
  assert.match(timestampTrigger, /new\.updated_at\s*:=\s*now\(\)/i);
  assert.match(migration, /drop trigger if exists schedule_people_set_updated_at on public\.schedule_people/i);
  assert.match(migration, /create trigger schedule_people_set_updated_at\s+before update on public\.schedule_people/i);

  assert.match(finalize, /update public\.schedules[\s\S]*set person_id/i);
  assert.match(finalize, /raise exception[\s\S]*person_id/i);
});

test('명부 RLS와 권한은 authenticated 조회·manager/chief/owner 쓰기만 허용한다', () => {
  assert.match(privilegeStatement('revoke', 'schedule_people', 'anon'), /revoke all privileges/i);
  assert.match(privilegeStatement('grant', 'schedule_people', 'authenticated'), /grant select,\s*insert,\s*update/i);
  assert.doesNotMatch(migration, /grant[^;]*delete[^;]*schedule_people/i);
  assert.match(policyStatement('schedule_people_select_authenticated'), /for select to authenticated/i);
  assert.match(policyStatement('schedule_people_write_leads_insert'), /for insert to authenticated/i);
  assert.match(policyStatement('schedule_people_write_leads_update'), /for update to authenticated/i);
  assert.match(migration, /manager.*chief.*owner|chief.*owner.*manager/i);
});

test('근무표 RLS는 초안 편집만 열고 anon 권한과 공표 주차 직접 편집을 막는다', () => {
  assert.match(privilegeStatement('revoke', 'schedules', 'anon'), /revoke all privileges/i);
  assert.match(privilegeStatement('revoke', 'schedule_weeks', 'anon'), /revoke all privileges/i);
  assert.match(privilegeStatement('revoke', 'schedules', 'authenticated'), /revoke all privileges/i);
  assert.match(privilegeStatement('revoke', 'schedule_weeks', 'authenticated'), /revoke all privileges/i);
  assert.match(privilegeStatement('grant', 'schedules', 'authenticated'), /grant select,\s*insert,\s*update,\s*delete/i);
  assert.match(privilegeStatement('grant', 'schedule_weeks', 'authenticated'), /grant select,\s*insert,\s*update/i);
  assert.doesNotMatch(migration, /grant[^;]*(truncate|references|trigger)[^;]*(schedules|schedule_weeks)/i);

  assert.match(migration, /drop policy if exists schedule_weeks_update_approvers on public\.schedule_weeks/i);
  const weekInsert = policyStatement('schedule_weeks_insert_authenticated');
  assert.match(weekInsert, /on public\.schedule_weeks for insert to authenticated/i);
  assert.match(weekInsert, /status\s*=\s*'초안'\s+or\s+public\.my_role\(\)\s+in\s*\('chief',\s*'owner'\)/i);

  const weekUpdate = policyStatement('schedule_weeks_update_approvers');
  assert.match(weekUpdate, /on public\.schedule_weeks for update to authenticated/i);
  assert.match(weekUpdate, /using\s*\([\s\S]*status\s*=\s*'초안'\s+or\s+public\.my_role\(\)\s+in\s*\('chief',\s*'owner'\)/i);
  assert.match(weekUpdate, /with check\s*\([\s\S]*status\s*=\s*'초안'\s+or\s+public\.my_role\(\)\s+in\s*\('chief',\s*'owner'\)/i);

  for (const operation of ['insert', 'update', 'delete']) {
    const policy = policyStatement(`schedules_${operation}_authenticated`);
    assert.match(policy, new RegExp(`on public\\.schedules for ${operation} to authenticated`, 'i'));
    assert.match(policy, /exists\s*\([\s\S]*from public\.schedule_weeks sw[\s\S]*sw\.week_start\s*=\s*schedules\.week_start[\s\S]*sw\.status\s*=\s*'초안'[\s\S]*public\.my_role\(\)\s+in\s*\('chief',\s*'owner'\)/i);
  }
});

test('finalize는 null person_id를 먼저 거부하고 not null을 적용한다', () => {
  assert.match(finalize, /if exists\s*\(\s*select 1 from public\.schedules[^)]*person_id\s+is null/i);
  assert.match(finalize, /raise exception/i);
  assert.match(finalize, /alter table public\.schedules[\s\S]*alter column person_id set not null/i);
  assert.match(finalize, /user_id|rollback/i);
});
