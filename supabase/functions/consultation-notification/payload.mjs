export const MAX_BODY_BYTES = 16_384;
const SOURCES = new Set(['kakao', 'daangn', 'homepage']);
const EVENT_ID = /^[A-Za-z0-9._:-]{1,160}$/;
const PHONE = /^0\d{9,10}$/;
const CATEGORIES = new Set(['임플란트', '치아교정', '턱관절치료', '일반치료']);
const HOMEPAGE_MAX_BODY_BYTES = 2048;

export function notificationPayload(source, eventId, raw) {
  if (!SOURCES.has(source) || !EVENT_ID.test(eventId || '') || typeof raw !== 'string') return null;
  if (new TextEncoder().encode(raw).length > MAX_BODY_BYTES) return null;
  if (source === 'homepage') return homepagePayload(eventId, raw);
  const message = raw.replaceAll('\0', '').trim().toWellFormed();
  if (!message || message.length > 4000) return null;
  return { source, eventId, message };
}

function homepagePayload(eventId, raw) {
  if (new TextEncoder().encode(raw).length > HOMEPAGE_MAX_BODY_BYTES) return null;
  let data;
  try { data = JSON.parse(raw); } catch { return null; }
  if (!data || typeof data !== 'object' || Array.isArray(data)) return null;
  const name = String(data.name ?? '').trim();
  const phone = String(data.phone ?? '').replace(/\D/g, '');
  const category = String(data.category ?? '').trim();
  const receivedMs = Date.parse(String(data.received_at ?? ''));
  if (!name || name.length > 20 || !PHONE.test(phone) || Number.isNaN(receivedMs)) return null;
  const subject = CATEGORIES.has(category) ? category : '기타';
  return {
    source: 'homepage', eventId, message: `홈페이지 상담신청 · 분야: ${subject}`,
    senderName: name, contact: phone, subject, receivedAt: new Date(receivedMs).toISOString(),
  };
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
