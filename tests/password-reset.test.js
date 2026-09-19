const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const html = fs.readFileSync(path.join(__dirname, '..', 'hr.html'), 'utf8');
const block = html.match(/\/\* password-reset:test-start \*\/([\s\S]*?)\/\* password-reset:test-end \*\//);

function loadHelpers() {
  assert.ok(block, '비밀번호 재설정 테스트 경계가 없습니다.');
  const context = {};
  vm.runInNewContext(`${block[1]};this.validatePasswordReset=validatePasswordReset;`, context);
  return context.validatePasswordReset;
}

test('로그인 화면에 비밀번호 찾기와 재설정 UI가 있다', () => {
  assert.match(html, /id="lgResetBtn"/);
  assert.match(html, /id="resetView"/);
  assert.match(html, /id="resetEmail"/);
  assert.match(html, /id="resetPw"/);
  assert.match(html, /id="resetPw2"/);
});

test('재설정 메일은 지정된 redirectTo로 보내고 PASSWORD_RECOVERY에서 비밀번호를 변경한다', () => {
  assert.match(html, /resetPasswordForEmail\(email,\{redirectTo:'https:\/\/jung-plant\.com\/hr\.html'\}\)/);
  assert.match(html, /event==='PASSWORD_RECOVERY'/);
  assert.match(html, /updateUser\(\{password:newPassword\}\)/);
  assert.match(html, /session&&!passwordRecoveryMode/);
  assert.match(html, /function showRecoveryView\(\)\{[\s\S]*?\$\('#gate'\)\.style\.display='';[\s\S]*?\$\('#app'\)\.style\.display='none'/);
  assert.match(html, /function showAuth\(mode\)\{[\s\S]*?if\(mode==='login'\)\{/);
});

test('비밀번호는 6자 이상이고 확인값과 일치해야 한다', () => {
  const validate = loadHelpers();
  assert.equal(validate('', ''), '비밀번호를 입력하세요.');
  assert.equal(validate('12345', '12345'), '비밀번호는 6자 이상이어야 합니다.');
  assert.equal(validate('123456', '123457'), '비밀번호가 일치하지 않습니다.');
  assert.equal(validate('123456', '123456'), '');
});

test('비밀번호를 로그·저장소에 남기지 않는다', () => {
  assert.doesNotMatch(html, /localStorage\.[^\n]*(?:pw|password)/i);
  assert.doesNotMatch(html, /console\.[^\n]*(?:pw|password)/i);
});
