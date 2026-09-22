const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const html = fs.readFileSync(path.join(__dirname, '..', 'hr.html'), 'utf8');
const block = html.match(/\/\* account-delete-ui:test-start \*\/([\s\S]*?)\/\* account-delete-ui:test-end \*\//);
const renderOwnerSource = html.match(/async function renderOwner\([\s\S]*?\r?\n\}\r?\nasync function setRole/);
const hardDeleteSource = html.match(/async function hardDeleteAccountPreserveRecords\([\s\S]*?\n\}/);

test('account-delete-ui 순수 함수 코드 블록이 포함되어 있다', () => {
  assert.ok(block, 'account-delete-ui 순수 함수 코드 블록이 없습니다.');
});

// vm 컨텍스트에서 만든 객체는 host 객체와 realm이 달라 deepEqual이 프로토타입까지 비교하며 실패한다.
// 기존 account-filling.test.js와 같은 방식으로 JSON 왕복해 순수 데이터로 비교한다.
const plain = value => JSON.parse(JSON.stringify(value));

let context;
if (block) {
  context = {};
  vm.createContext(context);
  vm.runInContext(`${block[1]};this.accountDeleteRowState=accountDeleteRowState;`, context);

  /* ── accountDeleteRowState: 어느 행에 버튼/라벨을 보여줄지 ── */
  test('차단되지 않은 계정은 아무 것도 보여주지 않는다', () => {
    const p = { user_id: 'staff-1', account_access_status: '활성' };
    assert.deepEqual(plain(context.accountDeleteRowState(p, 'owner-1')), { show: 'none' });
  });

  test('차단됐고 아직 삭제되지 않았고 본인이 아니면 삭제 버튼을 보여준다', () => {
    const p = { user_id: 'staff-1', account_access_status: '차단', auth_deleted_at: null };
    assert.equal(context.accountDeleteRowState(p, 'owner-1').show, 'blocked-deletable');
  });

  test('차단됐지만 본인 행이면 삭제 버튼을 보여주지 않는다', () => {
    const p = { user_id: 'owner-1', account_access_status: '차단', auth_deleted_at: null };
    assert.equal(context.accountDeleteRowState(p, 'owner-1').show, 'blocked');
  });

  test('auth_deleted_at이 있으면 버튼 대신 삭제됨 상태를 돌려준다', () => {
    const p = { user_id: 'staff-1', account_access_status: '차단', auth_deleted_at: '2026-09-22T00:00:00.000Z' };
    const result = context.accountDeleteRowState(p, 'owner-1');
    assert.equal(result.show, 'deleted');
    assert.equal(result.authDeletedAt, '2026-09-22T00:00:00.000Z');
  });

  test('프로필이 없으면(방어적으로) 아무 것도 보여주지 않는다', () => {
    assert.deepEqual(plain(context.accountDeleteRowState(null, 'owner-1')), { show: 'none' });
    assert.deepEqual(plain(context.accountDeleteRowState(undefined, 'owner-1')), { show: 'none' });
  });
}

/* ── renderOwner 화면 배선: 같은 행에 빨간 버튼/회색 라벨이 붙어 있는지 구조 검증 ── */
test('renderOwner에 로그인 계정 영구 삭제 버튼과 삭제됨 라벨이 배선돼 있다', () => {
  assert.ok(renderOwnerSource, 'renderOwner 함수를 찾을 수 없습니다.');
  const source = renderOwnerSource[0];
  assert.match(source, /accountDeleteRowState\(p,\s*ME\.id\)/);
  assert.match(source, /onclick="hardDeleteAccountPreserveRecords\('\$\{p\.user_id\}'\)"/);
  assert.match(source, /로그인 계정 영구 삭제/);
  assert.match(source, /로그인 계정 삭제됨/);
  // 빨간(경고) 버튼 클래스는 기존 "접속 영구 차단" 버튼과 같은 mini rej를 재사용한다.
  assert.match(source, /class="mini rej" onclick="hardDeleteAccountPreserveRecords/);
});

test('renderOwner의 로그인 계정 영구 삭제 버튼은 접속 영구 차단 버튼과 같은 셀(재직 상태 열)에 있다', () => {
  const source = renderOwnerSource[0];
  const statusCell = source.match(/<td><select id="employment-\$\{p\.user_id\}-status"[\s\S]*?<\/td>/);
  assert.ok(statusCell, '재직 상태 칸을 찾을 수 없습니다.');
  assert.match(statusCell[0], /disableEmployeeAccountPreserveRecords/);
  assert.match(statusCell[0], /hardDeleteAccountPreserveRecords/);
});

/* ── hardDeleteAccountPreserveRecords 동작 ── */
// supabase-js v2는 HTTP 오류일 때 서버 JSON을 error.context(Response)에 담고, error.message에는
// "Edge Function returned a non-2xx status code"만 넣는다. 실제 반환 모양 그대로 재현한다.
const NON_2XX = 'Edge Function returned a non-2xx status code';
function httpErrorResult(status, payload) {
  return {
    data: null,
    error: {
      name: 'FunctionsHttpError',
      message: NON_2XX,
      context: new Response(JSON.stringify(payload), { status, headers: { 'content-type': 'application/json' } })
    }
  };
}

function hardDeleteHarness({ profile, confirmReturns = true, promptReturns = '김직원', invokeResult = { data: { ok: true, message: '김직원님의 로그인 계정을 영구 삭제했습니다.' }, error: null } } = {}) {
  assert.ok(hardDeleteSource, 'hardDeleteAccountPreserveRecords 함수를 찾을 수 없습니다.');
  assert.ok(block, 'account-delete-ui 코드 블록을 찾을 수 없습니다.');
  const p = profile || { user_id: 'staff-1', name: '김직원', account_access_status: '차단', auth_deleted_at: null };
  const calls = { invoke: [], status: [], errors: [], load: 0, render: 0, confirmMsgs: [], promptMsgs: [] };
  const ctx = {
    PROFILES: [{ user_id: 'owner-1', name: '원장', role: 'owner', account_access_status: '활성' }, p],
    ME: { id: 'owner-1' },
    setStatus: value => calls.status.push(value),
    showScheduleRosterError: message => calls.errors.push(message),
    loadProfiles: async () => { calls.load++; },
    render: () => { calls.render++; },
    confirm: msg => { calls.confirmMsgs.push(msg); return confirmReturns; },
    prompt: msg => { calls.promptMsgs.push(msg); return promptReturns; },
    sb: { functions: { invoke: async (name, args) => { calls.invoke.push([name, args]); return invokeResult; } } }
  };
  vm.createContext(ctx);
  vm.runInContext(`${block[1]};${hardDeleteSource[0]};this.hardDeleteAccountPreserveRecords=hardDeleteAccountPreserveRecords;`, ctx);
  return { ctx, calls, p };
}

test('삭제 대상이 아닌 행(차단 안 됨)이면 확인창도 띄우지 않고 바로 거절한다', async () => {
  const { ctx, calls } = hardDeleteHarness({ profile: { user_id: 'staff-1', name: '재직중', account_access_status: '활성' } });
  await ctx.hardDeleteAccountPreserveRecords('staff-1');
  assert.equal(calls.invoke.length, 0);
  assert.equal(calls.confirmMsgs.length, 0, '대상이 아니면 확인창을 띄우면 안 됨');
  assert.equal(calls.status.at(-1), 'error');
});

test('첫 확인창에서 취소하면 그대로 멈추고 아무 것도 부르지 않는다', async () => {
  const { ctx, calls } = hardDeleteHarness({ confirmReturns: false });
  await ctx.hardDeleteAccountPreserveRecords('staff-1');
  assert.equal(calls.invoke.length, 0);
  assert.equal(calls.status.length, 0, '취소는 조용히 멈춰야 함(상태 변경 없음)');
});

test('첫 확인창 문구는 로그인·이메일 영구 삭제와 근무 기록 보존을 설명한다', async () => {
  const { ctx, calls } = hardDeleteHarness({ confirmReturns: false });
  await ctx.hardDeleteAccountPreserveRecords('staff-1');
  const msg = calls.confirmMsgs[0];
  assert.match(msg, /로그인/);
  assert.match(msg, /이메일/);
  assert.match(msg, /영구/);
  assert.match(msg, /근무.*연차.*계약.*출퇴근.*기록/);
});

// confidential_access.user_id는 auth.users를 ON DELETE CASCADE로 참조한다 — 로그인 계정을 지우면
// 그 직원의 케이스노트 접근권한 행도 함께 사라진다(근무 기록과 달리 보존되지 않는다).
test('첫 확인창 문구는 케이스노트 접근권한이 함께 사라진다는 것도 알린다', async () => {
  const { ctx, calls } = hardDeleteHarness({ confirmReturns: false });
  await ctx.hardDeleteAccountPreserveRecords('staff-1');
  assert.match(calls.confirmMsgs[0], /케이스노트 접근권한/);
});

test('이름 입력창에서 취소(null)하면 조용히 멈춘다', async () => {
  const { ctx, calls } = hardDeleteHarness({ promptReturns: null });
  await ctx.hardDeleteAccountPreserveRecords('staff-1');
  assert.equal(calls.invoke.length, 0);
  assert.equal(calls.status.length, 0);
});

test('이름을 틀리게 입력하면 호출하지 않고 오류를 보여준다', async () => {
  const { ctx, calls } = hardDeleteHarness({ promptReturns: '다른이름' });
  await ctx.hardDeleteAccountPreserveRecords('staff-1');
  assert.equal(calls.invoke.length, 0);
  assert.equal(calls.status.at(-1), 'error');
  assert.match(calls.errors.at(-1), /일치하지 않/);
});

test('이름 앞뒤 공백은 트림해서 비교한다', async () => {
  const { ctx, calls } = hardDeleteHarness({ promptReturns: '  김직원  ' });
  await ctx.hardDeleteAccountPreserveRecords('staff-1');
  assert.equal(calls.invoke.length, 1, '트림한 값이 일치하면 호출돼야 함');
  assert.equal(calls.invoke[0][1].body.confirm_name, '김직원');
});

test('정상 흐름: account-delete 함수를 caller 세션으로(sb.functions.invoke) 호출하고 성공하면 새로고침·재렌더한다', async () => {
  const { ctx, calls } = hardDeleteHarness();
  await ctx.hardDeleteAccountPreserveRecords('staff-1');
  assert.equal(calls.invoke.length, 1);
  assert.deepEqual(plain(calls.invoke[0]), ['account-delete', { body: { user_id: 'staff-1', confirm_name: '김직원' } }]);
  assert.equal(calls.load, 1, '성공하면 프로필을 다시 불러와야 함');
  assert.equal(calls.render, 1);
  assert.equal(calls.status.at(-1), 'saved');
  assert.match(calls.errors.at(-1), /영구 삭제했습니다/, '함수가 돌려준 한국어 결과 메시지를 보여줘야 함');
});

test('함수 호출이 실패(HTTP 409)하면 저장 실패로 표시하고 새로고침하지 않는다', async () => {
  const { ctx, calls } = hardDeleteHarness({
    invokeResult: httpErrorResult(409, { ok: false, error: 'not_blocked', stage: 'before_delete', message: '먼저 계정을 차단한 뒤에만 삭제할 수 있습니다.' })
  });
  await ctx.hardDeleteAccountPreserveRecords('staff-1');
  assert.equal(calls.status.at(-1), 'error');
  assert.match(calls.errors.at(-1), /먼저 계정을 차단한 뒤에만 삭제할 수 있습니다\./);
  assert.equal(calls.load, 0);
  assert.equal(calls.render, 0);
});

test('함수 자체가 배포되지 않아 네트워크 오류(error)가 나도 실패로 처리한다', async () => {
  const { ctx, calls } = hardDeleteHarness({
    invokeResult: { data: null, error: { message: 'Failed to send a request to the Edge Function' } }
  });
  await ctx.hardDeleteAccountPreserveRecords('staff-1');
  assert.equal(calls.status.at(-1), 'error');
  assert.match(calls.errors.at(-1), /Failed to send a request/);
});

/* ── 부분 성공 안내: 세 단계가 서로 다른 문구로 보여야 한다 ──
   supabase-js가 error.message에 넣는 "Edge Function returned a non-2xx status code"만 보여주면
   이미 로그인 계정이 지워졌는데도(되돌릴 수 없음) 원장이 "실패"로 오인한다. */

test('①삭제 전 실패: 아무것도 지워지지 않았음을 분명히 말하고, non-2xx 원문만 보여주지 않는다', async () => {
  const { ctx, calls } = hardDeleteHarness({
    invokeResult: httpErrorResult(409, { ok: false, error: 'not_blocked', stage: 'before_delete', message: '먼저 계정을 차단한 뒤에만 삭제할 수 있습니다.' })
  });
  await ctx.hardDeleteAccountPreserveRecords('staff-1');
  const msg = calls.errors.at(-1);
  assert.doesNotMatch(msg, /non-2xx/, 'supabase-js 내부 문구가 그대로 노출되면 안 됨');
  assert.match(msg, /아무것도 지워지지 않았/);
  assert.match(msg, /먼저 계정을 차단한 뒤에만 삭제할 수 있습니다\./, '서버가 준 구체적 이유를 함께 보여줘야 함');
  assert.equal(calls.status.at(-1), 'error');
});

test('②로그인 계정은 지워졌고 기록만 실패: 되돌릴 수 없음 + 같은 버튼 재시도 안내가 분명히 보인다', async () => {
  const { ctx, calls } = hardDeleteHarness({
    invokeResult: httpErrorResult(500, {
      ok: false, error: 'record_failed_after_delete', stage: 'deleted_record_failed',
      message: '로그인 계정은 이미 삭제됐습니다. 기록 저장에만 실패했습니다.',
      target_user_id: 'staff-1', target_name: '김직원'
    })
  });
  await ctx.hardDeleteAccountPreserveRecords('staff-1');
  const msg = calls.errors.at(-1);
  assert.doesNotMatch(msg, /non-2xx/);
  assert.match(msg, /로그인 계정은 이미 삭제/, '이미 지워졌다는 사실이 분명히 보여야 함');
  assert.doesNotMatch(msg, /아무것도 지워지지 않았/, '지워졌는데 안 지워졌다고 하면 안 됨');
  assert.match(msg, /되돌릴 수 없/);
  assert.match(msg, /같은 버튼을 한 번 더 누르|같은 버튼을 다시 누르/, '같은 버튼을 다시 누르면 기록이 채워진다고 안내해야 함');
});

test('③이미 완료: 추가로 지워진 것이 없다고 알리고 실패처럼 보이지 않게 한다', async () => {
  const { ctx, calls } = hardDeleteHarness({
    invokeResult: httpErrorResult(409, { ok: false, error: 'already_deleted', stage: 'already_deleted', message: '이미 영구 삭제된 계정입니다.' })
  });
  await ctx.hardDeleteAccountPreserveRecords('staff-1');
  const msg = calls.errors.at(-1);
  assert.doesNotMatch(msg, /non-2xx/);
  assert.match(msg, /이미 영구 삭제/);
  assert.doesNotMatch(msg, /아무것도 지워지지 않았/);
});

test('세 단계 문구는 서로 달라야 한다', async () => {
  const texts = [];
  for (const [status, stage, message] of [
    [409, 'before_delete', '먼저 계정을 차단한 뒤에만 삭제할 수 있습니다.'],
    [500, 'deleted_record_failed', '로그인 계정은 이미 삭제됐습니다. 기록 저장에만 실패했습니다.'],
    [409, 'already_deleted', '이미 영구 삭제된 계정입니다.']
  ]) {
    const { ctx, calls } = hardDeleteHarness({ invokeResult: httpErrorResult(status, { ok: false, stage, message }) });
    await ctx.hardDeleteAccountPreserveRecords('staff-1');
    texts.push(calls.errors.at(-1));
  }
  assert.equal(new Set(texts).size, 3, '세 단계가 같은 문구로 보이면 구분이 안 됨');
});

test('소유권 이전 실패(삭제 전)는 파일을 지우라고 안내하지 않는다', async () => {
  const { ctx, calls } = hardDeleteHarness({
    invokeResult: httpErrorResult(409, {
      ok: false, error: 'storage_transfer_failed', stage: 'before_delete',
      message: '이 직원이 올린 파일의 소유권을 원장 계정으로 넘기지 못해 삭제를 시작하지 않았습니다. 잠시 후 다시 시도하거나 관리자에게 문의하세요.'
    })
  });
  await ctx.hardDeleteAccountPreserveRecords('staff-1');
  const msg = calls.errors.at(-1);
  assert.match(msg, /소유권/);
  assert.match(msg, /아무것도 지워지지 않았/);
  assert.equal(calls.load, 0);
});

test('error.context의 본문이 JSON이 아니어도(파싱 실패) 죽지 않고 실패로 처리한다', async () => {
  const { ctx, calls } = hardDeleteHarness({
    invokeResult: { data: null, error: { message: NON_2XX, context: new Response('<html>502 Bad Gateway</html>', { status: 502 }) } }
  });
  await ctx.hardDeleteAccountPreserveRecords('staff-1');
  assert.equal(calls.status.at(-1), 'error');
  assert.match(calls.errors.at(-1), /아무것도 지워지지 않았/);
});

test('이미 삭제된 계정(auth_deleted_at 있음)이면 확인창 없이 거절한다', async () => {
  const { ctx, calls } = hardDeleteHarness({
    profile: { user_id: 'staff-1', name: '김직원', account_access_status: '차단', auth_deleted_at: '2026-09-22T00:00:00.000Z' }
  });
  await ctx.hardDeleteAccountPreserveRecords('staff-1');
  assert.equal(calls.invoke.length, 0);
  assert.equal(calls.confirmMsgs.length, 0);
  assert.equal(calls.status.at(-1), 'error');
});
