// 업무매뉴얼 설명덱(2026-10-10) 시험 — 사진 슬라이드 단계 순서·좌표 비율 저장/복원·확대 중 단계 안 넘어감·단축키가 입력칸에서 안 먹음·직원 계정엔 편집 단추 없음
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const root = path.join(__dirname, '..'), read = p => fs.readFileSync(path.join(root, p), 'utf8');
const maker = read('설명덱_제작기.html'), hr = read('hr.html'), js = read('hub-texts.js');
const clone = x => JSON.parse(JSON.stringify(x));
const between = (s, a, b) => { const i = s.indexOf(a), j = s.indexOf(b, i + a.length); assert.ok(i >= 0 && j > i, '경계가 없습니다: ' + a); return s.slice(i + a.length, j); };

const pureSrc = between(maker, '/* manual-deck:test-start */', '/* manual-deck:test-end */');
const geoSrc = between(maker, '<script type="text/plain" id="phGeoSrc">', '</script>');
const engineSrc = between(maker, '<script type="text/plain" id="engineSrc">', '</script>');
const photoEngine = engineSrc.slice(engineSrc.indexOf('/* ---- 사진 슬라이드: 사진 + 화살표'), engineSrc.indexOf('const BUILDERS'));

const geo = (() => { const ctx = {}; vm.createContext(ctx); vm.runInContext(geoSrc + ';this.api={phFit,phArrow,phLabelPos,phSafeColor,phLabelFont,phAvoid,phFxOk};', ctx); return ctx.api; })();
const pure = (() => { const ctx = { PHG: geo }; vm.createContext(ctx); vm.runInContext(pureSrc + ';this.api={rnd2,clampPct,roleCanEdit,isTypingTarget,phNormalize,phBendAdd,phBendRemove,phSwapMarks,deckForStore,snapEncode,snapDecode,shortcutAction,zoomAt};', ctx); return ctx.api; })();

/* ---- 아주 작은 가짜 화면(DOM): 엔진의 buildPhoto/phBind를 노드에서 돌리기 위함 ---- */
function fakeNode(tag, cls) {
  const n = { tag, className: cls || '', dataset: {}, children: [], style: { props: {}, setProperty(k, v) { this.props[k] = v; } }, attrs: {}, handlers: {}, textContent: '', innerHTML: '',
    appendChild(c) { this.children.push(c); return c; }, setAttribute(k, v) { this.attrs[k] = v; if (k === 'class') this.className = v; }, addEventListener(t, f) { (this.handlers[t] = this.handlers[t] || []).push(f); },
    getBoundingClientRect() { return { left: 0, top: 0, width: this.clientWidth || 0, height: this.clientHeight || 0 }; }, setPointerCapture() {}, clientWidth: 0, clientHeight: 0, offsetWidth: 80, offsetHeight: 24 };
  n.classList = { set: new Set((cls || '').split(' ').filter(Boolean)), add(c) { this.set.add(c); }, toggle(c, f) { f ? this.set.add(c) : this.set.delete(c); }, contains(c) { return this.set.has(c); } };
  return n;
}
function walk(n, f) { f(n); (n.children || []).forEach(c => walk(c, f)); }
function engineCtx(extra) {
  const ctx = Object.assign({ Math, Map, Number, String, Array, document: { createElementNS: (ns, tag) => fakeNode(tag), createElement: t => fakeNode(t) }, Image: function () { return fakeNode('img'); },
    ResizeObserver: undefined, calls: [] }, extra || {});
  vm.createContext(ctx);
  vm.runInContext(geoSrc + `\nfunction el(tag,cls,html){const n=document.createElement(tag);if(cls)n.className=cls;if(html!=null)n.innerHTML=html;return n;}\nfunction next(){calls.push('next');}\nfunction prev(){calls.push('prev');}\n` + photoEngine + ';this.buildPhoto=buildPhoto;this.phBind=phBind;this.phApply=phApply;this.phLayout=phLayout;', ctx);
  return ctx;
}
const PHOTO = { type: 'photo', title: '3번 서랍장', notes: '메모', image: { src: 'x', w: 1600, h: 900 }, marks: [
  { id: 'a', kind: 'arrow', pts: [[10, 20], [22, 28]], text: '1번', step: 1 },
  { id: 'b', kind: 'arrow', pts: [[40, 10], [48, 40], [30, 52]], text: '꺾인 화살표', step: 2 },
  { id: 'c', kind: 'arrow', pts: [[70, 90], [62, 70]], text: '', step: 3 },
  { id: 'd', kind: 'label', x: 75, y: 38, text: '<img src=x onerror=alert(1)>', step: 3 }] };

test('사진 슬라이드: 화살표 3개가 클릭(step)마다 하나씩 차례로 나오고 글은 화살표와 같은 단계, 글은 HTML로 해석되지 않는다', () => {
  const ctx = engineCtx(), body = ctx.buildPhoto(clone(PHOTO));
  const arrows = [], lbls = [];
  walk(body, n => { if (n.dataset.step !== undefined) { if (/ph-arrow/.test(n.className)) arrows.push(+n.dataset.step); if (/ph-lbl/.test(n.className)) lbls.push(+n.dataset.step); } });
  assert.deepEqual(arrows, [1, 2, 3], '화살표 선');
  assert.deepEqual(lbls, [1, 2, 3], '화살표 글 2개 + 자유 글 1개(단계 1·2·3)');
  const heads = []; walk(body, n => { if (/ph-head/.test(n.className)) heads.push(+n.dataset.step); });
  assert.deepEqual(heads, [1, 2, 3], '화살촉도 같은 단계');
  // 엔진 apply()와 같은 규칙(step<=지금 단계면 켜짐)으로 한 클릭씩 → 켜진 화살표 1·2·3개
  const on = st => { let k = 0; walk(body, n => { if (/ph-arrow/.test(n.className) && +n.dataset.step <= st) k++; }); return k; };
  assert.deepEqual([0, 1, 2, 3].map(on), [0, 1, 2, 3]);
  let html = false; walk(body, n => { if (n.tag === 'img' || /<img/.test(n.innerHTML)) html = html || /<img/.test(n.innerHTML); });
  assert.equal(html, false, '글은 textContent로만 넣음');
  const lab = []; walk(body, n => { if (/ph-lbl-box/.test(n.className)) lab.push(n.textContent); });
  assert.ok(lab.includes('<img src=x onerror=alert(1)>'));
});

test('좌표는 사진 기준 비율: PC·폰 폭이 달라도 같은 비율 지점을 가리키고, 저장→복원해도 그대로', () => {
  for (const [bw, bh] of [[327, 184], [1000, 562.5]]) {
    const g = geo.phArrow([[10, 20], [22, 28]], bw, bh, 3);
    assert.ok(Math.abs(g.tail.x / bw * 100 - 10) < 1e-9 && Math.abs(g.tail.y / bh * 100 - 20) < 1e-9, '꼬리 ' + bw);
    const tip = g.head.split(' ')[0].split(',').map(Number);
    assert.ok(Math.abs(tip[0] / bw * 100 - 22) < 0.1 && Math.abs(tip[1] / bh * 100 - 28) < 0.1, '화살촉 끝 ' + bw);
  }
  const bent = geo.phArrow([[40, 10], [48, 40], [30, 52]], 600, 400, 3);
  assert.equal((bent.d.match(/L/g) || []).length, 2, '꺾은 화살표는 꺾임점을 지남(점 3개)');
  const saved = JSON.parse(JSON.stringify(pure.deckForStore({ meta: { title: 't' }, slides: [clone(PHOTO)] })));
  const back = pure.phNormalize(saved.slides[0], () => 'id');
  assert.deepEqual(clone(back.marks.map(m => m.pts || [m.x, m.y])), [[[10, 20], [22, 28]], [[40, 10], [48, 40], [30, 52]], [[70, 90], [62, 70]], [75, 38]]);
  assert.deepEqual(clone(back.marks.map(m => m.step)), [1, 2, 3, 3]);
  const messy = pure.phNormalize({ type: 'photo', image: { path: 'p/x.webp' }, marks: [{ kind: 'arrow', pts: [[-5, 120.4567], [33.333, 66.666]], step: '2' }, { kind: 'arrow', pts: [[1, 1]] }, { x: 50.126, y: 'z' }] }, () => 'i');
  assert.equal(messy.marks.length, 2, '점이 1개뿐인 화살표는 버림');
  assert.deepEqual(clone(messy.marks[0].pts), [[0, 100], [33.33, 66.67]], '범위 0~100·소수 둘째 자리');
  assert.equal(messy.marks[0].step, 2);
  assert.deepEqual(clone([messy.marks[1].kind, messy.marks[1].x, messy.marks[1].y]), ['label', 50.13, 0]);
  // 서버에는 사진 경로만, 주소(src)는 안 저장
  const st = pure.deckForStore({ meta: {}, slides: [{ type: 'photo', image: { path: 'd/a.webp', src: 'https://signed', w: 1, h: 1 }, marks: [] }] });
  assert.deepEqual(clone(st.slides[0].image), { path: 'd/a.webp', w: 1, h: 1 });
});

test('되돌리기 기록: 긴 사진 데이터주소는 한 번만 보관했다가 그대로 복원', () => {
  const big = 'data:image/webp;base64,' + 'A'.repeat(600), list = [];
  const s1 = pure.snapEncode({ d: { slides: [{ image: { src: big } }, { image: { src: big } }] }, s: 1 }, list), s2 = pure.snapEncode({ d: { slides: [{ image: { src: big } }] }, s: 0 }, list);
  assert.equal(list.length, 1); assert.ok(s1.length < 200 && s2.length < 200);
  assert.equal(pure.snapDecode(s1, list).d.slides[1].image.src, big);
});

test('확대·이동 중에는 단계가 안 넘어감: 가운데 탭 무반응 · 가장자리 짧은 탭만 이전/다음 · 두 손가락 확대 · 확대 중 가장자리 탭 무반응 · 확대 상태 이동', () => {
  const ctx = engineCtx(), ph = { pv: fakeNode('div'), inn: fakeNode('div'), box: fakeNode('div'), W: 327, H: 300, z: 1, tx: 0, ty: 0 };
  ph.pv.clientWidth = 327; ph.pv.clientHeight = 300;
  ctx.phBind(ph);
  const fire = (t, id, x, y) => (ph.pv.handlers[t] || []).forEach(h => h({ type: t, pointerId: id, pointerType: 'touch', clientX: x, clientY: y, button: 0, preventDefault() {} }));
  const tap = x => { fire('pointerdown', 1, x, 100); fire('pointerup', 1, x, 100); };
  tap(160); assert.deepEqual(ctx.calls, [], '사진 가운데 탭은 단계를 안 넘김');
  tap(320); assert.deepEqual(ctx.calls, ['next']); tap(4); assert.deepEqual(ctx.calls, ['next', 'prev']);
  ctx.calls.length = 0;
  fire('pointerdown', 1, 140, 100); fire('pointerdown', 2, 180, 100);
  for (let i = 1; i <= 10; i++) { fire('pointermove', 1, 140 - i * 8, 100); fire('pointermove', 2, 180 + i * 8, 100); }
  fire('pointerup', 2, 260, 100); fire('pointerup', 1, 60, 100);
  assert.ok(ph.z > 2, '확대됨 z=' + ph.z); assert.deepEqual(ctx.calls, [], '확대 조작 중·직후 단계 안 넘어감');
  tap(322); tap(3); assert.deepEqual(ctx.calls, [], '확대한 상태의 가장자리 탭도 무반응(「다음」 단추로만)');
  const tx0 = ph.tx; fire('pointerdown', 1, 100, 100); fire('pointermove', 1, 140, 120); fire('pointerup', 1, 140, 120);
  assert.notEqual(ph.tx, tx0, '확대 상태에서 한 손가락 이동'); assert.deepEqual(ctx.calls, []);
  assert.ok(ph.box.style.props['--iz'] < 1, '글은 확대 비율만큼 줄여 그려 같은 크기 유지');
  let stopped = false; (ph.pv.handlers.click || []).forEach(h => h({ stopPropagation() { stopped = true; } }));
  assert.ok(stopped, '사진을 눌러도 click이 위로 올라가 다음 단계로 넘어가지 않음');
});

