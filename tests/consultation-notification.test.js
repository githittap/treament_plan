const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const endpoint = 'https://example.invalid/consultation-notification';
const token = 't'.repeat(40);
const request = (source, eventId, body, secret = token) => new Request(`${endpoint}?source=${source}`, {
  method: 'POST', headers: { 'X-Webhook-Token': secret, 'X-Event-Id': eventId }, body,
});

test('폰 알림 원문은 카카오·당근 출처를 보존하고 같은 이벤트 재전송을 한 행으로 합친다', async () => {
  const { handleNotification } = await import('../supabase/functions/consultation-notification/core.ts');
  const rows = new Map();
  const deps = {
    verifyToken: async value => value === token,
    ingest: async value => { rows.set(`${value.source}:${value.eventId}`, value); return true; },
  };
  assert.equal((await handleNotification(request('kakao', '20260925-001', '가짜 카카오 문의'), deps)).status, 200);
  assert.equal((await handleNotification(request('kakao', '20260925-001', '가짜 카카오 문의'), deps)).status, 200);
  assert.equal((await handleNotification(request('daangn', '20260925-001', '가짜 당근 문의'), deps)).status, 200);
  assert.equal(rows.size, 2);
  assert.equal(rows.get('kakao:20260925-001').message, '가짜 카카오 문의');
  assert.equal(rows.get('daangn:20260925-001').source, 'daangn');
});

test('권한 없는 요청·지원하지 않는 출처·빈 본문·고유 이벤트 ID 누락은 저장하지 않는다', async () => {
  const { handleNotification } = await import('../supabase/functions/consultation-notification/core.ts');
  let saved = 0;
  const deps = { verifyToken: async value => value === token, ingest: async () => { saved++; return true; } };
  assert.equal((await handleNotification(request('kakao', 'id', '가짜 문의', 'wrong'), deps)).status, 401);
  assert.equal((await handleNotification(request('phone', 'id', '가짜 문의'), deps)).status, 400);
  assert.equal((await handleNotification(request('kakao', '', '가짜 문의'), deps)).status, 400);
  assert.equal((await handleNotification(request('kakao', 'id', '  '), deps)).status, 400);
  assert.equal((await handleNotification(request('kakao', 'id', '가'.repeat(4001)), deps)).status, 400);
  assert.equal(saved, 0);
});

test('알림 웹훅은 기존 문의함 service RPC만 사용하고 토큰·본문을 로그에 쓰지 않는다', () => {
  const edge = fs.readFileSync('supabase/functions/consultation-notification/index.ts', 'utf8');
  const config = fs.readFileSync('supabase/config.toml', 'utf8');
  assert.match(edge, /consultation_inbox_ingest_service/);
  assert.match(edge, /consultation_notification_sha256/);
  assert.match(config, /\[functions\.consultation-notification\]\s+verify_jwt = false/);
  assert.doesNotMatch(edge, /console\.log|console\.error/);
  assert.doesNotMatch(edge, /from\(['"]consultation_inbox['"]\)\.insert/);
});
