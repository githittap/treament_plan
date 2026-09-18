const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const html = fs.readFileSync(path.join(__dirname, '..', 'hr.html'), 'utf8');
const block = html.match(/\/\* schedule-roster:test-start \*\/([\s\S]*?)\/\* schedule-roster:test-end \*\//);
const adminBlock = html.match(/\/\* schedule-roster-admin:test-start \*\/([\s\S]*?)\/\* schedule-roster-admin:test-end \*\//);

test('근무표는 person_id 명부와 person_id 저장 계약을 사용한다', () => {
  const schedule = html.match(/\/\* ── 근무표\(M2\) ── \*\/([\s\S]*?)\/\* 엑셀 파싱 \*\//);
  assert.ok(schedule, '근무표 코드 블록이 없습니다.');
  const source = schedule[1];
  assert.match(source, /select\('person_id,user_id,week_start,day,shift,note'\)/);
  assert.match(source, /schedulePeopleForWeek\(SCHEDULE_PEOPLE,rows\)/);
  assert.match(source, /smap\[r\.person_id\+'\|'\+r\.day\]/);
  assert.match(source, /data-person-id=/);
  assert.match(source, /data-profile-user-id=/);
  assert.match(source, /async function setShift\(personId,profileUserId,day,ws,shift\)/);
  assert.match(source, /onConflict:'week_start,person_id,day'/);
});

test('근무표 저장 실패는 성공 상태로 표시하지 않는다', () => {
  const setShift = html.match(/async function setShift\([\s\S]*?async function publishSched/);
  assert.ok(setShift, 'setShift 함수를 찾을 수 없습니다.');
  assert.match(setShift[0], /if\(weekError\)\{setStatus\('error'\);return;\}/);
  assert.match(setShift[0], /if\(error\)\{setStatus\('error'\);return;\}/);
});

test('통합 명부 순수 함수 코드 블록이 포함되어 있다', () => {
  assert.ok(block, '통합 명부 순수 함수 코드 블록이 없습니다.');
});

if (block) {
  const context = {};
  vm.createContext(context);
  vm.runInContext(`${block[1]};this.schedulePersonLabel=schedulePersonLabel;this.schedulePeopleForWeek=schedulePeopleForWeek;this.scheduleDate=scheduleDate;this.scheduleCalendarIndex=scheduleCalendarIndex;`, context);

  test('의사 부서는 표시 이름에만 Dr. 접두사를 붙인다', () => {
    assert.equal(context.schedulePersonLabel({ name: '홍길동', department: 'Dr.' }), 'Dr. 홍길동');
    assert.equal(context.schedulePersonLabel({ name: '홍길동', department: '진료실' }), '홍길동');
    assert.equal(context.schedulePersonLabel({ name: '홍길동', department: 'Dr' }), '홍길동');
  });

  test('새 주차는 활성화되고 포함된 명부만 표시한다', () => {
    const people = [
      { id: 'active', active: true, included_in_schedule: true },
      { id: 'inactive', active: false, included_in_schedule: true },
      { id: 'excluded', active: true, included_in_schedule: false }
    ];
    assert.deepEqual([...context.schedulePeopleForWeek(people, [])].map(p => p.id), ['active']);
  });

  test('과거 일정은 포함된 비활성 명부도 보존하되 제외 명부는 숨긴다', () => {
    const people = [
      { id: 'active', active: true, included_in_schedule: true },
      { id: 'inactive-history', active: false, included_in_schedule: true },
      { id: 'inactive-empty', active: false, included_in_schedule: true },
      { id: 'excluded-history', active: false, included_in_schedule: false }
    ];
    const rows = [{ person_id: 'inactive-history' }, { person_id: 'excluded-history' }];
    assert.deepEqual([...context.schedulePeopleForWeek(people, rows)].map(p => p.id), ['active', 'inactive-history']);
  });

  test('월요일 week_start를 DB 요일 날짜로 변환한다', () => {
    assert.equal(context.scheduleDate('2026-09-14', 0), '2026-09-20');
    assert.equal(context.scheduleDate('2026-09-14', 1), '2026-09-14');
    assert.equal(context.scheduleDate('2026-09-14', 6), '2026-09-19');
  });

  test('캘린더 인덱스는 부서별 근무와 상태를 중복 없이 정렬한다', () => {
    const people = [
      { id: 'dr-b', name: '나의사', department: 'Dr.', sort_order: 2, included_in_schedule: true },
      { id: 'dr-a', name: '가의사', department: 'Dr.', sort_order: 1, included_in_schedule: true },
      { id: 'desk', name: '김데스크', department: '데스크', sort_order: 1, included_in_schedule: true },
      { id: 'off', name: '박휴무', department: '진료실', sort_order: 1, included_in_schedule: true },
      { id: 'etc', name: '최기타', department: '기공실', sort_order: 1, included_in_schedule: true },
      { id: 'excluded', name: '숨김', department: '진료실', sort_order: 0, included_in_schedule: false }
    ];
    const rows = [
      { week_start: '2026-09-14', day: 1, person_id: 'dr-b', shift: 'work' },
      { week_start: '2026-09-14', day: 1, person_id: 'dr-a', shift: 'evening' },
      { week_start: '2026-09-14', day: 1, person_id: 'dr-a', shift: 'evening' },
      { week_start: '2026-09-14', day: 1, person_id: 'desk', shift: 'work' },
      { week_start: '2026-09-14', day: 1, person_id: 'off', shift: 'off' },
      { week_start: '2026-09-14', day: 1, person_id: 'etc', shift: 'etc' },
      { week_start: '2026-09-14', day: 1, person_id: 'excluded', shift: 'work' }
    ];
    const index = context.scheduleCalendarIndex(rows, people, [{ week_start: '2026-09-14', status: '공표' }]);
    const day = index['2026-09-14'];
    assert.deepEqual(JSON.parse(JSON.stringify(day.departments['Dr.'])), ['Dr. 가의사', 'Dr. 나의사']);
    assert.deepEqual(JSON.parse(JSON.stringify(day.departments['데스크'])), ['김데스크']);
    assert.deepEqual(JSON.parse(JSON.stringify(day.departments['진료실'])), []);
    assert.deepEqual(JSON.parse(JSON.stringify(day.departments['기공실'])), []);
    assert.deepEqual(JSON.parse(JSON.stringify(day.departments['미지정'])), []);
    assert.deepEqual(JSON.parse(JSON.stringify(day.evening)), ['Dr. 가의사']);
    assert.deepEqual(JSON.parse(JSON.stringify(day.off)), ['박휴무']);
    assert.deepEqual(JSON.parse(JSON.stringify(day.etc)), ['최기타']);
    assert.equal(day.weekStatus, 'published');
  });

  test('캘린더 인덱스는 초안을 draft로 정규화하고 미지정 부서를 수용한다', () => {
    const index = context.scheduleCalendarIndex(
      [{ week_start: '2026-09-14', day: 0, person_id: 'unassigned', shift: 'work' }],
      [{ id: 'unassigned', name: '무소속', department: null, sort_order: 0, included_in_schedule: true }],
      [{ week_start: '2026-09-14', status: '초안' }]
    );
    assert.deepEqual(JSON.parse(JSON.stringify(index['2026-09-20'].departments['미지정'])), ['무소속']);
    assert.equal(index['2026-09-20'].weekStatus, 'draft');
  });
}

test('명부 관리 UI는 manager, chief, owner에게만 근무표 안에서 노출된다', () => {
  const ownerTab = html.match(/\{key:'owner',[^\n]+/);
  const schedule = html.match(/async function renderSched\([\s\S]*?\n\}/);
  assert.ok(ownerTab, 'owner 탭 정의가 없습니다.');
  assert.deepEqual(ownerTab[0].match(/roles:\[([^\]]+)\]/)[1].match(/'[^']+'/g), ["'owner'"]);
  assert.ok(schedule, 'renderSched 함수를 찾을 수 없습니다.');
  assert.match(schedule[0], /isMgr\(\)\?scheduleRosterAdminCard\(\):''/);

  const roleContext = { ME: { role: 'staff' } };
  vm.createContext(roleContext);
  vm.runInContext(`${html.match(/const isMgr=\(\)=>[^;]+;/)[0]};this.isMgr=isMgr;`, roleContext);
  for (const role of ['manager', 'chief', 'owner']) {
    roleContext.ME.role = role;
    assert.equal(roleContext.isMgr(), true, `${role}가 명부 관리 권한에서 빠졌습니다.`);
  }
  roleContext.ME.role = 'staff';
  assert.equal(roleContext.isMgr(), false);
});

test('명부 관리 카드는 필수 라벨, 정확한 부서 선택지와 계정 구분을 제공한다', () => {
  assert.ok(adminBlock, '명부 관리 코드 블록이 없습니다.');
  assert.match(adminBlock[1], /근무명부 관리/);
  assert.match(adminBlock[1], /이름/);
  assert.match(adminBlock[1], /근무부서/);
  assert.match(adminBlock[1], /근무표·집계 포함/);
  assert.match(adminBlock[1], /재직 상태/);
  assert.match(adminBlock[1], /로그인 계정/);
  assert.match(adminBlock[1], /비로그인 명부/);
  assert.match(adminBlock[1], /\['Dr\.'\s*,\s*'진료실'\s*,\s*'데스크'\s*,\s*'기공실'\s*,\s*'미지정'\]/);
});

test('schedule_people 관리에서는 삭제 호출을 만들지 않고 비활성화 확인 후 update한다', () => {
  assert.doesNotMatch(html, /from\('schedule_people'\)\.delete\(/);
  assert.match(adminBlock[1], /if\(!active&&!confirm\(/);
  assert.match(adminBlock[1], /update\(\{active\}\)/);
});

function adminHarness({ role = 'manager', error = null, confirmResult = true } = {}) {
  assert.ok(adminBlock, '명부 관리 코드 블록이 없습니다.');
  const calls = { insert: [], update: [], eq: [], status: [], load: 0, render: 0, alerts: [] };
  const elements = {
    rosterName: { value: '  비로그인 직원  ' },
    rosterDepartment: { value: '진료실' },
    rosterMsg: { textContent: '' }
  };
  const context = {
    ME: { role },
    SCHEDULE_PEOPLE: [],
    isMgr: () => ['manager', 'chief', 'owner'].includes(context.ME.role),
    $: selector => elements[selector.replace('#', '')] || null,
    esc: value => String(value == null ? '' : value),
    setStatus: value => calls.status.push(value),
    loadSchedulePeople: async () => { calls.load++; },
    render: async () => { calls.render++; },
    alert: message => calls.alerts.push(message),
    confirm: () => confirmResult,
    sb: {
      from(table) {
        assert.equal(table, 'schedule_people');
        return {
          insert: async payload => { calls.insert.push(payload); return { error }; },
          update(payload) {
            calls.update.push(payload);
            return { eq: async (column, value) => { calls.eq.push([column, value]); return { error }; } };
          }
        };
      }
    }
  };
  vm.createContext(context);
  vm.runInContext(`${adminBlock[1]};this.saveSchedulePerson=saveSchedulePerson;this.setSchedulePersonDepartment=setSchedulePersonDepartment;this.setSchedulePersonIncluded=setSchedulePersonIncluded;this.setSchedulePersonActive=setSchedulePersonActive;`, context);
  return { context, calls, elements };
}

test('세 관리자 역할은 비로그인 명부를 정해진 기본값으로 추가하고 staff는 거부한다', async () => {
  for (const role of ['manager', 'chief', 'owner']) {
    const { context, calls } = adminHarness({ role });
    await context.saveSchedulePerson();
    assert.deepEqual(JSON.parse(JSON.stringify(calls.insert)), [{
      profile_user_id: null,
      name: '비로그인 직원',
      department: '진료실',
      included_in_schedule: true,
      active: true
    }]);
    assert.equal(calls.load, 1);
    assert.equal(calls.render, 1);
    assert.equal(calls.status.at(-1), 'saved');
  }

  const { context, calls } = adminHarness({ role: 'staff' });
  await context.saveSchedulePerson();
  assert.equal(calls.insert.length, 0);
  assert.equal(calls.status.at(-1), 'error');
});

test('이름 또는 부서가 비면 수동 명부를 저장하지 않고 보이는 오류를 표시한다', async () => {
  for (const missing of ['rosterName', 'rosterDepartment']) {
    const { context, calls, elements } = adminHarness();
    elements[missing].value = '';
    await context.saveSchedulePerson();
    assert.equal(calls.insert.length, 0);
    assert.equal(calls.status.at(-1), 'error');
    assert.notEqual(elements.rosterMsg.textContent, '');
  }
});

test('네 명부 mutation은 Supabase 오류를 성공으로 바꾸지 않고 사용자에게 표시한다', async () => {
  const { context, calls, elements } = adminHarness({ error: { message: 'RLS denied' } });
  await context.saveSchedulePerson();
  await context.setSchedulePersonDepartment('person-1', '데스크');
  await context.setSchedulePersonIncluded('person-1', false);
  await context.setSchedulePersonActive('person-1', false);
  assert.equal(calls.load, 0);
  assert.equal(calls.render, 0);
  assert.equal(calls.status.filter(value => value === 'error').length, 4);
  assert.equal(calls.status.includes('saved'), false);
  assert.match(elements.rosterMsg.textContent, /RLS denied/);
});

test('포함 토글은 included_in_schedule만 변경하고 비활성화 취소 시 update하지 않는다', async () => {
  const included = adminHarness();
  await included.context.setSchedulePersonIncluded('person-1', false);
  assert.deepEqual(JSON.parse(JSON.stringify(included.calls.update)), [{ included_in_schedule: false }]);

  const inactive = adminHarness({ confirmResult: false });
  await inactive.context.setSchedulePersonActive('person-1', false);
  assert.equal(inactive.calls.update.length, 0);
});

test('owner 직원 권한 표는 연결 명부 상태를 보여 주고 승인 시 기존 설정을 보존한다', () => {
  const owner = html.match(/async function renderOwner\([\s\S]*?async function setRole/);
  const approve = html.match(/async function approveProfile\([\s\S]*?async function revokeApproval/);
  assert.ok(owner, 'renderOwner 함수를 찾을 수 없습니다.');
  assert.ok(approve, 'approveProfile 함수를 찾을 수 없습니다.');
  assert.match(owner[0], /근무부서/);
  assert.match(owner[0], /근무표·집계 포함/);
  assert.match(owner[0], /재직 상태/);
  assert.match(owner[0], /profile_user_id===p\.user_id/);
  assert.match(approve[0], /if\(!SCHEDULE_PEOPLE\.some\(.*profile_user_id===uid/);
  assert.match(approve[0], /upsert\(\{profile_user_id:uid,name:p\.name,department:'미지정',included_in_schedule:true,active:true\}/);
  assert.match(approve[0], /onConflict:'profile_user_id',ignoreDuplicates:true/);
  assert.match(approve[0], /if\(rosterError\).*setStatus\('error'\)/s);
});
