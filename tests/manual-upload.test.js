// tools/pptx_import/upload_deck.mjs 시험 — 가짜 supabase(fetch 대체: 표·보관함·updated_at 조건부 저장 흉내)와 실제 가져오기 그림 몇 장으로
// dry-run은 아무것도 안 보냄 · 새 덱 · 덮어쓰기 없음(1) · --update-images 허브 수정 보존·충돌 재시도(3) · --append 중간 실패 뒤 이어서(5)
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), os = require('node:os'), path = require('node:path'), crypto = require('node:crypto'), { pathToFileURL } = require('node:url');
const root = path.join(__dirname, '..');
const load = () => import(pathToFileURL(path.join(root, 'tools/pptx_import/upload_deck.mjs')).href);
const sha8 = b => crypto.createHash('sha256').update(b).digest('hex').slice(0, 8);

/* 최소 WebP(VP8 손실): 가로·세로만 맞으면 됨 */
function webp(w, h, extra = 0) {
  const b = Buffer.alloc(30 + extra); b.write('RIFF', 0, 'ascii'); b.writeUInt32LE(b.length - 8, 4); b.write('WEBP', 8, 'ascii'); b.write('VP8 ', 12, 'ascii');
  b.writeUInt16LE(w, 26); b.writeUInt16LE(h, 28); return b;
}
function workdir() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'upl-')); fs.mkdirSync(path.join(dir, 'images'));
  fs.writeFileSync(path.join(dir, 'images', 'slide001.webp'), webp(1600, 900, 100)); fs.writeFileSync(path.join(dir, 'images', 'slide002.webp'), webp(1600, 900, 200)); fs.writeFileSync(path.join(dir, 'images', 'slide003.webp'), webp(1600, 800, 300));
  const slide = (n, extra) => Object.assign({ type: 'photo', title: '장' + n, kicker: '', image: { file: `slide00${n}.webp` }, notes: '', srcSlide: n,
    marks: [{ kind: 'label', x: 2, y: 3, w: 9, h: 5, text: '글' + n, step: 1 }, { kind: 'arrow', pts: [[1, 1], [1, 5], [9, 5], [9, 9]], text: '', step: 2, color: '#ff0000' }] }, extra);
  fs.writeFileSync(path.join(dir, 'deck.json'), JSON.stringify({ title: '원내 물품 정리', slides: [slide(1), slide(2), slide(3)] }));
  return dir;
}
const ID = '11111111-1111-4111-8111-111111111111';
const env = { SUPABASE_SERVICE_ROLE_KEY: 'TEST-ONLY-NOT-A-REAL-KEY' };
const args = (dir, ...more) => ['--deck', path.join(dir, 'deck.json'), '--images', path.join(dir, 'images'), ...more];

