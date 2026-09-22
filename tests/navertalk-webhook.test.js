const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

test('payload.mjs는 네이버 이벤트 기본 구조만 확인하고 JSON이 아니거나 event가 없으면 거절한다', async () => {
  const { parseNaverEvent } = await import('../supabase/functions/navertalk-webhook/payload.mjs');
  assert.equal(parseNaverEvent('not json').ok, false);
  assert.equal(parseNaverEvent('[]').ok, false);
  assert.equal(parseNaverEvent('{}').ok, false);
  assert.equal(parseNaverEvent('{"event":""}').ok, false);
  assert.equal(parseNaverEvent('{"event":123}').ok, false);
  const ok = parseNaverEvent('{"event":"send","user":"u1"}');
  assert.equal(ok.ok, true);
  assert.equal(ok.value.event, 'send');
});

test('classifySendEvent는 텍스트를 그대로, 이미지·복합 메시지는 자리표시자로, 저장할 것이 없으면 null을 돌려준다', async () => {
  const { classifySendEvent } = await import('../supabase/functions/navertalk-webhook/payload.mjs');
  assert.deepEqual(
    classifySendEvent({ event: 'send', user: 'al-2eGuGr5WQOnco1_V-FQ', textContent: { text: 'hello world', inputType: 'typing' } }),
    { contact: 'al-2eGuGr5WQOnco1_V-FQ', message: 'hello world' },
  );
  assert.deepEqual(
    classifySendEvent({ event: 'send', user: 'u1', imageContent: { imageUrl: 'http://example.com/a.jpg' } }),
    { contact: 'u1', message: '[이미지 메시지]' },
  );
  assert.deepEqual(
    classifySendEvent({ event: 'send', user: 'u1', compositeContent: { composite: [] } }),
    { contact: 'u1', message: '[복합 메시지]' },
  );
  assert.equal(classifySendEvent({ event: 'send', textContent: { text: 'hi' } }), null, '사용자 식별값 없음');
  assert.equal(classifySendEvent({ event: 'send', user: '   ' }), null, '공백뿐인 사용자 식별값');
  assert.equal(classifySendEvent({ event: 'send', user: 'u1' }), null, '인식 가능한 콘텐츠 없음');
  assert.equal(classifySendEvent({ event: 'send', user: 'u1', textContent: { text: '   ' } }), null, '공백뿐인 텍스트');
  assert.equal(classifySendEvent({ event: 'send', user: 'u1', textContent: { text: 42 } }), null, '텍스트가 문자열이 아님');
});

test('classifySendEvent는 contact를 40자, message를 4000자로 잘라 문의함 CHECK 제약과 맞춘다', async () => {
  const { classifySendEvent } = await import('../supabase/functions/navertalk-webhook/payload.mjs');
  const longUser = 'u'.repeat(80);
  const longText = '가'.repeat(5000);
  const out = classifySendEvent({ event: 'send', user: longUser, textContent: { text: longText } });
  assert.equal(out.contact.length, 40);
  assert.equal(out.message.length, 4000);
});

test('classifySendEvent는 이미지/복합 메시지에서 URL 등 부가 데이터를 저장하지 않는다', async () => {
  const { classifySendEvent } = await import('../supabase/functions/navertalk-webhook/payload.mjs');
  const out = classifySendEvent({ event: 'send', user: 'u1', imageContent: { imageUrl: 'http://blogfiles5.naver.net/secret/path.jpg' } });
  assert.ok(!out.message.includes('naver.net'), '이미지 URL이 message에 남으면 안 됩니다.');
  assert.ok(!JSON.stringify(out).includes('naver.net'));
});

test('sha256Hex·sameHex는 ai-usage-sync와 같은 방식의 토큰 해시·상수시간 비교를 제공한다', async () => {
  const { sha256Hex, sameHex } = await import('../supabase/functions/navertalk-webhook/payload.mjs');
  const digest = await sha256Hex('hello');
  assert.match(digest, /^[0-9a-f]{64}$/);
  assert.equal(await sha256Hex('hello'), digest, '같은 입력은 같은 해시');
  assert.notEqual(await sha256Hex('hello2'), digest, '다른 입력은 다른 해시');
  assert.equal(sameHex(digest, digest.toUpperCase()), true);
  assert.equal(sameHex(digest, 'a'.repeat(64)), digest === 'a'.repeat(64));
  assert.equal(sameHex('', ''), false);
  assert.equal(sameHex('zz', 'zz'), false, '16진수가 아니면 거절');
});

