/**
 * @typedef {{status:'recorded',eventKind:'purchase',transactionAt:string,currency:string,amount:number,amountKrw:number|null,merchant:string,merchantKey:string}} MarketingRecorded
 * @typedef {{status:'cancellation',transactionAt:string,currency:'KRW',amount:number,amountKrw:number,merchant:string,merchantKey:string}} MarketingCancellation
 * @typedef {{status:'failed',failureCode:'empty'|'unsupported_shape'|'unreadable_fields'|'unmatched_cancellation'|'ambiguous_cancellation'}} MarketingFailed
 * @typedef {{status:'ignored',reason:'rejected'|'points'}} MarketingIgnored
 * @typedef {MarketingRecorded|MarketingCancellation|MarketingFailed|MarketingIgnored} MarketingParseResult
 */
/** @returns {MarketingParseResult} */
export function parseMarketingSms(rawText, receivedAt = new Date().toISOString()) {
  const text = String(rawText || '').replace(/\r/g, '').replace(/[\t ]+/g, ' ').trim();
  if (!text) return { status: 'failed', failureCode: 'empty' };
  if (/거절|승인거절|사용불가/i.test(text)) return { status: 'ignored', reason: 'rejected' };
  if (/P사용|포인트\s*결제시차감청구/i.test(text)) return { status: 'ignored', reason: 'points' };
  const cancellation = parseSamsungCancellation(text, receivedAt);
  if (/취소|승인취소/i.test(text)) return cancellation || { status: 'failed', failureCode: 'unreadable_fields' };

  let match;
  if ((match = text.match(/삼성\d{4}승인[\s\S]*?([\d,]+)원\s*일시불\s*\/?\s*(\d{2}\/\d{2}\s+\d{2}:\d{2})\s+(.+?)\s*\/?\s*누적[\d,]+원/i))) {
    return parsedPurchase({ currency: 'KRW', amount: Number(match[1].replace(/,/g, '')), date: match[2], merchant: match[3], receivedAt });
  }
  if ((match = text.match(/신한체크승인[\s\S]*?\d{2}\/\d{2}\s+\d{2}:\d{2}\s*\(금액\)\s*([\d,]+)원\s+(.+)$/i))) {
    const date = text.match(/신한체크승인[\s\S]*?(\d{2}\/\d{2}\s+\d{2}:\d{2})\s*\(금액\)/i)?.[1];
    return parsedPurchase({ currency: 'KRW', amount: Number(match[1].replace(/,/g, '')), date, merchant: match[2], receivedAt });
  }
  if ((match = text.match(/신한체크해외승인[\s\S]*?(\d{2}\/\d{2}\s+\d{2}:\d{2})\s+([A-Z]{3})\s+([\d,]+(?:\.\d{1,4})?)\s+(.+)$/i))) {
    return parsedPurchase({ currency: match[2].toUpperCase(), amount: Number(match[3].replace(/,/g, '')), date: match[1], merchant: match[4], receivedAt });
  }
  return { status: 'failed', failureCode: 'unsupported_shape' };
}

function parseSamsungCancellation(text, receivedAt) {
  const match = text.match(/삼성\d{4}승인취소[\s\S]*?([\d,]+)원\s*일시불\s*\/?\s*(\d{2}\/\d{2}\s+\d{2}:\d{2})\s+(.+?)(?:\s*\/?\s*누적[\d,]+원)?$/i);
  if (!match) return null;
  const merchant = sanitizeMerchant(match[3]);
  const transactionAt = transactionTimestamp(match[2], receivedAt);
  const amount = Number(match[1].replace(/,/g, ''));
  if (!merchant || !transactionAt || !Number.isFinite(amount) || amount <= 0) return { status: 'failed', failureCode: 'unreadable_fields' };
  return { status: 'cancellation', transactionAt, currency: 'KRW', amount, amountKrw: Math.round(amount), merchant, merchantKey: merchantKey(merchant) };
}

/** @returns {MarketingParseResult} */
function parsedPurchase({ currency, amount, date, merchant, receivedAt }) {
  const safeMerchant = sanitizeMerchant(merchant);
  const transactionAt = transactionTimestamp(date, receivedAt);
  if (!safeMerchant || !transactionAt || !Number.isFinite(amount) || amount <= 0) {
    return { status: 'failed', failureCode: 'unreadable_fields' };
  }
  return {
    status: 'recorded', eventKind: 'purchase', transactionAt,
    currency, amount, amountKrw: currency === 'KRW' ? Math.round(amount) : null,
    merchant: safeMerchant, merchantKey: merchantKey(safeMerchant),
  };
}

function sanitizeMerchant(value) {
  const safe = String(value || '')
    .replace(/\d{4,}/g, '')
    .replace(/[^\p{L}\p{N} .&()_\/-]/gu, ' ')
    .replace(/\s+/g, ' ').trim().slice(0, 80);
  return safe || null;
}

export function merchantKey(value) {
  return String(value || '').normalize('NFKC').replace(/\d{4,}/g, '').toLocaleLowerCase('ko-KR').replace(/[^\p{L}\p{N}]/gu, '').slice(0, 80);
}

function transactionTimestamp(date, receivedAt) {
  const match = String(date || '').match(/^(\d{2})\/(\d{2})\s+(\d{2}):(\d{2})$/);
  const received = new Date(receivedAt);
  if (!match || Number.isNaN(received.getTime())) return null;
  const [, monthText, dayText, hourText, minuteText] = match;
  const kstParts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(received);
  const part = name => Number(kstParts.find(item => item.type === name)?.value);
  let year = part('year');
  const month = Number(monthText), day = Number(dayText), hour = Number(hourText), minute = Number(minuteText);
  let utcMs = Date.UTC(year, month - 1, day, hour - 9, minute);
  const candidateKst = new Date(utcMs + 9 * 60 * 60 * 1000);
  if (candidateKst.getUTCMonth() !== month - 1 || candidateKst.getUTCDate() !== day || candidateKst.getUTCHours() !== hour) return null;
  if (utcMs > received.getTime() + 5 * 60 * 1000) {
    year -= 1;
    utcMs = Date.UTC(year, month - 1, day, hour - 9, minute);
  }
  return new Date(utcMs).toISOString();
}

export async function marketingSmsDigest(rawText, secret) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(String(secret)), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const bytes = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(String(rawText || '').replace(/\r/g, '').replace(/[\t ]+/g, ' ').trim()));
  return [...new Uint8Array(bytes)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}
