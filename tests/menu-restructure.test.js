const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const hr = fs.readFileSync(path.join(__dirname, '..', 'hr.html'), 'utf8');
const index = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');

const menuBlock = hr.match(/\/\* menu-restructure:test-start \*\/([\s\S]*?)\/\* menu-restructure:test-end \*\//);
const tabsSource = hr.match(/const TABS=\[([\s\S]*?)\n\];/);
const menuSource = hr.match(/const MENU=\[([\s\S]*?)\n\];/);
const homeBlock = hr.match(/async function renderHome\(m\)\{([\s\S]*?)\/\* ── 입금 ── \*\//);

const norm = s => s.replace(/\s+/g, '');
const plain = v => JSON.parse(JSON.stringify(v));   // vm 안에서 만든 배열·객체는 프로토타입이 달라 그냥 비교되지 않는다

/* ── 정본: 조직도 보드 orgchart_final/boards/hr.json (status ready, source commit 2d81760) ──
   원장 정정 2건을 반영한 모습이다.
   ① '🕘 근무'는 '🔒 원장 전용' 안에 잘못 들어가 있었다 → 최상위로 뺀다(직원도 출퇴근·근무표를 봐야 한다).
   ② '❤️커뮤니티' 묶음은 비워 두기로 했다 → 메뉴에 올리지 않는다.
   라벨은 보드의 icon + label 을 합친 화면 표기다(예: icon '💡' + label '건의함' → '💡 건의함'). */
const BOARD = [
  { kind: 'tab', key: 'home', label: '홈', children: [['notice', '공지'], ['suggestions', '💡 건의함']] },
  { kind: 'group', key: 'g-work', label: '🕘 근무', children: [['sched', '근무표'], ['calendar', '📅 캘린더'], ['att', '출퇴근']] },
  { kind: 'group', key: 'g-owner', label: '🔒 원장 전용', children: [['owner', '🛡️ 계정·권한 관리'], ['aicost', '💰 AI비용'], ['pay', '💰 급여']] },
  { kind: 'group', key: 'g-care', label: '🩺 환자관리·진료', children: [['confid', '진료기록'], ['workdocs', '📚 업무자료']] },
  { kind: 'group', key: 'g-docs', label: '🏖 연차·결재·서류', children: [['contract', '근로계약서'], ['onbo', '내 서류함'], ['appr', '결재함'], ['leave', '연차']] },
  { kind: 'tab', key: 'deposit', label: '입금', children: [] }
];

/* ── 권한 불변 기준선: 이번 재편 전(origin/main) TABS의 역할 규칙 그대로 ── */
const ALL = ['staff', 'manager', 'chief', 'owner'];
const TAB_ROLE_RULES = {
  home: ALL, att: ALL, deposit: ALL, sched: ALL, leave: ALL, appr: ALL, notice: ALL,
  workdocs: ALL, calendar: ALL, suggestions: ALL, onbo: ALL, confid: ALL, contract: ALL,
  pay: ['owner'], aicost: ['owner'], owner: ['owner']
};
/* 재편 전 renderNav 의 노출 판정식 — 글자 하나도 바꾸지 않는다(공백만 무시해 비교). */
const VISIBILITY_RULE = `ME.role==='owner'
    ?t.roles.includes('owner')&&(!t.needsConfid||ME.confidAccess)
    :(()=>{const ov=(TAB_OVERRIDES[ME.id]||{})[t.key],base=(TAB_ROLES[t.key]||t.roles).includes(ME.role),shown=ov===true?true:ov===false?false:base;return t.key!=='owner'&&shown&&(!t.needsConfid||ME.confidAccess);})()`;

/* ── 정본: 조직도 보드 orgchart_final/boards/hub.json ── */
const HUB = [
  { label: null, links: ['hr.html', '치료계획.html'] },
  { label: '📚 정보(치과 소식·AI 모델 지표·설명덱)', links: ['뉴스.html', 'AI지표.html', '설명덱_제작기.html'] },
  { label: '🦷진료', links: ['기공차트_리메이크장부_서식.html', 'ortho.html', '보철프로토콜_진단기.html'] },
  { label: '🎲 재미', links: ['사주.html', '진행판.html', '직원뽑기.html'] }
];
/* 재편 전 index.html 의 카드 링크 목록 — 순서만 바뀌고 주소는 하나도 늘거나 줄지 않는다. */
const LINKS_BEFORE = ['치료계획.html', '뉴스.html', 'ortho.html', 'hr.html', '사주.html', '직원뽑기.html',
  'AI지표.html', '설명덱_제작기.html', '보철프로토콜_진단기.html', '기공차트_리메이크장부_서식.html', '진행판.html'];

function harness({ role = 'staff', confidAccess = false, tabRoles = {}, tabOverrides = {}, badge = {}, tab = 'home', id = 'u1' } = {}) {
  assert.ok(menuBlock, 'menu-restructure 코드 경계가 없습니다.');
  assert.ok(tabsSource, 'TABS 배열을 찾을 수 없습니다.');
  assert.ok(menuSource, 'MENU 배열을 찾을 수 없습니다.');
  const nav = { innerHTML: '' }, nav2 = { innerHTML: '' };
  const ctx = {
    ME: { id, role, confidAccess },
    TAB_ROLES: tabRoles, TAB_OVERRIDES: tabOverrides, BADGE: badge, TAB: tab,
    $: sel => (sel === '#nav' ? nav : sel === '#nav2' ? nav2 : null)
  };
  vm.createContext(ctx);
  vm.runInContext(
    `const TABS=[${tabsSource[1]}\n];const MENU=[${menuSource[1]}\n];${menuBlock[1]}
     this.TABS=TABS;this.MENU=MENU;this.renderNav=renderNav;this.tabLabel=tabLabel;
     this.visibleTabKeys=visibleTabKeys;this.menuTopRow=menuTopRow;this.menuSubRow=menuSubRow;this.menuEntryOf=menuEntryOf;`, ctx);
  const goTo = k => { ctx.TAB = k; ctx.renderNav(); };
  return { ctx, nav, nav2, goTo };
}
const keysOf = html => [...html.matchAll(/onclick="go\('([^']+)'\)"/g)].map(m => m[1]);
const labelsOf = html => [...html.matchAll(/<button class="[^"]*" onclick="go\('[^']+'\)">(.*?)(?:<span class="cnt">|<\/button>)/g)].map(m => m[1]);
const onKeyOf = html => (html.match(/<button class="on" onclick="go\('([^']+)'\)"/) || [])[1];

test('① 묶음·소속·순서가 조직도 보드(정정 2건 반영)와 같다', () => {
  const { ctx } = harness();
  assert.deepEqual(plain(ctx.MENU.map(e => [e.kind, e.key, e.children.slice()])),
    BOARD.map(e => [e.kind, e.key, e.children.map(c => c[0])]));
  // 정정 ①: 근무 묶음은 최상위이며 원장 전용 안에 없다.
  assert.equal(ctx.MENU.findIndex(e => e.key === 'g-work') >= 0, true);
  assert.deepEqual(plain(ctx.MENU.find(e => e.key === 'g-owner').children), ['owner', 'aicost', 'pay']);
  // 정정 ②: 커뮤니티 묶음은 메뉴에 없고, 비워 둔 자리라는 것만 주석으로 남는다.
  assert.equal(ctx.MENU.some(e => String(e.label || '').includes('커뮤니티')), false);
  assert.match(hr, /커뮤니티.*묶음은 원장 지시로 비워 둔 자리/);
  // 탭이 하나도 빠지거나 두 곳에 들어가지 않는다.
  const placed = plain(ctx.MENU).flatMap(e => (e.kind === 'tab' ? [e.key] : []).concat(e.children));
  assert.equal(new Set(placed).size, placed.length, '같은 탭이 두 묶음에 들어갔습니다.');
  assert.deepEqual(placed.slice().sort(), plain(ctx.TABS).map(t => t.key).sort());
});

test('② 메뉴 라벨이 보드와 같다', () => {
  const { ctx } = harness();
  for (const entry of BOARD) {
    if (entry.kind === 'group') assert.equal(ctx.MENU.find(e => e.key === entry.key).label, entry.label);
    else assert.equal(ctx.tabLabel(entry.key), entry.label);
    for (const [key, label] of entry.children) assert.equal(ctx.tabLabel(key), label);
  }
});

test('② 화면 안 제목도 새 이름과 어긋나지 않는다', () => {
  assert.match(hr, /<h2>🔒 진료기록<\/h2>/);
  assert.match(hr, /<h2>🛡️ 계정·권한 관리<\/h2>/);
  assert.match(hr, /다음 설계 예정\/혹은 할일/);
  assert.match(hr, /\[내 서류함\] 탭에서 제출하세요/);
  assert.doesNotMatch(hr, /다음 마일스톤/);
  assert.doesNotMatch(hr, /🔑 원장 전용/);
});

test('③ 안 쓰는 메뉴로 옮긴 홈 카드 3개가 홈에서 빠졌다', () => {
  assert.ok(homeBlock, 'renderHome 경계가 없습니다.');
  const home = homeBlock[1];
  assert.doesNotMatch(home, /contractAlertsCard/);      // ⏰ 근로계약 만료 확인
  assert.doesNotMatch(home, /업무자료 열기/);            // 📚 업무자료
  assert.doesNotMatch(home, /최근 공지/);                // 📢 최근 공지
  assert.doesNotMatch(home, /notice_reads/);             // 보이지 않는 공지를 읽음 처리하지 않는다
  assert.doesNotMatch(home, /from\('notices'\)/);
});

test('③ 그 기능의 원래 자리는 그대로 남는다', () => {
  assert.match(hr, /function contractAlertsCard\(alerts\)\{/);
  assert.match(hr, /⏰ 근로계약 만료 확인/);
  assert.match(hr, /\/\* work-documents:render-start \*\//);
  assert.match(hr, /TAB==='workdocs'\)renderWorkDocuments\(m\)/);
  assert.match(hr, /async function renderNotice\(m\)\{/);
  assert.match(hr, /notice_reads/);                      // 공지 탭의 읽음 처리
});

test('④ 각 탭의 역할 규칙과 노출 판정식이 재편 전과 동일하다', () => {
  const { ctx } = harness();
  assert.deepEqual(Object.fromEntries(plain(ctx.TABS).map(t => [t.key, t.roles])), TAB_ROLE_RULES);
  assert.deepEqual(plain(ctx.TABS).filter(t => t.needsConfid).map(t => t.key), ['confid']);
  assert.ok(norm(hr).includes(norm(VISIBILITY_RULE)), '탭 노출 판정식이 바뀌었습니다.');
  // 원장용 탭 노출 설정·사람별 예외가 여전히 판정에 쓰인다.
  assert.match(hr, /🧭 탭 노출 설정/);
  assert.match(hr, /👤 사람별 탭 예외/);
});

test('⑤ 볼 수 있는 탭이 없는 묶음은 렌더링되지 않는다', () => {
  assert.match(menuBlock[1], /menuChildKeys\(e,vis\)\.length>0/);
  // 직원에게는 원장 전용 묶음(owner·aicost·pay 전부 owner 전용)이 아예 안 보인다.
  const staff = harness({ role: 'staff' });
  staff.ctx.renderNav();
  assert.equal(labelsOf(staff.nav.innerHTML).includes('🔒 원장 전용'), false);
  // 탭 노출 설정으로 묶음 안 탭을 모두 닫으면 그 묶음도 사라진다.
  const closed = harness({ role: 'staff', tabRoles: { workdocs: ['owner'] } });
  closed.ctx.renderNav();
  assert.equal(labelsOf(closed.nav.innerHTML).includes('🩺 환자관리·진료'), false);
});

test('권한 없는 탭은 어느 줄에도 나오지 않는다 (staff·manager·chief·owner)', () => {
  for (const role of ALL) {
    const h = harness({ role });
    const vis = h.ctx.visibleTabKeys();
    for (const entry of h.ctx.MENU) {
      const shown = h.ctx.menuTopRow(vis, null).some(b => b.label === (entry.kind === 'group' ? entry.label : h.ctx.tabLabel(entry.key)));
      if (!shown) continue;
      if (entry.kind === 'group') assert.ok(entry.children.some(k => vis.has(k)), `${role}: 빈 묶음 ${entry.label}`);
    }
    for (const entry of h.ctx.MENU) {                     // 모든 묶음의 아래줄을 훑는다
      h.goTo(entry.kind === 'group' ? (entry.children.find(k => vis.has(k)) || entry.children[0]) : entry.key);
      for (const key of keysOf(h.nav2.innerHTML)) assert.ok(vis.has(key), `${role}: 권한 없는 탭 ${key} 가 아래줄에 있다`);
      for (const key of keysOf(h.nav.innerHTML)) assert.ok(vis.has(key), `${role}: 위줄 버튼이 권한 없는 탭 ${key} 로 간다`);
    }
    // owner 탭은 원장만, 진료기록은 접근 명단에 있어야 보인다.
    assert.equal(vis.has('owner'), role === 'owner');
    assert.equal(vis.has('confid'), false);
  }
  const withConfid = harness({ role: 'owner', confidAccess: true, tab: 'confid' });
  withConfid.ctx.renderNav();
  assert.deepEqual(keysOf(withConfid.nav2.innerHTML), ['confid', 'workdocs']);
});

test('역할별 위줄 묶음 구성이 보드 순서대로 나온다', () => {
  const staff = harness({ role: 'staff' });
  staff.ctx.renderNav();
  assert.deepEqual(labelsOf(staff.nav.innerHTML), ['홈', '🕘 근무', '🩺 환자관리·진료', '🏖 연차·결재·서류', '입금']);
  const owner = harness({ role: 'owner' });
  owner.ctx.renderNav();
  assert.deepEqual(labelsOf(owner.nav.innerHTML), ['홈', '🕘 근무', '🔒 원장 전용', '🩺 환자관리·진료', '🏖 연차·결재·서류', '입금']);
});

test('아래줄은 고른 묶음의 탭들이고, 자식 있는 탭은 자기 자신이 첫 항목이다', () => {
  const h = harness({ role: 'owner' });
  h.goTo('home');
  assert.deepEqual(keysOf(h.nav2.innerHTML), ['home', 'notice', 'suggestions']);
  assert.equal(onKeyOf(h.nav2.innerHTML), 'home');
  h.goTo('notice');
  assert.deepEqual(keysOf(h.nav2.innerHTML), ['home', 'notice', 'suggestions']);
  assert.equal(onKeyOf(h.nav2.innerHTML), 'notice');
  assert.equal(onKeyOf(h.nav.innerHTML), 'home', '공지를 보고 있어도 위줄은 부모 탭(홈)이 켜지고 홈 화면으로 간다');
  h.goTo('att');
  assert.deepEqual(keysOf(h.nav2.innerHTML), ['sched', 'calendar', 'att']);
  assert.equal(onKeyOf(h.nav2.innerHTML), 'att');
  h.goTo('deposit');
  assert.equal(h.nav2.innerHTML, '', '자식 없는 탭은 아래줄이 비어 숨는다');
  assert.match(hr, /\.nav2:empty\{display:none\}/);
  assert.match(hr, /<nav class="nav nav2" id="nav2"><\/nav>/);
});

test('옛 탭 id·딥링크·숨은 상담일지 경로가 그대로 동작한다', () => {
  assert.match(hr, /function go\(k\)\{if\(k==='leavestatus'\)\{k='calendar';CAL_VIEW='leave';\}TAB=k;renderNav\(\);render\(\);\}/);
  assert.match(hr, /onclick="go\(\\'consult\\'\)"/);
  const h = harness({ role: 'owner', tab: 'consult' });   // 상단 메뉴에 없는 숨은 화면
  h.ctx.renderNav();
  assert.equal(h.ctx.menuEntryOf('consult'), null);
  assert.equal(h.nav2.innerHTML, '');
  assert.equal(labelsOf(h.nav.innerHTML).length, 6, '숨은 화면에서도 위줄은 그대로 나온다');
});

test('묶음 버튼 뱃지는 그 안 탭들의 안 읽은 수를 합쳐 보여 준다', () => {
  const h = harness({ role: 'owner', badge: { notice: 2, appr: 1, leave: 3 } });
  h.ctx.renderNav();
  assert.match(h.nav.innerHTML, /홈<span class="cnt">2<\/span>/);
  assert.match(h.nav.innerHTML, /🏖 연차·결재·서류<span class="cnt">4<\/span>/);
});

test('⑥ index.html 도구 묶음·순서가 hub.json과 같다', () => {
  const groups = [{ label: null, links: [] }];
  const re = /<h2 class="tools-head">([^<]+)<\/h2>|<a class="card" href="([^"]+)"/g;
  let m;
  while ((m = re.exec(index))) {
    if (m[1] !== undefined) groups.push({ label: m[1], links: [] });
    else groups[groups.length - 1].links.push(m[2]);
  }
  assert.deepEqual(groups, HUB);
});

test('⑥ index.html 링크 주소 목록은 재편 전과 같다', () => {
  const links = [...index.matchAll(/<a class="card" href="([^"]+)"/g)].map(m => m[1]);
  assert.deepEqual([...links].sort(), [...LINKS_BEFORE].sort());
  assert.equal(links.length, LINKS_BEFORE.length);
  assert.match(index, /manifest-index\.json/);
  assert.match(index, /<script src="shared\.js"><\/script>/);
  assert.match(index, /serviceWorker.*register\('sw\.js'\)/);
});
