const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const html = fs.readFileSync(path.join(__dirname, '..', 'hr.html'), 'utf8');
const block = html.match(/\/\* schedule-roster:test-start \*\/([\s\S]*?)\/\* schedule-roster:test-end \*\//);
const adminBlock = html.match(/\/\* schedule-roster-admin:test-start \*\/([\s\S]*?)\/\* schedule-roster-admin:test-end \*\//);
const calendarBlock = html.match(/\/\* ── 캘린더 ── \*\/([\s\S]*?)\/\* ── 연차현황 ── \*\//);
const loadSchedulePeopleSource = html.match(/async function loadSchedulePeople\(\)\{[\s\S]*?\n\}/);
const authBlock = html.match(/let _inited=false[^;]*;[\s\S]*?async function doLogin/);

test('근무표는 person_id 명부와 person_id 저장 계약을 사용한다', () => {
  const schedule = html.match(/\/\* ── 근무표\(M2\) ── \*\/([\s\S]*?)\/\* 엑셀 파싱 \*\//);
  assert.ok(schedule, '근무표 코드 블록이 없습니다.');
  const source = schedule[1];
  assert.match(source, /select\('person_id,user_id,week_start,day,shift,note'\)/);
  assert.match(source, /schedulePeopleForWeek\(SCHEDULE_PEOPLE,rows\)/);
  assert.match(source, /smap\[r\.person_id\+'\|'\+r\.day\]/);
  assert.match(source, /data-person-id=/);
  assert.match(source, /data-profile-user-id=/);
  assert.match(source, /async function setShift\(personId,profileUserId,day,ws,shift(?:,writeKey=null,writeSeq=null)?\)/);
  assert.match(source, /sb\.rpc\('set_schedule_cell'/);
  assert.doesNotMatch(source, /from\('schedules'\)\.upsert/);
});

test('근무표 저장 실패는 성공 상태로 표시하지 않는다', () => {
  const setShift = html.match(/async function setShift\([\s\S]*?async function publishSched/);
  assert.ok(setShift, 'setShift 함수를 찾을 수 없습니다.');
  assert.match(setShift[0], /sb\.rpc\('set_schedule_cell'/);
  assert.match(setShift[0], /if\(result\?\.error\)\{setStatus\('error'\);return false;\}/);
  assert.doesNotMatch(setShift[0], /from\('schedule_weeks'\)\.upsert/);
});

test('근무표 원자 저장 RPC 초안은 공표주·역할·키 검증과 롤백 계약을 담는다', () => {
  const sql=fs.readFileSync(path.join(__dirname,'..','db','unified_schedule_transaction_draft.sql'),'utf8');
  assert.match(sql,/create or replace function public\.set_schedule_cell/);
  assert.match(sql,/status='공표'/);
  assert.match(sql,/public\.my_role\(\).*chief.*owner/s);
  assert.match(sql,/person_id/);
  assert.match(sql,/p_day.*0.*6/s);
  assert.match(sql,/extract\(isodow from p_week_start\).*<> 1/);
  assert.match(sql,/on conflict \(week_start\) do nothing/);
  assert.match(sql,/raise exception/);
  assert.match(sql,/grant execute on function public\.set_schedule_cell/);
});

test('근무표 월뷰는 날짜를 기존 주차·요일 키로 되돌린다', () => {
  const schedule = html.match(/\/\* ── 근무표\(M2\) ── \*\/([\s\S]*?)\/\* 엑셀 파싱 \*\//);
  assert.ok(schedule, '근무표 코드 블록이 없습니다.');
  assert.match(schedule[1], /SCHED_VIEW/);
  assert.match(schedule[1], /renderScheduleMonth/);
  assert.match(schedule[1], /setShiftByDate/);
});

test('통합 명부 순수 함수 코드 블록이 포함되어 있다', () => {
  assert.ok(block, '통합 명부 순수 함수 코드 블록이 없습니다.');
});

if (block) {
  const context = {};
  vm.createContext(context);
  vm.runInContext(`${block[1]};this.schedulePersonLabel=schedulePersonLabel;this.schedulePeopleForWeek=schedulePeopleForWeek;this.scheduleDate=scheduleDate;this.scheduleCalendarIndex=scheduleCalendarIndex;this.calendarLeaveIndex=typeof calendarLeaveIndex==='function'?calendarLeaveIndex:null;this.scheduleRowsWithoutApprovedLeave=typeof scheduleRowsWithoutApprovedLeave==='function'?scheduleRowsWithoutApprovedLeave:null;`, context);

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

  test('연차 인덱스는 제외 명부를 숨기고 연결되지 않은 프로필 이름은 보존한다', () => {
    assert.equal(typeof context.calendarLeaveIndex, 'function');
    const index = context.calendarLeaveIndex(
      [
        { user_id: 'included-user', date_from: '2026-09-14', date_to: '2026-09-14' },
        { user_id: 'excluded-user', date_from: '2026-09-14', date_to: '2026-09-15' },
        { user_id: 'unlinked-user', date_from: '2026-09-15', date_to: '2026-09-15' }
      ],
      [
        { id: 'included', profile_user_id: 'included-user', name: '포함의사', department: 'Dr.', included_in_schedule: true },
        { id: 'excluded', profile_user_id: 'excluded-user', name: '제외직원', department: '진료실', included_in_schedule: false }
      ],
      '2026-09-01',
      '2026-09-30',
      userId => userId === 'unlinked-user' ? '연결없음' : userId
    );
    assert.deepEqual(JSON.parse(JSON.stringify(index)), {
      '2026-09-14': ['Dr. 포함의사'],
      '2026-09-15': ['연결없음']
    });
  });

  test('연차 인덱스는 동명이인을 person_id로 구분해 모두 표시한다', () => {
    const index = context.calendarLeaveIndex(
      [
        { user_id: 'same-user-1', date_from: '2026-09-14', date_to: '2026-09-14' },
        { user_id: 'same-user-2', date_from: '2026-09-14', date_to: '2026-09-14' },
        { user_id: 'same-user-1', date_from: '2026-09-14', date_to: '2026-09-14' }
      ],
      [
        { id: 'person-1', profile_user_id: 'same-user-1', name: '김동일', department: '진료실', included_in_schedule: true },
        { id: 'person-2', profile_user_id: 'same-user-2', name: '김동일', department: '진료실', included_in_schedule: true }
      ],
      '2026-09-01',
      '2026-09-30',
      value => value
    );
    assert.deepEqual(JSON.parse(JSON.stringify(index['2026-09-14'])), ['김동일', '김동일']);
  });

  test('승인 연차 당일의 work와 evening만 근무 집계에서 제외하고 연차·OFF·기타는 보존한다', () => {
    assert.equal(typeof context.scheduleRowsWithoutApprovedLeave, 'function');
    const people = [
      { id: 'leave-person', profile_user_id: 'leave-user', name: '연차의사', department: 'Dr.', sort_order: 1, included_in_schedule: true },
      { id: 'worker', profile_user_id: 'worker-user', name: '근무직원', department: '진료실', sort_order: 1, included_in_schedule: true }
    ];
    const schedules = [
      { person_id: 'leave-person', user_id: 'leave-user', week_start: '2026-09-14', day: 1, shift: 'work' },
      { person_id: 'leave-person', user_id: 'leave-user', week_start: '2026-09-14', day: 1, shift: 'evening' },
      { person_id: 'worker', user_id: 'worker-user', week_start: '2026-09-14', day: 1, shift: 'work' },
      { person_id: 'leave-person', user_id: 'leave-user', week_start: '2026-09-14', day: 2, shift: 'off' },
      { person_id: 'leave-person', user_id: 'leave-user', week_start: '2026-09-14', day: 3, shift: 'etc' }
    ];
    const leave = [{ user_id: 'leave-user', date_from: '2026-09-14', date_to: '2026-09-14' }];
    const filtered = context.scheduleRowsWithoutApprovedLeave(schedules, leave);
    assert.deepEqual([...filtered].map(row => row.shift), ['work', 'off', 'etc']);

    const scheduleIndex = context.scheduleCalendarIndex(filtered, people, []);
    const leaveIndex = context.calendarLeaveIndex(leave, people, '2026-09-01', '2026-09-30', value => value);
    assert.deepEqual(JSON.parse(JSON.stringify(scheduleIndex['2026-09-14'].departments['Dr.'])), []);
    assert.deepEqual(JSON.parse(JSON.stringify(scheduleIndex['2026-09-14'].departments['진료실'])), ['근무직원']);
    assert.deepEqual(JSON.parse(JSON.stringify(scheduleIndex['2026-09-14'].evening)), []);
    assert.deepEqual(JSON.parse(JSON.stringify(leaveIndex['2026-09-14'])), ['Dr. 연차의사']);
    assert.deepEqual(JSON.parse(JSON.stringify(scheduleIndex['2026-09-15'].off)), ['Dr. 연차의사']);
    assert.deepEqual(JSON.parse(JSON.stringify(scheduleIndex['2026-09-16'].etc)), ['Dr. 연차의사']);
  });

  test('반차는 상세 표시에서 반차로 구분하고 근무표 자체를 통째로 숨기지 않는다', () => {
    const people=[{id:'half',profile_user_id:'half-user',name:'반차직원',department:'진료실',included_in_schedule:true}];
    const detail=context.calendarLeaveIndex([{user_id:'half-user',type:'반차',type_note:null,date_from:'2026-09-14',date_to:'2026-09-14'}],people,'2026-09-01','2026-09-30',v=>v,true);
    assert.deepEqual(JSON.parse(JSON.stringify(detail['2026-09-14'])),[{label:'반차직원',type:'반차',type_note:null}]);
    const kept=context.scheduleRowsWithoutApprovedLeave([{person_id:'half',user_id:'half-user',week_start:'2026-09-14',day:1,shift:'work'}],[{user_id:'half-user',type:'반차',date_from:'2026-09-14',date_to:'2026-09-14'}]);
    assert.equal(kept.length,1);
  });
}

function authHarness({ rosterResults = [{ data: [], error: null }], settingsResults = [null], settingsGate = null } = {}) {
  assert.ok(loadSchedulePeopleSource, 'loadSchedulePeople 함수를 찾을 수 없습니다.');
  assert.ok(authBlock, 'onAuthed 코드 블록을 찾을 수 없습니다.');
  const calls = { settings: 0, profiles: 0, roster: 0, nav: 0, render: 0, badges: 0, listeners: 0, status: [] };
  const elements = {
    gate: { style: {} }, app: { style: {} }, pendingGate: { style: {} },

    meName: { textContent: '' }, meRole: { textContent: '' }, main: { innerHTML: '', insertAdjacentHTML() {} }
  };
  const rosterQueue = rosterResults.slice();
  const settingsQueue = settingsResults.slice();
  const context = {
    ME: { id: '', email: '', name: '', role: 'staff', approved: true },
    PROFILES: [], SCHEDULE_PEOPLE: [], SCHEDULE_PEOPLE_ERROR: '',
    $: selector => elements[selector.replace('#', '')] || null,
    esc: value => String(value),
    setStatus: value => calls.status.push(value),
    loadSettings: async () => { calls.settings++; if (settingsGate) await settingsGate; const error = settingsQueue.shift(); if (error) throw error; },
    loadProfiles: async () => { calls.profiles++; context.PROFILES = [{ user_id: 'user-1', name: '홍길동', role: 'staff', approved: true }]; },
    renderNav: () => { calls.nav++; },
    render: async () => { calls.render++; },
    refreshBadges: async () => { calls.badges++; },
    loadSteps: () => {},
    setTimeout: () => 0,
    document: { addEventListener: () => { calls.listeners++; } },
    console: { warn() {}, error() {} },
    sb: {
      from(table) {
        if (table === 'schedule_people') {
          const result = rosterQueue.length ? rosterQueue.shift() : { data: [], error: null };
          const builder = {
            select() { return builder; }, order() { return builder; },
            then(resolve) { calls.roster++; return Promise.resolve(resolve(result)); }
          };
          return builder;
        }
        if (table === 'confidential_access') {
          return { select() { return this; }, eq() { return this; }, maybeSingle: async () => ({ data: null, error: null }) };
        }
        if (table === 'profiles') return { insert: async () => ({ error: null }) };
        throw new Error(`예상하지 않은 테이블: ${table}`);
      }
    }
  };
  vm.createContext(context);
  const authSource = authBlock[0].replace(/\nasync function doLogin[\s\S]*$/, '');
  vm.runInContext(`${loadSchedulePeopleSource[0]};${authSource};this.onAuthed=onAuthed;this.getInited=()=>_inited;this.getInitPromise=()=>_initPromise;this.getRosterError=()=>SCHEDULE_PEOPLE_ERROR;`, context);
  const session = { user: { id: 'user-1', email: 'user@example.com', user_metadata: { full_name: '홍길동' } } };
  return { context, calls, elements, session };
}

test('명부 로딩 실패 후에도 이름·nav·렌더에 도달하고 onAuthed 재호출로 회복한다', async () => {
  const { context, calls, elements, session } = authHarness({
    rosterResults: [{ data: null, error: { message: 'roster denied' } }, { data: [{ id: 'person-1' }], error: null }]
  });
  await context.onAuthed(session);
  assert.equal(elements.meName.textContent, '홍길동');
  assert.equal(calls.nav, 1);
  assert.equal(calls.render, 1);
  assert.match(context.getRosterError(), /근무명부|roster denied/);
  assert.equal(context.getInited(), false);

  await context.onAuthed(session);
  assert.equal(calls.roster, 2);
  assert.equal(calls.nav, 2);
  assert.equal(calls.render, 2);
  assert.equal(context.getRosterError(), '');
  assert.equal(context.getInited(), true);
  assert.equal(calls.listeners, 1);
});

test('치명적 초기화 실패는 플래그를 복구해 다음 onAuthed가 재시도한다', async () => {
  const { context, calls, session } = authHarness({ settingsResults: [new Error('settings down'), null] });
  await context.onAuthed(session);
  assert.equal(context.getInited(), false);
  assert.equal(calls.render, 0);
  await context.onAuthed(session);
  assert.equal(calls.settings, 2);
  assert.equal(calls.render, 1);
  assert.equal(context.getInited(), true);
});

test('동시 onAuthed 호출은 하나의 초기화 Promise를 공유한다', async () => {
  let releaseSettings;
  const settingsGate = new Promise(resolve => { releaseSettings = resolve; });
  const { context, calls, session } = authHarness({ settingsGate });
  const first = context.onAuthed(session);
  const second = context.onAuthed(session);
  let secondDone = false;
  second.then(() => { secondDone = true; });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(secondDone, false, '중복 호출이 진행 중인 초기화를 기다리지 않았습니다.');
  releaseSettings();
  await Promise.all([first, second]);
  assert.equal(calls.settings, 1);
  assert.equal(calls.profiles, 1);
  assert.equal(calls.render, 1);
  assert.equal(calls.listeners, 1);
});

function scheduleRenderHarness({ weekError = null, scheduleError = { message: 'schedule denied' }, leaveError = null } = {}) {
  const source = html.match(/async function renderSched\([\s\S]*?\n\}/);
  assert.ok(source, 'renderSched 함수를 찾을 수 없습니다.');
  const syncHelper = html.match(/function syncScheduleCellValues[\s\S]*?\n\}/)?.[0] || '';
  const m = { innerHTML: '', addEventListener() {}, contains: () => true };
  const context = {
    SCHED_WEEK: '2026-09-14', SCHED_VIEW: 'week', SCHEDULE_STATUS_OVERRIDES: {}, SCHEDULE_WRITE_TAIL: {}, SCHEDULE_CELL_VALUES: {}, SCHEDULE_PEOPLE: [{ id: 'person-1', name: '김직원', department: '진료실', active: true, included_in_schedule: true }],
    SCHEDULE_PEOPLE_ERROR: '', SHIFTS: { work: { l: '근무' }, off: { l: 'off' }, evening: { l: '야간' }, etc: { l: '기타' } },
    today: () => '2026-09-14', mondayStr: value => value, addDays: value => value, md: value => value,
    schedulePeopleForWeek: (people) => people, schedulePersonLabel: person => person.name, esc: value => String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'),
    isLead: () => false, isMgr: () => false, scheduleRosterAdminCard: () => '', window: {},
    document: { addEventListener() {} },
    sb: {
      from(table) {
        const result = table === 'schedule_weeks'
          ? { data: { status: '초안' }, error: weekError }
          : table === 'schedules'
            ? { data: scheduleError ? null : [], error: scheduleError }
            : { data: leaveError ? null : [], error: leaveError };
        const builder = {
          select() { return builder; }, eq() { return builder; }, lte() { return builder; }, gte() { return builder; },
          maybeSingle: async () => result,
          then(resolve) { return Promise.resolve(resolve(result)); }
        };
        return builder;
      }
    }
  };
  vm.createContext(context);
  vm.runInContext(`${syncHelper}\n${source[0]};this.renderSched=renderSched;`, context);
  return { context, m };
}

test('근무표 schedules 조회 오류는 보이는 오류를 남기고 편집 셀을 만들지 않는다', async () => {
  const { context, m } = scheduleRenderHarness();
  await context.renderSched(m);
  assert.match(m.innerHTML, /근무표를 불러오지 못했습니다|schedule denied/);
  assert.doesNotMatch(m.innerHTML, /data-person-id|<select/);
});

test('근무표 주차 조회 오류는 대상과 escape된 메시지만 표시하고 편집을 차단한다', async () => {
  const { context, m } = scheduleRenderHarness({ weekError: { message: '<week denied>' }, scheduleError: null });
  await context.renderSched(m);
  assert.match(m.innerHTML, /주차/);
  assert.match(m.innerHTML, /&lt;week denied&gt;/);
  assert.doesNotMatch(m.innerHTML, /<week denied>|data-person-id|<select|지난주 복사/);
});

test('근무표 연차 조회 오류는 대상과 escape된 메시지만 표시하고 편집을 차단한다', async () => {
  const { context, m } = scheduleRenderHarness({ scheduleError: null, leaveError: { message: '<leave denied>' } });
  await context.renderSched(m);
  assert.match(m.innerHTML, /연차/);
  assert.match(m.innerHTML, /&lt;leave denied&gt;/);
  assert.doesNotMatch(m.innerHTML, /<leave denied>|data-person-id|<select|지난주 복사/);
});

function scheduleMonthRenderHarness({ role = 'staff' } = {}) {
  const source = html.match(/async function renderScheduleMonth\([\s\S]*?\n\}\nasync function applyScheduleShift/);
  assert.ok(source, 'renderScheduleMonth 함수를 찾을 수 없습니다.');
  const helpers = [html.match(/function scheduleMonthWeeks[\s\S]*?\n\}/)?.[0], html.match(/function scheduleShiftOptions[\s\S]*?\n\}/)?.[0], html.match(/function syncScheduleCellValues[\s\S]*?\n\}/)?.[0]].filter(Boolean).join('\n');
  const m = { innerHTML: '' };
  const rows = [{ person_id: 'person-1', user_id: 'user-1', week_start: '2028-01-31', day: 2, shift: 'work' }, { person_id: 'guest-1', user_id: null, week_start: '2028-02-21', day: 4, shift: 'evening' }];
  const weekRows = [{ week_start: '2028-01-31', status: '초안' }, { week_start: '2028-02-07', status: '공표' }, { week_start: '2028-02-14', status: '초안' }, { week_start: '2028-02-21', status: '공표' }, { week_start: '2028-02-28', status: '초안' }];
  const context = {
    SCHED_MONTH: '2028-02', SCHED_VIEW: 'month', SCHEDULE_STATUS_OVERRIDES: {}, SCHEDULE_WRITE_SEQ: {}, SCHEDULE_WRITE_TAIL: {}, SCHEDULE_CELL_VALUES: {}, SCHEDULE_PEOPLE: [{ id: 'person-1', profile_user_id: 'user-1', name: '직원', department: '진료실', active: true, included_in_schedule: true }, { id: 'guest-1', profile_user_id: null, name: 'Dr 비로그인', department: 'Dr.', active: true, included_in_schedule: true }],
    SHIFTS: { work: { l: '근무' }, off: { l: 'off' }, evening: { l: '야간' }, etc: { l: '기타' } },
    today: () => '2028-02-15', mondayStr: value => { const d = new Date(value+'T00:00:00'); const g=d.getDay(); d.setDate(d.getDate()+(g===0?-6:1-g)); return d.toISOString().slice(0,10); },
    addDays: (value,n) => { const d=new Date(value+'T00:00:00'); d.setDate(d.getDate()+n); return d.toISOString().slice(0,10); },
    scheduleDate: (value,day) => { const d=new Date(value+'T00:00:00'); d.setDate(d.getDate()+(day===0?6:day-1)); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; }, scheduleDayForDate: value => new Date(value+'T00:00:00').getDay(),
    schedulePeopleForWeek: (people) => people, schedulePersonLabel: p => p.department==='Dr.'?'Dr. '+p.name:p.name, scheduleWeekForDate: value => { const d=new Date(value+'T00:00:00'); const g=d.getDay(); d.setDate(d.getDate()+(g===0?-6:1-g)); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; }, scheduleShiftOptions: cur => Object.keys(context.SHIFTS).map(k=>`<option value="${k}" ${cur===k?'selected':''}>${context.SHIFTS[k].l}</option>`).join(''),
    esc: value => String(value ?? ''), isLead: () => role !== 'staff', isMgr: () => role !== 'staff', scheduleRosterAdminCard: () => '',
    serverRows: rows,
    sb: { from(table) { const result = table==='schedules'?{data:rows,error:null}:table==='schedule_weeks'?{data:weekRows,error:null}:{data:[],error:null}; const builder={select(){return builder;},in(){return builder;},eq(){return builder;},lte(){return builder;},gte(){return builder;},then(resolve){return Promise.resolve(resolve(result));}}; return builder; } }
  };
  vm.createContext(context);
  vm.runInContext(`${helpers}\n${source[0].replace(/\nasync function applyScheduleShift$/, '')};this.renderScheduleMonth=renderScheduleMonth;this.syncScheduleCellValues=syncScheduleCellValues;`, context);
  return { context, m };
}

test('월간 렌더는 윤년 월경계·비로그인 Dr 저장키와 혼합 공표 주차별 편집을 실제 출력한다', async () => {
  const { context, m } = scheduleMonthRenderHarness();
  context.SCHEDULE_CELL_VALUES['person-1|2028-01-31|2'] = 'off';
  context.SCHEDULE_STATUS_OVERRIDES['2028-02-07'] = '초안';
  await context.renderScheduleMonth(m);
  assert.match(m.innerHTML, /2028-02/);
  assert.match(m.innerHTML, /applyScheduleShift\(this,'guest-1','',2,'2028-02-28'/);
  assert.equal((m.innerHTML.match(/<select /g)||[]).length, 30);
  assert.equal(Object.hasOwn(context.SCHEDULE_STATUS_OVERRIDES, '2028-02-07'), false);
  context.syncScheduleCellValues(context.serverRows, ['2028-01-31']);
  assert.equal(context.SCHEDULE_CELL_VALUES['person-1|2028-01-31|2'], 'work');
  const owner = scheduleMonthRenderHarness({ role: 'owner' });
  await owner.context.renderScheduleMonth(owner.m);
  assert.equal((owner.m.innerHTML.match(/<select /g)||[]).length, 58);
});

test('공표 성공은 초안 override를 지우고 서버 재조회 렌더를 호출한다', async () => {
  const source = html.match(/async function publishSched\([\s\S]*?\n\}/);
  assert.ok(source, 'publishSched 함수를 찾을 수 없습니다.');
  const calls = { render: 0, status: [] }, context = {
    ME: { name: '합성원장' }, SCHEDULE_STATUS_OVERRIDES: { '2028-02-07': '초안' },
    setStatus: value => calls.status.push(value), render: () => { calls.render++; },
    sb: { from() { const builder = { upsert: async () => ({ error: null }) }; return builder; } }
  };
  vm.createContext(context);
  vm.runInContext(`${source[0]};this.publishSched=publishSched;`, context);
  await context.publishSched('2028-02-07');
  assert.equal(Object.hasOwn(context.SCHEDULE_STATUS_OVERRIDES, '2028-02-07'), false);
  assert.equal(calls.render, 1);
  assert.deepEqual(calls.status, ['saved']);
});

test('근무표 셀 저장 실패는 이전 선택값을 복원하고 성공 시에만 새 값을 기억한다', async () => {
  const source = html.match(/async function applyScheduleShift\([\s\S]*?\n\}/);
  assert.ok(source, 'applyScheduleShift 함수를 찾을 수 없습니다.');
  const calls = [], context = {
    SCHEDULE_WRITE_SEQ: {}, SCHEDULE_STATUS_OVERRIDES: {}, SCHEDULE_WRITE_TAIL: {}, SCHEDULE_CELL_VALUES: {},
    setShift: async (...args) => { calls.push(args); return context.nextResult; }
  };
  vm.createContext(context);
  vm.runInContext(`${source[0]};this.applyScheduleShift=applyScheduleShift;`, context);
  const element = { value: 'off', dataset: { prevValue: 'work' }, classList: { toggle() {} } };
  context.nextResult = false;
  assert.equal(await context.applyScheduleShift(element, 'person-1', null, 2, '2028-02-07', 'off'), false);
  assert.equal(element.value, 'work');
  context.nextResult = true;
  element.value = 'evening';
  assert.equal(await context.applyScheduleShift(element, 'person-1', null, 2, '2028-02-07', 'evening'), true);

  assert.equal(element.dataset.prevValue, 'evening');
  assert.equal(calls.length, 2);
});

test('근무표 셀의 늦게 도착한 이전 응답은 최신 선택을 되돌리지 않는다', async () => {
  const source = html.match(/async function applyScheduleShift\([\s\S]*?\n\}/);
  assert.ok(source, 'applyScheduleShift 함수를 찾을 수 없습니다.');
  const pending = [], context = {
    SCHEDULE_WRITE_SEQ: {}, SCHEDULE_WRITE_TAIL: {}, SCHEDULE_CELL_VALUES: {},
    setShift: (...args) => new Promise(resolve => pending.push({ args, resolve }))
  };
  vm.createContext(context);
  vm.runInContext(`${source[0]};this.applyScheduleShift=applyScheduleShift;`, context);
  const first = { value: 'off', dataset: { prevValue: 'work' }, classList: { toggle() {} } };
  const second = { value: 'evening', dataset: { prevValue: 'off' }, classList: { toggle() {} } };
  const p1 = context.applyScheduleShift(first, 'person-1', null, 2, '2028-02-07', 'off');
  const p2 = context.applyScheduleShift(second, 'person-1', null, 2, '2028-02-07', 'evening');
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(pending.length, 1, '같은 셀 요청은 이전 RPC가 끝날 때까지 직렬화되어야 합니다.');
  pending[0].resolve(true);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(pending.length, 2);
  pending[1].resolve(true);
  assert.equal(await p1, null);
  assert.equal(await p2, true);
  assert.equal(first.value, 'off');
  assert.equal(first.dataset.prevValue, 'work');
  assert.equal(second.dataset.prevValue, 'evening');
});

test('근무표 셀 RPC 예외는 최신 셀을 이전 값으로 복원하고 오류 상태를 남긴다', async () => {
  const source = html.match(/async function applyScheduleShift\([\s\S]*?\n\}/);
  const statuses = [], context = { SCHEDULE_WRITE_SEQ: {}, SCHEDULE_WRITE_TAIL: {}, SCHEDULE_CELL_VALUES: {}, setStatus: value => statuses.push(value), setShift: async () => { throw new Error('network'); } };
  vm.createContext(context);
  vm.runInContext(`${source[0]};this.applyScheduleShift=applyScheduleShift;`, context);
  const element = { value: 'off', dataset: { prevValue: 'work' }, classList: { toggle() {} } };
  assert.equal(await context.applyScheduleShift(element, 'person-1', null, 2, '2028-02-07', 'off'), false);
  assert.equal(element.value, 'work');
  assert.deepEqual(statuses, ['error']);
});

test('같은 셀의 성공·실패 조합은 최종 DB값과 화면값을 일치시킨다', async () => {
  const source = html.match(/async function applyScheduleShift\([\s\S]*?\n\}/);
  assert.ok(source, 'applyScheduleShift 함수를 찾을 수 없습니다.');
  async function scenario(outcomes) {
    let dbValue = 'work', call = 0;
    const context = {
      SCHEDULE_WRITE_SEQ: {}, SCHEDULE_WRITE_TAIL: {}, SCHEDULE_CELL_VALUES: {},
      setShift: async (...args) => { const ok = outcomes[call++]; if (ok) dbValue = args[4]; return ok; }
    };
    vm.createContext(context);
    vm.runInContext(`${source[0]};this.applyScheduleShift=applyScheduleShift;`, context);
    const element = { value: 'work', dataset: { prevValue: 'work' }, classList: { toggle() {} } };
    const first = context.applyScheduleShift(element, 'person-1', null, 2, '2028-02-07', 'off');
    element.value = 'evening';
    const second = context.applyScheduleShift(element, 'person-1', null, 2, '2028-02-07', 'evening');
    const results = await Promise.all([first, second]);
    return { dbValue, screenValue: element.value, confirmed: context.SCHEDULE_CELL_VALUES['person-1|2028-02-07|2'], results };
  }
  assert.deepEqual(await scenario([true, false]), { dbValue: 'off', screenValue: 'off', confirmed: 'off', results: [null, false] });
  assert.deepEqual(await scenario([false, true]), { dbValue: 'evening', screenValue: 'evening', confirmed: 'evening', results: [null, true] });
  assert.deepEqual(await scenario([false, false]), { dbValue: 'work', screenValue: 'work', confirmed: 'work', results: [null, false] });
  assert.match(html, /function setShiftByDate\([^\n]+return applyScheduleShift\(/);
});

function copyPrevWeekHarness(rpcError = null) {
  const source = html.match(/async function copyPrevWeek\([\s\S]*?\n\}/);
  assert.ok(source, 'copyPrevWeek 함수를 찾을 수 없습니다.');
  const calls = { rpc: [], scheduleWrites: [], render: 0, status: [], alerts: [] };
  const context = {
    addDays: () => '2026-09-07', setStatus: value => calls.status.push(value), render: () => { calls.render++; }, alert: value => calls.alerts.push(value),
    sb: {
      from(table) {
        if (table === 'schedules') {
          const builder = {
            select() { return builder; }, eq: async () => ({ data: [{ person_id: 'person-1', day: 1, shift: 'work' }], error: null }),
            upsert(payload) { calls.scheduleWrites.push(['upsert', payload]); return Promise.resolve({ error: null }); },
            delete() { calls.scheduleWrites.push(['delete']); return builder; }
          };
          return builder;
        }
        return { upsert: async payload => ({ error: null, payload }) };
      },
      rpc: async (name, args) => { calls.rpc.push([name, args]); return { error: rpcError }; }
    }
  };
  vm.createContext(context);
  vm.runInContext(`${source[0]};this.copyPrevWeek=copyPrevWeek;`, context);
  return { context, calls };
}

test('지난주 복사는 copy_schedule_week RPC로 대상 주차를 교체하고 schedules를 직접 쓰지 않는다', async () => {
  const { context, calls } = copyPrevWeekHarness();
  await context.copyPrevWeek('2026-09-14');
  assert.deepEqual(JSON.parse(JSON.stringify(calls.rpc)), [['copy_schedule_week', { p_source_week: '2026-09-07', p_target_week: '2026-09-14' }]]);
  assert.deepEqual(calls.scheduleWrites, []);
  assert.equal(calls.render, 1);
  assert.equal(calls.status.at(-1), 'saved');
});

test('지난주 복사 RPC 오류는 사용자에게 표시하고 성공 렌더를 막는다', async () => {
  const { context, calls } = copyPrevWeekHarness({ message: 'rpc denied' });
  await context.copyPrevWeek('2026-09-14');
  assert.equal(calls.status.at(-1), 'error');
  assert.match(calls.alerts.at(-1), /복사 실패.*rpc denied/);
  assert.equal(calls.render, 0);
});

test('월간 캘린더는 월 경계 주차의 전체 근무와 주차 상태를 조회한다', () => {
  assert.ok(calendarBlock, '캘린더 코드 블록이 없습니다.');
  const source = calendarBlock[1];
  assert.match(source, /const weekFrom=mondayStr\(from\),weekTo=mondayStr\(to\)/);
  assert.match(source, /from\('schedules'\)\.select\('person_id,user_id,week_start,day,shift,note'\)\.gte\('week_start',weekFrom\)\.lte\('week_start',weekTo\)/);
  assert.match(source, /from\('schedule_weeks'\)\.select\('week_start,status'\)\.gte\('week_start',weekFrom\)\.lte\('week_start',weekTo\)/);
  assert.doesNotMatch(source, /from\('schedules'\)[\s\S]*?\.eq\('shift','off'\)/);
  assert.match(source, /scheduleCalendarIndex\(scheduleRowsWithoutApprovedLeave\(schedules\|\|\[\],lv\|\|\[\]\),SCHEDULE_PEOPLE,weeks\|\|\[\]\)/);
});

test('월간 캘린더는 모든 조회 오류를 눈에 보이는 하나의 오류 문구로 표시한다', () => {
  const source = calendarBlock[1];
  for (const name of ['holidaysError', 'eventsError', 'leaveError', 'schedulesError', 'weeksError']) {
    assert.match(source, new RegExp(name));
  }
  assert.match(source, /근무표를 불러오지 못했습니다/);
});

test('캘린더 렌더 순서는 공휴일과 이벤트, 부서, 야간, 연차, OFF, 기타, 주차 상태다', () => {
  const source = calendarBlock[1];
  const markers = [
    'cal-tag hol', 'cal-tag ev',
    "calendarRosterTag('Dr.'", "calendarRosterTag('진료실'", "calendarRosterTag('데스크'", "calendarRosterTag('기공실'", "calendarRosterTag('미지정'",
    "calendarRosterTag('야간'", "calendarRosterTag('연차'", "calendarRosterTag('OFF'", "calendarRosterTag('기타'", 'cal-tag status'
  ];
  let previous = -1;
  for (const marker of markers) {
    const current = source.indexOf(marker);
    assert.ok(current > previous, `${marker} 렌더 순서가 잘못되었습니다.`);
    previous = current;
  }
  assert.doesNotMatch(source, /치과\s*휴무/);
  assert.match(source, /weekByStart\.get\(mondayStr\(c\.ds\)\)/);
});

test('캘린더 날짜 셀은 모바일·키보드 펼침과 삭제 링크 전파 차단을 제공한다', () => {
  const source = calendarBlock[1];
  assert.match(source, /function toggleCalendarDay\(cell,event\)/);
  assert.match(source, /event\.key==='Enter'\|\|event\.key===' '/);
  assert.match(source, /tabindex="0" role="button" aria-expanded="false"/);
  assert.match(source, /onclick="toggleCalendarDay\(this,event\)"/);
  assert.match(source, /onkeydown="toggleCalendarDay\(this,event\)"/);
  assert.match(source, /event\.stopPropagation\(\);deleteCalendarEvent/);
  assert.match(html, /@media\(max-width:640px\)[\s\S]*?\.cal-cell:not\(\.expanded\) \.cal-names\{display:none\}/);
  assert.match(html, /\.cal-cell:focus-visible/);
});

function calendarToggleHarness() {
  const context = {};
  vm.createContext(context);
  vm.runInContext(`${calendarBlock[1]};this.toggleCalendarDay=toggleCalendarDay;`, context);
  const calls = { toggle: 0, preventDefault: 0, attributes: [] };
  const cell = {
    classList: { toggle: () => { calls.toggle++; return true; } },
    setAttribute: (name, value) => calls.attributes.push([name, value])
  };
  return { context, calls, cell };
}

test('중첩 삭제 링크의 Enter는 기본 동작을 막거나 날짜 셀을 펼치지 않는다', () => {
  const { context, calls, cell } = calendarToggleHarness();
  context.toggleCalendarDay(cell, {
    type: 'keydown',
    key: 'Enter',
    target: { closest: selector => selector === 'a,button,input,select' ? {} : null },
    preventDefault: () => { calls.preventDefault++; }
  });
  assert.equal(calls.preventDefault, 0);
  assert.equal(calls.toggle, 0);
  assert.deepEqual(calls.attributes, []);
});

test('날짜 셀의 Enter와 Space는 기본 동작을 막고 펼침 상태를 갱신한다', () => {
  for (const key of ['Enter', ' ']) {
    const { context, calls, cell } = calendarToggleHarness();
    context.toggleCalendarDay(cell, {
      type: 'keydown',
      key,
      target: { closest: () => null },
      preventDefault: () => { calls.preventDefault++; }
    });
    assert.equal(calls.preventDefault, 1, `${JSON.stringify(key)} preventDefault 누락`);
    assert.equal(calls.toggle, 1, `${JSON.stringify(key)} 펼침 누락`);
    assert.deepEqual(calls.attributes, [['aria-expanded', 'true']]);
  }
});

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

function approvalHarness({ existingRoster = false, rosterError = null, profileError = null } = {}) {
  const approve = html.match(/async function approveProfile\([\s\S]*?async function revokeApproval/);
  assert.ok(approve, 'approveProfile 함수를 찾을 수 없습니다.');
  const source = approve[0].replace(/async function revokeApproval[\s\S]*/, '');
  const profileErrors=Array.isArray(profileError)?profileError.slice():[profileError];
  const calls = { order: [], rosterPayloads: [], profilePayloads: [], status: [], errors: [], loadProfiles: 0, loadRoster: 0, render: 0 };
  const context = {
    ME: { role: 'owner' },
    PROFILES: [{ user_id: 'user-1', name: '승인 대상' }],
    SCHEDULE_PEOPLE: existingRoster ? [{ id: 'person-1', profile_user_id: 'user-1', department: '데스크', included_in_schedule: false, active: false }] : [],
    isMgr: () => true,
    setStatus: value => calls.status.push(value),
    showScheduleRosterError: message => calls.errors.push(message),
    loadProfiles: async () => { calls.loadProfiles++; },
    loadSchedulePeople: async () => { calls.loadRoster++; },
    render: () => { calls.render++; },
    sb: {
      from(table) {
        if (table === 'schedule_people') {
          return {
            upsert: async (payload, options) => {
              calls.order.push('roster');
              calls.rosterPayloads.push({ payload, options });
              return { error: rosterError };
            }
          };
        }
        if (table === 'profiles') {
          return {
            update(payload) {
              return {
                eq: async (column, value) => {
                  calls.order.push('profile');
                  calls.profilePayloads.push({ payload, column, value });
                  return { error: profileErrors.length?profileErrors.shift():null };
                }
              };
            }
          };
        }
        throw new Error(`예상하지 않은 테이블: ${table}`);
      }
    }
  };
  vm.createContext(context);
  vm.runInContext(`${source};this.approveProfile=approveProfile;`, context);
  return { context, calls };
}

test('연결 명부가 없으면 명부 저장 성공 후에만 프로필을 승인한다', async () => {
  const { context, calls } = approvalHarness();
  await context.approveProfile('user-1');
  assert.deepEqual(calls.order, ['roster', 'profile']);
  assert.deepEqual(JSON.parse(JSON.stringify(calls.profilePayloads)), [{ payload: { approved: true }, column: 'user_id', value: 'user-1' }]);
  assert.equal(calls.status.at(-1), 'saved');
});

test('연결 명부 저장 실패는 approved=true 갱신을 차단한다', async () => {
  const { context, calls } = approvalHarness({ rosterError: { message: 'roster denied' } });
  await context.approveProfile('user-1');
  assert.deepEqual(calls.order, ['roster']);
  assert.equal(calls.profilePayloads.length, 0);
  assert.equal(calls.status.at(-1), 'error');
  assert.match(calls.errors.at(-1), /roster denied/);
});

test('연결 명부가 이미 있으면 설정을 보존하고 upsert 없이 프로필만 승인한다', async () => {
  const { context, calls } = approvalHarness({ existingRoster: true });
  await context.approveProfile('user-1');
  assert.deepEqual(calls.order, ['profile']);
  assert.equal(calls.rosterPayloads.length, 0);
  assert.equal(calls.status.at(-1), 'saved');
});

test('명부 생성 뒤 프로필 승인이 실패해도 재시도할 수 있다', async () => {
  const { context, calls } = approvalHarness({ profileError: [{ message: 'profile denied' }, null] });
  await context.approveProfile('user-1');
  assert.deepEqual(calls.order, ['roster', 'profile']);
  assert.equal(calls.status.at(-1), 'error');
  await context.approveProfile('user-1');
  assert.deepEqual(calls.order, ['roster', 'profile', 'roster', 'profile']);
  assert.equal(calls.status.at(-1), 'saved');
});
