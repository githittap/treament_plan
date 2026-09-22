import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// MacroDroid HTTP 요청(POST) 설정(원장 기존 계좌연동 매크로와 동일한 패턴):
//   URL: .../ai-billing-webhook?platform=Claude  (플랫폼은 매크로마다 쿼리파라미터로 구분)
//   헤더: X-Webhook-Token: <webhook_secrets 값>
//   Body: {sms_message} (순수 문자 원문 그대로, JSON 아님 가능 — 이전처럼 JSON으로 보내도 동작)
//
// 실제 문자 형식(카드사별 다름, 해외승인은 USD로 온다):
//   삼성카드: "USD 28.12"      /  KB국민카드: "10.76(USD)"

function extractUsdAmount(text: string): number | null {
  if (!text) return null;
  let m = text.match(/USD\s*([\d]+\.?\d*)/i);
  if (m) return Number(m[1]);
  m = text.match(/([\d]+\.?\d*)\s*\(\s*USD\s*\)/i);
  if (m) return Number(m[1]);
  return null;
}

function extractKrwAmount(text: string): number | null {
  if (!text) return null;
  const matches = [...text.matchAll(/([\d][\d,]*)\s*원/g)].map(m => Number(m[1].replace(/,/g, '')));
  if (!matches.length) return null;
  return Math.max(...matches);
}

async function usdToKrw(usd: number): Promise<number> {
  try {
    const r = await fetch('https://open.er-api.com/v6/latest/USD', { signal: AbortSignal.timeout(4000) });
    const j = await r.json();
    const rate = j?.rates?.KRW;
    if (rate) return Math.round(usd * rate);
  } catch (_e) { /* 폴백 */ }
  return Math.round(usd * 1380);
}

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 });
  }

  const url = new URL(req.url);
  const bodyText = await req.text();

  // 토큰: 헤더 X-Webhook-Token 우선, 없으면 JSON body 안의 token 필드로 폴백(구버전 호환)
  // 플랫폼: URL 쿼리파라미터 ?platform= 우선, 없으면 JSON body의 platform 필드로 폴백
  // raw_text: JSON body의 raw_text 필드가 있으면 그것, 아니면(=순수 문자) bodyText 자체를 원문으로 사용
  let token = req.headers.get('x-webhook-token') || '';
  let platform = url.searchParams.get('platform') || '';
  let raw_text = '';
  let note: string | null = null;
  let amount_krw: number | null = null;

  let parsedJson: any = null;
  try { parsedJson = JSON.parse(bodyText); } catch { /* 순수 문자 body — JSON 아님 */ }

  if (parsedJson && typeof parsedJson === 'object') {
    if (!token && typeof parsedJson.token === 'string') token = parsedJson.token;
    if (!platform && typeof parsedJson.platform === 'string') platform = parsedJson.platform;
    if (typeof parsedJson.raw_text === 'string') raw_text = parsedJson.raw_text;
    if (typeof parsedJson.note === 'string') note = parsedJson.note;
    if (typeof parsedJson.amount_krw === 'number') amount_krw = parsedJson.amount_krw;
  }
  if (!raw_text) raw_text = bodyText; // 순수 문자(=SMS 원문)가 그대로 온 경우

  let usd_amount: number | null = null;
  if (amount_krw == null && raw_text) {
    usd_amount = extractUsdAmount(raw_text);
    if (usd_amount != null) amount_krw = await usdToKrw(usd_amount);
    else amount_krw = extractKrwAmount(raw_text);
  }

  if (!token || !platform || amount_krw == null) {
    return new Response(JSON.stringify({ error: 'token(헤더 X-Webhook-Token 또는 body.token), platform(쿼리 ?platform= 또는 body.platform), 금액(raw_text에서 USD/원 추출 또는 body.amount_krw)이 필요합니다.', got: { hasToken: !!token, platform, raw_text_preview: raw_text.slice(0,80) } }), { status: 400, headers: { 'Content-Type': 'application/json' } });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const client = createClient(supabaseUrl, serviceKey);

  const { data: secretRow, error: secretErr } = await client
    .from('webhook_secrets').select('value').eq('name', 'ai_billing_webhook').single();
  if (secretErr || !secretRow || secretRow.value !== token) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { 'Content-Type': 'application/json' } });
  }

  const composedNote = [note, usd_amount != null ? `USD ${usd_amount} 자동환산` : null].filter(Boolean).join(' / ') || null;

  const { error: insertErr } = await client.from('ai_billing_events').insert({
    platform: String(platform),
    amount_krw,
    source: 'sms',
    note: composedNote,
    raw_text: raw_text || null,
  });
  if (insertErr) {
    return new Response(JSON.stringify({ error: insertErr.message }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }

  return new Response(JSON.stringify({ ok: true, platform, amount_krw, usd_amount }), { status: 200, headers: { 'Content-Type': 'application/json' } });
});