/* 가짜 supabase: 표(updated_at 조건부 PATCH)·보관함(같은 이름 올리면 중복 오류, upsert 요청은 기록) */
function fakeSb({ rows = {}, objects = {}, hooks = {} } = {}) {
  const st = { rows: JSON.parse(JSON.stringify(rows)), objects: Object.fromEntries(Object.entries(objects).map(([k, v]) => [k, Buffer.from(v)])), calls: [], upsertRequests: 0, tick: 0, failUploadAt: null, uploadsSeen: 0 };
  const res = (status, body, extra = {}) => ({ ok: status < 300, status, json: async () => body, text: async () => (typeof body === 'string' ? body : JSON.stringify(body)), arrayBuffer: async () => extra.buf ? extra.buf.buffer.slice(extra.buf.byteOffset, extra.buf.byteOffset + extra.buf.length) : new ArrayBuffer(0) });
  st.fetch = async (url, opt = {}) => {
    const method = opt.method || 'GET'; st.calls.push({ url, method, headers: opt.headers, body: opt.body });
    const obj = url.match(/\/storage\/v1\/object\/manual-media\/(.+)$/);
    if (obj) {
      const name = decodeURIComponent(obj[1]);
      if (method === 'GET') return st.objects[name] ? res(200, '', { buf: st.objects[name] }) : res(404, 'nf');
      if (opt.headers['x-upsert'] === 'true') st.upsertRequests++;
      st.uploadsSeen++;
      if (st.failUploadAt && st.uploadsSeen === st.failUploadAt) return res(500, 'boom');
      if (st.objects[name]) return res(400, { statusCode: '409', error: 'Duplicate', message: 'The resource already exists' });
      st.objects[name] = Buffer.from(opt.body); return res(200, { Key: name });
    }
    const q = url.match(/\/rest\/v1\/manual_decks(?:\?(.*))?$/);
    const idq = q && q[1] && q[1].match(/id=eq\.([0-9a-f-]+)/);
    if (method === 'GET') { const r = idq && st.rows[idq[1]]; return res(200, r ? [JSON.parse(JSON.stringify(r))] : []); }
    if (method === 'POST') {
      const b = JSON.parse(opt.body); if (hooks.beforeInsert) hooks.beforeInsert(st, b);
      if (st.rows[b.id]) return res(409, { code: '23505' });
      st.rows[b.id] = { ...b, updated_at: '2026-10-10T01:00:00.000001+00:00' }; return res(201, '');
    }
    if (method === 'PATCH') {
      if (hooks.beforePatch) hooks.beforePatch(st);
      const row = st.rows[idq[1]], at = decodeURIComponent(q[1].match(/updated_at=eq\.([^&]+)/)[1]);
      if (!row || row.updated_at !== at) return res(200, []);
      Object.assign(row, JSON.parse(opt.body)); row.updated_at = '2026-10-10T02:00:0' + (++st.tick) + '+00:00'; return res(200, [JSON.parse(JSON.stringify(row))]);
    }
    throw new Error('예상 못한 요청 ' + method + ' ' + url);
  };
  return st;
}
const hubRow = (deck, extra) => ({ id: ID, title: '고친 덱', published: false, updated_at: '2026-10-09T00:00:00+00:00', deck, ...extra });
const imgOf = (n, h = 900) => ({ path: `${ID}/slide00${n}.webp`, w: 1600, h });

test('dry-run(기본): 목록·용량만 출력하고 네트워크·키를 쓰지 않는다 · 실행(--execute)에 키 이름이 없으면 이름만 알리고 멈춘다', async () => {
  const { run, webpSize } = await load(); const dir = workdir(), sb = fakeSb(), out = [];
  const r = await run(args(dir), { fetch: sb.fetch, log: s => out.push(s), uuid: () => ID });
  assert.equal(r.executed, false); assert.equal(sb.calls.length, 0, '아무것도 안 보냄');
  assert.match(out.join('\n'), /올릴 그림 3장/); assert.ok(out.some(l => l.includes(`manual-media/${ID}/slide001.webp`)));
  assert.deepEqual(webpSize(webp(1600, 900)), { w: 1600, h: 900 });
  assert.equal((await run(args(dir, '--dry-run', '--execute'), { fetch: sb.fetch, log() { } })).executed, false);
  await assert.rejects(run(args(dir, '--execute', '--keys-file', path.join(dir, 'none.env')), { fetch: sb.fetch, log() { }, env: {} }), /SUPABASE_SERVICE_ROLE_KEY/);
  assert.equal(sb.calls.length, 0);
  await assert.rejects(run(args(dir, '--update-images'), { log() { } }), /--deck-id/);
});

