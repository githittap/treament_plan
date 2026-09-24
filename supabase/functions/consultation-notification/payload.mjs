export const MAX_BODY_BYTES = 16_384;
const SOURCES = new Set(['kakao', 'daangn']);
const EVENT_ID = /^[A-Za-z0-9._:-]{1,160}$/;

export function notificationPayload(source, eventId, raw) {
  if (!SOURCES.has(source) || !EVENT_ID.test(eventId || '') || typeof raw !== 'string') return null;
  if (new TextEncoder().encode(raw).length > MAX_BODY_BYTES) return null;
  const message = raw.replaceAll('\0', '').trim().toWellFormed();
  if (!message || message.length > 4000) return null;
  return { source, eventId, message };
}

export async function sha256Hex(value) {
  const bytes = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)));
  return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
}

export function sameHex(a, b) {
  a = String(a || '').toLowerCase(); b = String(b || '').toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(a) || !/^[0-9a-f]{64}$/.test(b)) return false;
  let diff = 0;
  for (let i = 0; i < 64; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
