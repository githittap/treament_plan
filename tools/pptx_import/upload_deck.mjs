/* upload_deck.mjs — PPT 가져오기 결과(deck.json + images\slideNNN.webp)를 허브 업무매뉴얼로 올린다.
 *
 *   node tools/pptx_import/upload_deck.mjs --deck <deck.json> --images <그림 폴더> [옵션]
 *
 * 기본은 「올릴 목록·용량만 출력」(= --dry-run, 네트워크·키 없이 동작). 실제로 올리려면 --execute 를 붙인다(원장 승인 뒤에만).
 *
 * 모드
 *   (없음)           새 덱 만들기: 그림을 manual-media/<deck_id>/slideNNN.webp 로 올리고 manual_decks 에 한 행 넣음
 *                    (제목 기본 「원내 물품 정리」·published=false·image.path/w/h 채움). 그 id 의 덱이 이미 있으면 그림을 올리기 전에 거절함.
 *                    --deck-id 로 id 를 고정하면, 중단된 뒤 같은 명령을 다시 돌려 이어서 할 수 있음(같은 그림은 건너뜀)
 *   --update-images  이미 올라간 덱(--deck-id 필수)에서 srcSlide 가 같은 장의 바탕 그림만 바꿈 — 허브에서 고친 화살표·글·제목·메모는 그대로.
 *                    새 그림은 slideNNN.<해시8자>.webp 라는 새 이름으로 올려 옛 그림을 덮어쓰지 않음(옛 그림은 보관함에 남음)
 *   --append         이미 올라간 덱(--deck-id 필수)에 srcSlide 가 없는 새 장만 뒤에 덧붙임
 *   (--update-images 와 --append 는 함께 쓸 수 있음)
 * 안전 규칙
 *   · 보관함 그림은 어떤 모드에서도 덮어쓰지 않음(upsert 없음). 같은 이름이 이미 있으면 내용(sha256)을 비교해 같으면 건너뛰고, 다르면 멈춤
 *   · 기존 덱 고치기(--update-images·--append)는 읽은 시점의 updated_at 이 그대로일 때만 저장(조건부 PATCH). 그 사이 허브에서 고쳤으면 다시 읽어 그림 경로만 다시 적용, 4번 실패하면 아무것도 덮지 않고 멈춤
 * 옵션
 *   --title <제목>  --category <진료실|데스크|상담|행정|통역|기공실>  --url <supabase 주소>  --keys-file <키 파일>  --concurrency <동시 업로드 수, 기본 4>
 *
 * 실행에 필요한 이름(값은 이 스크립트가 키 파일에서만 읽고 어디에도 출력·저장하지 않음):
 *   SUPABASE_SERVICE_ROLE_KEY  — 허브 supabase 프로젝트의 service_role 키(원장·실장 로그인 없이 표·보관함에 씀). 파일: C:\Users\elusi\.secrets\api-keys.env
 *   SUPABASE_URL               — (선택) 없으면 허브가 쓰는 프로젝트 주소(공개 값)를 씀
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { pathToFileURL } from 'node:url';

export const DEFAULT_URL = 'https://texevhsxttfoqkrucfzl.supabase.co';
export const DEFAULT_ENV = 'C:\\Users\\elusi\\.secrets\\api-keys.env';
export const CATS = ['진료실', '데스크', '상담', '행정', '통역', '기공실'];
const MAX_BYTES = 5 * 1024 * 1024;

/* WebP 머리글에서 가로·세로 읽기(VP8 / VP8L / VP8X) */
export function webpSize(buf) {
  if (buf.length < 30 || buf.toString('ascii', 0, 4) !== 'RIFF' || buf.toString('ascii', 8, 12) !== 'WEBP') throw new Error('webp 파일이 아님');
  const kind = buf.toString('ascii', 12, 16);
  if (kind === 'VP8 ') return { w: buf.readUInt16LE(26) & 0x3fff, h: buf.readUInt16LE(28) & 0x3fff };
  if (kind === 'VP8L') { const b = buf.readUInt32LE(21); return { w: (b & 0x3fff) + 1, h: ((b >> 14) & 0x3fff) + 1 }; }
  if (kind === 'VP8X') return { w: 1 + buf.readUIntLE(24, 3), h: 1 + buf.readUIntLE(27, 3) };
  throw new Error('알 수 없는 webp 형식: ' + kind);
}
export function parseArgs(argv) {
  const a = { flags: new Set(), opt: {} };
  const valued = new Set(['deck', 'images', 'title', 'category', 'deck-id', 'url', 'keys-file', 'concurrency']);
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i];
    if (!k.startsWith('--')) throw new Error('알 수 없는 인수: ' + k);
    const name = k.slice(2);
    if (valued.has(name)) { if (i + 1 >= argv.length) throw new Error(k + ' 값이 없음'); a.opt[name] = argv[++i]; }
    else if (['dry-run', 'execute', 'update-images', 'append'].includes(name)) a.flags.add(name);
    else throw new Error('알 수 없는 옵션: ' + k);
  }
  return a;
}
/* 키 파일(KEY=VALUE 줄)에서 필요한 이름만 읽는다 — 값은 호출한 쪽 변수에만 담김 */
export function readEnvFile(file, names, fsImpl = fs) {
  const out = {};
  if (!fsImpl.existsSync(file)) return out;
  for (const line of fsImpl.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m && names.includes(m[1]) && m[2]) out[m[1]] = m[2].replace(/^(['"])(.*)\1$/, '$2');
  }
  return out;
}
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/* 올릴 계획 만들기(파일 읽기만, 네트워크 없음) */
export function buildPlan({ deck, imagesDir, mode, existing, fsImpl = fs }) {
  const bySrc = new Map();
  (existing ? existing.slides : []).forEach((s, i) => { if (s.srcSlide != null) bySrc.set(s.srcSlide, i); });
  const items = [], problems = [], skipped = [];
  const result = existing ? JSON.parse(JSON.stringify(existing)) : { meta: { title: deck.title || '' }, slides: [] };
  deck.slides.forEach((s, i) => {
    const file = s.image && s.image.file;
    const idx = s.srcSlide != null ? bySrc.get(s.srcSlide) : undefined;
    let action;
    if (!existing) action = 'new';
    else if (idx !== undefined) action = mode.updateImages ? 'update' : 'skip';
    else action = mode.append ? 'append' : 'skip';
    if (action === 'skip') { skipped.push(s.srcSlide != null ? s.srcSlide : i + 1); return; }
    if (!file || /[\\/]/.test(file) || !/\.webp$/i.test(file)) { problems.push(`장 ${s.srcSlide != null ? s.srcSlide : i + 1}: image.file 이 없거나 잘못됨`); return; }
    const p = path.join(imagesDir, file);
    if (!fsImpl.existsSync(p)) { problems.push(`장 ${s.srcSlide != null ? s.srcSlide : i + 1}: 그림 없음 ${file}`); return; }
    const buf = fsImpl.readFileSync(p);
    if (buf.length > MAX_BYTES) { problems.push(`장 ${s.srcSlide}: ${file} 가 5MB 초과`); return; }
    let size; try { size = webpSize(buf); } catch (e) { problems.push(`장 ${s.srcSlide}: ${file} ${e.message}`); return; }
    const sha = crypto.createHash('sha256').update(buf).digest('hex');
    const uploadName = action === 'update' ? file.replace(/\.webp$/i, '') + '.' + sha.slice(0, 8) + '.webp' : file;
    items.push({ action, srcSlide: s.srcSlide, file, uploadName, sha, bytes: buf.length, w: size.w, h: size.h, slide: s, idx, buf });
  });
  return { items, problems, skipped, result };
}
/* 계획대로 덱 JSON 완성(그림 경로 채움). 옛 그림과 가로세로 비가 1% 넘게 다르면 경고(화살표·글은 사진 비율 좌표라 어긋날 수 있음) */
export function applyPlan(plan, deckId) {
  const warnings = [], slides = plan.result.slides;
  for (const it of plan.items) {
    const image = { path: `${deckId}/${it.uploadName}`, w: it.w, h: it.h };
    if (it.action === 'update') {
      const old = slides[it.idx].image || {};
      if (old.w && old.h && Math.abs(old.w / old.h - it.w / it.h) / (old.w / old.h) > 0.01) warnings.push(`장 ${it.srcSlide}: 그림 비율이 바뀜(${old.w}x${old.h} → ${it.w}x${it.h}) — 화살표·글 위치 확인 필요`);
      slides[it.idx].image = image;
    } else {
      const s = JSON.parse(JSON.stringify(it.slide)); s.image = image; slides.push(s);
    }
  }
  return warnings;
}
function mb(n) { return (n / 1048576).toFixed(2) + 'MB'; }

export async function run(argv, deps = {}) {
  const log = deps.log || console.log, fsImpl = deps.fs || fs, doFetch = deps.fetch || globalThis.fetch;
  const a = parseArgs(argv);
  if (!a.opt.deck || !a.opt.images) throw new Error('--deck 와 --images 가 필요함');
  const mode = { updateImages: a.flags.has('update-images'), append: a.flags.has('append') };
  const existingMode = mode.updateImages || mode.append;
  const execute = a.flags.has('execute') && !a.flags.has('dry-run');
  if (existingMode && !UUID.test(a.opt['deck-id'] || '')) throw new Error('--update-images / --append 는 --deck-id <uuid> 가 필요함');
  if (a.opt['deck-id'] && !UUID.test(a.opt['deck-id'])) throw new Error('--deck-id 는 uuid 모양이어야 함');
  if (a.opt.category && !CATS.includes(a.opt.category)) throw new Error('--category 는 ' + CATS.join('·') + ' 중 하나');
  const deck = JSON.parse(fsImpl.readFileSync(a.opt.deck, 'utf8'));
  if (!deck || !Array.isArray(deck.slides)) throw new Error('deck.json 모양이 아님');
  const deckId = a.opt['deck-id'] || (deps.uuid ? deps.uuid() : crypto.randomUUID());
  const url = (a.opt.url || deps.env?.SUPABASE_URL || DEFAULT_URL).replace(/\/$/, '');

  let key = '', existingRow = null;
  const names = ['SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_URL'];
  if (execute) {
    const env = { ...readEnvFile(a.opt['keys-file'] || DEFAULT_ENV, names, fsImpl), ...(deps.env || {}) };
    key = env.SUPABASE_SERVICE_ROLE_KEY || '';
    if (!key) throw new Error('키 이름 SUPABASE_SERVICE_ROLE_KEY 가 비어 있음 — 원장이 ' + (a.opt['keys-file'] || DEFAULT_ENV) + ' 에 채워야 함');
  }
  const headers = () => ({ apikey: key, Authorization: 'Bearer ' + key });
  const readRow = async () => {
    const r = await doFetch(`${url}/rest/v1/manual_decks?id=eq.${deckId}&select=id,title,deck,published,updated_at`, { headers: headers() });
    if (!r.ok) throw new Error('기존 덱 읽기 실패 HTTP ' + r.status);
    const rows = await r.json();
    return rows.length ? rows[0] : null;
  };
  if (execute) {
    existingRow = await readRow();
    if (!existingMode && existingRow) throw new Error(`이미 있는 덱 id(${deckId}) — 새 덱 모드로는 쓸 수 없음. 그림을 올리기 전에 멈춤. 고치려면 --update-images / --append 를 쓰거나 다른 --deck-id 를 줌`);
    if (existingMode && !existingRow) throw new Error('그 id 의 덱이 없음: ' + deckId);
  } else if (existingMode) log('(dry-run) 기존 덱은 읽지 않음 — 실제 실행 때 manual_decks 에서 ' + deckId + ' 를 읽어 srcSlide 로 맞춤. 아래는 deck.json 의 모든 장을 「올릴 후보」로 셈');
  let plan;
  if (existingMode && !execute) {
    // 시험 출력용: 기존 덱 없이 후보 전체를 보여 줌
    plan = buildPlan({ deck, imagesDir: a.opt.images, mode, existing: null, fsImpl });
    plan.items.forEach(it => { it.action = mode.updateImages ? 'update?' : 'append?'; if (mode.updateImages) it.uploadName = it.file.replace(/\.webp$/i, '') + '.' + it.sha.slice(0, 8) + '.webp'; });
  } else plan = buildPlan({ deck, imagesDir: a.opt.images, mode, existing: existingRow && existingRow.deck, fsImpl });

  const total = plan.items.reduce((n, it) => n + it.bytes, 0);
  log(`${execute ? '[실행]' : '[dry-run]'} 덱 id ${deckId} · 모드 ${existingMode ? [mode.updateImages && 'update-images', mode.append && 'append'].filter(Boolean).join('+') : '새 덱'} · 올릴 그림 ${plan.items.length}장 ${mb(total)} · 건너뜀 ${plan.skipped.length}장`);
  const counts = {}; plan.items.forEach(it => { counts[it.action] = (counts[it.action] || 0) + 1; }); log('동작별: ' + JSON.stringify(counts));
  plan.items.slice(0, 5).forEach(it => log(`  ${it.action} 장${it.srcSlide} → manual-media/${deckId}/${it.uploadName}  ${(it.bytes / 1024).toFixed(0)}KB ${it.w}x${it.h}`));
  if (plan.items.length > 5) log(`  … 외 ${plan.items.length - 5}장 (가장 큰 것 ${(Math.max(...plan.items.map(i => i.bytes)) / 1024).toFixed(0)}KB)`);
  plan.problems.forEach(p => log('문제: ' + p));
  if (plan.problems.length) throw new Error(`문제 ${plan.problems.length}건 — 고친 뒤 다시 실행`);
  if (!execute) { log('실제로 올리지 않았음. 올리려면 --execute (원장 승인 뒤)'); return { plan, deckId, executed: false }; }

  /* ---- 실제 올리기: 덮어쓰기 없음. 같은 이름이 있으면 내용이 같을 때만 건너뜀 ---- */
  const objUrl = name => `${url}/storage/v1/object/manual-media/${deckId}/${encodeURIComponent(name)}`;
  const isDuplicate = async r => {
    if (r.status === 409) return true;
    try { const t = typeof r.text === 'function' ? await r.text() : ''; const j = JSON.parse(t); return String(j.statusCode) === '409' || /duplicate/i.test(String(j.error || '')); } catch { return false; }
  };
  const sameObject = async (it) => {
    const r = await doFetch(objUrl(it.uploadName), { headers: headers() });
    if (!r.ok) return false;
    const got = Buffer.from(await r.arrayBuffer());
    return got.length === it.bytes && crypto.createHash('sha256').update(got).digest('hex') === it.sha;
  };
  const stat = { uploaded: 0, same: 0 }, doneNames = new Set();
  async function putAll(items) {
    const todo = items.filter(it => !doneNames.has(it.uploadName)); let next = 0;
    const conc = Math.max(1, Math.min(8, +a.opt.concurrency || 4));
    async function worker() {
      while (next < todo.length) {
        const it = todo[next++];
        const r = await doFetch(objUrl(it.uploadName), { method: 'POST', headers: { ...headers(), 'Content-Type': 'image/webp', 'x-upsert': 'false', 'cache-control': 'max-age=3600' }, body: it.buf });
        if (r.ok) stat.uploaded++;
        else if (await isDuplicate(r)) {
          if (!(await sameObject(it))) throw new Error(`장${it.srcSlide}: ${it.uploadName} 이 보관함에 이미 있고 내용이 달라 덮어쓰지 않고 멈춤`);
          stat.same++;
        } else throw new Error(`그림 올리기 실패 장${it.srcSlide} HTTP ${r.status} (올린 ${stat.uploaded}장·이미 있던 같은 그림 ${stat.same}장은 그대로 — 같은 명령을 다시 돌리면 같은 그림은 건너뛰고 이어서 함)`);
        doneNames.add(it.uploadName);
      }
    }
    await Promise.all(Array.from({ length: conc }, worker));
  }
  const patchHeaders = { ...headers(), 'Content-Type': 'application/json', Prefer: 'return=representation' };
  let attempt = 0;
  for (;;) {
    attempt++;
    await putAll(plan.items);
    const warnings = applyPlan(plan, deckId); warnings.forEach(w => log('경고: ' + w));
    if (!existingMode) {
      plan.result.meta.title = a.opt.title || deck.title || '원내 물품 정리';
      const body = { id: deckId, title: a.opt.title || deck.title || '원내 물품 정리', category: a.opt.category || null, deck: plan.result, published: false, sort: 0 };
      const r = await doFetch(`${url}/rest/v1/manual_decks`, { method: 'POST', headers: { ...headers(), 'Content-Type': 'application/json', Prefer: 'return=minimal' }, body: JSON.stringify(body) });
      if (!r.ok) throw new Error(`manual_decks 쓰기 실패 HTTP ${r.status}${r.status === 409 ? ' — 그 사이 같은 id 의 덱이 생김(그림은 덮어쓰지 않았음)' : ''}. 같은 명령을 다시 돌리면 같은 그림은 건너뜀`);
      break;
    }
    /* 기존 덱: 읽은 시점의 updated_at 이 그대로일 때만 저장 */
    const r = await doFetch(`${url}/rest/v1/manual_decks?id=eq.${deckId}&updated_at=eq.${encodeURIComponent(existingRow.updated_at)}`, { method: 'PATCH', headers: patchHeaders, body: JSON.stringify({ deck: plan.result }) });
    if (!r.ok) throw new Error(`manual_decks 쓰기 실패 HTTP ${r.status} — 그림은 올라가 있음. 같은 명령을 다시 돌리면 같은 그림은 건너뜀`);
    const rows = await r.json();
    if (rows.length) break;
    if (attempt >= 4) throw new Error(`허브에서 계속 고쳐져 ${attempt}번 시도했으나 저장하지 못함 — 허브의 내용은 하나도 덮지 않았음. 잠시 뒤 다시 실행`);
    log(`충돌: 읽은 뒤 허브에서 덱이 고쳐짐 — 다시 읽어 그림만 다시 적용(${attempt}/3)`);
    existingRow = await readRow();
    if (!existingRow) throw new Error('덱이 그 사이 지워졌음: ' + deckId);
    plan = buildPlan({ deck, imagesDir: a.opt.images, mode, existing: existingRow.deck, fsImpl });
    if (plan.problems.length) throw new Error('다시 읽은 뒤 문제: ' + plan.problems.join(' / '));
  }
  log(`완료: 그림 올림 ${stat.uploaded}장 · 이미 있어 건너뜀 ${stat.same}장 (${mb(total)}) · 덱 ${existingMode ? '갱신' : '추가(비공개)'} ${deckId}`);
  return { plan, deckId, executed: true, uploads: stat.uploaded, same: stat.same, attempts: attempt };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  run(process.argv.slice(2)).catch(e => { console.error('오류: ' + e.message); process.exit(1); });
}