test('새 덱: 그림 3장을 manual-media/<id>/slideNNN.webp 로 올리고 manual_decks 에 비공개 한 행 · image.path/w/h 채움 · 키는 헤더로만 · upsert 요청 없음', async () => {
  const { run } = await load(); const dir = workdir(), sb = fakeSb(), out = [];
  const r = await run(args(dir, '--execute', '--category', '진료실'), { fetch: sb.fetch, log: s => out.push(s), env, uuid: () => ID });
  assert.equal(r.executed, true); assert.equal(sb.upsertRequests, 0, '덮어쓰기(upsert) 요청이 한 번도 없음');
  assert.deepEqual(Object.keys(sb.objects).sort(), [`${ID}/slide001.webp`, `${ID}/slide002.webp`, `${ID}/slide003.webp`]);
  const ups = sb.calls.filter(c => c.method === 'POST' && /storage/.test(c.url)); assert.ok(ups.every(c => c.headers['Content-Type'] === 'image/webp' && c.headers['x-upsert'] === 'false' && c.headers.Authorization === 'Bearer ' + env.SUPABASE_SERVICE_ROLE_KEY));
  const row = sb.rows[ID];
  assert.equal(row.title, '원내 물품 정리'); assert.equal(row.published, false); assert.equal(row.category, '진료실');
  assert.deepEqual(row.deck.slides.map(s => s.image), [imgOf(1), imgOf(2), imgOf(3, 800)]);
  assert.equal(row.deck.slides[0].marks[1].pts.length, 4); assert.equal(row.deck.slides[0].marks[0].w, 9); assert.equal(row.deck.slides[1].srcSlide, 2);
  assert.ok(!out.join('\n').includes(env.SUPABASE_SERVICE_ROLE_KEY) && !sb.calls.some(c => String(c.body).includes('TEST-ONLY')), '키 값이 출력·내용에 없음');
});

test('[1] 새 덱 모드: 이미 있는 --deck-id 는 사진을 올리기 전에 거절 · 같은 이름의 다른 사진은 덮어쓰지 않고 멈춤 · 같은 사진은 건너뜀 · 만드는 순간 생긴 경쟁에서도 사진 안 덮음', async () => {
  const { run } = await load(); const dir = workdir();
  // (a) 덱이 이미 있음 → 사진 요청 0건
  const a = fakeSb({ rows: { [ID]: hubRow({ meta: { title: 'x' }, slides: [] }) } });
  await assert.rejects(run(args(dir, '--execute', '--deck-id', ID), { fetch: a.fetch, log() { }, env }), /이미 있는 덱 id/);
  assert.equal(a.calls.filter(c => /storage/.test(c.url)).length, 0, '사진 올리기 전에 거절'); assert.equal(Object.keys(a.rows).length, 1);
  // (b) 보관함에 같은 이름의 다른 사진 → 덮지 않고 멈춤(원래 내용 그대로, 표에는 아무 행도 안 생김)
  const b = fakeSb({ objects: { [`${ID}/slide001.webp`]: 'SOMEONE ELSES PHOTO' } });
  await assert.rejects(run(args(dir, '--execute', '--deck-id', ID), { fetch: b.fetch, log() { }, env }), /덮어쓰지 않고 멈춤/);
  assert.equal(b.objects[`${ID}/slide001.webp`].toString(), 'SOMEONE ELSES PHOTO'); assert.equal(b.upsertRequests, 0); assert.equal(Object.keys(b.rows).length, 0);
  // (c) 같은 사진이 이미 있으면(앞선 실행이 끊김) 건너뛰고 이어서 완료
  const same = fs.readFileSync(path.join(dir, 'images', 'slide001.webp'));
  const c = fakeSb({ objects: { [`${ID}/slide001.webp`]: same } });
  const rc = await run(args(dir, '--execute', '--deck-id', ID), { fetch: c.fetch, log() { }, env }); assert.equal(rc.same, 1); assert.equal(rc.uploads, 2); assert.ok(c.rows[ID]);
  // (d) 확인 뒤 ~ 삽입 사이에 같은 id 덱이 생김(경쟁) → 삽입 거절, 사진은 upsert 없이 올렸으니 남의 사진을 못 덮음
  const d = fakeSb({ hooks: { beforeInsert: (st) => { st.rows[ID] = hubRow({ meta: { title: '남이 먼저' }, slides: [] }); } } });
  await assert.rejects(run(args(dir, '--execute', '--deck-id', ID), { fetch: d.fetch, log() { }, env }), /그 사이 같은 id/);
  assert.equal(d.rows[ID].title, '고친 덱'); assert.equal(d.upsertRequests, 0);
});

