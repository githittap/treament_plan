const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const html = fs.readFileSync(path.join(__dirname, '..', 'hr.html'), 'utf8');
const block = html.match(/\/\* account-filling:test-start \*\/([\s\S]*?)\/\* account-filling:test-end \*\//);
const renderOwnerSource = html.match(/async function renderOwner\([\s\S]*?\r?\n\}\r?\nasync function setRole/);
const setRoleSource = html.match(/async function setRole\([\s\S]*?\n\}/);
const applyBulkRoleSource = html.match(/async function applyBulkRole\(\)\{[\s\S]*?\n\}/);
const copyInviteMessageSource = html.match(/async function copyInviteMessage\(\)\{[\s\S]*?\n\}/);

test('account-filling 순수 함수 코드 블록이 포함되어 있다', () => {
  assert.ok(block, 'account-filling 순수 함수 코드 블록이 없습니다.');
});

let context;
if (block) {
  context = {};
  vm.createContext(context);
  vm.runInContext(`${block[1]};this.accountFillingLists=accountFillingLists;this.bulkRoleApplyTargets=bulkRoleApplyTargets;this.inviteMessageText=inviteMessageText;this.BULK_ROLE_ALLOWED_ROLES=BULK_ROLE_ALLOWED_ROLES;`, context);

  /* ── accountFillingLists ── */
  test('계정 없는 근무명부와 승인 대기 프로필을 각각 걸러낸다', () => {
    const people = [
      { id: 'p1', name: '연결됨', profile_user_id: 'user-1' },
      { id: 'p2', name: '연결안됨1', profile_user_id: null },
      { id: 'p3', name: '연결안됨2' } // profile_user_id 필드 자체가 없는 경우도 처리
    ];
    const profiles = [
      { user_id: 'user-1', name: '승인됨', approved: true },
      { user_id: 'user-2', name: '대기1', approved: false },
      { user_id: 'user-3', name: '대기2', approved: false }
    ];
    const result = context.accountFillingLists(people, profiles);
    assert.deepEqual(result.unlinkedRoster.map(p => p.id), ['p2', 'p3']);
    assert.deepEqual(result.pendingApproval.map(p => p.user_id), ['user-2', 'user-3']);
  });

  test('빈 배열·undefined 입력에도 빈 목록을 반환한다', () => {
    const a = context.accountFillingLists(undefined, undefined);
    assert.equal(a.unlinkedRoster.length, 0);
    assert.equal(a.pendingApproval.length, 0);
    const b = context.accountFillingLists([], []);
    assert.equal(b.unlinkedRoster.length, 0);
    assert.equal(b.pendingApproval.length, 0);
  });

  test('모두 연결·승인된 경우 두 목록 모두 비어 있다', () => {
    const people = [{ id: 'p1', profile_user_id: 'user-1' }];
    const profiles = [{ user_id: 'user-1', approved: true }];
    const result = context.accountFillingLists(people, profiles);
    assert.equal(result.unlinkedRoster.length, 0);
    assert.equal(result.pendingApproval.length, 0);
  });

  /* ── bulkRoleApplyTargets ── */
  const profiles = [
    { user_id: 'owner-1', name: '원장', role: 'owner' },
    { user_id: 'staff-1', name: '직원1', role: 'staff' },
    { user_id: 'staff-2', name: '직원2', role: 'staff' },
    { user_id: 'manager-1', name: '매니저', role: 'manager' }
  ];

  // vm 컨텍스트에서 만든 배열은 host 배열과 realm이 달라 deepEqual이 프로토타입까지 비교하며 실패한다.
  // 기존 schedule-roster.test.js와 같은 방식으로 JSON 왕복해 순수 데이터로 비교한다.
  const plain = value => JSON.parse(JSON.stringify(value));

  test('role이 owner면 대상을 하나도 보내지 않는다', () => {
    const selected = new Set(['staff-1', 'staff-2']);
    assert.deepEqual(plain(context.bulkRoleApplyTargets(profiles, selected, 'owner-1', 'owner')), []);
  });

  test('허용되지 않은 임의의 role 문자열도 거부한다', () => {
    const selected = new Set(['staff-1']);
    assert.deepEqual(plain(context.bulkRoleApplyTargets(profiles, selected, 'owner-1', 'admin')), []);
    assert.deepEqual(plain(context.bulkRoleApplyTargets(profiles, selected, 'owner-1', '')), []);
  });

  test('선택 목록에 원장 본인이 포함돼도 원장 자신의 행은 제외한다', () => {
    const selected = new Set(['owner-1', 'staff-1', 'manager-1']);
    const result = plain(context.bulkRoleApplyTargets(profiles, selected, 'owner-1', 'staff'));
    assert.deepEqual(result.sort(), ['manager-1', 'staff-1'].sort());
    assert.ok(!result.includes('owner-1'), '원장 자신의 행이 대상에 포함되면 안 됩니다.');
  });

  test('profiles에 없는 알 수 없는 id는 대상에서 제외한다', () => {
    const selected = new Set(['staff-1', 'ghost-id']);
    const result = plain(context.bulkRoleApplyTargets(profiles, selected, 'owner-1', 'manager'));
    assert.deepEqual(result, ['staff-1']);
  });

  test('staff/manager/chief는 정상적으로 대상 목록을 만든다', () => {
    for (const role of ['staff', 'manager', 'chief']) {
      const selected = new Set(['staff-1', 'staff-2']);
      const result = plain(context.bulkRoleApplyTargets(profiles, selected, 'owner-1', role));
      assert.deepEqual(result.sort(), ['staff-1', 'staff-2'].sort());
    }
  });

  test('선택이 비어 있으면 빈 배열을 반환한다', () => {
    assert.deepEqual(plain(context.bulkRoleApplyTargets(profiles, new Set(), 'owner-1', 'staff')), []);
    assert.deepEqual(plain(context.bulkRoleApplyTargets(profiles, undefined, 'owner-1', 'staff')), []);
  });

  test('허용 role 목록은 owner를 포함하지 않는다', () => {
    assert.deepEqual(plain(context.BULK_ROLE_ALLOWED_ROLES), ['staff', 'manager', 'chief']);
  });

  /* ── inviteMessageText ── */
  test('가입 안내 문구는 가입 링크와 3단계 안내를 포함한다', () => {
    const text = context.inviteMessageText();
    assert.match(text, /https:\/\/jung-plant\.com\/hr\.html/);
    assert.match(text, /회원가입/);
    assert.match(text, /원장 승인/);
    assert.match(text, /로그인/);
  });

  test('가입 안내 문구에는 개인정보(전화번호·이메일·특정 이름)가 없다', () => {
    const text = context.inviteMessageText();
    assert.doesNotMatch(text, /\d{2,3}-?\d{3,4}-?\d{4}/, '전화번호로 보이는 숫자열이 포함되어 있습니다.');
    assert.doesNotMatch(text, /@/, '이메일 주소로 보이는 문구가 포함되어 있습니다.');
    assert.doesNotMatch(text, /정용태|원장님|[가-힣]{2,3}(님|씨)/, '특정 개인 이름이 포함되어 있습니다.');
  });
}

/* ── renderOwner 화면 배선: setRole과 동일한 쓰기 경로를 재사용하는지 구조 검증 ── */
test('renderOwner에 미가입자·승인 대기 섹션과 일괄 적용 UI가 있다', () => {
  assert.ok(renderOwnerSource, 'renderOwner 함수를 찾을 수 없습니다.');
  const source = renderOwnerSource[0];
  assert.match(source, /미가입자·승인 대기/);
  assert.match(source, /accountFillingLists\(SCHEDULE_PEOPLE,PROFILES\)/);
  assert.match(source, /onclick="copyInviteMessage\(\)"/);
  assert.match(source, /id="bulkRoleSelect"/);
  assert.match(source, /onclick="applyBulkRole\(\)"/);
  assert.match(source, /onchange="toggleBulkRoleSelect\('\$\{p\.user_id\}',this\.checked\)"/);
  // 본인(원장) 행에는 체크박스를 그리지 않는다
  assert.match(source, /\$\{p\.user_id===ME\.id\?'':`<input type="checkbox"/);
});

test('일괄 권한 적용 드롭다운은 owner를 옵션으로 제공하지 않는다', () => {
  const source = renderOwnerSource[0];
  const select = source.match(/id="bulkRoleSelect"[\s\S]*?<\/select>/);
  assert.ok(select, 'bulkRoleSelect 드롭다운을 찾을 수 없습니다.');
  assert.doesNotMatch(select[0], />owner</);
});

test('applyBulkRole은 setRole과 동일한 RPC(update_employee_profile_field, field=role)를 사용한다', () => {
  assert.ok(setRoleSource, 'setRole 함수를 찾을 수 없습니다.');
  assert.ok(applyBulkRoleSource, 'applyBulkRole 함수를 찾을 수 없습니다.');
  assert.match(setRoleSource[0], /sb\.rpc\('update_employee_profile_field',\{p_user_id:uid,p_field:'role',p_value:role\}\)/);
  assert.match(applyBulkRoleSource[0], /sb\.rpc\('update_employee_profile_field',\{p_user_id:uid,p_field:'role',p_value:role\}\)/);
  assert.match(applyBulkRoleSource[0], /bulkRoleApplyTargets\(PROFILES,BULK_ROLE_SELECTED,ME\.id,role\)/);
});

test('copyInviteMessage는 클립보드 복사만 하고 서버로 전송하지 않는다', () => {
  assert.ok(copyInviteMessageSource, 'copyInviteMessage 함수를 찾을 수 없습니다.');
  assert.match(copyInviteMessageSource[0], /navigator\.clipboard\.writeText\(inviteMessageText\(\)\)/);
  assert.doesNotMatch(copyInviteMessageSource[0], /sb\.(from|rpc)\(/);
});

/* ── applyBulkRole 동작: 실패 시 중단하고, 성공 시 선택을 비우고 재로딩한다 ── */
function applyBulkRoleHarness({ role = 'staff', selected = new Set(['staff-1']), rpcErrors = [] } = {}) {
  assert.ok(applyBulkRoleSource, 'applyBulkRole 함수를 찾을 수 없습니다.');
  assert.ok(block, 'account-filling 코드 블록을 찾을 수 없습니다.');
  const calls = { rpc: [], status: [], load: 0, render: 0, errors: [] };
  const profiles = [
    { user_id: 'owner-1', role: 'owner' },
    { user_id: 'staff-1', role: 'staff' },
    { user_id: 'staff-2', role: 'staff' }
  ];
  const rpcQueue = rpcErrors.slice();
  const elements = { bulkRoleSelect: { value: role } };
  const context = {
    PROFILES: profiles,
    ME: { id: 'owner-1' },
    BULK_ROLE_SELECTED: selected,
    $: sel => elements[sel.replace('#', '')] || null,
    setStatus: value => calls.status.push(value),
    showScheduleRosterError: message => calls.errors.push(message),
    loadProfiles: async () => { calls.load++; },
    render: () => { calls.render++; },
    sb: { rpc: async (name, args) => { calls.rpc.push([name, args]); return { error: rpcQueue.shift() || null }; } }
  };
  vm.createContext(context);
  vm.runInContext(`${block[1]};${applyBulkRoleSource[0]};this.applyBulkRole=applyBulkRole;this.getSelected=()=>BULK_ROLE_SELECTED;`, context);
  return { context, calls };
}

test('일괄 적용 성공 시 선택한 각 대상에 동일 RPC를 호출하고 선택을 비운 뒤 새로고침한다', async () => {
  const { context, calls } = applyBulkRoleHarness({ selected: new Set(['staff-1', 'staff-2', 'owner-1']) });
  await context.applyBulkRole();
  assert.deepEqual(JSON.parse(JSON.stringify(calls.rpc)), [
    ['update_employee_profile_field', { p_user_id: 'staff-1', p_field: 'role', p_value: 'staff' }],
    ['update_employee_profile_field', { p_user_id: 'staff-2', p_field: 'role', p_value: 'staff' }]
  ]);
  assert.equal(context.getSelected().size, 0, '성공 후 선택 목록이 비워져야 합니다.');
  assert.equal(calls.load, 1);
  assert.equal(calls.render, 1);
  assert.equal(calls.status.at(-1), 'saved');
});

test('일괄 적용 중 RPC 오류가 나면 남은 대상 호출을 멈추고 오류를 표시한다', async () => {
  const { context, calls } = applyBulkRoleHarness({
    selected: new Set(['staff-1', 'staff-2']),
    rpcErrors: [{ message: 'rpc denied' }]
  });
  await context.applyBulkRole();
  assert.equal(calls.rpc.length, 1, '첫 번째 실패 이후 나머지 대상에는 호출하지 않아야 합니다.');
  assert.equal(calls.status.at(-1), 'error');
  assert.match(calls.errors.at(-1), /rpc denied/);
  assert.equal(calls.load, 0, '실패했으면 새로고침하지 않아야 합니다.');
});

test('선택된 대상이 없으면(원장 본인만 선택) RPC를 호출하지 않고 안내만 표시한다', async () => {
  const { context, calls } = applyBulkRoleHarness({ selected: new Set(['owner-1']) });
  await context.applyBulkRole();
  assert.deepEqual(calls.rpc, []);
  assert.equal(calls.status.at(-1), 'error');
  assert.match(calls.errors.at(-1), /선택/);
});