test('글 크기: 사진 위 설명 글은 14px 이상, 확대해도 같은 크기(--iz) · 폰 폭에서 사진 장 안쪽 여백을 줄임', () => {
  const css = between(maker, '<template id="slideCSS">', '</template>');
  const fs = +css.match(/\.ph-lbl-box\{[^}]*font-size:(\d+)px/)[1];
  assert.ok(fs >= 14, 'font-size ' + fs);
  assert.match(css, /\.ph-lbl\{[^}]*transform:scale\(var\(--iz,1\)\)/);
  assert.match(css, /\.slide\.slide-photo\{padding:clamp\(10px/);
  assert.match(css, /\.pv\{[^}]*touch-action:none/);
});

test('편집 단축키: 글 입력 칸(입력·글상자·선택칸·편집영역)에서는 하나도 안 먹고, 그 밖에서는 원장이 정한 글쇠(Q 화살표·R 꺾기·Ctrl+E 복제·↑↓ 장 이동)', () => {
  const k = (code, extra) => Object.assign({ code, key: code.replace('Key', '').toLowerCase(), target: { tagName: 'DIV' } }, extra || {});
  const ctx = { photo: true, hasSel: true };
  for (const tag of ['INPUT', 'TEXTAREA', 'SELECT']) for (const code of ['KeyQ', 'KeyT', 'KeyA', 'KeyE', 'KeyR', 'Delete', 'Escape', 'ArrowDown'])
    assert.equal(pure.shortcutAction(k(code, { target: { tagName: tag } }), ctx), null, tag + ' ' + code);
  assert.equal(pure.shortcutAction(k('KeyZ', { ctrlKey: true, target: { tagName: 'INPUT' } }), ctx), null);
  assert.equal(pure.shortcutAction(k('KeyQ', { target: { tagName: 'DIV', isContentEditable: true } }), ctx), null);
  const want = { KeyQ: 'tool-arrow', KeyT: 'tool-text', KeyA: 'tool-select', KeyE: 'tool-erase', KeyR: 'bend', Delete: 'delete', Escape: 'cancel', ArrowDown: 'slide-next', ArrowUp: 'slide-prev' };
  for (const [code, act] of Object.entries(want)) assert.equal(pure.shortcutAction(k(code), ctx), act, code);
  assert.equal(pure.shortcutAction(k('KeyR', { shiftKey: true }), ctx), 'straighten', 'Shift+R = 곧게 펴기');
  assert.equal(pure.shortcutAction(k('KeyR', { shiftKey: true, target: { tagName: 'TEXTAREA' } }), ctx), null, '입력 칸에선 Shift+R도 무반응');
  assert.equal(pure.shortcutAction(k('KeyZ', { ctrlKey: true }), ctx), 'undo');
  assert.equal(pure.shortcutAction(k('KeyZ', { ctrlKey: true, shiftKey: true }), ctx), 'redo');
  assert.equal(pure.shortcutAction(k('KeyY', { ctrlKey: true }), ctx), 'redo');
  assert.equal(pure.shortcutAction(k('KeyE', { ctrlKey: true }), ctx), 'dup');
  assert.equal(pure.shortcutAction({ code: '', key: 'q', target: { tagName: 'DIV' } }, ctx), 'tool-arrow', '글쇠 코드가 없어도 글자로 인식');
  assert.equal(pure.shortcutAction(k('KeyQ'), { photo: false }), null, '사진 슬라이드가 아니면 그리기 글쇠 무반응');
  assert.equal(pure.shortcutAction(k('ArrowDown'), { photo: false }), 'slide-next', '장 이동·복제·되돌리기는 어느 장에서나');
  assert.equal(pure.shortcutAction(k('Delete'), { photo: true, hasSel: false }), null, '선택한 게 없으면 Delete 무반응(슬라이드를 실수로 안 지움)');
  assert.equal(pure.shortcutAction(k('KeyQ', { altKey: true }), ctx), null);
  assert.equal(pure.shortcutAction(k('KeyQ'), { photo: true, blocked: true }), null, '도움말 창이 열려 있으면 무반응');
  assert.ok(maker.includes('R 한 번 더 = 꺾임 더하기 · Shift+R = 펴기 · 꺾임점 두 번 누르면 빼기') && !/다시 [JKD] = /.test(maker), '꺾기 안내도 새 글쇠(R·Shift+R)');
  // 화면 연결: 안내 칸 + 도움말 표 + 보기용 keydown과 따로(제작기 문서 vs 미리보기 문서)
  assert.match(maker, /id="keyHint"/); assert.match(maker, /편집 단축키 \(글 입력 칸에서는 안 먹어요\)/);
  for (const key of ['Ctrl+Z', 'Ctrl+Y', 'Ctrl+E', 'Delete', 'Esc', '↓ / ↑', 'Q', 'R']) assert.ok(maker.includes('<kbd>' + key + '</kbd>'), key);
});

test('표시 순서 바꾸기', () => {
  const m = clone(PHOTO.marks);
  assert.ok(!/phNextStep/.test(maker), '순서 기본 0 — 다음 단계 번호 함수는 없어짐');
  assert.match(maker, /kind:'arrow', pts:\[a0, p\], text:'', step:0/); assert.match(maker, /kind:'label', x:p\[0\], y:p\[1\], text:'', step:0/);
  assert.equal(pure.phSwapMarks(m, 0, 1), true);
  assert.deepEqual(clone(m.map(x => [x.id, x.step])), [['b', 1], ['a', 2], ['c', 3], ['d', 3]], '자리와 등장 순서를 함께 맞바꿈');
  assert.equal(pure.phSwapMarks(m, 0, -1), false);
});

test('허브 연결: 허브에서 ?deck/?new 로 열 때만 켜지고, 편집은 원장·실장만 · 허브 밖은 지금처럼 이 브라우저 저장', () => {
  assert.equal(pure.roleCanEdit('owner'), true); assert.equal(pure.roleCanEdit('chief'), true);
  for (const r of ['manager', 'staff', 'deputy', '', undefined]) assert.equal(pure.roleCanEdit(r), false, String(r));
  assert.match(maker, /if\(HUB\.view \|\| QS\.get\('deck'\) \|\| QS\.get\('new'\)\)/, '주소에 deck/new가 있을 때만 허브 모드');
  assert.match(maker, /function scheduleAutosave\(\)\{ if\(HUB\.on\)\{ markDirty\(\); return; \}/, '허브 모드에선 이 브라우저 저장을 건드리지 않음');
  assert.match(maker, /B\.saveBtn\.onclick=\(\)=>\{ if\(HUB\.on\)\{ hubSave\(\); return; \} localSave\(\); \};/, '허브 모드 저장 = 서버, 아니면 기존 localStorage');
  assert.match(maker, /if\(!HUB\.view && !HUB\.canEdit\) return hubFail/, '편집 화면은 원장·실장만');
  assert.match(maker, /from\('manual_decks'\)/); assert.match(maker, /from\('manual-media'\)/);
  assert.match(maker, /window\.parent\.hubSb/, '허브의 로그인 세션 재사용(허브가 window.hubSb 로 내놓음)');
  assert.match(maker, /1600\/long/, '사진은 긴 변 1600px로 줄임'); assert.match(maker, /'image\/webp', 0\.85/);
});

/* ---- 허브(hr.html) 업무매뉴얼 화면 ---- */
const toolsBlock = between(hr, '/* hub-tools:test-start */', '/* hub-tools:test-end */');
function hubCtx(role) {
  const esc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const opened = [], alerts = [], renders = [], ctx = { opened, alerts, renders, popupBlocked: false, window: { open: (u, t) => { opened.push([u, t]); return ctx.popupBlocked ? null : { opener: {} }; } }, alert: m => alerts.push(m), ME: { id: 'u', role }, esc, render() { renders.push(1); }, $: () => null, confirm: () => true, hubT: (k, d, v) => (v ? String(d).replace(/\{([a-z_]+)\}/g, (m, n) => v[n]) : String(d)), TAB: 'tools' };
  vm.createContext(ctx);
  vm.runInContext(toolsBlock + ';this.api={MDECK,mdeckListHtml,mdeckOpen,mdeckBack,renderMdeckTool,mdeckFiltered,mdeckFrameUrl,mdeckCardHtml,TOOL_CARDS,toolCanSee,mdeckCanEdit,renderTools};', ctx);
  return ctx;
}
const DECKS = [{ id: '11111111-1111-4111-8111-111111111111', title: '서랍 <정리>', category: '진료실', published: true }, { id: '22222222-2222-4222-8222-222222222222', title: '데스크 마감', category: '데스크', published: false }, { id: 'bad id', title: '나쁜 id', published: true }];

test('허브 도구 탭: 업무매뉴얼 카드(전 직원) · 직원 계정엔 「편집」·「새 매뉴얼」 단추가 없고 원장·실장에게만 있다', () => {
  for (const role of ['staff', 'manager']) {
    const c = hubCtx(role); c.api.MDECK.decks = clone(DECKS);
    const html = c.api.mdeckListHtml(role);
    assert.ok(html.includes('>보기<'), role); assert.ok(!html.includes('>편집<'), role + ' 편집 단추 없음'); assert.ok(!html.includes('새 매뉴얼'), role + ' 새 매뉴얼 없음'); assert.ok(!html.includes("mdeckOpen('edit'"), role);
    assert.equal(c.api.mdeckOpen('edit', DECKS[0].id), false, role + ' 편집 열기 거절'); assert.equal(c.api.mdeckOpen('new', ''), false);
    assert.equal(c.api.MDECK.mode, 'list'); assert.equal(c.opened.length, 0, role + ': 새 창도 안 열림');
  }
  for (const role of ['owner', 'chief']) {
    const c = hubCtx(role); c.api.MDECK.decks = clone(DECKS);
    const html = c.api.mdeckListHtml(role);
    assert.ok(html.includes('>편집<')); assert.ok(html.includes('＋ 새 매뉴얼')); assert.ok(html.includes('비공개'), '미공개 덱 표시');
    assert.equal(c.api.mdeckOpen('edit', DECKS[0].id), true); assert.equal(c.api.MDECK.mode, 'list', '허브 화면은 그대로(편집은 새 창)');
  }
  const card = hubCtx('staff').api.TOOL_CARDS.find(x => x.code === 'manual_deck');
  assert.equal(card.who, 'all'); assert.equal(card.group, 'top'); assert.equal(card.view, 'manual');
});

test('업무매뉴얼 목록: 제목·분류 표시, 검색·분류 거르기, HTML 이스케이프, 잘못된 id는 카드에서 뺌, 보기·편집 화면은 제작기를 ?deck= 로 열어 씀', () => {
  const c = hubCtx('owner'); c.api.MDECK.decks = clone(DECKS);
  const html = c.api.mdeckListHtml('owner');
  assert.ok(html.includes('<h3>서랍 &lt;정리&gt;</h3>')); assert.ok(html.includes('mdeck-badge">진료실<'));
  assert.ok(!html.includes('나쁜 id'), '잘못된 id');
  assert.ok(/id="manualSearch"/.test(html) && /id="manualCat"/.test(html) && html.includes('<option value="">전체</option>'));
  for (const cat of ['진료실', '데스크', '상담', '행정', '통역', '기공실']) assert.ok(html.includes('value="' + cat + '"'), cat);
  assert.deepEqual(clone(c.api.mdeckFiltered(DECKS, '마감', '').map(d => d.title)), ['데스크 마감']);
  assert.deepEqual(clone(c.api.mdeckFiltered(DECKS, '', '진료실').map(d => d.title)), ['서랍 <정리>']);
  assert.equal(c.api.mdeckFrameUrl('view', DECKS[0].id), encodeURI('설명덱_제작기.html') + '?deck=' + DECKS[0].id + '&view=1');
  assert.equal(c.api.mdeckFrameUrl('edit', DECKS[0].id), encodeURI('설명덱_제작기.html') + '?deck=' + DECKS[0].id);
  assert.equal(c.api.mdeckFrameUrl('new', ''), encodeURI('설명덱_제작기.html') + '?new=1');
  c.api.MDECK.decks = []; assert.ok(c.api.mdeckListHtml('owner').includes('볼 수 있는 매뉴얼이 없습니다.'));
  c.api.MDECK.error = '실패'; assert.ok(c.api.mdeckListHtml('owner').includes('불러오지 못했어요: 실패'));
  const v = hubCtx('staff'); v.api.MDECK.mode = 'view'; v.api.MDECK.id = DECKS[0].id; const m = { innerHTML: '' }; v.api.renderMdeckTool(m);
  assert.ok(m.innerHTML.includes('<iframe class="tools-frame" src="' + encodeURI('설명덱_제작기.html') + '?deck=' + DECKS[0].id + '&amp;view=1"'));
  assert.ok(m.innerHTML.includes("onclick=\"mdeckBack()\""));
  const e = hubCtx('staff'); e.api.MDECK.mode = 'edit'; e.api.MDECK.id = DECKS[0].id; const m2 = { innerHTML: '' }; e.api.renderMdeckTool(m2);
  assert.ok(!m2.innerHTML.includes('?deck=') && e.api.MDECK.mode === 'list', '직원이 편집 화면 주소로 들어와도 목록으로');
});

test('업무매뉴얼 글: 화면의 기본 글이 글 고치기 기본 글(hub-texts.js)과 글자까지 같고 카드·보는 사람 설정도 등록됨', () => {
  const textBlock = between(js, '/* hub-texts:test-start */', '/* hub-texts:test-end */');
  const ctx = { globalThis: {} }; vm.createContext(ctx);
  vm.runInContext(textBlock + ';this.defs=hubTextDefs();this.sets=HUB_SETTING_DEFS;', ctx);
  const byKey = Object.fromEntries(clone(ctx.defs).map(d => [d.key, d.def]));
  const re = /hubT\(\s*'(mdeck\.[a-z_]+)'\s*,\s*'((?:[^'\\\n]|\\.)*)'/g; let m, n = 0;
  while ((m = re.exec(hr))) { n++; assert.equal(vm.runInNewContext("'" + m[2] + "'"), byKey[m[1]], m[1]); }
  assert.ok(n >= 12, '화면 글 ' + n + '개');
  assert.equal(Object.keys(byKey).filter(k => k.startsWith('mdeck.')).length, 13);
  assert.equal(byKey['tools.card.manual_deck.title'], '업무매뉴얼');
  assert.ok(clone(ctx.sets).some(d => d.key === 'tools.who.manual_deck' && d.def === 'all'));
});

test('DB 초안·롤백 파일과 pglite 시험이 있다(운영 DB에는 아직 적용 안 함)', () => {
  for (const f of ['db/manual_decks.sql', 'db/manual_decks_rollback.sql', 'tests/sql/pglite-manual-decks.mjs']) assert.ok(fs.existsSync(path.join(root, f)), f);
  const sql = read('db/manual_decks.sql');
  assert.match(sql, /p\.active and p\.approved/); assert.match(sql, /'manual-media','manual-media',false,5242880/);
  assert.match(sql, /allowed_mime_types[\s\S]*image\/webp/);
});

test('가져온 덱 모양(PPT 가져오기): 글 상자 x·y는 왼쪽 위 기준 + w·h·size·color, 화살표 color·꺾은선 4~5점 — 없으면 기본(한가운데·15px·빨강)', () => {
  const ctx = engineCtx();
  const imp = { type: 'photo', title: 't', image: { src: 'x', w: 1600, h: 900 }, marks: [
    { kind: 'label', x: 2.16, y: 14.79, w: 9.44, h: 5.39, text: '배치 물품 :', step: 1 },
    { kind: 'label', x: 17.84, y: 62.26, w: 6.43, h: 5.49, size: 16, color: '#112233', text: 'T[OP]', step: 2 },
    { kind: 'label', x: 50, y: 50, text: '내가 넣은 글(기준점 한가운데)', step: 3 },
    { kind: 'arrow', pts: [[31.99, 59.15], [31.99, 64.81], [1.11, 64.81], [1.11, 84.73], [2.99, 84.73]], text: '', step: 4, color: '#ff0000' },
    { kind: 'arrow', pts: [[10, 10], [20, 20]], text: '', step: 5, color: 'red;background:url(x)' }] };
  const body = ctx.buildPhoto(clone(imp)), ph = body._ph;
  ph.pv.clientWidth = 1000; ph.pv.clientHeight = 600; ph.im.naturalWidth = 1600; ph.im.naturalHeight = 900;
  ctx.phLayout(ph);
  const [a, b, c] = ph.labels;
  assert.equal(a.l.root.style.left, '21.6px', '왼쪽 위 기준: x 비율 그대로'); assert.equal(a.l.root.style.top, (14.79 * 562.5 / 100) + 'px');
  assert.equal(a.l.inn.style.transform, 'translate(0px,0px)', '왼쪽 위 모서리를 점에 붙임(가운데로 당기지 않음)');
  assert.equal(a.l.inn.style.minWidth, '94.4px', '글 상자 폭 = w 비율'); assert.equal(a.l.bx.style.fontSize, '', 'size 없으면 기본 크기');
  assert.equal(b.l.bx.style.fontSize, '16.7px', 'size 16pt → 사진 폭 1000px에서 16.7px(폭에 비례, 14px 아래로는 안 내려감)'); assert.equal(b.l.bx.style.color, '#112233');
  assert.equal(c.l.inn.style.transform, 'translate(-40px,-12px)', 'w가 없는 글은 예전처럼 한가운데 기준'); assert.equal(c.l.inn.style.minWidth, '');
  assert.equal(geo.phLabelFont(16, 327), 14, '폰 폭에서도 14px 이상'); assert.equal(geo.phLabelFont(0, 1000), null);
  const [arr1, arr2] = ph.arrows;
  assert.equal(arr1.line.style.stroke, '#ff0000'); assert.equal(arr1.head.style.fill, '#ff0000'); assert.equal(arr2.line.style.stroke, undefined, '이상한 색 값은 무시(기본 빨강)');
  assert.equal((arr1.line.attrs.d.match(/L/g) || []).length, 4, '5점 꺾은선이 점마다 이어짐');
  assert.equal(geo.phSafeColor('#fff'), '#fff'); assert.equal(geo.phSafeColor('url(#x)'), '');
  // 저장·복원: 가져온 모양이 정규화에서 안 깨짐
  const n = pure.phNormalize({ type: 'photo', image: { path: 'p/a.webp' }, srcSlide: 84, marks: clone(imp.marks) }, () => 'i');
  assert.equal(n.srcSlide, 84); assert.equal(n.marks[0].w, 9.44); assert.equal(n.marks[1].size, 16); assert.equal(n.marks[3].pts.length, 5); assert.equal(n.marks[3].color, '#ff0000'); assert.equal(n.marks[2].w, undefined);
  assert.ok(!/이미 여러 번 꺾인 화살표예요/.test(maker), '꺾기는 점을 더하기만 함 — 가져온 여러 점 꺾은선도 안 망가뜨림');
  assert.equal(pure.phBendAdd(clone(imp.marks[3].pts)).length, 6, '5점 꺾은선에도 점 하나 더');
});

/* ---- Codex 검증 지적 재현 시험 ---- */
function fnSrc(src, head) { // 함수 머리(head)부터 짝이 맞는 닫는 중괄호까지(시험 대상 함수 안에는 문자열·정규식 속 중괄호가 없음)
  const i = src.indexOf(head); assert.ok(i >= 0, head); let j = src.indexOf('{', i), d = 0;
  for (; j < src.length; j++) { if (src[j] === '{') d++; else if (src[j] === '}' && --d === 0) break; }
  return src.slice(i, j + 1);
}
const mainJs = maker.slice(maker.indexOf('/* ============ 설명덱 제작기 ============ */'), maker.lastIndexOf('</script>'));   // 제작기 본 스크립트(발표 엔진 문자열 안의 <script> 와 헷갈리지 않게 머리말로 찾음)

test('[2] 서버 저장 중에 고친 내용은 「저장됨」으로 바뀌지 않는다 — 변경 번호가 저장 시작 때와 같을 때만 dirty=false', async () => {
  const mk = () => {
    const toasts = [];
    const ctx = { deck: { meta: { title: 't' }, slides: [{ type: 'cover' }] }, HUB: { rev: 0, dirty: false, saving: false, exists: false, id: 'i', category: '', published: false, sb: null },
      B: { saveBtn: { disabled: false }, hubState: { textContent: '', classList: { toggle() { }, add() { } } }, backupBtn: { hidden: true } }, toasts, toast: (m, t) => toasts.push([m, t]), deckForStore: d => d, hubUploadInline: async () => { }, gate: null };
    vm.createContext(ctx);
    vm.runInContext(['let _sn = 0; const id = () => "s" + (++_sn); let DECK_GEN = 0; let loadSeq = 0;', fnSrc(mainJs, 'function sidOf'), fnSrc(mainJs, 'function slideById'), 'const PH_JOBS = new Set(), PH_FAILED = new Map();', fnSrc(mainJs, 'function phFailedCount'), fnSrc(mainJs, 'function markDirty'), 'function hubAutoQueue(){} const clearTimeout = () => {};', fnSrc(mainJs, 'function setDirty'), fnSrc(mainJs, 'async function hubWaitPhotos'), fnSrc(mainJs, 'function hubConflict'), fnSrc(mainJs, 'async function hubSave')].join('\n') + ';this.hubSave=hubSave;this.markDirty=markDirty;', ctx);
    const done = () => ctx.gate.then(() => ({ data: [{ id: 'i' }], error: null }));
    ctx.HUB.sb = { from: () => ({ insert: () => ({ select: done }), update: () => ({ eq: () => ({ eq: () => ({ select: done }) }) }) }) };
    return ctx;
  };
  // 저장 도중 고침 → 저장 끝나도 dirty 유지(+「다시 저장」 안내)
  let c = mk(), release; c.gate = new Promise(r => { release = r; });
  c.markDirty(); assert.equal(c.HUB.dirty, true);
  const p = c.hubSave(); await new Promise(r => setTimeout(r, 5));   // 저장 요청이 나가 응답을 기다리는 중
  c.markDirty();               // 저장 요청이 나간 뒤 사용자가 글을 고침
  release(); await p;
  assert.equal(c.HUB.dirty, true, '저장 중에 고친 내용은 아직 저장 안 됨'); assert.equal(c.HUB.exists, true);
  assert.ok(c.toasts.some(t => /그 사이 고친 내용은 곧 자동 저장돼요/.test(t[0]) && t[1] === undefined));
  // 대조: 고친 게 없으면 저장됨
  c = mk(); c.gate = Promise.resolve(); c.markDirty(); await c.hubSave();
  assert.equal(c.HUB.dirty, false); assert.ok(c.toasts.some(t => /저장했어요/.test(t[0])));
  // 저장 중 다시 저장 누르기는 무시(겹쳐 저장 안 함)
  c = mk(); let n = 0; c.gate = new Promise(r => { release = r; }); const orig = c.HUB.sb.from; c.HUB.sb.from = () => { n++; return orig(); };
  const p1 = c.hubSave(), p2 = c.hubSave(); release(); await Promise.all([p1, p2]); assert.equal(n, 1);
  // 분류·공개 바꾸기도 변경 번호를 올림, 모든 편집이 지나가는 scheduleAutosave 에서도 올라감
  assert.match(mainJs, /B\.catSel\.onchange = \(\)=>\{ HUB\.category = B\.catSel\.value; markDirty\(\); \}/); assert.match(mainJs, /B\.pubChk\.onchange = \(\)=>\{ HUB\.published = B\.pubChk\.checked; markDirty\(\);/);
  assert.match(mainJs, /function scheduleAutosave\(\)\{ if\(HUB\.on\)\{ markDirty\(\); return; \}/);
});

test('[4] 되돌리기 뒤 일반 입력을 하면 다시(Ctrl+Y) 기록이 비워져 새 입력이 사라지지 않는다 · 덱을 통째로 바꿀 땐 기록 초기화', () => {
  const toasts = [];
  const ctx = { deck: { meta: { title: 'A' }, slides: [{ type: 'cover', title: 'A' }] }, sel: 0, PE: {}, B: { deckName: { value: '' } }, toasts, toast: m => toasts.push(m), renderAll() { }, bootPreview() { }, scheduleAutosave() { },
    HUB: { on: false }, pvTimer: 0, setTimeout: () => 0, clearTimeout() { } };
  vm.createContext(ctx);
  vm.runInContext(pureSrc + ';' + ['const UNDO=[],REDO=[],SNAP_DATA=[], PH_PENDING=new Map(), PH_FAILED=new Map(), PH_JOBS=new Set();', 'let _sn = 0; const id = () => "s" + (++_sn); let DECK_GEN = 0; let loadSeq = 0;', fnSrc(mainJs, 'function sidOf'), fnSrc(mainJs, 'function slideById'), fnSrc(mainJs, 'function snapNow'), fnSrc(mainJs, 'function snap()'), fnSrc(mainJs, 'function snapOnce'), fnSrc(mainJs, 'function resetHistory'), fnSrc(mainJs, 'function restoreSnap'), fnSrc(mainJs, 'function undo'), fnSrc(mainJs, 'function redo'), fnSrc(mainJs, 'function schedulePreview'),
    'this.api={snap,snapOnce,undo,redo,schedulePreview,resetHistory,UNDO,REDO,SNAP_DATA};'].join('\n'), ctx);
  const a = ctx.api, title = () => ctx.deck.slides[0].title, input = () => ({ listeners: {}, addEventListener(t, f) { this.listeners[t] = f; } });
  // 제목을 A→B→C 로 두 번 고치며 기록, 한 번 되돌림(B) → 다시 목록에 C
  a.snap(); ctx.deck.slides[0].title = 'B'; a.snap(); ctx.deck.slides[0].title = 'C';
  a.undo(); assert.equal(title(), 'B'); assert.equal(a.REDO.length, 1);
  // 되돌린 뒤 일반 입력(칸에 글자 입력: snapOnce → 값 바꿈 → schedulePreview)
  const el = input(); a.snapOnce(el); ctx.deck.slides[0].title = 'X'; a.schedulePreview();
  assert.equal(a.REDO.length, 0, '새 입력이 다시(REDO) 기록을 비움');
  a.redo(); assert.equal(title(), 'X', '다시 실행해도 새 입력이 사라지지 않음(옛 C 로 덮이지 않음)'); assert.ok(toasts.includes('다시 할 작업이 없어요'));
  // 입력 직전 상태로 되돌아옴
  a.undo(); assert.equal(title(), 'B'); assert.equal(a.REDO.length, 1);
  // 칸에 커서만 두는 것(포커스)으로는 기록·다시를 건드리지 않음
  assert.equal(/addEventListener\('focus', *snap\)/.test(mainJs), false, '포커스만으로 snap(다시 기록 삭제) 하지 않음');
  // 한 칸은 처음 고칠 때 한 번만 기록, 칸을 벗어나면 다시 셈
  const e2 = input(); a.snapOnce(e2); const n1 = a.UNDO.length; a.snapOnce(e2); assert.equal(a.UNDO.length, n1); e2.listeners.blur(); assert.equal(e2._sn, false);
  // schedulePreview 만 지나가는 편집(체크칸·선택칸 등)도 REDO 비움
  a.undo(); assert.ok(a.REDO.length > 0); a.schedulePreview(); assert.equal(a.REDO.length, 0);
  // 덱 통째 교체: 불러오기·새로·튜토리얼·허브 덱 열기에서 기록 초기화
  a.snap(); a.resetHistory(); assert.deepEqual([a.UNDO.length, a.REDO.length, a.SNAP_DATA.length], [0, 0, 0]);
  assert.match(fnSrc(mainJs, 'function loadDeck'), /resetHistory\(\)/);
  assert.match(mainJs, /B\.newBtn\.onclick=\(\)=>\{[^\n]*deck=starterDeck\(\); resetHistory\(\);/);
  assert.match(mainJs, /B\.tutorialBtn\.onclick=\(\)=>\{[^\n]*normalize\(tutorialDeck\(\)\); resetHistory\(\);/); assert.match(mainJs, /HUB\.on = true; sel = 0; resetHistory\(\);/); assert.match(mainJs, /restored \? normalize\(restored\) : normalize\(tutorialDeck\(\)\); resetHistory\(\);/);
  // 입력 만드는 도우미들이 모두 기록 경계를 지남
  for (const f of ['function mkInput', 'function mkArea', 'function mkNum']) assert.match(fnSrc(mainJs, f), /snapOnce\(/, f);
  for (const f of ['function mkChk', 'function mkSel']) assert.match(fnSrc(mainJs, f), /snap\(\); on\(/, f);
  assert.match(mainJs, /B\.deckName\.addEventListener\('input', \(\)=>\{ snapOnce\(B\.deckName\)/);
});

test('허브 로그인 세션: 허브가 window.hubSb 로 내놓은 같은 클라이언트를 쓰고, 따로 만드는 클라이언트(새 창)는 hr.html과 같은 주소·공개키·기본 저장소 키로 만든다', () => {
  const hrUrl = hr.match(/const SB_URL = '([^']+)'/)[1], hrKey = hr.match(/const SB_KEY = '([^']+)'/)[1];
  assert.equal(maker.match(/const HUB_SB_URL = '([^']+)'/)[1], hrUrl); assert.equal(maker.match(/const HUB_SB_KEY = '([^']+)'/)[1], hrKey, '같은 공개(anon) 키');
  // 두 쪽 모두 createClient 에 옵션(storageKey 등)을 안 줌 → 기본 저장소 키(주소에서 만들어짐)가 같아 같은 출처에서 로그인 세션을 서로 읽음
  assert.match(hr, /supabase\.createClient\(SB_URL, SB_KEY\)/); assert.match(maker, /window\.supabase\.createClient\(HUB_SB_URL, HUB_SB_KEY\)/);
  // hr.html 의 const sb 는 window.sb 가 아니므로(parent.sb 로 안 보임) window.hubSb 로 내놓음
  assert.match(hr, /const sb = \(typeof supabase!=='undefined'\) \? supabase\.createClient\(SB_URL, SB_KEY\) : null;\r?\nwindow\.hubSb = sb;/);
  assert.match(fnSrc(mainJs, 'async function hubClient'), /window\.parent\.hubSb/); assert.doesNotMatch(fnSrc(mainJs, 'async function hubClient'), /parent\.sb\b/);
  assert.doesNotMatch(fnSrc(mainJs, 'async function hubRole'), /parent\.ME/, '허브의 let ME 는 안 보이므로 쓰지 않고 profiles 에서 역할을 읽음');
  // 같은 동작 확인: const 는 전역 객체(window)의 속성이 아니고, window.xxx = 로 내놓은 것만 iframe(parent)에서 보임
  const ctx = {}; vm.createContext(ctx); vm.runInContext('const sb = {};', ctx); assert.equal(ctx.sb, undefined, 'const 는 전역 객체 속성이 아님');
  vm.runInContext('this.hubSb = {};', ctx); assert.ok(ctx.hubSb);
});

test('[2차-1] 사진 올리는 동안 같은 슬라이드의 사진을 바꿔도 옛 사진 경로가 저장되지 않는다 — 새 사진을 이어서 올리고, 저장 중 고친 것이라 「저장 안 됨」으로 남는다', async () => {
  const dataUrl = t => 'data:image/png;base64,' + Buffer.from(t).toString('base64');
  const toasts = [], uploaded = [], gates = {}, rows = [];
  const ctx = { deck: { meta: { title: 't' }, slides: [{ type: 'photo', image: { src: dataUrl('BLACK'), w: 1, h: 1 }, marks: [] }] },
    HUB: { rev: 0, dirty: false, saving: false, exists: false, id: 'i', category: '', published: false, sb: null }, B: { saveBtn: { disabled: false }, hubState: { textContent: '', classList: { toggle() { }, add() { } } }, backupBtn: { hidden: true } },
    toast: (m, t) => toasts.push([m, t]), snap() { }, deckForStore: d => JSON.parse(JSON.stringify(d)), fetch,
    hubUpload: async blob => { const t = await blob.text(); uploaded.push(t); await new Promise(r => { gates[t] = r; if (t !== 'BLACK') r(); }); return 'p/' + t; } };
  vm.createContext(ctx);
  vm.runInContext(['let _sn = 0; const id = () => "s" + (++_sn); let DECK_GEN = 0; let loadSeq = 0;', fnSrc(mainJs, 'function sidOf'), fnSrc(mainJs, 'function slideById'), 'const PH_JOBS = new Set(), PH_FAILED = new Map();', fnSrc(mainJs, 'function phFailedCount'), fnSrc(mainJs, 'function markDirty'), 'function hubAutoQueue(){} const clearTimeout = () => {};', fnSrc(mainJs, 'function setDirty'), fnSrc(mainJs, 'function photoNeedsUpload'), fnSrc(mainJs, 'function commitPhoto'), fnSrc(mainJs, 'async function hubUploadInline'), fnSrc(mainJs, 'async function hubWaitPhotos'), fnSrc(mainJs, 'function hubConflict'), fnSrc(mainJs, 'async function hubSave')].join('\n') + ';this.hubSave=hubSave;this.markDirty=markDirty;', ctx);
  const done = { data: [{ id: 'i' }], error: null };
  ctx.HUB.sb = { from: () => ({ insert: row => ({ select: async () => { rows.push(JSON.parse(JSON.stringify(row))); return done; } }), update: () => ({ eq: () => ({ select: async () => done }) }) }) };
  ctx.markDirty();
  const p = ctx.hubSave();
  await new Promise(r => setTimeout(r, 20)); assert.deepEqual(uploaded, ['BLACK'], '검은 사진 업로드가 진행 중');
  ctx.deck.slides[0].image = { src: dataUrl('BLUE'), w: 2, h: 2 }; ctx.markDirty();   // 업로드 중에 원장이 이 슬라이드 사진을 파란 사진으로 교체
  gates.BLACK(); await p;
  assert.deepEqual(uploaded, ['BLACK', 'BLUE'], '교체된 새 사진을 이어서 올림');
  assert.equal(rows.length, 1); assert.equal(rows[0].deck.slides[0].image.path, 'p/BLUE', '저장된 건 파란 사진 — 옛(검은) 사진 경로가 아님');
  assert.equal(rows[0].deck.slides[0].image.w, 2); assert.ok(!JSON.stringify(rows[0]).includes('data:image'), '데이터주소가 서버에 가지 않음');
  assert.equal(ctx.deck.slides[0].image.path, 'p/BLUE');
  assert.equal(ctx.HUB.dirty, true, '저장 도중 바꾼 사진이라 「저장 안 됨」 유지'); assert.ok(toasts.some(t => /곧 자동 저장돼요/.test(t[0])));
  // 대조: 안 바꾸면 그대로 저장되고 저장됨
  uploaded.length = 0; ctx.deck.slides[0].image = { src: dataUrl('GREEN'), w: 3, h: 3 }; ctx.markDirty(); ctx.HUB.exists = false;
  await ctx.hubSave(); assert.deepEqual(uploaded, ['GREEN']); assert.equal(rows[1].deck.slides[0].image.path, 'p/GREEN'); assert.equal(ctx.HUB.dirty, false);
  // 변경 번호는 업로드 시작 전에 기억(업로드 뒤에 기억하면 업로드 중 고친 것을 저장됨으로 착각)
  const src = fnSrc(mainJs, 'async function hubSave'); assert.ok(src.indexOf('const rev0 = HUB.rev') < src.indexOf('await hubUploadInline()'));
});

test('[3차-1] 사진 붙이기: 최신 요청만 적용(먼저 시작한 파란 사진이 늦게 끝나도 빨간 사진이 남음) · undo 등으로 덱에서 빠진 슬라이드엔 안 붙임 · 올리는 중 표시 · hubUploadInline 도 같은 원칙', async () => {
  const gates = {}, snaps = [], toasts = [];
  const ctx = { deck: { meta: {}, slides: [{ type: 'photo', image: null, marks: [] }, { type: 'photo', image: null, marks: [] }] }, HUB: { on: true, canEdit: true }, toast: (m, t) => toasts.push([m, t]), snap: () => snaps.push(1),
    downscale: async f => ({ blob: { name: f.name }, w: 1, h: 1 }), blobToDataUrl: async b => 'data:image/png;base64,' + b.name,
    hubUpload: async blob => { await new Promise(r => { gates[blob.name] = r; }); return 'p/' + blob.name; }, fetch };
  vm.createContext(ctx);
  vm.runInContext(['let _sn = 0; const id = () => "s" + (++_sn); let DECK_GEN = 0; let loadSeq = 0;', fnSrc(mainJs, 'function sidOf'), fnSrc(mainJs, 'function slideById'), 'const PH_PENDING = new Map(), PH_JOBS = new Set(), PH_FAILED = new Map(); let phSeq = 0;', fnSrc(mainJs, 'function phFailedCount'), 'function markDirty(){} function scheduleAutosave(){}', fnSrc(mainJs, 'function commitPhoto'), fnSrc(mainJs, 'function attachPhoto('), fnSrc(mainJs, 'async function attachPhotoRun'), 'this.attachPhoto=attachPhoto;this.PH_PENDING=PH_PENDING;'].join('\n'), ctx);
  const tick = () => new Promise(r => setTimeout(r, 5));
  const [s0, s1] = ctx.deck.slides;
  // (1) 파랑 업로드 시작 → (다른 장을 갔다 와) 빨강 선택 → 빨강 먼저 완료 → 파랑 늦게 완료: 최신(빨강)이 남아야 함
  const pBlue = ctx.attachPhoto(s0, { name: 'blue' }); await tick();
  assert.equal(ctx.PH_PENDING.has(s0.sid), true, '올리는 중 표시용 상태가 있음(sid 로 키잉)'); assert.equal(ctx.PH_PENDING.has(s1.sid), false, '다른 슬라이드는 영향 없음');
  const pRed = ctx.attachPhoto(s0, { name: 'red' }); await tick();
  gates.red(); assert.equal(await pRed, 'ok'); assert.equal(s0.image.path, 'p/red');
  gates.blue(); assert.equal(await pBlue, 'stale', '늦게 끝난 옛 요청은 버림'); assert.equal(s0.image.path, 'p/red', '최신 선택이 유실되지 않음');
  assert.equal(ctx.PH_PENDING.has(s0.sid), false, '끝나면 올리는 중 상태가 사라짐'); assert.equal(snaps.length, 1, '적용된 한 번만 되돌리기 기록');
  // (2) 같은 순서인데 파랑이 먼저 끝나면 파랑이 아니라 빨강(최신)만 남음
  s0.image = null; const p1 = ctx.attachPhoto(s0, { name: 'blue2' }); await tick(); const p2 = ctx.attachPhoto(s0, { name: 'red2' }); await tick();
  gates.blue2(); assert.equal(await p1, 'stale'); assert.equal(s0.image, null, '아직 최신 요청이 안 끝났으니 파랑은 적용 안 됨'); gates.red2(); assert.equal(await p2, 'ok'); assert.equal(s0.image.path, 'p/red2');
  // (3) 업로드 중 UNDO/삭제로 이 슬라이드가 덱에서 떨어짐 → 옛 객체에 붙이지 않고 'gone'(성공 안내용 'ok' 아님), 덱의 복사본은 그대로
  const p3 = ctx.attachPhoto(s1, { name: 'x' }); await tick();
  ctx.deck.slides = [s0]; gates.x(); assert.equal(await p3, 'gone'); assert.equal(s1.image, null);   // s1 이 덱에서 사라짐
  // 되돌리기로 슬라이드 객체만 새로 만들어졌을 뿐 같은 슬라이드(같은 sid)면, 새 객체에 사진이 붙음(옛 객체가 아님)
  const clone0 = JSON.parse(JSON.stringify(s0)); const p3b = ctx.attachPhoto(s0, { name: 'y' }); await tick(); ctx.deck.slides = [clone0]; gates.y(); assert.equal(await p3b, 'ok');
  assert.equal(clone0.image.path, 'p/y', '덱에 있는 새 객체에 적용'); assert.equal(s0.image.path, 'p/red2', '덱에서 떨어진 옛 객체는 그대로');
  // (4) 서버 모드 아님(허브 밖): 데이터주소로 붙고 같은 원칙
  ctx.HUB.on = false; const p4 = await ctx.attachPhoto(clone0, { name: 'local' }); assert.equal(p4, 'ok'); assert.match(clone0.image.src, /^data:image\/png;base64,local$/);
  // 화면 연결: 올리는 중 단추 표시 · 적용 성공일 때만 미리보기·저장 표시 · 지금 보는 장일 때만 다시 그림
  const form = fnSrc(mainJs, 'FORMS.photo = s=>'), pick = fnSrc(mainJs, 'async function photoPick');   // 고르기·붙여넣기가 같이 쓰는 photoPick 에 갱신 규칙이 있음
  assert.match(form, /PH_PENDING\.has\(sidOf\(s\)\) \? '⏳ 사진 올리는 중/); assert.match(pick, /if\(res === 'ok'\)\{ bootPreview\(\); scheduleAutosave\(\); \}/); assert.match(pick, /if\(deck\.slides\[sel\] && deck\.slides\[sel\]\.sid === s\.sid\) renderEditor\(\);/);
  assert.equal(/ub\.disabled = true/.test(form), false, '다시 누르면 새 사진으로 교체되므로 단추를 막지 않음');
  // hubUploadInline: 같은 원칙(commitPhoto) — 올리는 중 덱에서 빠진 슬라이드엔 경로를 안 붙이고 남은 슬라이드만 이어서 올림
  const dataUrl = t => 'data:image/png;base64,' + Buffer.from(t).toString('base64'), up = [];
  const c2 = { deck: { meta: {}, slides: [{ type: 'photo', image: { src: dataUrl('A'), w: 1, h: 1 } }, { type: 'photo', image: { src: dataUrl('B'), w: 1, h: 1 } }] }, snap() { }, fetch, hubUpload: null };
  c2.hubUpload = async blob => { const t = await blob.text(); up.push(t); if (t === 'A') c2.deck.slides.shift(); return 'p/' + t; };   // A 를 올리는 중에 A 슬라이드가 덱에서 빠짐
  vm.createContext(c2); vm.runInContext(['let _sn = 0; const id = () => "s" + (++_sn); let DECK_GEN = 0; let loadSeq = 0;', fnSrc(mainJs, 'function sidOf'), fnSrc(mainJs, 'function slideById'),fnSrc(mainJs, 'function photoNeedsUpload'), fnSrc(mainJs, 'function commitPhoto'), fnSrc(mainJs, 'async function hubUploadInline'), 'this.f=hubUploadInline;'].join('\n'), c2);
  const gone = c2.deck.slides[0]; await c2.f();
  assert.deepEqual(up, ['A', 'B']); assert.equal(c2.deck.slides.length, 1); assert.equal(c2.deck.slides[0].image.path, 'p/B'); assert.match(gone.image.src, /^data:/, '빠진 슬라이드엔 경로를 붙이지 않음');
});

/* ---- 4차 검증: 데이터 유실 경로 3건 ---- */
function saveEnv(extra = {}) {   // 저장·사진 붙이기 부품을 한 환경에 올림(가짜 서버: updated_at 조건부 update)
  const toasts = [], srv = { row: { id: 'i', title: 'srv', deck: { meta: { title: 'srv' }, slides: [{ type: 'cover', title: '서버 원본' }], importedSrc: [1, 2, 3] }, updated_at: 'v1' }, writes: 0, inserts: [] };
  const upd = { v: 1 };
  const ctx = Object.assign({ deck: { meta: { title: '내 덱' }, slides: [{ type: 'photo', image: null, marks: [] }] }, HUB: { rev: 0, dirty: false, saving: false, exists: true, id: 'i', category: '', published: false, version: 'v1', conflict: false, sb: null, on: true, canEdit: true },
    B: { saveBtn: { disabled: false }, hubState: { textContent: '', classList: { toggle() { }, add() { } } }, backupBtn: { hidden: true } }, toast: (m, t) => toasts.push([m, t]), snap() { }, deckForStore: d => JSON.parse(JSON.stringify(d)), fetch,
    downscale: async f => ({ blob: { name: f.name }, w: 1, h: 1 }), blobToDataUrl: async b => 'data:image/png;base64,' + b.name, hubUpload: async blob => 'p/' + blob.name, toasts, srv }, extra);
  vm.createContext(ctx);
  vm.runInContext(['let _sn = 0; const id = () => "s" + (++_sn); let DECK_GEN = 0; let loadSeq = 0;', fnSrc(mainJs, 'function sidOf'), fnSrc(mainJs, 'function slideById'), 'const PH_PENDING = new Map(), PH_JOBS = new Set(), PH_FAILED = new Map(); let phSeq = 0;', fnSrc(mainJs, 'function phFailedCount'), fnSrc(mainJs, 'function markDirty'), 'function hubAutoQueue(){} const clearTimeout = () => {};', fnSrc(mainJs, 'function setDirty'), fnSrc(mainJs, 'function photoNeedsUpload'), fnSrc(mainJs, 'function commitPhoto'),
    fnSrc(mainJs, 'function attachPhoto('), fnSrc(mainJs, 'async function attachPhotoRun'), 'function scheduleAutosave(){ if(HUB.on) markDirty(); }', fnSrc(mainJs, 'async function hubUploadInline'), fnSrc(mainJs, 'async function hubWaitPhotos'), fnSrc(mainJs, 'function hubConflict'), fnSrc(mainJs, 'async function hubSave'),
    'this.hubSave=hubSave;this.attachPhoto=attachPhoto;this.PH_JOBS=PH_JOBS;this.markDirty=markDirty;'].join('\n'), ctx);
  ctx.HUB.sb = { from: () => ({
    update: row => { const f = {}; const ch = { eq: (k, v) => { f[k] = v; return ch; }, select: async () => { const hit = f.id === srv.row.id && f.updated_at === srv.row.updated_at; if (!hit) return { data: [], error: null }; Object.assign(srv.row, row); srv.row.updated_at = 'v' + (++upd.v + 1); srv.writes++; return { data: [{ id: 'i', updated_at: srv.row.updated_at }], error: null }; } }; return ch; },
    insert: row => ({ select: async () => { srv.inserts.push(row); return { data: [{ id: row.id, updated_at: 'n1' }], error: null }; } }),
    select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: srv.row ? { updated_at: srv.row.updated_at } : null }) }) }) }) };
  return ctx;
}

test('[4차-1] 제작기를 열어 둔 사이 업로더·다른 사람이 서버 덱을 바꾸면 덮지 않는다 — 열 때 받은 updated_at 으로 조건부 저장, 0행이면 충돌(안내·저장 안 됨 유지·백업 단추), 성공하면 새 updated_at 보관', async () => {
  const c = saveEnv();
  c.markDirty();
  // 그 사이 업로더(--append)가 서버 덱을 바꿈 → 새 장·importedSrc 가 생기고 updated_at 이 v1 → vX
  c.srv.row.deck = { meta: { title: 'srv' }, slides: [{ type: 'cover' }, { type: 'photo', title: '업로더가 붙인 새 장', srcSlide: 4 }], importedSrc: [1, 2, 3, 4] }; c.srv.row.updated_at = 'vX';
  await c.hubSave();
  assert.equal(c.srv.writes, 0, '서버 덱을 덮어쓰지 않음'); assert.equal(c.srv.row.deck.slides.length, 2); assert.deepEqual(c.srv.row.deck.importedSrc, [1, 2, 3, 4]); assert.equal(c.srv.row.title, 'srv');
  assert.equal(c.HUB.dirty, true, '저장 안 됨 유지'); assert.equal(c.HUB.conflict, true); assert.equal(c.B.backupBtn.hidden, false, '내 덱 백업 단추가 나옴'); assert.match(c.B.hubState.textContent, /충돌/);
  assert.ok(c.toasts.some(t => /다른 곳에서 바뀌었어요/.test(t[0]) && /백업/.test(t[0]) && /새로 불러온 뒤/.test(t[0]) && t[1] === 'err'));
  assert.ok(!c.toasts.some(t => /저장했어요/.test(t[0])), '「저장했어요」라고 하지 않음');
  await c.hubSave(); assert.equal(c.srv.writes, 0, '다시 눌러도 계속 막힘(옛 버전으로는 못 덮음)');
  // 충돌 없을 때: 저장되고 새 updated_at 을 보관 → 이어서 또 저장 가능
  const ok = saveEnv(); ok.markDirty(); await ok.hubSave();
  assert.equal(ok.srv.writes, 1); assert.equal(ok.srv.row.title, '내 덱'.length ? ok.srv.row.title : ''); assert.equal(ok.HUB.dirty, false); assert.equal(ok.HUB.version, ok.srv.row.updated_at, '새 updated_at 보관');
  ok.markDirty(); await ok.hubSave(); assert.equal(ok.srv.writes, 2, '두 번째 저장도 충돌 없이 됨'); assert.equal(ok.HUB.conflict, false);
  // 권한 없음(0행인데 서버 버전은 그대로)은 충돌이 아니라 권한 안내
  const np = saveEnv(); np.HUB.sb.from = () => ({ update: () => { const ch = { eq: () => ch, select: async () => ({ data: [], error: null }) }; return ch; }, select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { updated_at: 'v1' } }) }) }) });
  np.markDirty(); await np.hubSave(); assert.ok(np.toasts.some(t => /저장 권한이 없어요/.test(t[0]))); assert.equal(np.HUB.conflict, false);
  // 새 덱(아직 서버에 없음)은 insert 로 만들고 updated_at 보관
  const nw = saveEnv(); nw.HUB.exists = false; nw.HUB.version = null; nw.markDirty(); await nw.hubSave(); assert.equal(nw.srv.inserts.length, 1); assert.equal(nw.HUB.version, 'n1'); assert.equal(nw.HUB.exists, true);
  // 열 때 updated_at 을 받아 둠
  assert.match(mainJs, /select\('id,title,category,deck,published,updated_at'\)/); assert.match(mainJs, /HUB\.exists = true; HUB\.version = r\.data\.updated_at;/);
  assert.match(mainJs, /\.update\(row\)\.eq\('id', HUB\.id\)\.eq\('updated_at', HUB\.version\)/);
});