test('[3] --update-images: 읽은 뒤 허브에서 고친 제목·화살표·메모를 덮지 않는다 — updated_at 조건부 저장, 충돌이면 다시 읽어 그림 경로만 다시 적용, 4번 실패하면 멈춤', async () => {
  const { run } = await load(); const dir = workdir();
  const hub = () => ({ meta: { title: '고친 덱' }, slides: [{ type: 'photo', title: '허브에서 고친 제목', notes: '메모', srcSlide: 1, image: imgOf(1), marks: [{ id: 'm', kind: 'arrow', pts: [[50, 50], [60, 60]], text: '내가 붙인 화살표', step: 1 }] },
    { type: 'photo', title: '장3', srcSlide: 3, image: imgOf(3), marks: [] }, { type: 'photo', title: '직접 만든 장', image: { path: `${ID}/mine.webp`, w: 10, h: 10 }, marks: [] }] });
  // 정상(충돌 없음): 그림 1·3만 새 이름(해시)으로 올라가고 옛 그림은 그대로, 허브에서 고친 내용 보존
  const ok = fakeSb({ rows: { [ID]: hubRow(hub()) }, objects: { [`${ID}/slide001.webp`]: 'OLD1', [`${ID}/slide003.webp`]: 'OLD3' } });
  const out = [];
  const r = await run(args(dir, '--execute', '--update-images', '--deck-id', ID), { fetch: ok.fetch, log: s => out.push(s), env });
  const b1 = fs.readFileSync(path.join(dir, 'images', 'slide001.webp')), b3 = fs.readFileSync(path.join(dir, 'images', 'slide003.webp'));
  assert.deepEqual(Object.keys(ok.objects).sort(), [`${ID}/slide001.${sha8(b1)}.webp`, `${ID}/slide001.webp`, `${ID}/slide003.${sha8(b3)}.webp`, `${ID}/slide003.webp`].sort(), '새 이름으로 올림(옛 그림 안 덮음·안 지움)');
  assert.equal(ok.objects[`${ID}/slide001.webp`].toString(), 'OLD1'); assert.equal(ok.upsertRequests, 0);
  const d = ok.rows[ID].deck; assert.equal(d.slides.length, 3); assert.equal(d.slides[0].title, '허브에서 고친 제목'); assert.equal(d.slides[0].marks[0].text, '내가 붙인 화살표'); assert.equal(d.slides[0].notes, '메모');
  assert.deepEqual(d.slides[0].image, { path: `${ID}/slide001.${sha8(b1)}.webp`, w: 1600, h: 900 }); assert.equal(d.slides[1].image.h, 800); assert.equal(d.slides[2].image.path, `${ID}/mine.webp`);
  assert.ok(out.some(l => /장 3: 그림 비율이 바뀜/.test(l)), '비율 경고'); assert.equal(r.attempts, 1); assert.equal(ok.rows[ID].title, '고친 덱', '표 제목·공개 여부는 안 건드림');
  const patch = ok.calls.find(c => c.method === 'PATCH'); assert.match(patch.url, /updated_at=eq\.2026-10-09T00%3A00%3A00%2B00%3A00/, 'PATCH 는 읽은 시점의 updated_at 조건이 붙음'); assert.deepEqual(Object.keys(JSON.parse(patch.body)), ['deck']);
  // 충돌: 첫 PATCH 직전에 원장이 허브에서 제목·화살표를 고침 → 그 내용이 살아 있고 그림만 바뀜(재시도 1번)
  let edits = 0;
  const hooks = { beforePatch: st => { if (edits++ === 0) { const row = st.rows[ID]; row.deck.slides[0].title = '그 사이 새로 고친 제목'; row.deck.slides[0].marks.push({ id: 'n', kind: 'label', x: 5, y: 5, text: '그 사이 넣은 글', step: 2 }); row.updated_at = '2026-10-10T00:00:05+00:00'; } } };
  const cf = fakeSb({ rows: { [ID]: hubRow(hub()) }, hooks }), out2 = [];
  const r2 = await run(args(dir, '--execute', '--update-images', '--deck-id', ID), { fetch: cf.fetch, log: s => out2.push(s), env });
  assert.equal(r2.attempts, 2); assert.ok(out2.some(l => /충돌/.test(l)));
  const d2 = cf.rows[ID].deck; assert.equal(d2.slides[0].title, '그 사이 새로 고친 제목'); assert.equal(d2.slides[0].marks.length, 2); assert.equal(d2.slides[0].marks[1].text, '그 사이 넣은 글');
  assert.equal(d2.slides[0].image.path, `${ID}/slide001.${sha8(b1)}.webp`, '그림 경로는 새 것');
  assert.equal(cf.calls.filter(c => c.method === 'POST' && /storage/.test(c.url) && /slide001\./.test(c.url)).length, 1, '충돌 재시도에서 같은 그림을 또 올리지 않음');
  // 계속 충돌: 4번 시도 뒤 멈추고, 허브 쪽 내용은 한 글자도 안 덮음
  const always = fakeSb({ rows: { [ID]: hubRow(hub()) }, hooks: { beforePatch: st => { st.rows[ID].updated_at = '2026-10-10T00:00:0' + (++edits % 9) + '+00:00x'; st.rows[ID].deck.slides[0].title = '계속 고치는 중 ' + edits; } } });
  await assert.rejects(run(args(dir, '--execute', '--update-images', '--deck-id', ID), { fetch: always.fetch, log() { }, env }), /4번 시도했으나 저장하지 못함/);
  assert.match(always.rows[ID].deck.slides[0].title, /^계속 고치는 중/); assert.equal(always.rows[ID].deck.slides[0].image.path, `${ID}/slide001.webp`, '그림 경로도 안 바뀜');
  assert.equal(always.calls.filter(c => c.method === 'PATCH').length, 4);
});

