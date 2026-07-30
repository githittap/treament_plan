// Deploy with `supabase functions deploy deposit-webhook --no-verify-jwt`.
// The owner sets WEBHOOK_TOKEN and BIZ_ACCOUNT_MASKED. SUPABASE_URL and
// SUPABASE_SERVICE_ROLE_KEY are auto-provided. Never commit secrets.

import { createClient } from "npm:@supabase/supabase-js@2.110.9";

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
const MAX_EVENT_AGE_MS = 3 * 24 * 60 * 60 * 1000;
const BUSAN_SMS_PATTERN =
  /^\s*\[Web발신\] 부산(?<month>\d{2})\/(?<day>\d{2}) (?<hour>\d{2}):(?<minute>\d{2}) (?<maskedAccount>\d+\*+\d+) (?<payer>\S+) (?<transaction>입금|출금)(?<amount>[0-9,]+) 잔액[0-9,]+\s*$/u;
const AMOUNT_PATTERN = /^\d{1,3}(,\d{3})*$/;
const CARD_PAYER_PATTERN = /^[A-Z]{2}\d+$/;

type DepositRecord = {
  bank_dt: string;
  amount: number;
  payer_raw: string;
  is_card: boolean;
  account_tail: string;
  masked_account: string;
};

export type ParseResult =
  | { kind: "ok"; record: DepositRecord }
  | { kind: "ignore"; reason: "not-deposit" }
  | { kind: "error"; reason: "format" | "amount" | "stale" };

function kstInstantMs(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
): number | null {
  const wallClockMs = Date.UTC(year, month - 1, day, hour, minute);
  const wallClock = new Date(wallClockMs);

  if (
    wallClock.getUTCFullYear() !== year ||
    wallClock.getUTCMonth() !== month - 1 ||
    wallClock.getUTCDate() !== day ||
    wallClock.getUTCHours() !== hour ||
    wallClock.getUTCMinutes() !== minute
  ) {
    return null;
  }

  return wallClockMs - KST_OFFSET_MS;
}

function maskedTail(maskedAccount: string): string {
  let start = maskedAccount.lastIndexOf("*");
  while (start > 0 && maskedAccount[start - 1] === "*") {
    start -= 1;
  }
  return maskedAccount.slice(start);
}

export function parseBusanSms(
  msg: string,
  receivedAtIso: string,
): ParseResult {
  const match = BUSAN_SMS_PATTERN.exec(msg);
  if (!match?.groups) {
    return { kind: "error", reason: "format" };
  }

  const {
    month: monthText,
    day: dayText,
    hour: hourText,
    minute: minuteText,
    maskedAccount,
    payer,
    transaction,
    amount: amountText,
  } = match.groups;

  if (transaction !== "입금") {
    return { kind: "ignore", reason: "not-deposit" };
  }

  if (!AMOUNT_PATTERN.test(amountText)) {
    return { kind: "error", reason: "amount" };
  }

  const amount = Number(amountText.replaceAll(",", ""));
  if (!Number.isSafeInteger(amount) || amount <= 0) {
    return { kind: "error", reason: "amount" };
  }

  const receivedAtMs = Date.parse(receivedAtIso);
  if (!Number.isFinite(receivedAtMs)) {
    return { kind: "error", reason: "stale" };
  }

  const receivedAtKst = new Date(receivedAtMs + KST_OFFSET_MS);
  const receivedYear = receivedAtKst.getUTCFullYear();
  const month = Number(monthText);
  const day = Number(dayText);
  const hour = Number(hourText);
  const minute = Number(minuteText);
  const candidateYears = [receivedYear, receivedYear - 1, receivedYear + 1];
  const candidates = candidateYears
    .map((year) => kstInstantMs(year, month, day, hour, minute))
    .filter((candidate): candidate is number => candidate !== null);

  if (candidates.length === 0) {
    return { kind: "error", reason: "format" };
  }

  const bankDtMs = candidates.reduce((closest, candidate) =>
    Math.abs(candidate - receivedAtMs) < Math.abs(closest - receivedAtMs)
      ? candidate
      : closest
  );

  if (Math.abs(bankDtMs - receivedAtMs) > MAX_EVENT_AGE_MS) {
    return { kind: "error", reason: "stale" };
  }

  return {
    kind: "ok",
    record: {
      bank_dt: new Date(bankDtMs).toISOString(),
      amount,
      payer_raw: payer,
      is_card: CARD_PAYER_PATTERN.test(payer),
      account_tail: maskedTail(maskedAccount),
      masked_account: maskedAccount,
    },
  };
}

function jsonResponse(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}

export async function handleRequest(req: Request): Promise<Response> {
  if (req.method !== "POST") {
    return jsonResponse({ error: "method-not-allowed" }, 405);
  }

  const webhookToken = Deno.env.get("WEBHOOK_TOKEN");
  if (!webhookToken) {
    return jsonResponse({ error: "server-config" }, 500);
  }

  if (req.headers.get("X-Webhook-Token") !== webhookToken) {
    return jsonResponse({ error: "unauthorized" }, 401);
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: "invalid-body" }, 400);
  }

  if (
    typeof body !== "object" ||
    body === null ||
    !("msg" in body) ||
    !("event_id" in body) ||
    typeof body.msg !== "string" ||
    typeof body.event_id !== "string" ||
    body.msg.trim() === "" ||
    body.event_id.trim() === ""
  ) {
    return jsonResponse({ error: "invalid-body" }, 400);
  }

  const receivedAt = "received_at" in body &&
      typeof body.received_at === "string" &&
      body.received_at.trim() !== ""
    ? body.received_at.trim()
    : new Date().toISOString();
  const eventId = body.event_id.trim();
  const parsed = parseBusanSms(body.msg, receivedAt);

  if (parsed.kind === "error") {
    return jsonResponse({ error: parsed.reason }, 422);
  }
  if (parsed.kind === "ignore") {
    return jsonResponse({ ignored: parsed.reason });
  }

  const expectedAccount = Deno.env.get("BIZ_ACCOUNT_MASKED");
  if (!expectedAccount) {
    return jsonResponse({ error: "server-config" }, 500);
  }
  if (parsed.record.masked_account !== expectedAccount) {
    return jsonResponse({ ignored: "other-account" });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) {
    return jsonResponse({ error: "server-config" }, 500);
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey);
  const { masked_account: _maskedAccount, ...safeRecord } = parsed.record;
  const { data, error } = await supabase
    .from("deposits")
    .upsert(
      { event_id: eventId, ...safeRecord },
      { onConflict: "event_id", ignoreDuplicates: true },
    )
    .select("id");

  if (error) {
    return jsonResponse({ error: "database" }, 500);
  }

  return data.length > 0
    ? jsonResponse({ stored: true })
    : jsonResponse({ duplicate: true });
}

if (import.meta.main) {
  Deno.serve(handleRequest);
}
