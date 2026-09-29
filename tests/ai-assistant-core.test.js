const test = require('node:test'), assert = require('node:assert/strict');

async function loadCore() {
  return import('../supabase/functions/ai-assistant-chat/core.mjs');
}

// --- 입력 검사 경계값 ---
test('validateMessages는 0개·21개·8001자·마지막이 assistant인 입력을 거절한다', async () => {
  const { validateMessages } = await loadCore();
  const u = (c) => ({ role: 'user', content: c });
  const a = (c) => ({ role: 'assistant', content: c });

  assert.equal(validateMessages([]).ok, false, '0개');
  assert.equal(validateMessages(Array.from({ length: 21 }, (_, i) => (i % 2 === 0 ? u('x') : a('y')))).ok, false, '21개');
  assert.equal(validateMessages([u('x'.repeat(8001))]).ok, false, '8001자');
  assert.equal(validateMessages([u('x'.repeat(8000))]).ok, true, '8000자는 통과');
  assert.equal(validateMessages([u('안녕'), a('안녕하세요')]).ok, false, '마지막이 assistant');
  assert.equal(validateMessages([u('안녕'), a('안녕하세요'), u('또 물어볼게요')]).ok, true, '마지막이 user면 통과');
  assert.equal(validateMessages(Array.from({ length: 20 }, () => u('x'))).ok, true, '20개는 통과');
  assert.equal(validateMessages([u(''), ]).ok, false, '빈 content');
  assert.equal(validateMessages([{ role: 'system', content: 'x' }]).ok, false, '허용 안 된 role');
  assert.equal(validateMessages(null).ok, false, 'null');
});

test('validateMessages 합계 40,000자 경계(정확히 40000은 통과, 40001은 거절)', async () => {
  const { validateMessages } = await loadCore();
  const u = (c) => ({ role: 'user', content: c });
  const a = (c) => ({ role: 'assistant', content: c });
  // 5개 메시지, 마지막 user, 총 40000자(8000*5) — 20개 이하 제약과 별개로 합계만 시험한다.
  const exact = [u('x'.repeat(8000)), a('y'.repeat(8000)), u('z'.repeat(8000)), a('w'.repeat(8000)), u('a'.repeat(8000))];
  assert.equal(validateMessages(exact).ok, true, '정확히 40000자는 통과해야 함');
  const overTotal = [u('x'.repeat(8000)), u('x'.repeat(8000)), u('x'.repeat(8000)), u('x'.repeat(8000)), u('x'.repeat(8001))];
  assert.equal(validateMessages(overTotal).ok, false, '총 40001자는 거절');
});

// --- 시스템 프롬프트 조립 ---
test('buildSystemPrompt는 지침서가 비면 기본 문구를 쓰고, 참고자료가 있으면 이어붙인다', async () => {
  const { buildSystemPrompt, DEFAULT_SYSTEM_PROMPT } = await loadCore();
  assert.equal(buildSystemPrompt('', ''), DEFAULT_SYSTEM_PROMPT);
  assert.equal(buildSystemPrompt('   ', ''), DEFAULT_SYSTEM_PROMPT);
  assert.equal(buildSystemPrompt('너는 리뷰 답글 도우미다', ''), '너는 리뷰 답글 도우미다');
  assert.equal(
    buildSystemPrompt('너는 리뷰 답글 도우미다', '병원 이름: 아산정플란트치과'),
    '너는 리뷰 답글 도우미다\n\n# 참고자료\n병원 이름: 아산정플란트치과',
  );
  assert.equal(
    buildSystemPrompt('', '자료만 있음'),
    `${DEFAULT_SYSTEM_PROMPT}\n\n# 참고자료\n자료만 있음`,
  );
});

// --- 회사별 요청 본문 ---
test('buildAnthropicRequest: opus/sonnet/fable 5 계열은 effort를 output_config로, 서버 대체를 켜고, haiku-4-5는 effort/thinking 없이 보낸다', async () => {
  const { buildAnthropicRequest } = await loadCore();

  const opus = buildAnthropicRequest({ modelId: 'claude-opus-5-5', system: 's', messages: [{ role: 'user', content: 'hi' }], maxOutputTokens: 4000, effort: 'low' });
  assert.equal(opus.useBeta, true);
  assert.deepEqual(opus.betas, ['server-side-fallback-2026-07-01']);
  assert.equal(opus.fallbacks, 'default');
  assert.deepEqual(opus.params.output_config, { effort: 'low' });
  assert.equal('thinking' in opus.params, false, 'thinking 필드를 보내면 안 됨');
  assert.equal(opus.params.max_tokens, 4000);
  assert.equal(opus.params.system, 's');

  const sonnet = buildAnthropicRequest({ modelId: 'claude-sonnet-5-5', system: 's', messages: [{ role: 'user', content: 'hi' }], maxOutputTokens: 4000, effort: null });
  assert.equal(sonnet.useBeta, true);
  assert.equal('output_config' in sonnet.params, false, 'effort가 없으면 output_config도 없어야 함');

  const fable = buildAnthropicRequest({ modelId: 'claude-fable-5-1', system: 's', messages: [{ role: 'user', content: 'hi' }], maxOutputTokens: 4000, effort: 'high' });
  assert.equal(fable.useBeta, true);
  assert.deepEqual(fable.params.output_config, { effort: 'high' });

  const haiku = buildAnthropicRequest({ modelId: 'claude-haiku-4-5', system: 's', messages: [{ role: 'user', content: 'hi' }], maxOutputTokens: 2000, effort: 'high' });
  assert.equal(haiku.useBeta, false, 'haiku는 서버 대체를 켜지 않음');
  assert.equal('output_config' in haiku.params, false, 'haiku는 effort를 무시해야 함');
  assert.equal('thinking' in haiku.params, false);
});