test('[4차-2] 사진 올리는 중 저장하면 끝난 뒤 최신 사진으로 저장한다 — 올리기 시작부터 「저장 안 됨」, 저장은 기다림(안내), 닫기 경고에도 포함', async () => {
  let release; const gate = new Promise(r => { release = r; });
  const c = saveEnv({ hubUpload: async blob => { await gate; return 'p/' + blob.name; } });
  const s0 = c.deck.slides[0], rev0 = c.HUB.rev;
  const job = c.attachPhoto(s0, { name: 'blue' });
  assert.equal(c.HUB.dirty, true, '올리기 시작부터 미저장'); assert.ok(c.HUB.rev > rev0); assert.equal(c.PH_JOBS.size, 1);
  const save = c.hubSave(); await new Promise(r => setTimeout(r, 20));
  assert.equal(c.srv.writes, 0, '올리는 중에는 서버에 쓰지 않음(옛 사진 저장 방지)'); assert.ok(c.toasts.some(t => /사진 올리는 중 — 끝나면 저장해요/.test(t[0])));
  assert.equal(c.HUB.dirty, true);
  release(); assert.equal(await job, 'ok'); await save;
  assert.equal(c.srv.writes, 1); assert.equal(c.srv.row.deck.slides[0].image.path, 'p/blue', '끝난 뒤의 최신 사진이 저장됨'); assert.equal(c.PH_JOBS.size, 0);
  assert.equal(c.HUB.dirty, true, '변경 번호는 기다리기 전에 잡으므로, 기다리는 동안 붙은 사진은 한 번 더 저장해야 「저장됨」(보수적)'); assert.ok(c.toasts.some(t => /곧 자동 저장돼요/.test(t[0])));
  c.HUB.exists = true; await c.hubSave(); assert.equal(c.HUB.dirty, false, '대기 없이 다시 저장하면 저장됨');
  // 닫기 경고: 첨부 중에도 뜸
  assert.match(mainJs, /function mdeckUnsavedNow\(\)\{ return HUB\.on \? \(\(HUB\.dirty \|\| PH_JOBS\.size > 0\) && !HUB\.view\) : \(PH_JOBS\.size > 0 \|\| asPending\); \}/);   // 허브 모드 조건은 그대로(허브 밖 조건은 [8차] 에서 시험)
  // 사진 선택기는 올리는 작업 목록(PH_JOBS)을 거침(직접 attachPhotoRun 을 부르지 않음)
  assert.doesNotMatch(fnSrc(mainJs, 'FORMS.photo = s=>'), /attachPhotoRun/);
});

