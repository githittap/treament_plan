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
      if (amountKrw == null && rawText) {
        const usd = extractUsdAmount(rawText);
        if (usd != null) { usdAmount = usd; amountKrw = await usdToKrw(usd); }
        else amountKrw = extractKrwAmount(rawText);
      }
    }
    if (!token || !platform || (platform !== 'marketing' && amountKrw == null)) return json({ error: 'token, platform, 금액 또는 인식 가능한 문자 본문이 필요합니다.' }, 400);

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

    if (platform === 'marketing') {
      const parsed = parseMarketingSms(rawText, new Date().toISOString());
      if (parsed.status === 'ignored') return json({ ok: true, ignored: true }, 200);
      const eventHash = await marketingSmsDigest(rawText, String(secretRow.value));
      const row = parsed.status === 'recorded' ? {
        event_hash: eventHash, received_at: new Date().toISOString(), transaction_at: parsed.transactionAt,
        event_kind: parsed.eventKind, parse_status: 'recorded', currency: parsed.currency,
        amount_native: parsed.amount, amount_krw: parsed.amountKrw,
        merchant: parsed.merchant, merchant_key: parsed.merchantKey,
      } : {
        event_hash: eventHash, received_at: new Date().toISOString(), event_kind: 'purchase',
        parse_status: 'failed', failure_code: parsed.failureCode,
      };
      const { error: marketingErr } = await client.from('marketing_expense_events').upsert(row, { onConflict: 'event_hash', ignoreDuplicates: true });
      if (marketingErr) return json({ error: '이벤트 저장 실패' }, 500);
      return json({ ok: true, recorded: parsed.status === 'recorded' }, 200);
    }

    const composedNote = naverAd?.note || [note, usdAmount != null ? `USD ${usdAmount} 자동환산` : null].filter(Boolean).join(' / ') || null;
    const { error: insertErr } = await client.from('ai_billing_events').insert({
      platform: String(platform), amount_krw: amountKrw, source: 'sms', note: composedNote,
      raw_text: rawText || null, account_id: naverAd?.account_id ?? null,
      account_name: naverAd?.account_name ?? null, threshold_krw: naverAd?.threshold_krw ?? null,
    });
    if (insertErr) return json({ error: '이벤트 저장 실패' }, 500);
    return json({ ok: true, platform, amount_krw: amountKrw, usd_amount: usdAmount }, 200);
  };
}

function json(value: unknown, status: number): Response {
  return new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } });
}
function extractUsdAmount(text: string): number | null {
  if (!text) return null;
  let match = text.match(/USD\s*([\d]+\.?\d*)/i);
  if (match) return Number(match[1]);
  match = text.match(/([\d]+\.?\d*)\s*\(\s*USD\s*\)/i);
  return match ? Number(match[1]) : null;
}
function extractKrwAmount(text: string): number | null {
  if (!text) return null;
  const matches = [...text.matchAll(/([\d][\d,]*)\s*원/g)].map(match => Number(match[1].replace(/,/g, '')));
  return matches.length ? Math.max(...matches) : null;
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
