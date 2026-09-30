// ai-assistant-chat/core.js — 순수 ESM. Deno API·네트워크·환경변수를 쓰지 않는다(Node 시험에서도 그대로 import 됨).
// 설계서 3장: 입력 검사 · 시스템 프롬프트 만들기 · 회사별 요청 본문 만들기 · 응답 풀기 · 예비 모델 판단 · 금액 계산 · 오류 분류.

export const DEFAULT_SYSTEM_PROMPT = '당신은 아산정플란트치과 직원을 돕는 도우미입니다. 한국어로 간결하게 답합니다.';

export const MAX_MESSAGES = 20;
export const MAX_CONTENT_CHARS = 8000;
export const MAX_TOTAL_CHARS = 40000;

// claude-opus-5*·claude-sonnet-5*·claude-fable-5* 계열: thinking을 끄는 설정을 보내지 않고,
// effort가 있으면 output_config로 보내며, 거절 시 서버 쪽 대체(fallback)를 기본으로 켠다.
const ANTHROPIC_EFFORT_FAMILY = /^claude-(opus|sonnet|fable)-5/;
const ANTHROPIC_SERVER_FALLBACK_BETA = 'server-side-fallback-2026-07-01';

// -------------------------------------------------------------------------------------
// 입력 검사
// -------------------------------------------------------------------------------------
/**
 * @param {Array<{role:string, content:string}>} messages
 * @returns {{ok:true, messages:Array}|{ok:false, error_kind:string, message:string}}
 */
export function validateMessages(messages) {
  if (!Array.isArray(messages) || messages.length < 1 || messages.length > MAX_MESSAGES) {
    return { ok: false, error_kind: 'invalid_input', message: '메시지는 1~20개여야 해요.' };
  }
  let total = 0;
  for (const m of messages) {
    if (!m || typeof m !== 'object' || (m.role !== 'user' && m.role !== 'assistant')) {
      return { ok: false, error_kind: 'invalid_input', message: '메시지 역할은 user 또는 assistant여야 해요.' };
    }
    const parts = Array.isArray(m.content) ? m.content : null;
    const textLength = parts
      ? parts.reduce((n, p) => n + (p?.type === 'text' && typeof p.text === 'string' ? p.text.length : 0), 0)
      : typeof m.content === 'string' ? m.content.length : -1;
    const images = parts ? parts.filter((p) => p?.type === 'image_url' || p?.type === 'image') : [];
    const invalidPart = parts && parts.some((p) => {
      if (p?.type === 'text') return typeof p.text !== 'string';
      if (p?.type !== 'image_url' && p?.type !== 'image') return true;
      const url = p.image_url?.url;
      const mediaType = p.source?.media_type || String(url || '').match(/^data:(image\/(?:jpeg|png|webp));base64,/)?.[1];
      const data = p.source?.data || (typeof url === 'string' ? url.split(',')[1] : '');
      return !['image/jpeg', 'image/png', 'image/webp'].includes(mediaType) || !data || data.length > 2_100_000;
    });
    if ((textLength < 1 && images.length === 0) || textLength > MAX_CONTENT_CHARS || images.length > 4 || invalidPart) {
      return { ok: false, error_kind: 'invalid_input', message: '메시지 한 개는 1~8,000자여야 해요.' };
    }
    total += textLength;
  }
  if (total > MAX_TOTAL_CHARS) {
    return { ok: false, error_kind: 'invalid_input', message: '메시지 전체 길이가 40,000자를 넘었어요.' };
  }
  if (messages[messages.length - 1].role !== 'user') {
    return { ok: false, error_kind: 'invalid_input', message: '마지막 메시지는 직원이 보낸 것이어야 해요.' };
  }
  return { ok: true, messages };
}

// -------------------------------------------------------------------------------------
// 시스템 프롬프트
// -------------------------------------------------------------------------------------
export function buildSystemPrompt(instructions, knowledge) {
  const base = (instructions && instructions.trim()) ? instructions : DEFAULT_SYSTEM_PROMPT;
  if (knowledge && knowledge.trim()) {
    return `${base}\n\n# 참고자료\n${knowledge}`;
  }
  return base;
}

// -------------------------------------------------------------------------------------
// 회사별 요청 본문
// -------------------------------------------------------------------------------------
function anthropicModelClass(modelId) {
  if (modelId === 'claude-haiku-4-5') return 'haiku';
  if (ANTHROPIC_EFFORT_FAMILY.test(modelId)) return 'effort_family';
  return 'legacy'; // 시드에 없는 구형 모델 — effort/서버 대체 없이 최소 요청만 보낸다.
}