test('[5] --append 중간 실패 뒤 같은 명령 재실행: 이미 올린 같은 사진은 건너뛰고 이어서 완료 · 내용이 다르면 멈춤 · 안내 문구는 실제 동작과 맞음', async () => {
  const { run } = await load(); const dir = workdir();
  const base = { meta: { title: 't' }, slides: [{ type: 'photo', title: '직접', image: { path: `${ID}/mine.webp`, w: 1, h: 1 }, marks: [] }] };
  const sb = fakeSb({ rows: { [ID]: hubRow(base) } }); sb.failUploadAt = 2;
  await assert.rejects(run(args(dir, '--execute', '--append', '--deck-id', ID, '--concurrency', '1'), { fetch: sb.fetch, log() { }, env }), e => /HTTP 500/.test(e.message) && /같은 그림은 건너뛰고 이어서/.test(e.message));
  assert.deepEqual(Object.keys(sb.objects), [`${ID}/slide001.webp`], '첫 장만 올라가 있음'); assert.equal(sb.rows[ID].deck.slides.length, 1, '표는 아직 그대로');
  const out = [];
  const r = await run(args(dir, '--execute', '--append', '--deck-id', ID, '--concurrency', '1'), { fetch: sb.fetch, log: s => out.push(s), env });
  assert.equal(r.same, 1, '이미 올라간 같은 사진은 건너뜀'); assert.equal(r.uploads, 2); assert.equal(sb.upsertRequests, 0);
  assert.deepEqual(sb.rows[ID].deck.slides.map(s => s.srcSlide), [undefined, 1, 2, 3]); assert.match(out.join('\n'), /이미 있어 건너뜀 1장/);
  // 같은 이름인데 내용이 다른 사진이 있으면 멈춤(덮지 않음)
  const bad = fakeSb({ rows: { [ID]: hubRow(base) }, objects: { [`${ID}/slide002.webp`]: 'DIFFERENT' } });
  await assert.rejects(run(args(dir, '--execute', '--append', '--deck-id', ID), { fetch: bad.fetch, log() { }, env }), /덮어쓰지 않고 멈춤/); assert.equal(bad.objects[`${ID}/slide002.webp`].toString(), 'DIFFERENT');
  // 이미 반영된(srcSlide 가 표에 있는) 장은 다시 하면 건너뜀 — 연속 두 번 실행해도 장이 중복되지 않음
  const again = await run(args(dir, '--execute', '--append', '--deck-id', ID), { fetch: sb.fetch, log() { }, env }); assert.equal(again.plan.items.length, 0); assert.equal(sb.rows[ID].deck.slides.length, 4);
});

