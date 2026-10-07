import { isCardSms, parseCardSms, recordCardLedger } from './card_ledger.mjs';
import { parseNaverAdSms } from './naver_ads.mjs';
import { marketingSmsDigest, parseMarketingSms } from './marketing_expenses.mjs';
import { sameHex, sha256Hex } from '../navertalk-webhook/payload.mjs';

export function createWebhookHandler(
  createClient: (url: string, key: string) => any,
  env: (name: string) => string | undefined,
) {
  return async (req: Request): Promise<Response> => {
    if (req.method !== 'POST') return new Response('Method Not Allowed', { status: 405 });

    const url = new URL(req.url);
    const bodyText = await req.text();
    let token = req.headers.get('x-webhook-token') || '';
    let platform = url.searchParams.get('platform') || '';
    let rawText = '';
    let suppliedNote = null;
    let suppliedAmount = null;
    let parsedJson = null;
    try { parsedJson = JSON.parse(bodyText); } catch { /* SMS 원문이 순수 문자로 전달될 수 있음 */ }
    if (parsedJson && typeof parsedJson === 'object' && !Array.isArray(parsedJson)) {
      if (!token && typeof parsedJson.token === 'string') token = parsedJson.token;
      if (!platform && typeof parsedJson.platform === 'string') platform = parsedJson.platform;
      if (typeof parsedJson.raw_text === 'string') rawText = parsedJson.raw_text;
      if (typeof parsedJson.note === 'string') suppliedNote = parsedJson.note;
      if (typeof parsedJson.amount_krw === 'number' && Number.isFinite(parsedJson.amount_krw)) suppliedAmount = parsedJson.amount_krw;
    }
    if (!rawText) rawText = bodyText;
    if (!token) return json({ error: 'Unauthorized' }, 401);

    const receivedAt = new Date().toISOString();
    const cardParsed = parseCardSms(rawText, receivedAt);
    const cardMessage = isCardSms(rawText);
    let amountKrw = null;
    let usdAmount = null;
    let note = suppliedNote;
    let naverAd = null;
    if (platform === 'naver_ads') {
      naverAd = parseNaverAdSms(rawText);
      if (!naverAd) return json({ error: '네이버 광고 문자를 확인할 수 없습니다.' }, 400);
      amountKrw = naverAd.amount_krw;
      note = naverAd.note;
    } else {
      if (note?.startsWith('NAVER_AD_')) return json({ error: '광고 알림 표식은 naver_ads 플랫폼에서만 허용됩니다.' }, 400);
      amountKrw = suppliedAmount;
      if (platform !== 'card_ledger' && amountKrw == null && rawText) {
        const usd = extractUsdAmount(rawText);
        if (usd != null) { usdAmount = usd; amountKrw = await usdToKrw(usd); }
        else amountKrw = extractKrwAmount(rawText);
      }
    }
    if (!token || !platform || (platform !== 'marketing' && platform !== 'card_ledger' && amountKrw == null && !cardMessage)) return json({ error: 'token, platform, 금액 또는 인식 가능한 문자 본문이 필요합니다.' }, 400);

    const supabaseUrl = env('SUPABASE_URL');
    const serviceRoleKey = env('SUPABASE_SERVICE_ROLE_KEY');
    if (!supabaseUrl || !serviceRoleKey) {
      return json({ error: '서버 설정을 확인할 수 없습니다.' }, 500);
    }
    const client = createClient(supabaseUrl, serviceRoleKey);
    const { data: secretRow, error: secretErr } = await client
      .from('webhook_secrets').select('value').eq('name', 'ai_billing_webhook').single();
    if (secretErr || !secretRow?.value || !sameHex(await sha256Hex(String(secretRow.value)), await sha256Hex(token))) {
      return json({ error: 'Unauthorized' }, 401);
    }

    const ledger = cardMessage ? await recordCardLedger(client, rawText, receivedAt) : null;
    // pg_cron이 없는 환경에서도 다음 문자 수신 때 만료 원문을 정리함.
    if (cardMessage) { try { await client.rpc('card_sms_failed_raw_purge'); } catch { /* 기존 쓰기 계속 */ } }
    if (platform === 'card_ledger') return json({ ok: ledger?.status !== 'error', card_ledger: ledger }, ledger?.status === 'error' ? 503 : 200);
    if (cardMessage && cardParsed.status === 'ignored') return json({ ok: true, ignored: true, card_ledger: ledger }, 200);
    if (amountKrw == null && platform !== 'marketing') return json({ error: '금액을 읽지 못했습니다.', card_ledger: ledger }, 400);
    if (cardParsed.status === 'cancellation') amountKrw = -Math.abs(amountKrw ?? 0);

    if (platform === 'marketing') {
      const parsed = parseMarketingSms(rawText, new Date().toISOString());
      if (parsed.status === 'ignored') return json({ ok: true, ignored: true }, 200);
      const eventHash = await marketingSmsDigest(rawText, String(secretRow.value));
      let cancellationLink: { id: string } | null = null;
      let cancellationFailure: 'unmatched_cancellation' | 'ambiguous_cancellation' | 'duplicate_cancellation' | null = null;
      if (parsed.status === 'cancellation') {
        const { data: priorCancellations, error: priorErr } = await client.from('marketing_expense_events')
          .select('reversed_event_id').eq('event_kind', 'cancellation').eq('parse_status', 'recorded')
          .eq('currency', parsed.currency).eq('amount_krw', -parsed.amountKrw)
          .eq('merchant_key', parsed.merchantKey).not('reversed_event_id', 'is', null)
          .lte('transaction_at', parsed.transactionAt).limit(1000);
        if (priorErr) return json({ error: '취소 대상을 확인하지 못했습니다.' }, 500);
        const alreadyReversedIds = [...new Set((priorCancellations || []).map((row: { reversed_event_id: string }) => row.reversed_event_id))];
        let candidateQuery = client.from('marketing_expense_events')
          .select('id').eq('event_kind', 'purchase').eq('parse_status', 'recorded')
          .eq('currency', parsed.currency).eq('amount_krw', parsed.amountKrw)
          .eq('merchant_key', parsed.merchantKey).lte('transaction_at', parsed.transactionAt);
        if (alreadyReversedIds.length) candidateQuery = candidateQuery.not('id', 'in', `(${alreadyReversedIds.join(',')})`);
        const { data: candidates, error: candidateErr } = await candidateQuery.limit(2);
        if (candidateErr) return json({ error: '취소 대상을 확인하지 못했습니다.' }, 500);
        if (candidates?.length === 1) cancellationLink = candidates[0];
        else cancellationFailure = candidates?.length ? 'ambiguous_cancellation' : alreadyReversedIds.length ? 'duplicate_cancellation' : 'unmatched_cancellation';
      }
      const receivedAt = new Date().toISOString();
      const row = parsed.status === 'recorded' ? {
        event_hash: eventHash, received_at: receivedAt, transaction_at: parsed.transactionAt,
        event_kind: parsed.eventKind, parse_status: 'recorded', currency: parsed.currency,
        amount_native: parsed.amount, amount_krw: parsed.amountKrw,
        merchant: parsed.merchant, merchant_key: parsed.merchantKey,
      } : parsed.status === 'cancellation' && cancellationLink ? {
        event_hash: eventHash, received_at: receivedAt, transaction_at: parsed.transactionAt,
        event_kind: 'cancellation', parse_status: 'recorded', currency: parsed.currency,
        amount_native: -parsed.amount, amount_krw: -parsed.amountKrw,
        merchant: parsed.merchant, merchant_key: parsed.merchantKey, reversed_event_id: cancellationLink.id,
      } : parsed.status === 'cancellation' ? {
        event_hash: eventHash, received_at: receivedAt, transaction_at: parsed.transactionAt,
        event_kind: 'cancellation', parse_status: 'failed', failure_code: cancellationFailure || 'unmatched_cancellation',
        currency: parsed.currency, amount_native: parsed.amount, amount_krw: parsed.amountKrw,
        merchant: parsed.merchant, merchant_key: parsed.merchantKey,
      } : {
        event_hash: eventHash, received_at: receivedAt, event_kind: /취소|승인취소/i.test(rawText) ? 'cancellation' : 'purchase',
        parse_status: 'failed', failure_code: parsed.failureCode,
      };
      const { error: marketingErr } = await client.from('marketing_expense_events').upsert(row, { onConflict: 'event_hash', ignoreDuplicates: true });
      if (marketingErr && parsed.status === 'cancellation' && cancellationLink && marketingErr.code === '23505') {
        const duplicateRow = {
          event_hash: eventHash, received_at: receivedAt, transaction_at: parsed.transactionAt,
          event_kind: 'cancellation', parse_status: 'failed', failure_code: 'duplicate_cancellation',
          currency: parsed.currency, amount_native: parsed.amount, amount_krw: parsed.amountKrw,
          merchant: parsed.merchant, merchant_key: parsed.merchantKey,
        };
        const { error: fallbackErr } = await client.from('marketing_expense_events').upsert(duplicateRow, { onConflict: 'event_hash', ignoreDuplicates: true });
        if (fallbackErr) return json({ error: '이벤트 저장 실패' }, 500);
        return json({ ok: true, recorded: false, review: true, card_ledger: ledger }, 200);
      }
      if (marketingErr) return json({ error: '이벤트 저장 실패' }, 500);
      return json({ ok: true, recorded: parsed.status === 'recorded' || (parsed.status === 'cancellation' && !!cancellationLink), review: !!cancellationFailure || /취소|승인취소/i.test(rawText), card_ledger: ledger }, 200);
    }

    const composedNote = naverAd?.note || [note, usdAmount != null ? `USD ${usdAmount} 자동환산` : null].filter(Boolean).join(' / ') || null;
    const billingRow = {
      platform: String(platform), amount_krw: amountKrw, source: 'sms', note: composedNote,
      raw_text: cardMessage ? null : rawText || null, card_merchant: cardParsed.merchant || null, account_id: naverAd?.account_id ?? null,
      account_name: naverAd?.account_name ?? null, threshold_krw: naverAd?.threshold_krw ?? null,
    };
    let { error: insertErr } = await client.from('ai_billing_events').insert(billingRow);
    // 새 가맹점 열을 설치하기 전에도 기존 이벤트 기록은 이어감.
    if (insertErr && ['42703', 'PGRST204'].includes(insertErr.code) && /card_merchant/.test(insertErr.message || '')) {
      const { card_merchant: _merchant, ...legacyRow } = billingRow;
      ({ error: insertErr } = await client.from('ai_billing_events').insert(legacyRow));
    }
    if (insertErr) return json({ error: '이벤트 저장 실패' }, 500);
    return json({ ok: true, platform, amount_krw: amountKrw, usd_amount: usdAmount, card_ledger: ledger }, 200);
  };
}

