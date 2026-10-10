// tools/pptx_import/upload_deck.mjs 시험 — 가짜 supabase(fetch 대체)와 실제 가져오기 그림 몇 장으로: dry-run은 아무것도 안 보냄 · 새 덱 · --update-images(화살표·글 보존) · --append
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), os = require('node:os'), path = require('node:path'), { pathToFileURL } = require('node:url');
const root = path.join(__dirname, '..');
const load = () => import(pathToFileURL(path.join(root, 'tools/pptx_import/upload_deck.mjs')).href);

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
function fakeSb(rowsById = {}) {
  const calls = [];
  const fetch = async (url, opt = {}) => {
    calls.push({ url, method: opt.method || 'GET', headers: opt.headers, body: opt.body });
    const json = v => ({ ok: true, status: 200, json: async () => v });
    if (/\/rest\/v1\/manual_decks\?id=eq\./.test(url) && !opt.method) { const id = url.match(/eq\.([0-9a-f-]+)/)[1]; return json(rowsById[id] ? [rowsById[id]] : []); }
    return { ok: true, status: 201, json: async () => ({}) };
  };
  return { fetch, calls };
}
const ID = '11111111-1111-4111-8111-111111111111';
const env = { SUPABASE_SERVICE_ROLE_KEY: 'TEST-ONLY-NOT-A-REAL-KEY' };

test('dry-run(기본): 목록·용량만 출력하고 네트워크·키를 쓰지 않는다 · 실행(--execute)에 키 이름이 없으면 이름만 알리고 멈춘다', async () => {
  const { run, webpSize } = await load(); const dir = workdir(), sb = fakeSb(), out = [];
  const r = await run(['--deck', path.join(dir, 'deck.json'), '--images', path.join(dir, 'images')], { fetch: sb.fetch, log: s => out.push(s), uuid: () => ID });
  assert.equal(r.executed, false); assert.equal(sb.calls.length, 0, '아무것도 안 보냄');
  assert.match(out.join('\n'), /올릴 그림 3장/); assert.ok(out.some(l => l.includes(`manual-media/${ID}/slide001.webp`)));
  assert.deepEqual(webpSize(webp(1600, 900)), { w: 1600, h: 900 });
  await run(['--deck', path.join(dir, 'deck.json'), '--images', path.join(dir, 'images'), '--dry-run', '--execute'], { fetch: sb.fetch, log() { } }).then(x => assert.equal(x.executed, false), () => assert.fail());
  await assert.rejects(run(['--deck', path.join(dir, 'deck.json'), '--images', path.join(dir, 'images'), '--execute', '--keys-file', path.join(dir, 'none.env')], { fetch: sb.fetch, log() { }, env: {} }), /SUPABASE_SERVICE_ROLE_KEY/);
  assert.equal(sb.calls.length, 0);
  await assert.rejects(run(['--deck', path.join(dir, 'deck.json'), '--images', path.join(dir, 'images'), '--update-images'], { log() { } }), /--deck-id/);
});

test('새 덱: 그림 3장을 manual-media/<id>/slideNNN.webp 로 올리고 manual_decks 에 비공개 한 행 · image.path/w/h 채움 · 키는 헤더로만, 출력에 없음', async () => {
  const { run } = await load(); const dir = workdir(), sb = fakeSb(), out = [];
  const r = await run(['--deck', path.join(dir, 'deck.json'), '--images', path.join(dir, 'images'), '--execute', '--category', '진료실'], { fetch: sb.fetch, log: s => out.push(s), env, uuid: () => ID });
  assert.equal(r.executed, true);
  const ups = sb.calls.filter(c => /storage\/v1\/object\/manual-media/.test(c.url));
  assert.deepEqual(ups.map(c => c.url.split('manual-media/')[1]).sort(), [`${ID}/slide001.webp`, `${ID}/slide002.webp`, `${ID}/slide003.webp`]);
  assert.ok(ups.every(c => c.method === 'POST' && c.headers['Content-Type'] === 'image/webp' && c.headers['x-upsert'] === 'true' && c.headers.Authorization === 'Bearer ' + env.SUPABASE_SERVICE_ROLE_KEY));
  const ins = sb.calls.filter(c => /rest\/v1\/manual_decks$/.test(c.url));
  assert.equal(ins.length, 1); const row = JSON.parse(ins[0].body);
  assert.equal(row.id, ID); assert.equal(row.title, '원내 물품 정리'); assert.equal(row.published, false); assert.equal(row.category, '진료실');
  assert.deepEqual(row.deck.slides.map(s => s.image), [1, 2, 3].map(n => ({ path: `${ID}/slide00${n}.webp`, w: 1600, h: n === 3 ? 800 : 900 })));
  assert.equal(row.deck.slides[0].marks[1].pts.length, 4, '꺾은 화살표·색·글 상자 크기는 그대로'); assert.equal(row.deck.slides[0].marks[0].w, 9); assert.equal(row.deck.slides[1].srcSlide, 2);
  assert.ok(!out.join('\n').includes(env.SUPABASE_SERVICE_ROLE_KEY) && !JSON.stringify(ins[0].body).includes('TEST-ONLY'), '키 값이 출력·내용에 없음');
});