test('실제 가져오기 결과 deck.json(317장) dry-run: 그림이 모두 있고 합계가 50MB 안쪽 · 없으면 건너뜀(PC에 결과가 있을 때만)', async (t) => {
  const D = 'Z:/09_claude-output/03_병원운영·전산/정플란트치과 내부 물품 및 진료프로토콜/_가져오기_20261010';
  if (!fs.existsSync(path.join(D, 'deck.json')) || !fs.existsSync(path.join(D, 'images'))) return t.skip('가져오기 결과 없음');
  const { run } = await load(); const out = [];
  const r = await run(['--deck', path.join(D, 'deck.json'), '--images', path.join(D, 'images')], { log: s => out.push(s) });
  assert.equal(r.plan.items.length, 317); assert.equal(r.plan.problems.length, 0); assert.ok(r.plan.items.reduce((n, i) => n + i.bytes, 0) < 50 * 1048576);
});

test('[2차-2] 충돌 재시도에서 그 사이 허브에서 지운 장을 되살리지 않는다 — --append·--update-images 모두 첫 조회 때 정한 대상 목록만 다시 적용', async () => {
  const { run } = await load(); const dir = workdir();
  const ex = n => ({ type: 'photo', title: '허브 ' + n, srcSlide: n, image: imgOf(n), marks: [{ id: 'k' + n, kind: 'label', x: 1, y: 1, text: '내 글 ' + n, step: 1 }] });
  const srcs = d => d.slides.map(s => s.srcSlide);
  // (a) --append: 입력 [1,2,3], 기존 [1,2] → 첫 조회 때 붙일 대상은 [3]. 원장이 1을 지운 뒤 재시도 → 1이 새 장으로 되살아나면 안 됨 → [2,3]
  let n = 0;
  const a = fakeSb({ rows: { [ID]: hubRow({ meta: { title: 't' }, slides: [ex(1), ex(2)] }) }, hooks: { beforePatch: st => { if (n++ === 0) { st.rows[ID].deck.slides = st.rows[ID].deck.slides.filter(s => s.srcSlide !== 1); st.rows[ID].updated_at = '2026-10-10T00:00:09+00:00'; } } } });
  const ra = await run(args(dir, '--execute', '--append', '--deck-id', ID), { fetch: a.fetch, log() { }, env });
  assert.equal(ra.attempts, 2); assert.deepEqual(srcs(a.rows[ID].deck), [2, 3], '지워진 1은 되살아나지 않고, 첫 조회 때 정한 3만 붙음');
  assert.equal(a.rows[ID].deck.slides[0].marks[0].text, '내 글 2');
  assert.ok(!a.objects[`${ID}/slide001.webp`], '되살리지 않았으니 1번 그림도 올리지 않음');
  // (b) --update-images + --append: 입력 [1,2,3], 기존 [1,2] → 1·2 그림 교체, 3 추가. 원장이 1을 지움 → 재시도: 1은 되살리지 않고(교체도 없음) 2·3만 반영 → [2,3]
  n = 0;
  const b = fakeSb({ rows: { [ID]: hubRow({ meta: { title: 't' }, slides: [ex(1), ex(2)] }) }, hooks: { beforePatch: st => { if (n++ === 0) { st.rows[ID].deck.slides = st.rows[ID].deck.slides.filter(s => s.srcSlide !== 1); st.rows[ID].updated_at = '2026-10-10T00:00:09+00:00'; } } } });
  await run(args(dir, '--execute', '--update-images', '--append', '--deck-id', ID), { fetch: b.fetch, log() { }, env });
  const bd = b.rows[ID].deck; assert.deepEqual(srcs(bd), [2, 3]);
  assert.match(bd.slides[0].image.path, /slide002\.[0-9a-f]{8}\.webp$/, '2는 그림만 교체'); assert.equal(bd.slides[0].marks[0].text, '내 글 2'); assert.equal(bd.slides[1].image.path, `${ID}/slide003.webp`);
  // (c) 대조: 재시도에서 지워진 게 없으면 처음 정한 대로 [1,2,3]
  n = 0;
  const c = fakeSb({ rows: { [ID]: hubRow({ meta: { title: 't' }, slides: [ex(1), ex(2)] }) }, hooks: { beforePatch: st => { if (n++ === 0) st.rows[ID].updated_at = '2026-10-10T00:00:09+00:00'; } } });
  await run(args(dir, '--execute', '--append', '--deck-id', ID), { fetch: c.fetch, log() { }, env }); assert.deepEqual(srcs(c.rows[ID].deck), [1, 2, 3]);
  // (d) 그 사이 원장이 같은 srcSlide 장을 직접 넣었으면 중복해서 또 붙이지 않음
  n = 0;
  const d = fakeSb({ rows: { [ID]: hubRow({ meta: { title: 't' }, slides: [ex(1), ex(2)] }) }, hooks: { beforePatch: st => { if (n++ === 0) { st.rows[ID].deck.slides.push(ex(3)); st.rows[ID].updated_at = '2026-10-10T00:00:09+00:00'; } } } });
  await run(args(dir, '--execute', '--append', '--deck-id', ID), { fetch: d.fetch, log() { }, env }); assert.deepEqual(srcs(d.rows[ID].deck), [1, 2, 3]);
});