function json(value: unknown, status: number): Response {
  return new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } });
}
function extractUsdAmount(text: string): number | null {
  if (!text) return null;
  let match = text.match(/USD\s*([\d][\d,]*(?:\.\d+)?)/i);
  if (match) return Number(match[1].replace(/,/g, ''));
  match = text.match(/([\d][\d,]*(?:\.\d+)?)\s*\(\s*USD\s*\)/i);
  return match ? Number(match[1].replace(/,/g, '')) : null;
}
function extractKrwAmount(text: string): number | null {
  if (!text) return null;
  // v12: 누적·잔액을 제외하고 KRW 앞표시도 읽음.
  const paymentText = text.split(/\r?\n|\//).map(part => part.replace(/(?:누적|잔액).*$/, '')).join('\n');
  const match = paymentText.match(/(?:KRW\s*([\d][\d,]*)|([\d][\d,]*)\s*원)/i);
  return match ? Number((match[1] || match[2]).replace(/,/g, '')) : null;
}
async function usdToKrw(usd: number): Promise<number> {
  try {
    const response = await fetch('https://open.er-api.com/v6/latest/USD', { signal: AbortSignal.timeout(4000) });
    const jsonBody = await response.json();
    const rate = jsonBody?.rates?.KRW;
    if (rate) return Math.round(usd * rate);
  } catch { /* 환율 조회 실패 시 기존 폴백 */ }
  return Math.round(usd * 1380);
}
