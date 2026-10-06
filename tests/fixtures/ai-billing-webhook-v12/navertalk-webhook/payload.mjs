// 순수 helper: Naver TalkTalk(네이버 톡톡) 웹훅 페이로드 검증·추출. Deno(index.ts)와 Node 시험 양쪽에서 그대로 import한다.
// 공식 스펙(https://github.com/navertalk/chatbot-api)에는 이벤트 고유 ID·타임스탬프·서명이 없다 — event/user/
// textContent 등 문서화된 필드만 읽는다.
export const MAX_BODY_BYTES = 65_536;
const MAX_MESSAGE_LEN = 4000; // consultation_inbox.message CHECK와 동일
const MAX_CONTACT_LEN = 40; // consultation_inbox.contact CHECK와 동일
const HEX = /^[0-9a-f]+$/;
const NUL = String.fromCharCode(0);

const plain = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
// Postgres text는 NUL을 담지 못하고, 4000자 경계에서 자르면 서로게이트 절반이 남을 수 있어 toWellFormed로 정리한다
// (ai-usage-sync/payload.mjs의 text() 방어와 같은 방식).
const clip = (s, max) => s.split(NUL).join('').slice(0, max).toWellFormed();

export async function sha256Hex(text) {
  const bytes = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

export function sameHex(a, b) {
  a = String(a || '').toLowerCase();
  b = String(b || '').toLowerCase();
  if (!a || a.length !== b.length || !HEX.test(a) || !HEX.test(b)) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

// 이벤트 기본 구조({event, user, options, ...})만 확인한다. event가 없거나 JSON이 아니면 거절(400).
export function parseNaverEvent(raw) {
  let body;
  try {
    body = JSON.parse(raw);
  } catch {
    return { ok: false };
  }
  if (!plain(body) || typeof body.event !== 'string' || body.event.trim() === '') return { ok: false };
  return { ok: true, value: body };
}

// send 이벤트에서 저장할 발신자 식별값(옵신크 user id)과 본문만 뽑는다.
// imageContent/compositeContent는 원문(이미지 URL 등 부가 데이터)을 저장하지 않고 자리표시자만 남긴다.
// 저장할 것이 없으면(사용자 식별값 없음, 빈 텍스트, 인식 못한 콘텐츠 타입) null을 돌려주고 호출부가 200 no-op 처리한다.
export function classifySendEvent(event) {
  if (typeof event.user !== 'string') return null;
  const contact = clip(event.user.trim(), MAX_CONTACT_LEN);
  if (contact === '') return null;

  let text = null;
  if (plain(event.textContent) && typeof event.textContent.text === 'string' && event.textContent.text.trim() !== '') {
    text = event.textContent.text.trim();
  } else if (plain(event.imageContent)) {
    text = '[이미지 메시지]';
  } else if (plain(event.compositeContent)) {
    text = '[복합 메시지]';
  }
  if (text === null) return null;

  const message = clip(text, MAX_MESSAGE_LEN);
  if (message === '') return null;
  return { contact, message };
}