/**
 * Claude(anthropic) 요청 본문. SDK(client.messages.create / client.beta.messages.create)에 그대로 넘길 파라미터.
 * @returns {{useBeta:boolean, betas?:string[], fallbacks?:string, params:object}}
 */
export function buildAnthropicRequest({ modelId, system, messages, maxOutputTokens, effort }) {
  const cls = anthropicModelClass(modelId);
  const params = {
    model: modelId,
    max_tokens: maxOutputTokens,
    system,
    messages: messages.map((m) => ({ role: m.role, content: Array.isArray(m.content) ? m.content.map((part) => part.type === 'text' ? { type: 'text', text: part.text } : { type: 'image', source: { type: 'base64', media_type: part.source?.media_type || String(part.image_url?.url || '').match(/^data:(image\/(?:jpeg|png|webp));/)?.[1] || 'image/jpeg', data: part.source?.data || String(part.image_url?.url || '').split(',')[1] } }) : m.content })),
  };
  if (cls === 'effort_family') {
    if (effort) params.output_config = { effort };
    return { useBeta: true, betas: [ANTHROPIC_SERVER_FALLBACK_BETA], fallbacks: 'default', params };
  }
  // haiku·legacy: effort/thinking을 보내지 않는다.
  return { useBeta: false, params };
}

const OPENAI_COMPAT_MAX_TOKENS_FIELD = { openai: 'max_completion_tokens' };

/**
 * OpenAI 호환 5곳(openai·deepseek·stepfun·moonshot·google) 요청 본문.
 * @returns {object} fetch body(JSON.stringify 대상)
 */
export function buildOpenAICompatRequest({ provider, modelId, system, messages, maxOutputTokens, webSearch = false }) {
  const tokensField = OPENAI_COMPAT_MAX_TOKENS_FIELD[provider] || 'max_tokens';
  const body = {
    model: modelId,
    messages: [{ role: 'system', content: system }, ...messages.map((m) => ({ role: m.role, content: m.content }))],
  };
  body[tokensField] = maxOutputTokens;
  if (webSearch && provider === 'openai') body.tools = [{ type: 'web_search' }];
  return body;
}

// -------------------------------------------------------------------------------------
// 응답 풀기
// -------------------------------------------------------------------------------------
/**
 * Claude 응답에서 text 블록만 이어 붙이고(thinking 블록 무시) 토큰·거절 여부를 뽑는다.
 */
export function parseAnthropicResponse(response) {
  const content = Array.isArray(response?.content) ? response.content : [];
  const text = content.filter((b) => b && b.type === 'text').map((b) => b.text || '').join('');
  const usage = response?.usage || {};
  return {
    text,
    input_tokens: Number(usage.input_tokens) || 0,
    output_tokens: Number(usage.output_tokens) || 0,
    refusal: response?.stop_reason === 'refusal',
  };
}

/**
 * OpenAI 호환 응답에서 텍스트·토큰을 뽑는다(딥시크 reasoning_content는 무시).
 */
export function parseOpenAICompatResponse(json) {
  const text = json?.choices?.[0]?.message?.content || '';
  const usage = json?.usage || {};
  return {
    text,
    input_tokens: Number(usage.prompt_tokens) || 0,
    output_tokens: Number(usage.completion_tokens) || 0,
  };
}

// -------------------------------------------------------------------------------------
// 예비 모델로 넘길지 판단
// -------------------------------------------------------------------------------------
const FALLBACK_REASONS = new Set([
  'timeout',
  'network_error',
  'provider_not_configured',
  'refusal',
  'empty_response',
  'rate_limited', // 429
  'server_error', // 5xx
  'bad_request', // 400 — 회사마다 받는 칸이 달라 넘긴다
]);
const NO_FALLBACK_REASONS = new Set(['unauthorized', 'forbidden', 'model_not_set']);

/**
 * @param {string} reason FALLBACK_REASONS/NO_FALLBACK_REASONS 중 하나
 */
export function shouldFallback(reason) {
  if (FALLBACK_REASONS.has(reason)) return true;
  if (NO_FALLBACK_REASONS.has(reason)) return false;
  return false; // 모르는 이유는 안전하게 넘기지 않는다
}