test('[3차-2] --append 는 importedSrc(가져온 적 있는 srcSlide) 에 없는 장만 붙인다 — 허브에서 지운 장은 새 명령·새 실행에서도 되살아나지 않고, --force-src 로만 다시 넣는다', async () => {
  const { run } = await load(); const dir = workdir();
  const ex = n => ({ type: 'photo', title: '허브 ' + n, srcSlide: n, image: imgOf(n), marks: [] });
  const srcs = d => d.slides.map(s => s.srcSlide);
  // (1) 새 덱: 가져온 장 번호가 importedSrc 로 저장됨
  const nd = fakeSb(); await run(args(dir, '--execute', '--deck-id', ID), { fetch: nd.fetch, log() { }, env });
  assert.deepEqual(nd.rows[ID].deck.importedSrc, [1, 2, 3]);
  // (2) 원장이 2를 지운 뒤 같은 --append 를 새로 실행 → 2는 안 붙고 그림도 안 올림, 안내가 나옴
  nd.rows[ID].deck.slides = nd.rows[ID].deck.slides.filter(s => s.srcSlide !== 2); nd.rows[ID].updated_at = '2026-10-10T03:00:00+00:00';
  const out = [], r2 = await run(args(dir, '--execute', '--append', '--deck-id', ID), { fetch: nd.fetch, log: s => out.push(s), env });
  assert.deepEqual(srcs(nd.rows[ID].deck), [1, 3]); assert.deepEqual(nd.rows[ID].deck.importedSrc, [1, 2, 3]); assert.equal(r2.plan.items.length, 0);
  assert.ok(out.some(l => /다시 붙이지 않음: 장 2/.test(l) && /--force-src 2/.test(l)), '왜 안 붙였는지·되살리는 방법 안내');
  // (3) 정말 다시 넣고 싶을 때: --force-src 2 → 뒤에 붙음, 다른 지운 장은 여전히 안 붙음
  nd.rows[ID].deck.slides = nd.rows[ID].deck.slides.filter(s => s.srcSlide !== 1); nd.rows[ID].updated_at = '2026-10-10T03:01:00+00:00';
  await run(args(dir, '--execute', '--append', '--force-src', '2', '--deck-id', ID), { fetch: nd.fetch, log() { }, env });
  assert.deepEqual(srcs(nd.rows[ID].deck), [3, 2], '2만 되살림(1은 지운 채)'); assert.deepEqual(nd.rows[ID].deck.importedSrc, [1, 2, 3]);
  // (4) 실패 뒤 원장이 장을 지우고 같은 명령을 새로 돌림(고정 대상이 실행 메모리에만 있던 문제): 처음 입력 [1,2,3], 기존 [1,2](importedSrc [1,2]) → 올리다 실패 → 원장이 1 삭제 → 다시 실행
  const fl = fakeSb({ rows: { [ID]: hubRow({ meta: { title: 't' }, slides: [ex(1), ex(2)], importedSrc: [1, 2] }) } }); fl.failUploadAt = 1;
  await assert.rejects(run(args(dir, '--execute', '--append', '--deck-id', ID, '--concurrency', '1'), { fetch: fl.fetch, log() { }, env }), /HTTP 500/);
  fl.rows[ID].deck.slides = fl.rows[ID].deck.slides.filter(s => s.srcSlide !== 1); fl.rows[ID].updated_at = '2026-10-10T03:02:00+00:00';
  await run(args(dir, '--execute', '--append', '--deck-id', ID, '--concurrency', '1'), { fetch: fl.fetch, log() { }, env });
  assert.deepEqual(srcs(fl.rows[ID].deck), [2, 3], '지운 1은 되살아나지 않고 새 장 3만 붙음'); assert.deepEqual(fl.rows[ID].deck.importedSrc, [1, 2, 3]);
  // (5) importedSrc 가 없는 옛 덱: 현재 장들의 srcSlide 로 시작해 저장, --update-images 만 해도 목록이 생김
  const old = fakeSb({ rows: { [ID]: hubRow({ meta: { title: 't' }, slides: [ex(1), ex(2)] }) } });
  await run(args(dir, '--execute', '--append', '--deck-id', ID), { fetch: old.fetch, log() { }, env }); assert.deepEqual(old.rows[ID].deck.importedSrc, [1, 2, 3]);
  const old2 = fakeSb({ rows: { [ID]: hubRow({ meta: { title: 't' }, slides: [ex(1)] }) } });
  await run(args(dir, '--execute', '--update-images', '--deck-id', ID), { fetch: old2.fetch, log() { }, env }); assert.deepEqual(old2.rows[ID].deck.importedSrc, [1]);
  // (6) --force-src 는 --append 와 함께만, 장 번호 목록 모양만
  await assert.rejects(run(args(dir, '--force-src', '2'), { log() { } }), /--append 와 함께/);
  await assert.rejects(run(args(dir, '--append', '--deck-id', ID, '--force-src', 'a,b'), { log() { } }), /장 번호 목록/);
  // 제작기가 덱을 저장할 때 importedSrc 를 지우지 않음
  const maker = fs.readFileSync(path.join(root, '설명덱_제작기.html'), 'utf8'); assert.match(maker, /const c = JSON\.parse\(JSON\.stringify\(d\)\);/, '덱 전체를 복사해 저장(importedSrc 보존)');
});