test('--update-images: srcSlide 가 같은 장은 바탕 그림만 바꾸고 허브에서 고친 화살표·글·제목은 보존 · 없는 장은 건너뜀 · 비율이 바뀌면 경고', async () => {
  const { run } = await load(); const dir = workdir();
  const edited = { meta: { title: '고친 덱' }, slides: [
    { type: 'photo', title: '허브에서 고친 제목', notes: '메모', srcSlide: 1, image: { path: `${ID}/slide001.webp`, w: 1600, h: 900 }, marks: [{ id: 'm', kind: 'arrow', pts: [[50, 50], [60, 60]], text: '내가 붙인 화살표', step: 1 }] },
    { type: 'photo', title: '장3', srcSlide: 3, image: { path: `${ID}/slide003.webp`, w: 1600, h: 900 }, marks: [] },
    { type: 'photo', title: '직접 만든 장', image: { path: `${ID}/mine.webp`, w: 10, h: 10 }, marks: [] }] };
  const sb = fakeSb({ [ID]: { id: ID, title: '고친 덱', deck: edited, published: true } }), out = [];
  await run(['--deck', path.join(dir, 'deck.json'), '--images', path.join(dir, 'images'), '--execute', '--update-images', '--deck-id', ID], { fetch: sb.fetch, log: s => out.push(s), env });
  const ups = sb.calls.filter(c => /storage\/v1\/object/.test(c.url)); assert.deepEqual(ups.map(c => c.url.split('/').pop()).sort(), ['slide001.webp', 'slide003.webp'], '기존 장 1·3만(2는 허브에 없어 건너뜀)');
  const patch = sb.calls.find(c => c.method === 'PATCH'); assert.ok(patch.url.endsWith('id=eq.' + ID)); const deck = JSON.parse(patch.body).deck;
  assert.equal(deck.slides.length, 3, '새 장을 덧붙이지 않음'); assert.equal(deck.slides[0].title, '허브에서 고친 제목'); assert.equal(deck.slides[0].marks[0].text, '내가 붙인 화살표'); assert.equal(deck.slides[0].notes, '메모');
  assert.deepEqual(deck.slides[0].image, { path: `${ID}/slide001.webp`, w: 1600, h: 900 }); assert.equal(deck.slides[1].image.h, 800); assert.equal(deck.slides[2].image.path, `${ID}/mine.webp`);
  assert.ok(out.some(l => /장 3: 그림 비율이 바뀜/.test(l)), '비율 경고'); assert.ok(!JSON.parse(patch.body).title && !('published' in JSON.parse(patch.body)), '제목·공개 여부는 건드리지 않음');
});

test('--append: srcSlide 가 없는 새 장만 뒤에 덧붙이고 기존 장은 그대로(업로드도 새 장 것만, 덮어쓰기 없음)', async () => {
  const { run } = await load(); const dir = workdir();
  const edited = { meta: { title: 't' }, slides: [{ type: 'photo', title: '수정됨', srcSlide: 1, image: { path: `${ID}/slide001.webp`, w: 1600, h: 900 }, marks: [] }, { type: 'photo', title: '둘째', srcSlide: 2, image: { path: `${ID}/slide002.webp`, w: 1600, h: 900 }, marks: [] }] };
  const sb = fakeSb({ [ID]: { id: ID, title: 't', deck: edited, published: false } });
  await run(['--deck', path.join(dir, 'deck.json'), '--images', path.join(dir, 'images'), '--execute', '--append', '--deck-id', ID], { fetch: sb.fetch, log() { }, env });
  const ups = sb.calls.filter(c => /storage\/v1\/object/.test(c.url)); assert.deepEqual(ups.map(c => c.url.split('/').pop()), ['slide003.webp']); assert.equal(ups[0].headers['x-upsert'], 'false');
  const deck = JSON.parse(sb.calls.find(c => c.method === 'PATCH').body).deck;
  assert.deepEqual(deck.slides.map(s => s.srcSlide), [1, 2, 3]); assert.equal(deck.slides[0].title, '수정됨'); assert.equal(deck.slides[2].image.path, `${ID}/slide003.webp`); assert.equal(deck.slides[2].marks[1].color, '#ff0000');
});

test('실제 가져오기 결과 deck.json(317장) dry-run: 그림이 모두 있고 합계가 50MB 안쪽 · 없으면 건너뜀(PC에 결과가 있을 때만)', async (t) => {
  const D = 'Z:/09_claude-output/03_병원운영·전산/정플란트치과 내부 물품 및 진료프로토콜/_가져오기_20261010';
  if (!fs.existsSync(path.join(D, 'deck.json')) || !fs.existsSync(path.join(D, 'images'))) return t.skip('가져오기 결과 없음');
  const { run } = await load(); const out = [];
  const r = await run(['--deck', path.join(D, 'deck.json'), '--images', path.join(D, 'images')], { log: s => out.push(s) });
  assert.equal(r.plan.items.length, 317); assert.equal(r.plan.problems.length, 0); assert.ok(r.plan.items.reduce((n, i) => n + i.bytes, 0) < 50 * 1048576);
});
