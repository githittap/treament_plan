// 회원가입 승인제: hr.html 이 프로필 없음·미승인·저장실패를 fail-closed 로 다루는지, 그리고
// db 패치·되돌리기 파일이 profiles 만 건드리고 UPDATE/DELETE 정책을 새로 만들지 않는지 정적으로 확인한다.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'hr.html'), 'utf8');
const patchPath = path.join(root, 'db', 'signup_approval_gate_patch.sql');
const rollbackPath = path.join(root, 'db', 'signup_approval_gate_patch_rollback.sql');

test('ME 의 approved 기본값이 false 다', () => {
  const me = /let ME=\{[^}]*\}/.exec(html);
  assert.ok(me, 'ME 초기값을 찾지 못했습니다.');
  assert.match(me[0], /approved:false/, 'ME 의 approved 기본값이 false 여야 합니다.');
  assert.doesNotMatch(me[0], /approved:true/, 'ME 의 approved 기본값이 true 면 미승인자가 승인된 직원처럼 취급됩니다.');
});

test('프로필이 없거나 approved 가 참이 아니면 승인 대기로 보낸다', () => {
  assert.match(html, /ME\.approved\s*=\s*p\s*\?\s*p\.approved\s*===\s*true\s*:\s*false/,
    '프로필이 없을 때 approved 가 true 로 통과하면 안 됩니다.');
  assert.doesNotMatch(html, /ME\.approved\s*=\s*p\s*\?[^;]*:\s*true/,
    '프로필이 없을 때 승인된 것으로 간주하는 분기가 남아 있습니다.');
  assert.match(html, /if\(!ME\.approved\)\{showPendingGate\(/,
    '미승인이면 승인 대기 화면으로 보내야 합니다.');
});

test('승인 대기 화면과 실패 메시지 자리가 있다', () => {
  assert.match(html, /function showPendingGate\(message\)/, 'showPendingGate 가 없습니다.');
  assert.match(html, /id="pendingGate"/, '승인 대기 화면(#pendingGate)이 없습니다.');
  assert.match(html, /id="pendingMsg"/, '승인 대기 화면에 실패 메시지 자리(#pendingMsg)가 없습니다.');
  assert.match(html, /승인 대기 중입니다/, '승인 대기 안내 문구가 없습니다.');
  const fn = /function showPendingGate\(message\)\{[\s\S]*?\n\}/.exec(html);
  assert.ok(fn, 'showPendingGate 본문을 찾지 못했습니다.');
  assert.match(fn[0], /\$\('#app'\)\.style\.display='none'/, '승인 대기 화면에서 앱 화면을 숨겨야 합니다.');
  assert.match(fn[0], /\$\('#pendingGate'\)\.style\.display='flex'/, '승인 대기 화면을 보여야 합니다.');
  assert.match(fn[0], /pendingMsg/, '실패 메시지를 #pendingMsg 에 표시해야 합니다.');
});

test('프로필 저장 실패를 조용히 넘기지 않는다', () => {
  assert.doesNotMatch(html, /console\.warn\('프로필 자동생성 실패/,
    '프로필 저장 실패를 console.warn 만 하고 넘기면 안 됩니다.');
  assert.match(html, /if\(insErr&&insErr\.code!=='23505'\)profileError=/,
    '이미 있음(23505)을 뺀 저장 실패는 사용자에게 보이는 메시지로 남겨야 합니다.');
  assert.match(html, /showPendingGate\(profileError\)/, '저장 실패 메시지를 승인 대기 화면에 전달해야 합니다.');
});

test('db 패치와 되돌리기 파일이 있다', () => {
  assert.ok(fs.existsSync(patchPath), '회원가입 승인제 패치가 없습니다.');
  assert.ok(fs.existsSync(rollbackPath), '회원가입 승인제 되돌리기가 없습니다.');
});

test('패치가 미승인·staff 자기 행만 허용한다', () => {
  const sql = fs.readFileSync(patchPath, 'utf8');
  assert.match(sql, /approved is not true/, '미승인 조건(approved is not true)이 없습니다.');
  assert.match(sql, /account_access_status = '활성'/, "가입 시 account_access_status 를 기본값('활성')으로 고정해야 합니다.");
  assert.match(sql, /create policy profiles_insert_self on public\.profiles for insert to authenticated/, 'profiles_insert_self 재생성이 없습니다.');
  assert.match(sql, /as restrictive for all to authenticated\s*\n?\s*using \(public\.employee_hub_access_allowed\(\)\)/,
    '게이트의 using 은 employee_hub_access_allowed() 그대로여야 합니다.');
  assert.match(sql, /raise exception 'public\.profiles policies drifted/, 'fail-closed 선검사(드리프트 정지)가 없습니다.');
  assert.match(sql, /^begin;$/m, '트랜잭션 begin 이 없습니다.');
  assert.match(sql, /^commit;$/m, '트랜잭션 commit 이 없습니다.');
});

test('패치와 되돌리기가 profiles 만 건드리고 UPDATE/DELETE 정책을 만들지 않는다', () => {
  for (const [label, file] of [['패치', patchPath], ['되돌리기', rollbackPath]]) {
    const sql = fs.readFileSync(file, 'utf8');
    const statements = sql.replace(/^\s*--.*$/gm, '');
    const targets = [...statements.matchAll(/(?:create|drop) policy (?:if exists )?[\w.]+ on ([\w.]+)/gi)].map(m => m[1]);
    assert.ok(targets.length > 0, `${label}: 정책 문장을 찾지 못했습니다.`);
    assert.deepEqual([...new Set(targets)], ['public.profiles'], `${label}: public.profiles 외 다른 표를 건드리면 안 됩니다.`);
    assert.doesNotMatch(statements, /for (update|delete)/i, `${label}: profiles 에 UPDATE/DELETE 정책을 새로 만들면 안 됩니다.`);
  }
});

test('되돌리기가 적용 전 정의를 정확히 복원한다', () => {
  const sql = fs.readFileSync(rollbackPath, 'utf8');
  assert.match(sql, /with check \(public\.employee_hub_access_allowed\(\)\);/, '게이트 check 복원이 없습니다.');
  assert.match(sql, /with check \(user_id = auth\.uid\(\) and role = 'staff'\);/, 'profiles_insert_self 복원이 없습니다.');
  assert.doesNotMatch(sql, /approved is not true/, '되돌리기에는 패치 조건이 남아 있으면 안 됩니다.');
  assert.match(sql, /raise exception 'public\.profiles policies drifted/, '되돌리기에도 fail-closed 선검사가 있어야 합니다.');
});
