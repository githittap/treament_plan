const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// 원장 지시 2026-09-26: 데스크·실장·매니저는 허브 맨 앞에 문의함(위줄 첫 칸 + 처음 화면), 알림의 ?tab= 은 그 탭으로.
const hr = fs.readFileSync(path.join(__dirname, '..', 'hr.html'), 'utf8').replace(/\r\n/g, '\n');
const block = hr.match(/\/\* inbox-first:test-start \*\/([\s\S]*?)\/\* inbox-first:test-end \*\//)[1];
const tabsSource = hr.match(/const TABS=\[([\s\S]*?)\n\];/)[1];
const menuSource = hr.match(/const MENU=\[([\s\S]*?)\n\];/)[1];
const plain = v => JSON.parse(JSON.stringify(v));
const BAKIROVA = '212cef7e-8aab-4f72-b78d-4dfca59581e0';

function load(me, href = 'https://jung-plant.com/hr.html') {
  const ctx = {
    ME: { id: 'u-1', department: '', ...me }, TAB: 'home', URL, URLSearchParams,
    location: { href }, replaced: null,
    history: { replaceState(_s, _t, url) { ctx.replaced = url; } },
  };
  vm.createContext(ctx);
  vm.runInContext(`var TABS=[${tabsSource}\n];var MENU=[${menuSource}\n];
    function tabVisible(t){return (t.roles||[]).includes(ME.role);}
    ${block}`, ctx);
  return ctx;
}
const care = ctx => ctx.MENU.find(e => e.key === 'g-care').children;

test('데스크·실장·매니저·통역(Bakirova)은 위줄 첫 칸이 문의함이고 처음 화면도 문의함이다', () => {
  for (const me of [
    { role: 'staff', department: '데스크' },
    { role: 'manager', department: '기타' },
    { role: 'chief', department: '진료실' },
    { role: 'staff', department: '기타', id: BAKIROVA },
  ]) {
    const ctx = load(me);
    assert.equal(ctx.applyInboxFirst(), true, JSON.stringify(me));
    assert.deepEqual(plain(ctx.MENU[0]), { kind: 'tab', key: 'inbox', children: [] });
    assert.equal(ctx.MENU[1].key, 'home');
    assert.equal(care(ctx).includes('inbox'), false, '묶음 안 문의함은 빼서 두 번 안 보이게');
    assert.equal(ctx.TAB, 'inbox');
  }
});

test('그 밖의 직원과 원장은 그대로다(홈이 처음)', () => {
  for (const me of [{ role: 'staff', department: '진료실' }, { role: 'staff', department: '기공팀' }, { role: 'owner', department: '' }]) {
    const ctx = load(me);
    assert.equal(ctx.applyInboxFirst(), false, JSON.stringify(me));
    assert.equal(ctx.MENU[0].key, 'home');
    assert.equal(care(ctx).includes('inbox'), true);
    assert.equal(ctx.TAB, 'home');
  }
});

test('두 번 불러도 문의함 칸이 하나뿐이고, 사용자가 옮긴 탭을 되돌리지 않는다', () => {
  const ctx = load({ role: 'manager' });
  ctx.applyInboxFirst();
  ctx.TAB = 'leave';
  assert.equal(ctx.applyInboxFirst(), false);
  assert.equal(ctx.MENU.filter(e => e.key === 'inbox').length, 1);
  assert.equal(ctx.TAB, 'leave');
});

test('알림 주소 ?tab= 은 볼 수 있는 탭일 때만 열고, 한 번 쓴 뒤 주소에서 지운다', () => {
  let ctx = load({ role: 'staff', department: '진료실' }, 'https://jung-plant.com/hr.html?tab=leave#x');
  ctx.applyTabFromUrl();
  assert.equal(ctx.TAB, 'leave');
  assert.equal(ctx.replaced, '/hr.html#x');

  ctx = load({ role: 'staff', department: '진료실' }, 'https://jung-plant.com/hr.html?tab=pay');
  ctx.applyTabFromUrl();
  assert.equal(ctx.TAB, 'home', '원장 전용 탭은 직원에게 열지 않는다');
  assert.equal(ctx.replaced, '/hr.html');

  ctx = load({ role: 'staff', department: '데스크' }, 'https://jung-plant.com/hr.html?tab=leave');
  ctx.applyInboxFirst(); ctx.applyTabFromUrl();
  assert.equal(ctx.TAB, 'leave', '알림으로 연 탭이 문의함 기본보다 먼저');

  ctx = load({ role: 'staff' }, 'https://jung-plant.com/hr.html');
  ctx.applyTabFromUrl();
  assert.equal(ctx.replaced, null, '?tab= 이 없으면 주소를 건드리지 않는다');
});

test('로그인 뒤 첫 그리기 바로 앞에서 부른다', () => {
  assert.match(hr, /applyInboxFirst\(\);applyTabFromUrl\(\);\n\s*renderNav\(\);await render\(\);await refreshBadges\(\);/);
});
