const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const endpoint = 'https://example.invalid/consultation-notification';
const token = 't'.repeat(40);
const homepageToken = 'h'.repeat(40);
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
  const inboxSql = fs.readFileSync('db/consultation_inbox.sql', 'utf8');
  assert.match(edge, /consultation_inbox_ingest_service/);
  assert.match(edge, /consultation_notification_sha256/);
  assert.match(inboxSql, /consultation_inbox_ingest_service\(p_source text,p_event_id text,p_received_at timestamptz,p_sender_name text,p_contact text,p_subject text,p_message text\)/);
  assert.match(inboxSql, /p_source not in\('daangn','kakao','naver_email','homepage','phone','other'\)/);
  assert.match(config, /\[functions\.consultation-notification\]\s+verify_jwt = false/);
  assert.doesNotMatch(edge, /console\.log|console\.error/);
  assert.doesNotMatch(edge, /from\(['"]consultation_inbox['"]\)\.insert/);
});

test('홈페이지 상담은 전용 payload를 파싱하고 문의함 RPC 칸과 중복 ID를 보존한다', async () => {
  const { handleNotification } = await import('../supabase/functions/consultation-notification/core.ts');
  const rows = new Map();
  const deps = {
    verifyToken: async value => value === token || value === homepageToken,
    ingest: async value => { rows.set(`${value.source}:${value.eventId}`, value); return true; },
  };
  const body = JSON.stringify({ name: '가짜 신청자', phone: '01012345678', category: '임플란트', received_at: '2026-09-26T10:12:33+09:00' });
  assert.equal((await handleNotification(request('homepage', 'online-123', body, homepageToken), deps)).status, 200);
  assert.equal((await handleNotification(request('homepage', 'online-123', body, homepageToken), deps)).status, 200);
  assert.equal(rows.size, 1);
  assert.deepEqual(rows.get('homepage:online-123'), {
    source: 'homepage', eventId: 'online-123', message: '홈페이지 상담신청 · 분야: 임플란트',
    senderName: '가짜 신청자', contact: '01012345678', subject: '임플란트', receivedAt: '2026-09-26T01:12:33.000Z',
  });
});

test('홈페이지 연동은 토큰 출처를 교차 허용하지 않고 malformed 입력을 저장하지 않는다', async () => {
  const { handleNotification } = await import('../supabase/functions/consultation-notification/core.ts');
  const rows = [];
  const deps = {
    verifyToken: async (value, source) => value === (source === 'homepage' ? homepageToken : token),
    ingest: async value => { rows.push(value); return true; },
  };
  const ok = { name: '가짜 신청자', phone: '01012345678', category: '임플란트', received_at: '2026-09-26T10:00:00+09:00' };
  const oversized = JSON.stringify({ ...ok, extra: 'x'.repeat(2048) });
  assert.equal((await handleNotification(request('homepage', 'online-1', JSON.stringify(ok)), deps)).status, 401);
  assert.equal((await handleNotification(request('kakao', 'id-1', '가짜 문의', homepageToken), deps)).status, 401);
  assert.equal((await handleNotification(request('homepage', 'online-1', JSON.stringify({ ...ok, phone: '123' }), homepageToken), deps)).status, 400);
  assert.equal((await handleNotification(request('homepage', 'online-1', '이름: 가짜', homepageToken), deps)).status, 400);
  assert.equal((await handleNotification(request('homepage', 'wr 1', JSON.stringify(ok), homepageToken), deps)).status, 400);
  assert.equal((await handleNotification(request('homepage', 'online-3', oversized, homepageToken), deps)).status, 400);
  assert.equal((await handleNotification(request('homepage', 'online-2', JSON.stringify({ ...ok, category: '기타분야' }), homepageToken), deps)).status, 200);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].subject, '기타');
});

test('홈페이지 훅 PHP 예시는 비밀값 없이 wr_id 기반 이벤트 ID를 사용한다', () => {
  const php = fs.readFileSync('docs/homepage-online-hook.example.php', 'utf8');
  assert.match(php, /consultation-notification\?source=homepage/);
  assert.match(php, /X-Event-Id: online-'\s*\.\s*\$wr_id/);
  assert.match(php, /CURLOPT_TIMEOUT/);
  assert.doesNotMatch(php, /[0-9a-f]{40,}/i);
});
