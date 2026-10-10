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

const pure = (() => { const ctx = {}; vm.createContext(ctx); vm.runInContext(pureSrc + ';this.api={rnd2,clampPct,roleCanEdit,isTypingTarget,phNormalize,phNextStep,phSwapMarks,deckForStore,snapEncode,snapDecode,shortcutAction};', ctx); return ctx.api; })();
const geo = (() => { const ctx = {}; vm.createContext(ctx); vm.runInContext(geoSrc + ';this.api={phFit,phArrow,phLabelPos,phSafeColor,phLabelFont};', ctx); return ctx.api; })();

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

test('편집 단축키: 글 입력 칸(입력·글상자·선택칸·편집영역)에서는 하나도 안 먹고, 그 밖에서는 치료계획 도구와 같은 글쇠', () => {
  const k = (code, extra) => Object.assign({ code, key: code.replace('Key', '').toLowerCase(), target: { tagName: 'DIV' } }, extra || {});
  const ctx = { photo: true, hasSel: true };
  for (const tag of ['INPUT', 'TEXTAREA', 'SELECT']) for (const code of ['KeyJ', 'KeyT', 'KeyA', 'KeyE', 'KeyK', 'Delete', 'Escape', 'PageDown'])
    assert.equal(pure.shortcutAction(k(code, { target: { tagName: tag } }), ctx), null, tag + ' ' + code);
  assert.equal(pure.shortcutAction(k('KeyZ', { ctrlKey: true, target: { tagName: 'INPUT' } }), ctx), null);
  assert.equal(pure.shortcutAction(k('KeyJ', { target: { tagName: 'DIV', isContentEditable: true } }), ctx), null);
  const want = { KeyJ: 'tool-arrow', KeyT: 'tool-text', KeyA: 'tool-select', KeyE: 'tool-erase', KeyK: 'bend', Delete: 'delete', Escape: 'cancel', PageDown: 'slide-next', PageUp: 'slide-prev' };
  for (const [code, act] of Object.entries(want)) assert.equal(pure.shortcutAction(k(code), ctx), act, code);
  assert.equal(pure.shortcutAction(k('KeyZ', { ctrlKey: true }), ctx), 'undo');
  assert.equal(pure.shortcutAction(k('KeyZ', { ctrlKey: true, shiftKey: true }), ctx), 'redo');
  assert.equal(pure.shortcutAction(k('KeyY', { ctrlKey: true }), ctx), 'redo');
  assert.equal(pure.shortcutAction(k('KeyD', { ctrlKey: true }), ctx), 'dup');
  assert.equal(pure.shortcutAction({ code: '', key: 'j', target: { tagName: 'DIV' } }, ctx), 'tool-arrow', '글쇠 코드가 없어도 글자로 인식');
  assert.equal(pure.shortcutAction(k('KeyJ'), { photo: false }), null, '사진 슬라이드가 아니면 그리기 글쇠 무반응');
  assert.equal(pure.shortcutAction(k('PageDown'), { photo: false }), 'slide-next', '장 이동·복제·되돌리기는 어느 장에서나');
  assert.equal(pure.shortcutAction(k('Delete'), { photo: true, hasSel: false }), null, '선택한 게 없으면 Delete 무반응(슬라이드를 실수로 안 지움)');
  assert.equal(pure.shortcutAction(k('KeyJ', { altKey: true }), ctx), null);
  assert.equal(pure.shortcutAction(k('KeyJ'), { photo: true, blocked: true }), null, '도움말 창이 열려 있으면 무반응');
  // 화면 연결: 안내 칸 + 도움말 표 + 보기용 keydown과 따로(제작기 문서 vs 미리보기 문서)
  assert.match(maker, /id="keyHint"/); assert.match(maker, /편집 단축키 \(글 입력 칸에서는 안 먹어요\)/);
  for (const key of ['Ctrl+Z', 'Ctrl+Y', 'Ctrl+D', 'Delete', 'Esc', 'PgDn / PgUp']) assert.ok(maker.includes('<kbd>' + key + '</kbd>'), key);
});

test('표시 순서 바꾸기·다음 단계 번호', () => {
  const m = clone(PHOTO.marks);
  assert.equal(pure.phNextStep(m), 4); assert.equal(pure.phNextStep([]), 1);
  assert.equal(pure.phSwapMarks(m, 0, 1), true);
  assert.deepEqual(clone(m.map(x => [x.id, x.step])), [['b', 1], ['a', 2], ['c', 3], ['d', 3]], '자리와 등장 순서를 함께 맞바꿈');
  assert.equal(pure.phSwapMarks(m, 0, -1), false);
});

test('허브 연결: 허브에서 ?deck/?new 로 열 때만 켜지고, 편집은 원장·실장만 · 허브 밖은 지금처럼 이 브라우저 저장', () => {
  assert.equal(pure.roleCanEdit('owner'), true); assert.equal(pure.roleCanEdit('chief'), true);
  for (const r of ['manager', 'staff', 'deputy', '', undefined]) assert.equal(pure.roleCanEdit(r), false, String(r));
  assert.match(maker, /if\(HUB\.view \|\| QS\.get\('deck'\) \|\| QS\.get\('new'\)\)/, '주소에 deck/new가 있을 때만 허브 모드');
  assert.match(maker, /function scheduleAutosave\(\)\{ if\(HUB\.on\)\{ setDirty\(true\); return; \}/, '허브 모드에선 이 브라우저 저장을 건드리지 않음');
  assert.match(maker, /B\.saveBtn\.onclick=\(\)=>\{ if\(HUB\.on\)\{ hubSave\(\); return; \} try\{ localStorage/, '허브 모드 저장 = 서버, 아니면 기존 localStorage');
  assert.match(maker, /if\(!HUB\.view && !HUB\.canEdit\) return hubFail/, '편집 화면은 원장·실장만');
  assert.match(maker, /from\('manual_decks'\)/); assert.match(maker, /from\('manual-media'\)/);
  assert.match(maker, /window\.parent\.sb/, '허브의 로그인 세션 재사용');
  assert.match(maker, /1600\/long/, '사진은 긴 변 1600px로 줄임'); assert.match(maker, /'image\/webp', 0\.85/);
});

/* ---- 허브(hr.html) 업무매뉴얼 화면 ---- */
const toolsBlock = between(hr, '/* hub-tools:test-start */', '/* hub-tools:test-end */');
function hubCtx(role) {
  const esc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const ctx = { ME: { id: 'u', role }, esc, render() {}, $: () => null, confirm: () => true, hubT: (k, d, v) => (v ? String(d).replace(/\{([a-z_]+)\}/g, (m, n) => v[n]) : String(d)), TAB: 'tools' };
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
    assert.equal(c.api.MDECK.mode, 'list');
  }
  for (const role of ['owner', 'chief']) {
    const c = hubCtx(role); c.api.MDECK.decks = clone(DECKS);
    const html = c.api.mdeckListHtml(role);
    assert.ok(html.includes('>편집<')); assert.ok(html.includes('＋ 새 매뉴얼')); assert.ok(html.includes('비공개'), '미공개 덱 표시');
    assert.equal(c.api.mdeckOpen('edit', DECKS[0].id), true); assert.equal(c.api.MDECK.mode, 'edit');
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
  assert.match(maker, /이미 여러 번 꺾인 화살표예요/, '꺾기(K)는 2↔3점만 — 가져온 여러 점 꺾은선을 펴서 망가뜨리지 않음');
});