test('buildOpenAICompatRequest: openai는 max_completion_tokens, 나머지는 max_tokens, temperature 없음', async () => {
  const { buildOpenAICompatRequest } = await loadCore();
  const msgs = [{ role: 'user', content: '안녕' }];

  const openai = buildOpenAICompatRequest({ provider: 'openai', modelId: 'gpt-6-sol', system: '시스템', messages: msgs, maxOutputTokens: 3000 });
  assert.equal(openai.max_completion_tokens, 3000);
  assert.equal('max_tokens' in openai, false);
  assert.equal('temperature' in openai, false);
  assert.deepEqual(openai.messages[0], { role: 'system', content: '시스템' });
  assert.deepEqual(openai.messages[1], { role: 'user', content: '안녕' });

  for (const provider of ['deepseek', 'stepfun', 'moonshot', 'google']) {
    const body = buildOpenAICompatRequest({ provider, modelId: 'x', system: 's', messages: msgs, maxOutputTokens: 1234 });
    assert.equal(body.max_tokens, 1234, provider);
    assert.equal('max_completion_tokens' in body, false, provider);
  }
});

// --- 응답 풀기 ---
test('parseAnthropicResponse는 thinking 블록을 무시하고 text만 이어 붙이며 토큰·거절을 뽑는다', async () => {
  const { parseAnthropicResponse } = await loadCore();
  const r1 = parseAnthropicResponse({
    content: [{ type: 'thinking', thinking: '속으로 생각' }, { type: 'text', text: '답변 앞부분' }, { type: 'text', text: ' 답변 뒷부분' }],
    stop_reason: 'end_turn',
    usage: { input_tokens: 10, output_tokens: 20 },
  });
  assert.equal(r1.text, '답변 앞부분 답변 뒷부분');
  assert.equal(r1.input_tokens, 10);
  assert.equal(r1.output_tokens, 20);
  assert.equal(r1.refusal, false);

  const r2 = parseAnthropicResponse({ content: [{ type: 'thinking', thinking: 'x' }], stop_reason: 'refusal', usage: { input_tokens: 5, output_tokens: 0 } });
  assert.equal(r2.text, '');
  assert.equal(r2.refusal, true);
});

test('parseOpenAICompatResponse는 choices[0].message.content와 토큰을 뽑고 reasoning_content는 무시한다', async () => {
  const { parseOpenAICompatResponse } = await loadCore();
  const r = parseOpenAICompatResponse({
    choices: [{ message: { content: '답변', reasoning_content: '속으로 생각' } }],
    usage: { prompt_tokens: 7, completion_tokens: 9 },
  });
  assert.equal(r.text, '답변');
  assert.equal(r.input_tokens, 7);
  assert.equal(r.output_tokens, 9);
});

// --- 예비 모델로 넘길지 판단 ---
test('shouldFallback: 429·5xx·timeout·refusal·빈 답·400은 넘기고, 401·403·model_not_set은 안 넘긴다', async () => {
  const { shouldFallback, reasonFromHttpStatus } = await loadCore();
  for (const reason of ['timeout', 'network_error', 'provider_not_configured', 'refusal', 'empty_response', 'rate_limited', 'server_error', 'bad_request']) {
    assert.equal(shouldFallback(reason), true, reason);
  }
  for (const reason of ['unauthorized', 'forbidden', 'model_not_set']) {
    assert.equal(shouldFallback(reason), false, reason);
  }
  assert.equal(reasonFromHttpStatus(429), 'rate_limited');
  assert.equal(reasonFromHttpStatus(500), 'server_error');
  assert.equal(reasonFromHttpStatus(503), 'server_error');
  assert.equal(reasonFromHttpStatus(400), 'bad_request');
  assert.equal(reasonFromHttpStatus(401), 'unauthorized');
  assert.equal(reasonFromHttpStatus(403), 'forbidden');
  assert.equal(reasonFromHttpStatus(200), null);
});

// --- 금액 계산 ---
test('estimateCostUsd는 가격이 null이면 null, 아니면 100만 토큰당 단가로 계산한다', async () => {
  const { estimateCostUsd } = await loadCore();
  assert.equal(estimateCostUsd({ inputTokens: 1000, outputTokens: 500, priceInUsdPerMtok: null, priceOutUsdPerMtok: 5 }), null);
  assert.equal(estimateCostUsd({ inputTokens: 1000, outputTokens: 500, priceInUsdPerMtok: 4, priceOutUsdPerMtok: null }), null);
  const cost = estimateCostUsd({ inputTokens: 1_000_000, outputTokens: 1_000_000, priceInUsdPerMtok: 4, priceOutUsdPerMtok: 20 });
  assert.equal(cost, 24);
  const zero = estimateCostUsd({ inputTokens: 0, outputTokens: 0, priceInUsdPerMtok: 4, priceOutUsdPerMtok: 20 });
  assert.equal(zero, 0);
});

// --- 오류 분류 ---
test('errorMessageFor·httpStatusForError는 정해진 오류 종류마다 쉬운 한국어와 HTTP 코드를 돌려준다', async () => {
  const { errorMessageFor, httpStatusForError } = await loadCore();
  assert.equal(errorMessageFor('model_not_set'), '원장이 아직 이 도우미의 AI를 고르지 않았어요.');
  assert.equal(httpStatusForError('model_not_set'), 409);
  assert.equal(httpStatusForError('unauthenticated'), 401);
  assert.equal(httpStatusForError('hub_access_denied'), 403);
  assert.equal(httpStatusForError('rate_limited'), 429);
  assert.equal(httpStatusForError('알수없는거'), 500, '모르는 종류는 500');
  assert.equal(errorMessageFor('알수없는거'), errorMessageFor('unknown'));
});