test('네이버 실제 이벤트 예시(open/send/echo)를 그대로 파싱할 수 있다', async () => {
  const { parseNaverEvent, classifySendEvent } = await import('../supabase/functions/navertalk-webhook/payload.mjs');
  const openEvent = JSON.stringify({
    event: 'open',
    user: 'al-2eGuGr5WQOnco1_V-FQ',
    options: { inflow: 'list', referer: 'https://talk.naver.com/', friend: false, under14: false, under19: false },
  });
  const parsedOpen = parseNaverEvent(openEvent);
  assert.equal(parsedOpen.ok, true);
  assert.equal(parsedOpen.value.event, 'open');

  const sendEvent = JSON.stringify({ event: 'send', user: 'al-2eGuGr5WQOnco1_V-FQ', textContent: { text: 'hello world', inputType: 'typing' } });
  const parsedSend = parseNaverEvent(sendEvent);
  assert.deepEqual(classifySendEvent(parsedSend.value), { contact: 'al-2eGuGr5WQOnco1_V-FQ', message: 'hello world' });

  const echoEvent = JSON.stringify({
    event: 'echo',
    echoedEvent: 'send',
    user: '5KcCQTARWKNKv1IOvXwYQw',
    partner: 'wc8b1i',
    textContent: { text: '명함을 보냈습니다.', inputType: 'nameCard' },
    options: { mobile: false },
  });
  const parsedEcho = parseNaverEvent(echoEvent);
  assert.equal(parsedEcho.ok, true);
  assert.equal(parsedEcho.value.event, 'echo');
});

test('Edge Function은 verify_jwt=false로 배포되고 토큰을 webhook_secrets 해시와 상수시간 비교하며 RPC로만 쓴다', () => {
  const edge = read('supabase/functions/navertalk-webhook/index.ts');
  const core = read('supabase/functions/navertalk-webhook/core.ts');
  const config = read('supabase/config.toml');
  assert.match(config, /\[functions\.navertalk-webhook\]\s+verify_jwt\s*=\s*false/i);
  assert.match(edge, /\.from\("webhook_secrets"\)/);
  assert.match(edge, /\.select\("value"\)/);
  assert.match(edge, /\.eq\("name",\s*"navertalk_webhook_sha256"\)/);
  assert.match(edge, /sameHex\(await sha256Hex\(token\),\s*String\(data\.value\)\)/);
  assert.match(edge, /\.rpc\("consultation_inbox_ingest_service",/);
  assert.match(edge, /p_source:\s*"naver_talktalk"/);
  assert.doesNotMatch(edge, /\.(insert|upsert|update|delete)\(/);
  assert.doesNotMatch(edge + core, /console\.(log|info|warn|error)\(/);
  assert.match(core, /req\.method !== "POST"/);
  assert.match(core, /MAX_BODY_BYTES/);
});

test('echo 이벤트는 코드에서 명시적으로 저장 대상에서 제외된다(문의함이 발신 메시지 칸이 없음)', () => {
  const core = read('supabase/functions/navertalk-webhook/core.ts');
  assert.match(core, /\.event !== "send"/);
  assert.match(core, /echo/);
});

test('네이버 톡톡 source 확장 SQL은 consultation_inbox 표·RLS·상담일지 전환을 건드리지 않고 허용목록만 넓힌다', () => {
  const sql = read('db/consultation_inbox_navertalk_source_draft.sql');
  const rollback = read('db/consultation_inbox_navertalk_source_rollback.sql');
  assert.match(sql, /naver_talktalk/);
  assert.match(sql, /consultation_inbox_source_check/);
  assert.match(sql, /consultation_inbox_ingest_service/);
  assert.doesNotMatch(sql, /create table|drop table|create policy|drop policy|alter policy/i);
  assert.doesNotMatch(sql, /consultation_inbox_convert_to_journal/);
  for (const source of ['daangn', 'kakao', 'naver_email', 'homepage', 'phone', 'manual', 'other']) {
    assert.match(sql, new RegExp(source), `기존 source ${source}가 남아 있어야 합니다.`);
  }
  assert.match(sql, /preserve state and stop/);
  assert.match(sql, /begin;/);
  assert.match(sql, /commit;/);

  assert.match(rollback, /naver_talktalk/);
  assert.match(rollback, /consultation_inbox has naver_talktalk rows; rollback stopped to preserve records/);
  assert.doesNotMatch(rollback, /drop table/i);
});

test('SQL의 service-role 허용목록과 Edge가 실제로 보내는 p_source 값이 일치한다', () => {
  const sql = read('db/consultation_inbox_navertalk_source_draft.sql');
  const edge = read('supabase/functions/navertalk-webhook/index.ts');
  const allowList = sql.match(/p_source not in\(([^)]+)\)/);
  assert.ok(allowList, 'ingest 함수의 허용목록을 찾을 수 없습니다.');
  assert.match(allowList[1], /'naver_talktalk'/);
  assert.match(edge, /p_source:\s*"naver_talktalk"/);
});