test('[4차-3] HTML 내보내기·다시 불러오기가 덱 최상위 필드(importedSrc 등)를 잃지 않는다', () => {
  const ctx = { deck: { meta: { title: 'T', extraMeta: 1 }, slides: [{ type: 'cover', title: 'c', srcSlide: 7 }, { type: 'photo', title: 'p', srcSlide: 8, image: { path: 'd/a.webp', w: 2, h: 1 }, marks: [{ id: 'm', kind: 'label', x: 1, y: 2, w: 3, h: 4, text: 't', step: 1, custom: 'keep' }], unknownSlideField: 'z' }],
    importedSrc: [1, 2, 3, 7, 8], unknownTop: { a: 1 } }, IMG_URL: {}, SLIDE_CSS: '', ENGINE: '', SKELETON: '', escapeHtml: s => s, id: () => 'gen' };
  vm.createContext(ctx);
  vm.runInContext(pureSrc + ';' + [fnSrc(mainJs, 'function imgUrl'), fnSrc(mainJs, 'function deckData'), fnSrc(mainJs, 'function generateDeckHTML'), fnSrc(mainJs, 'function normalize'), 'this.api={deckData,generateDeckHTML,normalize};'].join('\n'), ctx);
  const html = ctx.api.generateDeckHTML({ si: 0, atEnd: false });
  const m = html.match(/const DECK=(\{[\s\S]*?\});\s*window\.__BOOT__/); assert.ok(m, '불러오기 규칙으로 덱을 찾을 수 있음');   // 불러오기(fi.onchange)가 쓰는 규칙과 같은 식
  assert.ok(mainJs.includes('/const DECK=(\\{[\\s\\S]*?\\});\\s*window\\.__BOOT__/'), '시험이 쓴 규칙 = 제작기 불러오기 규칙');
  const back = ctx.api.normalize(JSON.parse(m[1]));
  assert.deepEqual(clone(back.importedSrc), [1, 2, 3, 7, 8]); assert.deepEqual(clone(back.unknownTop), { a: 1 }); assert.equal(back.meta.extraMeta, 1);
  assert.equal(back.slides[0].srcSlide, 7); assert.equal(back.slides[1].srcSlide, 8); assert.equal(back.slides[1].unknownSlideField, 'z'); assert.equal(back.slides[1].marks[0].custom, 'keep'); assert.equal(back.slides[1].marks[0].w, 3);
  // 서버 저장 사본도 그대로(이미 전체 복사)
  assert.deepEqual(clone(pure.deckForStore(ctx.deck).importedSrc), [1, 2, 3, 7, 8]);
});

test('[5차] 사진 올리기 대기 중 저장했는데 올리기가 실패하면 저장하지 않는다 — 실패 표시·미저장 유지·「사진 N장 올리기 실패」 안내, 다시 저장해도 막히고, 사진을 다시 고르면 풀린다', async () => {
  const gates = {}, mk = () => saveEnv({ hubUpload: blob => new Promise((ok, no) => { gates[blob.name] = { ok: () => ok('p/' + blob.name), no: m => no(new Error(m)) }; }) });
  const tick = () => new Promise(r => setTimeout(r, 20));
  const failedHas = (c, i = 0) => vm.runInContext('PH_FAILED.has(deck.slides[' + i + '].sid)', c);
  // (1) 업로드 대기 중 저장 → 업로드 HTTP 500 실패: 옛 사진으로 저장하면 안 됨
  const c = mk(), s0 = c.deck.slides[0], rev0 = c.HUB.rev;
  const job = c.attachPhoto(s0, { name: 'blue' }); await tick();
  const save = c.hubSave(); await tick(); assert.equal(c.srv.writes, 0);
  gates.blue.no('HTTP 500'); await assert.rejects(job, /HTTP 500/); await save;
  assert.equal(c.srv.writes, 0, '저장 안 함'); assert.equal(c.HUB.dirty, true, '미저장 유지'); assert.equal(failedHas(c), true, '그 슬라이드에 실패 표시');
  assert.ok(c.toasts.some(t => t[0] === '사진 1장 올리기 실패 — 다시 골라 주세요' && t[1] === 'err')); assert.ok(!c.toasts.some(t => /저장했어요/.test(t[0])), '「저장했어요」 없음'); assert.ok(c.HUB.rev > rev0);
  assert.equal(c.HUB.saving, false); assert.equal(c.B.saveBtn.disabled, false, '저장 단추가 다시 눌러짐');
  // (2) 실패 작업이 목록에서 빠진 뒤 다시 저장해도 막힘(실패 표시는 잊히지 않음)
  assert.equal(c.PH_JOBS.size, 0); await c.hubSave(); await c.hubSave();
  assert.equal(c.srv.writes, 0, '다시 저장해도 막힘'); assert.equal(c.toasts.filter(t => /올리기 실패/.test(t[0])).length, 3);
  // (3) 같은 슬라이드에서 사진을 다시 고르면 풀리고, 성공하면 새 사진으로 저장됨
  const j2 = c.attachPhoto(s0, { name: 'red' }); await tick(); assert.equal(failedHas(c), false, '다시 고르는 순간 실패 표시가 풀림');
  gates.red.ok(); assert.equal(await j2, 'ok'); await c.hubSave();
  assert.equal(c.srv.writes, 1); assert.equal(c.srv.row.deck.slides[0].image.path, 'p/red'); assert.equal(c.HUB.dirty, false);
  // (4) 다시 고른 것도 실패하면 다시 표시
  const d = mk(); const ja = d.attachPhoto(d.deck.slides[0], { name: 'a' }); await tick(); gates.a.no('boom1'); await assert.rejects(ja, /boom1/); assert.equal(failedHas(d), true);
  const jb = d.attachPhoto(d.deck.slides[0], { name: 'b' }); await tick(); assert.equal(failedHas(d), false); gates.b.no('boom2'); await assert.rejects(jb, /boom2/); assert.equal(failedHas(d), true);
  // (5) 제외: 새 요청으로 대체된 옛 요청의 실패 · 삭제/undo 로 덱에서 빠진 슬라이드의 실패는 표시·저장 막기에 영향 없음
  const e = mk(), es = e.deck.slides[0];
  const o1 = e.attachPhoto(es, { name: 'old' }); await tick(); const o2 = e.attachPhoto(es, { name: 'new' }); await tick();
  gates.old.no('old failed'); await assert.rejects(o1, /old failed/); assert.equal(failedHas(e), false, '대체된 옛 요청의 실패는 무시');
  gates.new.ok(); assert.equal(await o2, 'ok'); await e.hubSave(); assert.equal(e.srv.writes, 1); assert.equal(e.srv.row.deck.slides[0].image.path, 'p/new');
  const g = mk(), gs = g.deck.slides[0]; const gj = g.attachPhoto(gs, { name: 'z' }); await tick();
  g.deck.slides = [{ type: 'photo', image: null, marks: [], sid: 'other' }];   // 업로드 중 undo/삭제로 이 슬라이드(sid)가 덱에서 사라짐
  gates.z.no('z failed'); await assert.rejects(gj, /z failed/); assert.equal(failedHas(g), false, '덱에서 빠진 슬라이드의 실패는 무시');
  g.markDirty(); await g.hubSave(); assert.equal(g.srv.writes, 1, '빠진 슬라이드 때문에 저장이 막히지 않음');
  // 다른 슬라이드의 실패는 그 슬라이드만 표시, 여러 장이면 장수 안내
  const h = mk(); h.deck.slides.push({ type: 'photo', image: null, marks: [] });
  const h0 = h.attachPhoto(h.deck.slides[0], { name: 'h0' }), h1 = h.attachPhoto(h.deck.slides[1], { name: 'h1' }); await tick(); gates.h0.no('x'); gates.h1.no('y'); await assert.rejects(h0); await assert.rejects(h1);
  await h.hubSave(); assert.ok(h.toasts.some(t => t[0] === '사진 2장 올리기 실패 — 다시 골라 주세요')); assert.equal(h.srv.writes, 0);
  // 변경 번호(rev0)는 기다리기 전에 잡음 · 화면: 실패 표시가 편집 화면·슬라이드 목록에 나옴
  const src = fnSrc(mainJs, 'async function hubSave'); assert.ok(src.indexOf('const rev0 = HUB.rev') < src.indexOf('await hubWaitPhotos()'));
  assert.match(fnSrc(mainJs, 'FORMS.photo = s=>'), /PH_FAILED\.has\(s\.sid\)[\s\S]*사진 올리기 실패 — 위 「사진 바꾸기」로 다시 골라 주세요/); assert.match(mainJs, /PH_FAILED\.has\(s\.sid\) \? '⚠ ' : ''\)\+slideLabel\(s\)/);
});