/** HTTP 상태 코드 -> 넘길지 판단용 reason 문자열 */
export function reasonFromHttpStatus(status) {
  if (status === 401) return 'unauthorized';
  if (status === 403) return 'forbidden';
  if (status === 429) return 'rate_limited';
  if (status === 400) return 'bad_request';
  if (status >= 500 && status < 600) return 'server_error';
  return null;
}

// -------------------------------------------------------------------------------------
// 금액 계산
// -------------------------------------------------------------------------------------
export function estimateCostUsd({ inputTokens, outputTokens, priceInUsdPerMtok, priceOutUsdPerMtok }) {
  if (priceInUsdPerMtok == null || priceOutUsdPerMtok == null) return null;
  return (Number(inputTokens) || 0) * (priceInUsdPerMtok / 1e6) + (Number(outputTokens) || 0) * (priceOutUsdPerMtok / 1e6);
}

// -------------------------------------------------------------------------------------
// 오류 분류 — 쉬운 한국어 메시지
// -------------------------------------------------------------------------------------
export const ERROR_MESSAGES_KO = {
  unauthenticated: '로그인이 필요해요.',
  hub_access_denied: '허브 접근 권한이 없어요.',
  assistant_not_found: '도우미를 찾을 수 없어요.',
  assistant_disabled: '지금은 쓸 수 없는 도우미예요.',
  forbidden_role: '이 도우미는 내 역할에서 쓸 수 없어요.',
  model_not_set: '원장이 아직 이 도우미의 AI를 고르지 않았어요.',
  model_disabled: '이 도우미가 쓰는 AI가 꺼져 있어요.',
  invalid_input: '메시지 형식이 올바르지 않아요.',
  image_not_supported: '이 AI는 사진을 읽지 못해요. 사진을 읽을 수 있는 모델을 지정해 주세요.',
  rate_limited: '너무 자주 요청했어요. 잠깐 쉬었다가 다시 시도해 주세요.',
  provider_not_configured: '이 AI 회사 연결이 아직 준비되지 않았어요.',
  provider_auth_failed: '이 AI 회사가 연결 키를 받아 주지 않아요. 원장에게 알려 주세요.',
  usage_unavailable: '사용 기록을 확인할 수 없어 지금은 쓸 수 없어요. 잠시 후 다시 시도해 주세요.',
  upstream_error: 'AI 응답을 받지 못했어요. 잠시 후 다시 시도해 주세요.',
  timeout: '응답이 너무 오래 걸려요. 잠시 후 다시 시도해 주세요.',
  unknown: '알 수 없는 오류가 발생했어요.',
};

export function errorMessageFor(errorKind) {
  return ERROR_MESSAGES_KO[errorKind] || ERROR_MESSAGES_KO.unknown;
}

/** HTTP 상태 코드(index.ts가 응답에 쓸 코드) */
export const HTTP_STATUS_FOR_ERROR = {
  unauthenticated: 401,
  hub_access_denied: 403,
  assistant_not_found: 404,
  assistant_disabled: 403,
  forbidden_role: 403,
  model_not_set: 409,
  model_disabled: 409,
  invalid_input: 400,
  rate_limited: 429,
  provider_not_configured: 502,
  image_not_supported: 400,
  provider_auth_failed: 502,
  usage_unavailable: 503,
  upstream_error: 502,
  timeout: 504,
  unknown: 500,
};

export function httpStatusForError(errorKind) {
  return HTTP_STATUS_FOR_ERROR[errorKind] || 500;
}

/**
 * 회사 호출 실패 이유(providers.ts의 reason)를 화면에 내보낼 error_kind로 바꾼다.
 * 회사가 401·403을 주면 「로그인 만료」로 오해되지 않게 provider_auth_failed로, 그 밖의 모르는 이유는 upstream_error로 정리한다.
 * (사용 기록 테이블에는 원래 reason을 그대로 남긴다.)
 */
export function publicErrorKind(reason) {
  if (reason === 'unauthorized' || reason === 'forbidden') return 'provider_auth_failed';
  if (reason === 'timeout' || reason === 'rate_limited' || reason === 'provider_not_configured' || reason === 'model_not_set') return reason;
  if (Object.prototype.hasOwnProperty.call(ERROR_MESSAGES_KO, reason)) return reason;
  return 'upstream_error'; // bad_request · server_error · network_error · refusal · empty_response 등
}