test('[6차] 사진 상태는 슬라이드 id(sid)에 묶인다 — 실패 → 제목 입력 → Ctrl+Z 로 슬라이드 객체가 새로 바뀌어도 저장이 막히고, Ctrl+Y 후에도 막히며, 사진을 다시 고르면 풀린다 · 복제본은 새 sid', async () => {
  const gates = {}, tick = () => new Promise(r => setTimeout(r, 20));
  const c = saveEnv({ sel: 0, PE: {}, renderAll() { }, bootPreview() { }, renderList() { }, renderEditor() { }, scheduleAutosave() { }, clone: o => JSON.parse(JSON.stringify(o)),
    hubUpload: blob => new Promise((ok, no) => { gates[blob.name] = { ok: () => ok('p/' + blob.name), no: m => no(new Error(m)) }; }) });
  c.deck.slides[0].title = '처음'; c.B.deckName = { value: '' };
  vm.runInContext(pureSrc + ';' + ['const UNDO=[],REDO=[],SNAP_DATA=[];', fnSrc(mainJs, 'function snapNow'), fnSrc(mainJs, 'function snap()'), fnSrc(mainJs, 'function resetHistory'), fnSrc(mainJs, 'function restoreSnap'), fnSrc(mainJs, 'function undo'), fnSrc(mainJs, 'function redo'), fnSrc(mainJs, 'function dupSlide'),
    'this.h={snap,undo,redo,dupSlide,UNDO,REDO};'].join('\n'), c);
  const ev = e => vm.runInContext(e, c), failed = () => ev('phFailedCount()'), sid0 = c.deck.slides[0].sid || ev('sidOf(deck.slides[0])');
  const origObj = c.deck.slides[0];
  // 1) 사진 올리기 실패 표시
  const job = c.attachPhoto(origObj, { name: 'blue' }); await tick(); gates.blue.no('HTTP 500'); await assert.rejects(job, /HTTP 500/);
  assert.equal(failed(), 1); assert.equal(ev('PH_FAILED.has("' + sid0 + '")'), true, '표시는 슬라이드 sid 에 붙음');
  // 2) 제목 입력(기록 후 고침) → Ctrl+Z : 슬라이드가 새 객체로 복원됨(같은 sid) — 그래도 실패 표시·저장 막힘이 이어짐
  c.h.snap(); c.deck.slides[0].title = '제목 입력'; c.markDirty();
  c.h.undo(); const restored = c.deck.slides[0];
  assert.notStrictEqual(restored, origObj, '되돌리기로 슬라이드 객체가 새로 만들어짐'); assert.equal(restored.sid, sid0, '같은 슬라이드(같은 sid)'); assert.equal(restored.title, '처음');
  assert.equal(failed(), 1, '객체가 바뀌어도 실패 표시가 안 사라짐');
  await c.hubSave(); assert.equal(c.srv.writes, 0, '옛 사진으로 저장하지 않음'); assert.ok(c.toasts.some(t => t[0] === '사진 1장 올리기 실패 — 다시 골라 주세요')); assert.equal(c.HUB.dirty, true);
  // 3) Ctrl+Y(다시)로 다시 복원돼도 막힘
  c.h.redo(); assert.equal(c.deck.slides[0].title, '제목 입력'); assert.equal(c.deck.slides[0].sid, sid0); assert.equal(failed(), 1);
  const w0 = c.toasts.length; await c.hubSave(); assert.equal(c.srv.writes, 0); assert.ok(c.toasts.length > w0);
  // 4) 같은 슬라이드(지금 덱의 객체)에서 사진을 다시 고르면 실패 표시가 풀리고, 성공하면 그 새 객체에 사진이 붙어 저장됨
  const cur = c.deck.slides[0], j2 = c.attachPhoto(cur, { name: 'red' }); await tick(); assert.equal(failed(), 0, '다시 고르는 순간 풀림');
  c.h.undo();   // 올리는 중에 또 되돌리기로 객체가 바뀌어도(같은 sid) 올리던 사진은 그 슬라이드에 적용됨
  gates.red.ok(); assert.equal(await j2, 'ok'); assert.equal(c.deck.slides[0].image.path, 'p/red', '새 객체에 적용'); assert.equal(failed(), 0);
  await c.hubSave(); assert.equal(c.srv.writes, 1); assert.equal(c.srv.row.deck.slides[0].image.path, 'p/red');
  // 5) 되돌리기로 슬라이드 자체가 사라진 경우(그 슬라이드가 생기기 전 상태)만 실패를 무시
  const d = saveEnv({ sel: 0, PE: {}, renderAll() { }, bootPreview() { }, renderList() { }, renderEditor() { }, scheduleAutosave() { }, clone: o => JSON.parse(JSON.stringify(o)),
    hubUpload: blob => new Promise((ok, no) => { gates['d' + blob.name] = { no: m => no(new Error(m)) }; }) });
  d.B.deckName = { value: '' };
  vm.runInContext(pureSrc + ';' + ['const UNDO=[],REDO=[],SNAP_DATA=[];', fnSrc(mainJs, 'function snapNow'), fnSrc(mainJs, 'function snap()'), fnSrc(mainJs, 'function restoreSnap'), fnSrc(mainJs, 'function undo'), fnSrc(mainJs, 'function redo'), 'this.h={snap,undo,redo,UNDO,REDO};'].join('\n'), d);
  d.h.snap();   // 슬라이드가 하나뿐인 상태를 기록
  d.deck.slides.push({ type: 'photo', title: '새로 추가한 장', image: null, marks: [] });   // 새 장 추가
  const dj = d.attachPhoto(d.deck.slides[1], { name: 'n' }); await tick();
  d.h.undo(); assert.equal(d.deck.slides.length, 1, '새 장이 되돌리기로 사라짐');
  gates.dn.no('late failure'); await assert.rejects(dj, /late failure/); assert.equal(vm.runInContext('phFailedCount()', d), 0, '사라진 슬라이드의 실패는 무시'); d.markDirty(); await d.hubSave(); assert.equal(d.srv.writes, 1, '저장이 막히지 않음');
  // 6) 복제(Ctrl+D): 복제본은 새 sid — 실패 표시(원본이 새 사진을 못 올린 것)는 복제본에 따라가지 않고 원본만 막힘
  const e = saveEnv({ sel: 0, PE: {}, renderAll() { }, bootPreview() { }, renderList() { }, renderEditor() { }, scheduleAutosave() { }, clone: o => JSON.parse(JSON.stringify(o)),
    hubUpload: blob => new Promise((ok, no) => { gates['e' + blob.name] = { no: m => no(new Error(m)) }; }) });
  e.B.deckName = { value: '' };
  vm.runInContext(pureSrc + ';' + ['const UNDO=[],REDO=[],SNAP_DATA=[];', fnSrc(mainJs, 'function snapNow'), fnSrc(mainJs, 'function snap()'), fnSrc(mainJs, 'function dupSlide'), 'this.h={dupSlide};'].join('\n'), e);
  const ej = e.attachPhoto(e.deck.slides[0], { name: 'q' }); await tick(); gates.eq.no('fail'); await assert.rejects(ej, /fail/);
  e.h.dupSlide(); assert.equal(e.deck.slides.length, 2); assert.notEqual(e.deck.slides[0].sid, e.deck.slides[1].sid, '복제본은 새 sid');
  assert.equal(vm.runInContext('PH_FAILED.has(deck.slides[1].sid)', e), false, '실패 표시는 복제본에 따라가지 않음'); assert.equal(vm.runInContext('PH_FAILED.has(deck.slides[0].sid)', e), true); assert.equal(vm.runInContext('phFailedCount()', e), 1);
  // 모든 슬라이드에 sid 보장: 불러오기(normalize)·새 장 추가·스냅샷 복원
  assert.match(fnSrc(mainJs, 'function normalize'), /if\(!s\.sid \|\| seen\.has\(s\.sid\)\) s\.sid = id\(\)/); assert.match(fnSrc(mainJs, 'function addSlide'), /s\.sid = id\(\)/);
  assert.match(fnSrc(mainJs, 'function snapNow'), /deck\.slides\.forEach\(sidOf\)/); assert.match(fnSrc(mainJs, 'function restoreSnap'), /deck\.slides\.forEach\(sidOf\)/);
});

test('[7차] 덱을 통째로 바꾸면(파일 다시 불러오기·허브 덱 열기…) 이전 덱에서 시작한 사진 올리기는 새 덱에 적용·실패 표시되지 않는다 — 덱 세대 번호(DECK_GEN), 같은 덱 안 되돌리기·다시는 세대 유지', async () => {
  const dataUrl = t => 'data:image/png;base64,' + Buffer.from(t).toString('base64'), tick = () => new Promise(r => setTimeout(r, 20));
  const gates = {};
  const mkEnv = () => {
    const c = saveEnv({ sel: 0, PE: {}, renderAll() { }, bootPreview() { }, renderList() { }, renderEditor() { }, scheduleAutosave() { }, clone: o => JSON.parse(JSON.stringify(o)), IMG_URL: {}, SLIDE_CSS: '', ENGINE: '', SKELETON: '', escapeHtml: s => s,
      deck: { meta: { title: '원본' }, slides: [{ type: 'photo', sid: 'S1', title: '장', image: { src: dataUrl('A'), w: 1, h: 1 }, marks: [] }] },
      hubUpload: async blob => { if (blob.name === 'B' || blob.name === 'C') return new Promise((ok, no) => { gates[blob.name] = { ok: () => ok('p/' + blob.name), no: m => no(new Error(m)) }; }); return 'p/' + (await blob.text()); } });
    c.B.deckName = { value: '' };
    vm.runInContext(pureSrc + ';' + [fnSrc(mainJs, 'function imgUrl'), fnSrc(mainJs, 'function deckData'), fnSrc(mainJs, 'function generateDeckHTML'), fnSrc(mainJs, 'function normalize'), 'const UNDO=[],REDO=[],SNAP_DATA=[];', fnSrc(mainJs, 'function snapNow'), fnSrc(mainJs, 'function snap()'), fnSrc(mainJs, 'function resetHistory'),
      fnSrc(mainJs, 'function restoreSnap'), fnSrc(mainJs, 'function undo'), fnSrc(mainJs, 'function redo'), fnSrc(mainJs, 'function loadDeck'), 'this.h={generateDeckHTML,loadDeck,undo,redo,snap,normalize};'].join('\n'), c);
    return c;
  };
  const ev = (c, e) => vm.runInContext(e, c);
  // (1) 사진 A 가 있는 덱을 내보냄(파일에 sid 가 같이 들어감) → 사진 B 업로드 지연 → 같은 파일을 다시 불러옴 → 제목 수정 → B 완료 → 저장: A 유지, B 적용 안 됨
  const c = mkEnv(), html = c.h.generateDeckHTML({ si: 0, atEnd: false }), exported = JSON.parse(html.match(/const DECK=(\{[\s\S]*?\});\s*window\.__BOOT__/)[1]);
  assert.equal(exported.slides[0].sid, 'S1', '내보낸 파일에 sid 가 들어감(이 재현의 전제)');
  const gen0 = ev(c, 'DECK_GEN'), jb = c.attachPhoto(c.deck.slides[0], { name: 'B' }); await tick();
  c.h.loadDeck(JSON.parse(JSON.stringify(exported)));   // 파일 다시 불러오기(같은 sid)
  assert.equal(ev(c, 'DECK_GEN'), gen0 + 1, '덱 세대가 올라감'); assert.equal(c.PH_JOBS.size, 0); assert.equal(ev(c, 'PH_PENDING.size'), 0, '진행·실패 상태도 비워짐');
  c.deck.meta.title = '불러온 뒤 제목 수정'; c.markDirty();
  gates.B.ok(); assert.equal(await jb, 'gone', '늦게 끝난 B 는 버림');
  assert.equal(c.deck.slides[0].image.src, dataUrl('A'), '불러온 덱의 사진 A 가 그대로'); assert.equal(c.deck.slides[0].image.path, undefined);
  await c.hubSave(); assert.equal(c.srv.writes, 1); assert.equal(c.srv.row.deck.slides[0].image.path, 'p/A', '저장된 건 사진 A(B 아님)'); assert.ok(!JSON.stringify(c.srv.row).includes('p/B'));
  // (2) 늦게 실패해도 새 덱에는 실패 표시가 안 생기고 저장이 안 막힘
  const f = mkEnv(); const jf = f.attachPhoto(f.deck.slides[0], { name: 'C' }); await tick();
  f.h.loadDeck(JSON.parse(JSON.stringify(exported))); gates.C.no('HTTP 500'); await assert.rejects(jf, /HTTP 500/);
  assert.equal(ev(f, 'phFailedCount()'), 0, '다른 덱 일의 실패는 표시 안 함'); f.markDirty(); await f.hubSave(); assert.equal(f.srv.writes, 1);
  // (3) 허브 덱 열기(덱 교체 + resetHistory)도 같음: 이전 덱의 올리기가 새 덱의 같은 sid 슬라이드에 붙지 않음
  const g = mkEnv(); const jg = g.attachPhoto(g.deck.slides[0], { name: 'B' }); await tick();
  g.deck = { meta: { title: '서버에서 연 덱' }, slides: [{ type: 'photo', sid: 'S1', image: { path: 'srv/A.webp', w: 1, h: 1 }, marks: [] }] }; ev(g, 'resetHistory()');
  gates.B.ok(); assert.equal(await jg, 'gone'); assert.equal(g.deck.slides[0].image.path, 'srv/A.webp');
  // (4) 같은 덱 안 되돌리기·다시는 세대 유지(6차 동작 그대로): 올리는 중 Ctrl+Z 해도 올리던 사진이 적용됨
  const h = mkEnv(); const g0 = ev(h, 'DECK_GEN'); h.deck.slides[0].image = null; h.h.snap(); h.deck.slides[0].title = '고침';
  const jh = h.attachPhoto(h.deck.slides[0], { name: 'B' }); await tick(); h.h.undo(); h.h.redo(); assert.equal(ev(h, 'DECK_GEN'), g0, '되돌리기·다시는 세대를 안 올림');
  gates.B.ok(); assert.equal(await jh, 'ok'); assert.equal(h.deck.slides[0].image.path, 'p/B');
  // (5) 저장 중 hubUploadInline 이 올리는 도중 덱이 통째로 바뀌면, 옛 덱의 결과를 새 덱에 적용하지 않고 새 덱 것을 올려 저장함
  let rel; const slow = new Promise(r => { rel = r; });
  const k = mkEnv(); k.hubUpload = undefined;
  const up = []; vm.runInContext('hubUpload = async blob => { const t = await blob.text(); up.push(t); if (t === "A") await slow; return "p/" + t; }', Object.assign(k, { up, slow }) && k);
  k.markDirty(); const sv = k.hubSave(); await tick();
  k.h.loadDeck({ meta: { title: '새로 연 덱' }, slides: [{ type: 'photo', sid: 'S1', image: { src: dataUrl('Z'), w: 1, h: 1 }, marks: [] }] });
  rel(); await sv;
  assert.deepEqual(up, ['A', 'Z'], '옛 덱 A 를 올리던 중 덱이 바뀌어도 새 덱 Z 를 이어서 올림'); assert.equal(k.srv.row.deck.slides[0].image.path, 'p/Z', '저장된 건 새 덱의 사진'); assert.equal(k.srv.row.deck.meta.title, '새로 연 덱');
  // 덱을 통째로 바꾸는 모든 곳이 resetHistory(= 세대 증가)를 부름
  assert.match(fnSrc(mainJs, 'function resetHistory'), /DECK_GEN\+\+; loadSeq\+\+; PH_PENDING\.clear\(\); PH_FAILED\.clear\(\); PH_JOBS\.clear\(\);/);
  assert.match(fnSrc(mainJs, 'function loadDeck'), /resetHistory\(\)/); assert.match(mainJs, /B\.newBtn\.onclick=\(\)=>\{[^\n]*resetHistory\(\)/); assert.match(mainJs, /B\.tutorialBtn\.onclick=\(\)=>\{[^\n]*resetHistory\(\)/); assert.match(mainJs, /HUB\.on = true; sel = 0; resetHistory\(\);/); assert.match(mainJs, /normalize\(tutorialDeck\(\)\); resetHistory\(\);/);
  assert.equal(/function (undo|redo|restoreSnap)[^]*?resetHistory/.test(fnSrc(mainJs, 'function undo') + fnSrc(mainJs, 'function redo') + fnSrc(mainJs, 'function restoreSnap')), false, '되돌리기·다시는 세대를 올리지 않음');
});

test('[8차-1] 파일을 연달아 두 번 불러오면 최신 요청 결과만 적용한다 — 먼저 고른 파일의 읽기가 늦게 끝나도 나중 선택을 덮지 않음, 덱을 바꾸는 다른 동작(새로·튜토리얼·허브 덱 열기=resetHistory)도 대기 중인 읽기를 무효로 함', () => {
  const readers = [], loaded = [], toasts = [];
  class FR { readAsText(f) { this.f = f; readers.push(this); } }
  const ctx = { B: { fileInput: { files: [], value: 'x' } }, FileReader: FR, loadDeck: d => loaded.push(d.meta.title), toast: m => toasts.push(m) };
  vm.createContext(ctx);
  vm.runInContext('let loadSeq = 0;\n' + fnSrc(mainJs, 'B.fileInput.onchange=()=>{') + ';this.bump=()=>{loadSeq++;};', ctx);
  const pick = (name, title) => { ctx.B.fileInput.files = [{ name }]; ctx.B.fileInput.onchange(); const r = readers[readers.length - 1]; r.text = JSON.stringify({ meta: { title }, slides: [] }); return r; };
  const finish = r => { r.result = r.text; r.onload(); };
  // 먼저 고른 a 의 읽기가 늦게 끝남 → 나중에 고른 b 가 남아야 함
  const a = pick('a.json', 'A'), b = pick('b.json', 'B'); finish(b); finish(a);
  assert.deepEqual(loaded, ['B'], '늦게 끝난 옛 결과(A)는 버림');
  // 순서대로 끝나도 최신(b2)만
  loaded.length = 0; const a2 = pick('a.json', 'A2'), b2 = pick('b.json', 'B2'); finish(a2); finish(b2); assert.deepEqual(loaded, ['B2']);
  // 대기 중인 읽기 도중 덱을 통째로 바꾸면(resetHistory 가 번호를 올림) 그 읽기 결과는 버림
  loaded.length = 0; const c = pick('c.json', 'C'); ctx.bump(); finish(c); assert.deepEqual(loaded, [], '덱이 바뀐 뒤 늦게 끝난 읽기는 적용 안 함');
  assert.match(fnSrc(mainJs, 'function resetHistory'), /loadSeq\+\+/);
  // 단독 불러오기는 그대로 됨
  const d = pick('d.json', 'D'); finish(d); assert.deepEqual(loaded, ['D']); assert.ok(toasts.includes('불러왔어요'));
});

test('[8차-2] 허브 밖(이 브라우저 저장)에서도 사진 처리 중이면 저장·내보내기는 끝나길 기다리고(실패면 저장 안 함), 닫기 경고·숨김/종료 때 대기 중 자동저장 즉시 실행 · 허브 모드 동작 유지', async () => {
  const timers = [], store = {}, gates = {}, toasts = [], win = {}, doc = { visibilityState: 'visible', addEventListener(t, f) { doc[t] = f; } };
  const c = saveEnv({ sel: 0, PE: {}, renderAll() { }, bootPreview() { }, renderList() { }, renderEditor() { }, clone: o => JSON.parse(JSON.stringify(o)),
    localStorage: { setItem: (k, v) => { store[k] = v; } }, setTimeout: f => timers.push(f), clearTimeout: id => { if (id) timers[id - 1] = null; }, window: { addEventListener: (t, f) => { win[t] = f; } }, document: doc,
    blobToDataUrl: b => new Promise((ok, no) => { gates[b.name] = { ok: () => ok('data:image/png;base64,' + b.name), no: m => no(new Error(m)) }; }) });
  c.HUB.on = false;
  vm.runInContext(['let asTimer = 0, asPending = false, lsWarned = false; const LS_KEY = "k";', fnSrc(mainJs, 'function lsWrite'), fnSrc(mainJs, 'function scheduleAutosave'), fnSrc(mainJs, 'function flushAutosave'), fnSrc(mainJs, 'async function waitPhotos'), fnSrc(mainJs, 'async function localSave')].join('\n'), c);
  const reg = mainJs.slice(mainJs.indexOf('function mdeckUnsavedNow'), mainJs.indexOf('\n', mainJs.indexOf("document.addEventListener('visibilitychange'")) + 1);
  vm.runInContext(reg, c);
  const ev = e => vm.runInContext(e, c), tick = () => new Promise(r => setTimeout(r, 20));
  const unload = () => { const e = { prevented: false, preventDefault() { this.prevented = true; } }; win.beforeunload(e); return e.prevented; };
  const saved = () => store.k ? JSON.parse(store.k) : null;
  assert.equal(unload(), false, '아무 일 없으면 닫기 경고 없음');
  // (1) 사진 A 가 있는 덱, B 처리(축소·변환) 중에 저장 → 기다렸다가 B 로 저장
  const s0 = c.deck.slides[0]; s0.image = { src: 'data:image/png;base64,A', w: 1, h: 1 };
  const job = c.attachPhoto(s0, { name: 'B' }); await tick();
  assert.equal(unload(), true, '사진 처리 중에는 닫기 경고');
  const save = c.localSave(); await tick(); assert.equal(saved(), null, '처리 중에는 옛 사진으로 저장하지 않음'); assert.ok(c.toasts.some(t => t[0] === '사진 처리 중 — 끝나면 저장해요'));
  gates.B.ok(); assert.equal(await job, 'ok'); await save;
  assert.match(saved().slides[0].image.src, /base64,B$/, '끝난 뒤의 최신(B) 사진으로 저장'); assert.ok(c.toasts.some(t => /저장했어요/.test(t[0])));
  assert.equal(ev('asPending'), false, '직접 저장하면 자동저장 대기가 풀림'); assert.equal(unload(), false);
  // (2) 처리 실패: 저장하지 않고 안내, 실패 표시 유지
  for (const k of Object.keys(store)) delete store[k];
  const j2 = c.attachPhoto(s0, { name: 'C' }); await tick(); const sv2 = c.localSave(); gates.C.no('변환 실패'); await assert.rejects(j2, /변환 실패/); await sv2;
  assert.equal(saved(), null, '실패면 저장 안 함'); assert.ok(c.toasts.some(t => t[0] === '사진 1장 처리 실패 — 다시 골라 주세요' && t[1] === 'err'));
  // 다시 고르면 풀려 저장됨
  const j3 = c.attachPhoto(s0, { name: 'D' }); await tick(); gates.D.ok(); assert.equal(await j3, 'ok'); await c.localSave(); assert.match(saved().slides[0].image.src, /base64,D$/);
  // (3) 처리 직후 900ms 자동저장 전에 닫기: 닫기 경고 + 숨김/종료 때 즉시 저장
  for (const k of Object.keys(store)) delete store[k];
  const j4 = c.attachPhoto(s0, { name: 'E' }); await tick(); gates.E.ok(); await j4;
  assert.equal(ev('asPending'), true, '사진 적용 직후 자동저장이 예약됨'); assert.equal(saved(), null, '아직 저장 전(900ms 안)'); assert.equal(unload(), true, '자동저장 대기 중 닫기 경고');
  doc.visibilityState = 'visible'; doc.visibilitychange(); assert.equal(saved(), null, '보이는 중에는 즉시 저장 안 함');
  doc.visibilityState = 'hidden'; doc.visibilitychange(); assert.match(saved().slides[0].image.src, /base64,E$/, '숨겨지는 순간 즉시 저장'); assert.equal(ev('asPending'), false); assert.equal(unload(), false);
  for (const k of Object.keys(store)) delete store[k];
  c.deck.meta.title = '고침'; vm.runInContext('scheduleAutosave()', c); assert.equal(ev('asPending'), true); win.pagehide(); assert.equal(saved().meta.title, '고침', '창을 닫을 때(pagehide)도 즉시 저장'); win.pagehide(); // 두 번째는 할 일 없음
  // (4) 내보내기도 사진 처리 중이면 기다린 뒤 최신 상태로(코드 순서)
  const ex = fnSrc(mainJs, 'B.exportBtn.onclick=async()=>{'); assert.ok(ex.indexOf("waitPhotos('내려받아')") > 0 && ex.indexOf("waitPhotos('내려받아')") < ex.indexOf('generateDeckHTML'), '내보내기: 기다린 뒤에 파일을 만듦');
  assert.match(mainJs, /B\.saveBtn\.onclick=\(\)=>\{ if\(HUB\.on\)\{ hubSave\(\); return; \} localSave\(\); \};/);
  // (5) 허브 모드 닫기 경고 규칙은 그대로
  c.HUB.on = true; c.HUB.dirty = false; c.HUB.view = false; assert.equal(unload(), false); c.HUB.dirty = true; assert.equal(unload(), true); c.HUB.view = true; assert.equal(unload(), false, '보기 전용은 경고 없음');
  for (const k of Object.keys(store)) delete store[k];
  c.HUB.view = false; c.HUB.dirty = false; vm.runInContext('asPending = true', c); assert.equal(unload(), false, '허브 모드에서는 이 브라우저 자동저장 대기를 보지 않음'); vm.runInContext('flushAutosave()', c); // 허브 모드는 flush 도 안 함
  assert.equal(saved(), null);
});

test('[11차-A] 업무매뉴얼 편집·새로 만들기는 새 창(새 탭)으로 열리고, 허브 안 iframe 은 보기 전용(view=1)이다 — 허브 화면은 안 바뀜', () => {
  const ID1 = '11111111-1111-4111-8111-111111111111', base = encodeURI('설명덱_제작기.html');
  for (const role of ['owner', 'chief']) {
    const c = hubCtx(role); c.api.MDECK.decks = clone(DECKS); c.api.MDECK.mode = 'list';
    assert.equal(c.api.mdeckOpen('edit', ID1), true); assert.equal(c.api.mdeckOpen('new', ''), true);
    assert.deepEqual(clone(c.opened), [[base + '?deck=' + ID1, '_blank'], [base + '?new=1', '_blank']], role + ': 편집·새로 만들기는 새 창');
    assert.equal(c.api.MDECK.mode, 'list', '허브 화면은 그대로'); assert.equal(c.renders.length, 0, '허브를 다시 그리지 않음');
    // 팝업이 막히면 안내(글은 글 고치기 키)
    c.popupBlocked = true; c.api.mdeckOpen('edit', ID1); assert.deepEqual(clone(c.alerts), ['새 창이 열리지 않았어요. 이 사이트의 팝업을 허용한 뒤 다시 눌러 주세요.']);
  }
  for (const role of ['staff', 'manager']) { const c = hubCtx(role); assert.equal(c.api.mdeckOpen('edit', ID1), false); assert.equal(c.api.mdeckOpen('new', ''), false); assert.equal(c.opened.length, 0, role + ': 새 창 안 열림'); }
  // 보기: 허브 안 iframe 으로(view=1), 편집·새로 만들기 모드는 허브 안에 만들어지지 않음
  for (const role of ['owner', 'staff']) {
    const c = hubCtx(role); assert.equal(c.api.mdeckOpen('view', ID1), true); assert.equal(c.api.MDECK.mode, 'view'); assert.equal(c.renders.length, 1);
    const m = { innerHTML: '' }; c.api.renderMdeckTool(m);
    assert.ok(m.innerHTML.includes('<iframe class="tools-frame" src="' + base + '?deck=' + ID1 + '&amp;view=1"'), role); assert.ok(!/\?new=1|deck=[^"]*"(?![^"]*view)/.test(m.innerHTML.replace(/&amp;view=1/g, '')) || m.innerHTML.includes('view=1'));
    assert.equal((m.innerHTML.match(/<iframe/g) || []).length, 1);
  }
  for (const mode of ['edit', 'new']) { const c = hubCtx('owner'); c.api.MDECK.decks = []; c.api.MDECK.mode = mode; c.api.MDECK.id = ID1; const m = { innerHTML: '' }; c.api.renderMdeckTool(m); assert.ok(!m.innerHTML.includes('<iframe'), mode + ': 허브 안 편집 iframe 없음'); assert.equal(c.api.MDECK.mode, 'list'); }
  // 되돌려진 것(9·10차 허브 라우터 변경)이 없다 — 이전 동작 그대로
  for (const gone of ['toolsLeaveOk', 'toolsFrameKept', 'toolsFrameKey', 'view-root', 'data-tkey', 'mdeck.leave_unsaved', 'mdeck.leave_confirm', 'replaceChildren(m)']) assert.ok(!hr.includes(gone) && !js.includes(gone), '되돌렸어야 할 것이 남아 있음: ' + gone);
  // 탭 사용법의 늦은 응답 차단은 #main 자체를 빈 복제본으로 교체함. 감싸는 칸을 추가하지 않음.
  const router = fnSrc(hr, 'async function render()');
  assert.match(router, /const old=\$\('#main'\),m=old\.cloneNode\(false\);/, '#main 속성을 보존한 빈 복제본');
  assert.match(router, /old\.replaceWith\(m\);/, '새 #main 자체를 같은 위치에 놓음');
  assert.match(router, /m\.innerHTML='<div class="empty">불러오는 중…<\/div>';hubStaticFill\(\);apprKindSelectFill\(\);/, '초기 화면·공통 글·결재 선택칸 초기화 유지');
  // 다섯 후속 동작도 공용 render를 거침: 같은 #main 직계 구조 + 탭 사용법 재연결·옛 응답 차단.
  for (const name of ['revokeMonthlyLeaveAccrual','applyLeaveAccrual','submitConfidRecord','inboxSetSubtab','saveConsultationJournal']) {
    const body = fnSrc(hr, 'async function ' + name);
    if(name==='applyLeaveAccrual')assert.match(body, /const redraw=render\(\),refreshedMain=\$\('#main'\);await redraw;/, '연차 적용: 새 #main을 잡고 공용 라우터 완료를 기다림');
    else assert.match(body, /await render\(\)/, name + ': 공용 라우터로 현재 #main에 그림');
    assert.doesNotMatch(body, /render[A-Z]\w*\(\$\('#main'\)\)/, name + ': 안내·전환 안전장치를 우회하지 않음');
  }
  assert.match(fnSrc(hr, 'async function saveConsultationJournal'), /consultationResetForm\(\);await render\(\);/, '상담일지 초기화 후 현재 화면을 그림');
  assert.match(hr, /window\.hubSb = sb;/, 'window.hubSb 노출은 유지(허브 보기 iframe 이 씀)');
  assert.match(fnSrc(hr, 'function mdeckOpen'), /window\.open\(mdeckFrameUrl\(mode,id\),'_blank'\)/);
});

test('[11차-B] 인쇄 회귀 없음: 근로계약서·월 근무표·내 출퇴근 월 표 인쇄는 #main 직계 자식을 전제로 하므로 render() 가 #main 에 직접 그리고, 인쇄 함수·CSS 규칙이 그대로다', () => {
  // 1) render() 는 화면 그리기 함수에 #main 자체를 넘김(감싸는 칸 없음) → 인쇄 CSS `#main>.contract-print-target` 같은 직계 자식 규칙이 먹음
  const app = {}, got = {}; let main;
  const makeMain = () => ({ id: 'main', className: 'panel', parentNode: app, isConnected: true, innerHTML: '',
    cloneNode(deep) { assert.equal(deep, false, '이전 화면 자식은 복제하지 않음'); const next = makeMain(); next.id = this.id; next.className = this.className; return next; },
    replaceWith(next) { assert.strictEqual(this, main); next.parentNode = this.parentNode; this.parentNode = null; this.isConnected = false; main = next; }
  });
  main = makeMain();
  const mk = tab => { const ctx = { TAB: tab, $: s => (s === '#main' ? main : null), hubStaticFill() { }, apprKindSelectFill() { }, SCHEDULE_PEOPLE_ERROR: '', esc: s => String(s),
    renderContract: async m => { got.contract = m; }, renderAtt: async m => { got.att = m; }, renderSched: async m => { got.sched = m; } }; vm.createContext(ctx); vm.runInContext(fnSrc(hr, 'async function render()') + ';this.render=render;', ctx); return ctx; };
  return (async () => {
    for (const [tab, label] of [['contract', '근로계약서'], ['att', '내 출퇴근(월 표 인쇄)'], ['sched', '월 근무표']]) {
      const old = main; old.innerHTML = '<div>이전 화면</div>'; await mk(tab).render();
      assert.strictEqual(got[tab], main, label + ': 현재 #main 자체에 그림(감싸는 칸 없음)');
      assert.notStrictEqual(main, old, label + ': 늦은 응답이 쓸 이전 #main과 분리');
      assert.equal(main.id, 'main'); assert.equal(main.className, 'panel'); assert.strictEqual(main.parentNode, app, '#main은 원래 부모 직계');
      assert.equal(old.isConnected, false); assert.equal(main.isConnected, true);
      assert.equal(main.innerHTML, '<div class="empty">불러오는 중…</div>', '이전 화면 자식을 보존하지 않은 새 화면');
    }
    // 2) 인쇄 CSS 규칙(직계 자식 기준)이 그대로 있음
    assert.ok(hr.includes('body.contract-printing #main>.contract-print-target{display:block!important')); assert.ok(hr.includes('body.contract-printing #main> *{display:none!important}'));
    assert.ok(hr.includes('body.staff-att-printing #main> *:not(#staffAttMonthContainer){display:none!important}') || hr.includes('body.staff-att-printing #main> *:not(#staffAttMonthContainer)'));
    // 3) printIntegratedContract / printStaffAttendanceMonth: 인쇄 직전에 표시용 클래스가 붙고 인쇄 뒤 떨어짐
    const classes = new Set(), tclasses = new Set(), snaps = []; const listeners = {};
    const env = { CONTRACT_ROWS: [{ id: 5, status: '서명완료', pledge_required: false }], document: { getElementById: id => (id === 'integratedContract-5' ? { classList: { add: c => tclasses.add(c), remove: c => tclasses.delete(c) } } : null), body: { classList: { add: c => classes.add(c), remove: c => classes.delete(c) } } },
      window: { addEventListener: (t, f) => { listeners[t] = f; }, removeEventListener: t => { delete listeners[t]; }, print: () => snaps.push([...classes].concat([...tclasses])) } };
    vm.createContext(env); vm.runInContext(fnSrc(hr, 'function printIntegratedContract') + ';' + fnSrc(hr, 'function printStaffAttendanceMonth') + ';', env);
    env.printIntegratedContract(5); assert.deepEqual(snaps[0].sort(), ['contract-print-target', 'contract-printing'], '인쇄 순간: 본문 숨기고 계약서만'); listeners.afterprint(); assert.equal(classes.size + tclasses.size, 0, '인쇄 뒤 원래대로');
    env.printStaffAttendanceMonth(); assert.deepEqual(snaps[1], ['staff-att-printing']); listeners.afterprint(); assert.equal(classes.size, 0);
  })();
});

test('[11차-C] 허브 밖(이 브라우저 저장)에서 localStorage 쓰기가 실패(용량 초과 등)하면 자동저장·pagehide·수동저장 모두 「미저장」 상태(자동저장 대기·닫기 경고)를 유지하고 백업 안내를 한다', async () => {
  const timers = [], store = {}, win = {}, doc = { visibilityState: 'visible', addEventListener(t, f) { doc[t] = f; } };
  let full = true;
  const c = saveEnv({ sel: 0, PE: {}, renderAll() { }, bootPreview() { }, renderList() { }, renderEditor() { }, clone: o => JSON.parse(JSON.stringify(o)),
    localStorage: { setItem: (k, v) => { if (full) throw Object.assign(new Error('quota'), { name: 'QuotaExceededError' }); store[k] = v; } }, setTimeout: f => timers.push(f), clearTimeout: id => { if (id) timers[id - 1] = null; }, window: { addEventListener: (t, f) => { win[t] = f; } }, document: doc });
  c.HUB.on = false;
  vm.runInContext(['let asTimer = 0, asPending = false, lsWarned = false; const LS_KEY = "k";', fnSrc(mainJs, 'function lsWrite'), fnSrc(mainJs, 'function scheduleAutosave'), fnSrc(mainJs, 'function flushAutosave'), fnSrc(mainJs, 'async function waitPhotos'), fnSrc(mainJs, 'async function localSave')].join('\n'), c);
  vm.runInContext(mainJs.slice(mainJs.indexOf('function mdeckUnsavedNow'), mainJs.indexOf('\n', mainJs.indexOf("document.addEventListener('visibilitychange'")) + 1), c);
  const fire = () => { const k = timers.findLastIndex(f => f); const f = timers[k]; timers[k] = null; f(); };
  const ev = e => vm.runInContext(e, c), MSG = '브라우저 저장 공간이 부족해요 — 발표 파일 만들기로 백업하세요';
  const unload = () => { const e = { prevented: false, preventDefault() { this.prevented = true; } }; win.beforeunload(e); return e.prevented; };
  const errToasts = () => c.toasts.filter(t => t[0] === MSG && t[1] === 'err').length;
  // (1) 자동저장 실패: 타이머가 돌아도 대기 표시 유지 + 닫기 경고 + 백업 안내(한 번)
  c.deck.meta.title = '고침'; ev('scheduleAutosave()'); assert.equal(ev('asPending'), true); fire();
  assert.equal(ev('asPending'), true, '쓰기 실패 → 아직 미저장'); assert.equal(unload(), true, '닫기 경고 유지'); assert.equal(errToasts(), 1, '백업 안내'); assert.deepEqual(Object.keys(store), []);
  ev('scheduleAutosave()'); fire(); assert.equal(errToasts(), 1, '같은 안내를 계속 반복하지 않음');
  // (2) pagehide·숨김 때 즉시 저장도 실패하면 미저장 유지
  win.pagehide(); assert.equal(ev('asPending'), true); doc.visibilityState = 'hidden'; doc.visibilitychange(); assert.equal(ev('asPending'), true); assert.equal(unload(), true);
  // (3) 수동 저장 실패: 「저장했어요」 아님, 백업 안내(매번), 미저장 유지
  c.toasts.length = 0; await c.localSave(); assert.ok(!c.toasts.some(t => /저장했어요/.test(t[0])), '성공 안내 없음'); assert.equal(errToasts(), 1); assert.equal(ev('asPending'), true); assert.equal(unload(), true);
  // (4) 공간이 생기면(다른 탭 정리 등) 다음 시도에서 저장되고 대기·경고가 풀림
  full = false; win.pagehide(); assert.equal(ev('asPending'), false); assert.equal(JSON.parse(store.k).meta.title, '고침'); assert.equal(unload(), false);
  full = true; ev('scheduleAutosave()'); assert.equal(ev('asPending'), true); fire(); assert.equal(errToasts(), 2, '성공한 뒤 다시 실패하면 안내가 다시 나옴(경고 상태가 풀렸으므로)');
  full = false; c.toasts.length = 0; await c.localSave(); assert.ok(c.toasts.some(t => /저장했어요/.test(t[0]))); assert.equal(ev('asPending'), false);
  // 코드: 세 쓰기 경로 모두 lsWrite 한 곳을 지남
  assert.equal((mainJs.match(/localStorage\.setItem\(LS_KEY/g) || []).length, 1, 'localStorage 쓰기는 lsWrite 한 곳');
});

/* ---- 배치 A (2026-10-11): 큰 덱 빈 화면 · 글 겹침 피하기 · 등장 효과 · 줄바꿈·배경색 ---- */
test('A0 큰 덱 미리보기: 발표 화면 .app 열이 minmax(0,1fr)로 고정되고, 장이 31장 이상이면 점(dot)을 만들지 않고 30장 이하면 장 수만큼', () => {
  const css = between(maker, '<template id="slideCSS">', '</template>');
  assert.match(css, /\.app\{[^}]*grid-template-columns:minmax\(0,1fr\)/, '열 크기가 없으면 점 317개가 열 폭을 5천 px로 키움');
  assert.match(css, /\.controls\{[^}]*min-width:0/);
  const src = engineSrc.slice(engineSrc.indexOf('function buildControls(){'), engineSrc.indexOf('function updateMeta'));
  const dots = (n) => {
    const dotsEl = fakeNode('div'), ctx = { dotsEl, slides: Array.from({ length: n }, () => ({})), si: 0, updateMeta() {}, goSlide() {}, el: (t, c) => fakeNode(t, c) };
    vm.createContext(ctx); vm.runInContext(src + ';this.buildControls=buildControls;', ctx); ctx.buildControls(); return dotsEl.children.length;
  };
  assert.equal(dots(317), 0); assert.equal(dots(31), 0); assert.equal(dots(30), 30); assert.equal(dots(5), 5);
});

test('A3 phAvoid: 겹친 글은 뒤 글이 비켜나고 · 안 겹치면 그대로 · 고정 글은 안 움직이고 · 경계 밖은 안 고르고 · 같은 입력은 같은 출력 · 빈 배열', () => {
  const av = (...a) => clone(geo.phAvoid(...a));
  const ov = (a, b, g = 0) => a.x < b.x + b.w + g && b.x < a.x + a.w + g && a.y < b.y + b.h + g && b.y < a.y + a.h + g;
  const box = (x, y, w = 100, h = 30) => ({ x, y, w, h }), B = [0, 400, 0, 300];
  // 겹침 → 뒤 글이 비킴(앞 글=고정 글은 그대로), 비킨 뒤 gap 4px 이상 떨어짐
  const f = [box(100, 100)], m = [box(110, 110)];
  const r = av(f, m, B, 4), moved = { ...m[0], ...r[0] };
  assert.equal(r.length, 1); assert.ok(!ov(f[0], moved, 3.98), '겹침 없음(gap 4)');
  assert.ok(Math.hypot(r[0].x - 110, r[0].y - 110) <= 40, '가장 가까운 자리: ' + JSON.stringify(r[0]));
  assert.deepEqual(f, [box(100, 100)], '고정 글 입력은 안 건드림');
  // 안 겹치면 그대로(gap 딱 4px 떨어지면 그대로, 그 안으로 닿으면 비킴)
  assert.deepEqual(av([box(0, 0)], [box(200, 200)], B, 4), [{ x: 200, y: 200 }]);
  assert.deepEqual(av([box(0, 0)], [box(104, 0)], B, 4), [{ x: 104, y: 0 }]);
  assert.notDeepEqual(av([box(0, 0)], [box(102, 0)], B, 4), [{ x: 102, y: 0 }]);
  // 움직이는 글끼리도 순서대로 자리 잡음(앞 글 먼저 놓이고 뒤 글이 비킴)
  const mm = av([], [box(50, 50), box(55, 55), box(60, 60)], B, 4);
  assert.deepEqual(mm[0], { x: 50, y: 50 });
  for (let i = 0; i < 3; i++) for (let j = i + 1; j < 3; j++) assert.ok(!ov({ ...box(0, 0), ...mm[i] }, { ...box(0, 0), ...mm[j] }, 3.98), '움직이는 글끼리 ' + i + '-' + j);
  // 경계 밖 후보는 안 고름: 위쪽 경계에 붙은 고정 글과 겹치면 위(경계 밖)가 아니라 안쪽 후보
  const up = av([box(100, 0)], [box(100, 10)], B, 4);
  assert.ok(up[0].y >= 0 && up[0].x >= 0 && up[0].x + 100 <= 400 && up[0].y + 30 <= 300, '경계 안: ' + JSON.stringify(up[0]));
  assert.deepEqual(av([box(0, 0, 400, 300)], [box(10, 10)], B, 4), [{ x: 10, y: 10 }], '빈 자리 없으면 원래 자리');
  // 결정적 + 빈 입력
  const a1 = av(f, [box(110, 110), box(120, 100)], B, 4), a2 = av(f, [box(110, 110), box(120, 100)], B, 4);
  assert.deepEqual(a1, a2);
  assert.deepEqual(av([], [], B, 4), []); assert.deepEqual(av([box(0, 0)], [], B, 4), []);
});

test('A3 발표 엔진 phLayout: 가져온 글(w 있음)은 그대로, 그 위에 겹친 화살표 글·내가 넣은 글만 비킴', () => {
  const ctx = engineCtx();
  const s = { type: 'photo', title: 't', image: { src: 'x', w: 1600, h: 900 }, marks: [
    { kind: 'label', x: 10, y: 10, w: 8, h: 4, text: '고정', step: 1 },
    { kind: 'label', x: 14, y: 12, text: '내 글(겹침)', step: 2 },
    { kind: 'arrow', pts: [[10, 12], [30, 40]], text: '화살표 글', step: 3 }] };
  const ph = ctx.buildPhoto(s)._ph;
  ph.pv.clientWidth = 1000; ph.pv.clientHeight = 562.5; ph.im.naturalWidth = 1600; ph.im.naturalHeight = 900;
  ctx.phLayout(ph);
  assert.equal(ph.labels[0].l.inn.style.transform, 'translate(0px,0px)', '고정 글은 안 움직임');
  const rect = l => { const t = l.inn.style.transform.match(/-?[\d.]+/g).map(Number); return { x: parseFloat(l.root.style.left) + t[0], y: parseFloat(l.root.style.top) + t[1], w: 80, h: 24 }; };
  const hit = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
  const fix = rect(ph.labels[0].l), free = rect(ph.labels[1].l), ar = rect(ph.arrows[0].lbl);
  assert.ok(!hit(fix, free), '내 글이 고정 글에서 비켜남 ' + JSON.stringify([fix, free]));
  assert.ok(!hit(fix, ar) && !hit(free, ar), '화살표 글도 겹치지 않음 ' + JSON.stringify([fix, free, ar]));
});

test('A4·A9a phNormalize: 잘못된 fx·color·bg는 지우고 허용 값은 유지(화살표 fx는 fade만)', () => {
  const n = pure.phNormalize({ type: 'photo', image: { path: 'p' }, marks: [
    { kind: 'label', x: 1, y: 1, text: 'a', fx: 'pop', color: '#112233', bg: '#fff' },
    { kind: 'label', x: 1, y: 1, text: 'b', fx: 'spin', color: 'red;background:url(x)', bg: 'url(javascript:1)' },
    { kind: 'label', x: 1, y: 1, text: 'c', fx: 'zoom' }, { kind: 'label', x: 1, y: 1, text: 'd', fx: 'fade', bg: 5 },
    { kind: 'arrow', pts: [[1, 1], [9, 9]], fx: 'fade', color: '#ff0000' }, { kind: 'arrow', pts: [[1, 1], [9, 9]], fx: 'zoom', color: '' }] }, () => 'i');
  const m = n.marks;
  assert.deepEqual(clone([m[0].fx, m[0].color, m[0].bg]), ['pop', '#112233', '#fff'], '허용 값 유지');
  assert.deepEqual([m[1].fx, m[1].color, m[1].bg], [undefined, undefined, undefined], '잘못된 값 지움');
  assert.equal(m[2].fx, 'zoom'); assert.equal(m[3].fx, 'fade'); assert.equal(m[3].bg, undefined, '문자열 아닌 색도 지움');
  assert.deepEqual([m[4].fx, m[4].color], ['fade', '#ff0000']);
  assert.deepEqual([m[5].fx, m[5].color], [undefined, undefined], '화살표는 zoom 불가 · 빈 색 지움');
  assert.deepEqual([geo.phFxOk('arrow', 'fade'), geo.phFxOk('arrow', 'pop'), geo.phFxOk('label', 'pop'), geo.phFxOk('label', ''), geo.phFxOk('label', undefined)], [true, false, true, false, false]);
});

test('A4 엔진 buildPhoto: fx 클래스가 붙고 · 모르는 fx는 무시 · 배경색 적용 · 글은 여전히 textContent로만 · 줄바꿈 글 CSS', () => {
  const ctx = engineCtx(), body = ctx.buildPhoto(clone({ type: 'photo', title: 't', image: { src: 'x', w: 100, h: 100 }, marks: [
    { id: 'a', kind: 'arrow', pts: [[10, 10], [30, 30]], text: '<b>x</b>', step: 1, fx: 'fade' },
    { id: 'b', kind: 'arrow', pts: [[10, 50], [30, 70]], text: '', step: 2, fx: 'zoom' },
    { id: 'c', kind: 'label', x: 50, y: 50, text: '<img src=x onerror=alert(1)>', step: 3, fx: 'pop', bg: '#ffeeaa' },
    { id: 'd', kind: 'label', x: 60, y: 60, text: 'd', step: 4, fx: '" onload="alert(1)' },
    { id: 'e', kind: 'label', x: 20, y: 80, text: 'e', step: 5, fx: 'zoom', bg: 'url(x)' }] }));
  const cls = []; walk(body, n => { if (/ph-(arrow|head|lbl-box)/.test(n.className)) cls.push(n.className); });
  assert.equal(cls.filter(c => /^ph-arrow fx-fade$/.test(c)).length, 1); assert.equal(cls.filter(c => /^ph-head fx-fade$/.test(c)).length, 1);
  assert.equal(cls.filter(c => /^ph-arrow$/.test(c)).length, 1, '화살표 zoom은 무시(기본 그려지듯)');
  assert.ok(cls.includes('ph-lbl-box fx-fade'), '화살표 글도 fade'); assert.ok(cls.includes('ph-lbl-box fx-pop')); assert.ok(cls.includes('ph-lbl-box fx-zoom'));
  assert.ok(cls.includes('ph-lbl-box'), '엉뚱한 fx는 클래스로 안 들어감'); assert.ok(!cls.some(c => /onload|alert/.test(c)));
  const boxes = []; walk(body, n => { if (/ph-lbl-box/.test(n.className)) boxes.push(n); });
  assert.equal(boxes.find(b => b.textContent.startsWith('<img')).style.background, '#ffeeaa', '배경색 적용');
  assert.equal(boxes.find(b => b.textContent === 'e').style.background, undefined, '이상한 배경색 무시');
  let html = false; walk(body, n => { if (/<(img|b)/.test(n.innerHTML)) html = true; });
  assert.equal(html, false, '글은 textContent로만');
  assert.ok(boxes.some(b => b.textContent === '<img src=x onerror=alert(1)>'));
  const css = between(maker, '<template id="slideCSS">', '</template>');
  assert.match(css, /\.ph-lbl-box\{[^}]*white-space:pre-line/); assert.match(css, /\.ph-arrow\.fx-fade\{/); assert.match(css, /\.ph-lbl-box\.fx-zoom\{/); assert.match(css, /\.ph-lbl-box\.fx-pop\{/);
  assert.match(css, /prefers-reduced-motion[\s\S]*\.ph-lbl-box\.fx-zoom,\.ph-lbl-box\.fx-pop\{transform:none/, '동작 줄이기: 효과는 투명도만');
  assert.match(maker, /\.pe-lbl\{[^}]*white-space:pre-line/);
});

test('A7 발표 파일 만들기: 사진 담는 중 n/전체 알림 + 못 담은 사진 수 알림', () => {
  assert.ok(maker.includes("'사진 담는 중 '+(++n)+'/'+todo.length")); assert.ok(maker.includes("'장을 못 담았어요'")); assert.ok(maker.includes('if(!r.ok) throw 0'));
});

test('[B1] 꺾임점 더하기·빼기(phBendAdd·phBendRemove)', () => {
  const two = [[10, 10], [50, 10]];
  const a = pure.phBendAdd(two);
  assert.deepEqual(clone(a), [[10, 10], [30, 10], [50, 10]], '2점 → 3점, 가운데는 중점'); assert.deepEqual(clone(two), [[10, 10], [50, 10]], '원본은 안 바뀜');
  const b = pure.phBendAdd([[0, 0], [10, 0], [10, 40]]);
  assert.deepEqual(clone(b), [[0, 0], [10, 0], [10, 20], [10, 40]], '가장 긴 구간(둘째 구간) 가운데에 끼움');
  const eight = Array.from({ length: 8 }, (_, i) => [i * 10, 0]);
  assert.equal(pure.phBendAdd(eight), null, '점이 8개면 더 못 늘림'); assert.equal(pure.phBendAdd(eight.slice(0, 7)).length, 8);
  assert.deepEqual(clone(pure.phBendAdd([[1.111, 1.111], [2.226, 2.226]])[1]), [1.67, 1.67], 'rnd2');
  const r = pure.phBendRemove(a, 1);
  assert.deepEqual(clone(r), [[10, 10], [50, 10]], '가운데 점이 빠짐'); assert.equal(a.length, 3, '원본은 안 바뀜');
  for (const i of [0, 2, -1, 3, 9]) assert.equal(pure.phBendRemove(a, i), a, '처음·끝·범위 밖은 원래 배열 그대로 ' + i);
});

test('[B1] 소스 확인: 붙여넣기·글 편집 칸·꾸미기 줄·장 이동·이름표·불러오기 안내', () => {
  const paste = between(maker, "document.addEventListener('paste'", "document.addEventListener('keydown'");
  assert.ok(paste.includes("x.kind === 'file' && /^image\\//.test(x.type)")); assert.match(paste, /isTypingTarget\(e\.target\) && items\.some\(x=> x\.type === 'text\/plain'\)/);
  assert.match(paste, /HUB\.view \|\| B\.help\.classList\.contains\('show'\)/); assert.match(paste, /snap\(\); s = blank\('photo'\)/);
  assert.match(paste, /photoPick\(s, file, msg\);[^\n]*\n\s*renderList\(\); renderEditor\(\)/);
  assert.match(fnSrc(maker, 'FORMS.photo = s=>'), /photoPick\(s, file\)/); assert.match(fnSrc(maker, 'async function photoPick'), /attachPhoto\(s, file\)/);
  const pop = fnSrc(maker, 'function peOpenPop');
  assert.match(pop, /ce\('textarea','pe-pop'\)/); assert.match(pop, /ev\.key === 'Enter' && !ev\.shiftKey/); assert.match(pop, /Shift\+Enter 줄바꿈/);
  const deco = fnSrc(maker, 'function peDeco');
  assert.ok(!/peRenderRows/.test(deco.replace(/\/\*[\s\S]*?\*\//g, '')), '꾸미기 칸은 줄을 다시 그리지 않음(색 창 유지)');
  assert.match(deco, /type = 'color'/); assert.match(deco, /'지금 '\+cur/); assert.match(deco, /delete m\.color; delete m\.bg; delete m\.size; delete m\.fx; peChanged\(\)/);
  assert.match(maker, /id="slideGo"/); assert.match(maker, /1~'\+N\+' 사이 번호를 넣어 주세요/);
  assert.match(maker, /<h2>편집<\/h2><span class="hint">여기서 고쳐요/); assert.match(maker, /직원에게 이렇게 보여요/);
  assert.match(maker, /id="loadBtn" title="「발표 파일 만들기」로 만든 \.html 또는 \.json 파일만 열려요"/);
  assert.match(maker, /꺾임점은 6개까지예요/); assert.match(maker, /sn\.placeholder = '바로'/); assert.match(maker, /순서: 비우면 바로 나옴 · 숫자 = 클릭 몇 번째에 나올지/);
  assert.match(fnSrc(maker, 'function peRedraw'), /if\(!\(step >= 1\)\) return;/, '번호 배지는 순서 1 이상만');
});

test('[B2] zoomAt: 배율 1~6 자름 · 커서 아래 점 고정 · 이동 범위 · 1배면 0', () => {
  const Z = pure.zoomAt, VW = 800, VH = 400;
  assert.deepEqual(clone(Z(2, -100, -50, 400, 200, 0.5, VW, VH)), { z: 1, tx: 0, ty: 0 }, '1 미만은 1로 자르고 1배면 이동 0');
  assert.equal(Z(1, 0, 0, 100, 100, 9, VW, VH).z, 6, '6 초과는 6');
  assert.equal(Z(1, 0, 0, 100, 100, NaN, VW, VH).z, 1, '숫자가 아니면 1');
  // 커서 아래 점 고정(자르기에 안 걸리는 경우): 판 위 점의 틀 좌표 = tx + 판좌표*z
  const a = Z(2, -400, -200, 500, 250, 3, VW, VH), px = (500 + 400) / 2, py = (250 + 200) / 2;
  assert.ok(Math.abs(a.tx + px * a.z - 500) < 1e-9 && Math.abs(a.ty + py * a.z - 250) < 1e-9, '커서 아래 점이 그대로');
  // 범위: tx in [VW-VW*z, 0], ty in [VH-VH*z, 0]
  for (const [cx, cy, nz] of [[0, 0, 4], [VW, VH, 4], [VW / 2, VH / 2, 2.5], [10, 390, 6]]) {
    const r = Z(1, 0, 0, cx, cy, nz, VW, VH);
    assert.ok(r.tx <= 0 && r.tx >= VW - VW * r.z && r.ty <= 0 && r.ty >= VH - VH * r.z, '범위 ' + cx + ',' + cy);
  }
  assert.equal(Z(1, 0, 0, 0, 0, 4, VW, VH).tx, 0, '왼쪽 위 기준 확대는 0');
  assert.equal(Z(1, 0, 0, VW, VH, 4, VW, VH).tx, VW - VW * 4, '오른쪽 아래 기준은 끝까지');
  // 이동만(nz=z): 너무 멀리 끌어도 범위 안으로
  assert.deepEqual(clone(Z(3, 500, -9999, 0, 0, 3, VW, VH)), { z: 3, tx: 0, ty: VH - VH * 3 });
  assert.deepEqual(clone(Z(3, -300, -100, 0, 0, 3, VW, VH)), { z: 3, tx: -300, ty: -100 }, '범위 안 이동은 그대로');
});

test('[B2] 소스 확인: 접기 단추·pe-view·peXY 보정·Space·붙여넣기 닫기·peDeco 이름', () => {
  assert.match(maker, /id="pvFold" title="미리보기 접기 — 편집 칸이 넓어져요"/); assert.match(maker, /id="pvOn" type="button" hidden/);
  assert.match(maker, /\.work\.pv-off\{grid-template-columns:236px minmax\(320px,1fr\);\}/); assert.match(maker, /\.work, \.work\.pv-off\{grid-template-columns:200px 1fr/);
  assert.match(maker, /seolmyeongdeok:pvOff/); const pv = between(maker, 'function pvSet', 'B.pvFold.onclick');
  assert.match(pv, /try\{ localStorage\.setItem/); assert.match(maker, /try\{ off = localStorage\.getItem\(PV_KEY\) === '1'; \}catch/);
  assert.match(maker, /\.pe-view\{position:relative;[^}]*overflow:hidden/); assert.match(maker, /\.pe-stage\{position:absolute; left:0; top:0; width:100%; height:100%; transform-origin:0 0/);
  const ed = fnSrc(maker, 'function photoEditor');
  assert.match(ed, /ce\('div','pe-view'\)/); assert.match(ed, /calc\(\(100vh - 250px\) \* /); assert.ok(!/58\*/.test(ed), '옛 58vh 크기 줄이 없음');
  assert.match(ed, /sidOf\(s\) !== PE\.zsid/); assert.match(ed, /\{passive:false\}/); assert.match(ed, /e\.ctrlKey/); assert.match(ed, /e\.button === 1/); assert.match(ed, /PE\.space/);
  assert.match(ed, /if\(PE\.z > 1\) panStart\(e\)/); assert.match(ed, /observe\(vw\)/); assert.match(ed, /Ctrl\+휠 또는 ＋\/－ = 확대/);
  assert.match(fnSrc(maker, 'function peXY'), /\(e\.clientX-r\.left\)\*\(PE\.W \|\| r\.width\)\/\(r\.width \|\| 1\)/);
  assert.match(fnSrc(maker, 'function peApplyView'), /zoomAt\(PE\.z, PE\.tx, PE\.ty/);
  assert.match(maker, /e\.code === 'Space'[^\n]*peSpace\(true\)/); assert.match(maker, /document\.addEventListener\('keyup'/);
  const paste = between(maker, "document.addEventListener('paste'", "document.addEventListener('keydown'");
  assert.match(paste, /e\.preventDefault\(\);\s*if\(PE\.pop\) peClosePop\(\);/);
  const deco = fnSrc(maker, 'function peDeco'); assert.ok(!/\bsel\b/.test(deco.replace(/\/\*[\s\S]*?\*\//g, '').replace(/'[^']*'/g, '')), 'peDeco 안에 전역 sel 을 가리는 이름이 없음');
});

/* ---- 배치 C: 허브 자동 저장(노션처럼) · 설명서 · 튜토리얼 사진 장 ---- */
function autoEnv(over = {}) {   // 진짜 hubAutoQueue·hubAutoRun·hubSave 를 가짜 서버·짧은 지연(30ms)으로 돌림
  const toasts = [], srv = { version: 'v1', writes: 0, tries: 0, rows: [], gate: null, error: null };
  const ctx = Object.assign({ deck: { meta: { title: 'v0' }, slides: [{ type: 'cover', sid: 'x1' }] },
    HUB: { on: true, view: false, canEdit: true, rev: 0, dirty: false, saving: false, exists: true, id: 'i', category: '', published: false, version: 'v1', conflict: false, autoTimer: 0, autoMs: 30, autoAgain: false, sb: null },
    B: { saveBtn: { disabled: false }, hubState: { textContent: '', classList: { toggle() { }, add() { } } }, backupBtn: { hidden: true } }, toast: (m, t) => toasts.push([m, t]), deckForStore: d => JSON.parse(JSON.stringify(d)), hubUploadInline: async () => { },
    setTimeout, clearTimeout, toasts, srv }, over);
  vm.createContext(ctx);
  vm.runInContext(['const PH_JOBS = new Set(), PH_FAILED = new Map();', fnSrc(mainJs, 'function sidOf'), fnSrc(mainJs, 'function phFailedCount'), fnSrc(mainJs, 'function markDirty'), fnSrc(mainJs, 'function setDirty'), fnSrc(mainJs, 'async function hubWaitPhotos'), fnSrc(mainJs, 'function hubConflict'),
    fnSrc(mainJs, 'function hubStatus'), fnSrc(mainJs, 'function hubAutoQueue'), fnSrc(mainJs, 'function hubAutoRun'), fnSrc(mainJs, 'async function hubSave'), 'this.hubSave=hubSave;this.markDirty=markDirty;this.PH_JOBS=PH_JOBS;this.PH_FAILED=PH_FAILED;'].join('\n'), ctx);
  ctx.HUB.sb = { from: () => ({ update: row => { const f = {}; const ch = { eq: (k, v) => { f[k] = v; return ch; }, select: async () => {
    srv.tries++; srv.rows.push(JSON.parse(JSON.stringify(row)));
    if (srv.gate) await srv.gate;
    if (srv.error) return { data: null, error: { message: srv.error } };
    if (f.updated_at !== srv.version) return { data: [], error: null };
    srv.writes++; srv.version = 'v' + (srv.writes + 1); return { data: [{ id: 'i', updated_at: srv.version }], error: null }; } }; return ch; },
    select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { updated_at: srv.version } }) }) }) }) };
  return ctx;
}
const sleep = ms => new Promise(r => setTimeout(r, ms));
const state = c => c.B.hubState.textContent;

test('[C6-1] 자동 저장: 마지막으로 고친 뒤 일정 시간이 지나야 한 번 저장 · 그 사이 또 고치면 시간이 다시 시작 · 성공해도 알림(toast) 없이 상태 줄만 「저장됨 · 자동」', async () => {
  const c = autoEnv();
  c.markDirty(); await sleep(15); assert.equal(c.srv.tries, 0, '고친 직후엔 저장 안 함');
  c.markDirty(); await sleep(25); assert.equal(c.srv.tries, 0, '또 고쳤으니 시간이 다시 시작됨(첫 예약대로면 이미 저장됐을 시각)');
  await sleep(60); assert.equal(c.srv.writes, 1, '지나면 한 번'); assert.equal(c.HUB.dirty, false); assert.equal(state(c), '저장됨 · 자동'); assert.equal(c.toasts.length, 0, '자동 저장 성공은 알림 없음');
  await sleep(80); assert.equal(c.srv.tries, 1, '저장된 뒤 또 저장하지 않음');
  assert.match(mainJs, /autoMs:2500/, '기본 지연은 2.5초'); assert.match(fnSrc(mainJs, 'function markDirty'), /hubAutoQueue\(\)/);
});

test('[C6-2] 저장 중에 또 고치면 「저장 안 됨」 유지 → 끝난 뒤 한 번 더 저장되고 마지막 내용이 서버에 있다 · 손으로 누른 저장이면 「곧 자동 저장돼요」 안내', async () => {
  const c = autoEnv(); let release; c.srv.gate = new Promise(r => { release = r; });
  c.markDirty(); await sleep(60); assert.equal(c.srv.tries, 1, '첫 저장이 서버 응답을 기다리는 중'); assert.equal(c.HUB.saving, true);
  c.deck.meta.title = '마지막'; c.markDirty();   // 저장 중에 또 고침 → 예약 시각이 저장 중에 지남
  await sleep(60); assert.equal(c.HUB.autoAgain, true, '저장 중이라 「끝나면 한 번 더」 표시'); assert.equal(c.srv.tries, 1, '겹쳐 저장하지 않음');
  c.srv.gate = null; release(); await sleep(150);
  assert.equal(c.srv.writes, 2); assert.equal(c.srv.rows[1].deck.meta.title, '마지막', '마지막 내용이 서버에 감'); assert.equal(c.HUB.dirty, false); assert.equal(c.HUB.autoAgain, false); assert.equal(state(c), '저장됨 · 자동'); assert.equal(c.toasts.length, 0);
  // 손으로 누른 저장 중에 고침: 알림은 「그 사이 고친 내용은 곧 자동 저장돼요」, 상태는 저장 안 됨, 이어서 자동 저장이 한 번 더
  const m = autoEnv(); let rel2; m.srv.gate = new Promise(r => { rel2 = r; });
  m.markDirty(); const p = m.hubSave(); await sleep(10); m.deck.meta.title = '손저장중'; m.markDirty(); m.srv.gate = null; rel2(); await p;
  assert.equal(m.HUB.dirty, true); assert.ok(m.toasts.some(t => /저장했어요 — 그 사이 고친 내용은 곧 자동 저장돼요/.test(t[0])));
  await sleep(100); assert.equal(m.srv.writes, 2); assert.equal(m.srv.rows[1].deck.meta.title, '손저장중'); assert.equal(m.HUB.dirty, false);
});

test('[C6-3] 충돌이면 자동 저장이 멈추고 다시 안 간다(상태 줄 「충돌」 유지, 알림은 hubConflict 의 한 번)', async () => {
  const c = autoEnv(); c.srv.version = 'vX';   // 열어 둔 사이 서버가 바뀜
  c.markDirty(); await sleep(70); assert.equal(c.srv.tries, 1); assert.equal(c.HUB.conflict, true); assert.match(state(c), /충돌/); assert.equal(c.toasts.filter(t => /다른 곳에서 바뀌었어요/.test(t[0])).length, 1);
  c.markDirty(); await sleep(80); assert.equal(c.srv.tries, 1, '충돌 뒤엔 고쳐도 서버에 안 감'); assert.match(state(c), /충돌/, '상태 줄은 계속 「충돌」'); assert.equal(c.srv.writes, 0);
});

test('[C6-4] 올리기 실패한 사진이 있으면 자동 저장 안 함(상태 줄 「사진 실패 — 자동 저장 멈춤」, 알림 없음) · 사진 올리는 중이면 끝난 뒤 저장', async () => {
  const c = autoEnv(); c.PH_FAILED.set('x1', '실패');
  c.markDirty(); await sleep(70); assert.equal(c.srv.tries, 0); assert.equal(state(c), '사진 실패 — 자동 저장 멈춤'); assert.equal(c.toasts.length, 0); assert.equal(c.HUB.dirty, true);
  // 올리는 중에 시각이 지나면 끝나길 기다렸다가, 끝났는데 실패면 저장하지 않고 상태 줄만
  const d = autoEnv(); let res; d.PH_JOBS.add(new Promise(r => { res = r; }));
  d.markDirty(); await sleep(70); assert.equal(d.srv.tries, 0, '올리는 중에는 서버에 쓰지 않음'); assert.match(state(d), /사진 올리는 중/); assert.equal(d.toasts.length, 0);
  d.PH_FAILED.set('x1', '실패'); d.PH_JOBS.clear(); res(); await sleep(40);
  assert.equal(d.srv.tries, 0, '끝났는데 실패면 저장하지 않음'); assert.equal(state(d), '사진 실패 — 자동 저장 멈춤'); assert.equal(d.toasts.length, 0); assert.equal(d.HUB.dirty, true);
  const e = autoEnv(); let res2; e.PH_JOBS.add(new Promise(r => { res2 = r; })); e.markDirty(); await sleep(70); e.PH_JOBS.clear(); res2(); await sleep(40);
  assert.equal(e.srv.writes, 1, '올리기가 끝나면 저장됨'); assert.equal(e.HUB.dirty, false);
});

test('[C6-5] 일반 오류는 알림 없이 상태 줄 「자동 저장 실패 — 저장 단추를 눌러 주세요」 · 그 자리에서 다시 시도하지 않고, 다음에 고칠 때만 다시 예약', async () => {
  const c = autoEnv(); c.srv.error = '네트워크';
  c.markDirty(); await sleep(70); assert.equal(c.srv.tries, 1); assert.equal(state(c), '자동 저장 실패 — 저장 단추를 눌러 주세요'); assert.equal(c.toasts.length, 0); assert.equal(c.HUB.dirty, true);
  await sleep(120); assert.equal(c.srv.tries, 1, '끝없이 다시 시도하지 않음');
  c.markDirty(); await sleep(70); assert.equal(c.srv.tries, 2, '다시 고치면 그때 다시 시도');
  c.srv.error = null; c.markDirty(); await sleep(70); assert.equal(c.srv.writes, 1); assert.equal(c.HUB.dirty, false);
  // 손으로 누른 저장 실패는 지금처럼 알림
  const m = autoEnv(); m.srv.error = '끊김'; m.markDirty(); await m.hubSave(); assert.ok(m.toasts.some(t => /저장 실패: 끊김/.test(t[0]) && t[1] === 'err'));
});

test('[C6-6] 보기 모드·편집 권한 없음·허브 아님이면 예약하지 않는다 · 손 저장 단추를 누르면 대기 중인 자동 저장 타이머는 지운다(두 번 보내지 않음)', async () => {
  for (const patch of [{ view: true }, { canEdit: false }, { on: false }]) {
    const c = autoEnv(); Object.assign(c.HUB, patch); c.markDirty(); assert.ok(!c.HUB.autoTimer, JSON.stringify(patch) + ' — 타이머 없음'); await sleep(70); assert.equal(c.srv.tries, 0, JSON.stringify(patch));
  }
  const c = autoEnv(); c.markDirty(); assert.ok(c.HUB.autoTimer, '예약됨'); await c.hubSave();
  assert.equal(c.HUB.autoTimer, 0, '대기 타이머 지움'); assert.ok(c.toasts.some(t => /저장했어요/.test(t[0])), '손 저장은 알림'); await sleep(90); assert.equal(c.srv.tries, 1, '같은 내용을 두 번 보내지 않음');
  // 저장 중에 누른 손 저장(무시됨)이 대기 중인 자동 저장을 지워 버리지 않음
  const d = autoEnv(); let rel; d.srv.gate = new Promise(r => { rel = r; }); d.markDirty(); const p = d.hubSave(); await sleep(10); d.markDirty(); const t0 = d.HUB.autoTimer; await d.hubSave();
  assert.equal(d.HUB.autoTimer, t0, '저장 중 겹친 손 저장은 아무것도 안 함'); d.srv.gate = null; rel(); await p; await sleep(100); assert.equal(d.HUB.dirty, false); assert.equal(d.srv.writes, 2);
});

test('[C6-7] 공개 칸 안내·공개 알림·허브 「불러오기」 확인 창 문구(소스)', () => {
  assert.match(maker, /<label title="고치면 자동 저장돼요\. 공개 중이면 저장된 내용을 다음에 여는 직원부터 볼 수 있어요\. 이미 열린 화면은 새로고침이 필요해요\."><input type="checkbox" id="pubChk">/);
  assert.match(mainJs, /'공개로 바꿨어요 — 곧 자동 저장돼요 \(다음에 여는 직원부터 보여요\)' : '비공개로 바꿨어요 — 곧 자동 저장돼요'/);
  assert.match(mainJs, /B\.loadBtn\.onclick=\(\)=>\{ if\(HUB\.on && !confirm\('불러온 파일로 지금 매뉴얼 내용이 통째로 바뀌고 곧 자동 저장돼요\. 계속할까요\?'\)\) return; B\.fileInput\.click\(\); \};/);
  assert.match(mainJs, /B\.catSel\.onchange = \(\)=>\{ HUB\.category = B\.catSel\.value; markDirty\(\); \}/, '분류 바꾸기도 markDirty → 자동 저장');
  assert.match(mainJs, /window\.mdeckUnsaved = mdeckUnsavedNow/);
});

test('[C8-1] 튜토리얼 덱: 7가지 · 사진 슬라이드가 normalize 뒤에도 남음(데이터주소 그림, 표시 4개, 순서 0 하나, 바깥 주소 없음)', () => {
  const ctx = { PHG: geo, encodeURIComponent }; vm.createContext(ctx);
  vm.runInContext(['let _sn = 0; const id = () => "s" + (++_sn);', pureSrc, fnSrc(mainJs, 'function tutorialPhotoSlide'), fnSrc(mainJs, 'function tutorialDeck'), fnSrc(mainJs, 'function normalize'), 'this.d = normalize(tutorialDeck());'].join('\n'), ctx);
  const d = clone(ctx.d), photos = d.slides.filter(s => s.type === 'photo'); assert.equal(photos.length, 1);
  const p = photos[0]; assert.match(p.image.src, /^data:image\/svg\+xml;charset=utf-8,/); assert.equal(p.image.w, 1200); assert.equal(p.image.h, 800);
  assert.equal(p.marks.length, 6); assert.equal(p.marks.filter(m => m.step === 0).length, 1); assert.ok(p.marks.find(m => m.step === 0).bg, '순서 0 안내 글엔 배경색');
  assert.deepEqual([...new Set(p.marks.map(m => m.step))].sort(), [0, 1, 2, 3]);
  const bend = p.marks.find(m => m.kind === 'arrow' && m.pts.length >= 3 && m.pts.length <= 4); assert.ok(bend && bend.step === 2 && bend.fx === 'fade', '꺾인 화살표(순서 2, 나타나기)');
  assert.ok(p.marks.some(m => m.kind === 'arrow' && m.pts.length === 2 && m.step === 1), '곧은 화살표(순서 1)'); assert.ok(p.marks.some(m => m.kind === 'label' && m.fx === 'zoom' && m.step === 3), '확대 효과 글(순서 3)');
  assert.ok(!/https?:\/\//.test(JSON.stringify(d)), '바깥 주소 없음'); assert.ok(!/https?:\/\//.test(decodeURIComponent(p.image.src).replace('xmlns="http://www.w3.org/2000/svg"', '')), '그림 안에도 바깥 주소 없음(SVG 이름표 xmlns 만 있음)');
  const kinds = d.slides.find(s => s.title === '7가지 중에서 고르면 돼요'); assert.ok(kinds.nodes.some(n => n.label === '사진' && n.sub === '화살표·설명 글')); assert.equal(kinds.nodes.length, 8);
  assert.ok(d.slides.some(s => s.type === 'table' && s.rows.some(r => r.cells[0] === '사진')), '「어떤 종류를 언제 쓸까」 표에 사진 행');
  assert.ok(d.slides.findIndex(s => s.type === 'photo') === d.slides.findIndex(s => s.title === '7가지 중에서 고르면 돼요') + 1, '「슬라이드 종류」 도표 바로 뒤');
  assert.ok(!/6가지/.test(maker.slice(maker.indexOf('function tutorialDeck'), maker.indexOf('function normalize'))));
});

test('[C8-2] 도움말·단축키 줄: 사진 슬라이드 절·자동 저장·Shift+R·Ctrl+V·확대·이동 문구', () => {
  const help = between(maker, '<div class="overlay" id="helpOverlay">', 'id="closeHelp2"'), hint = between(maker, 'id="keyHint">', '</div>');
  for (const w of ['사진 슬라이드', '자동 저장', 'Shift+R', 'Ctrl+V', 'Ctrl+휠', 'Space+끌기', 'Shift+Enter', '접기 ▸', '장 이동', '기본으로', '순서 칸', '발표 파일 만들기', '.html·.json', '7가지', '꺾기 — 고른 화살표에 꺾임점 더하기']) assert.ok(help.includes(w), '도움말에 ' + w);
  for (const w of ['Shift+R', 'Ctrl+V', 'Ctrl+휠', 'Space+끌기']) assert.ok(hint.includes(w), '단축키 줄에 ' + w);
  assert.ok(!/6가지|여섯 가지/.test(help));
});

test('[2차 Codex 1차 지적] 누르기만 한 글은 겹침 계산 유지·놓으면 다시 계산 · 확대 중 입력 창은 바깥 틀에 · 사진 없는 장을 거치면 확대 초기화 · 「조금 크게」는 기본보다 큼', () => {
  const red = fnSrc(mainJs, 'function peRedraw');
  assert.ok(/dm = PE\.drag && PE\.drag\.moved \? PE\.drag\.m : null/.test(red), '실제로 끄는 중일 때만 계산에서 뺌');
  assert.ok(/PE\.disp\[o\.m\.id\]/.test(red), '비켜 앉은 자리를 기억');
  const ed = fnSrc(mainJs, 'function photoEditor');
  assert.ok(/PE\.drag = null; peRedraw\(\);/.test(ed), '놓으면 다시 그림(겹침 다시 계산)');
  assert.ok(/PE\.disp && PE\.disp\[d\.m\.id\]/.test(ed), '끌기는 보이던 자리에서 시작');
  const pop = fnSrc(mainJs, 'function peOpenPop');
  assert.ok(/PE\.view\.appendChild\(inp\)/.test(pop) && !/PE\.stage\.appendChild\(inp\)/.test(pop), '입력 창은 확대되는 판이 아니라 틀에');
  assert.ok(/preventScroll:true/.test(pop));
  assert.ok(/pePopPlace\(\)/.test(fnSrc(mainJs, 'function peApplyView')) && /scrollLeft = 0/.test(fnSrc(mainJs, 'function peApplyView')));
  assert.ok(/PE\.zsid = null/.test(fnSrc(mainJs, 'function renderEditor')), '사진 판 없는 장이면 확대 기억 버림');
  const sizes = JSON.parse(mainJs.match(/const PE_SIZES = (\[[^;]*\]);/)[1].replace(/'/g, '"'));
  for (const bw of [600, 1000]) assert.ok(geo.phLabelFont(sizes[0][0], bw) > 15, bw + 'px 사진에서 「조금 크게」가 기본 15px보다 큼');
});
