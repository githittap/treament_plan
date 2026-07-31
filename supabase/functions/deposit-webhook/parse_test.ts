import { buildTelegramMessage, extractPayload, parseBusanSms } from "./index.ts";

function assert(
  condition: unknown,
  message = "assertion failed",
): asserts condition {
  if (!condition) throw new Error(message);
}

function assertEquals<T>(actual: T, expected: T): void {
  if (!Object.is(actual, expected)) {
    throw new Error(`expected ${String(expected)}, got ${String(actual)}`);
  }
}

Deno.test("parses a synthetic Busan Bank card deposit", () => {
  const result = parseBusanSms(
    "[Web발신] 부산07/22 07:18 101209036***3 NH17576386 입금1,098,093 잔액3,456,789",
    "2026-07-22T07:20:00+09:00",
  );

  assertEquals(result.kind, "ok");
  if (result.kind !== "ok") return;

  assertEquals(result.record.bank_dt, "2026-07-21T22:18:00.000Z");
  assertEquals(result.record.amount, 1_098_093);
  assertEquals(result.record.is_card, true);
  assertEquals(result.record.account_tail, "***3");
  assertEquals(result.record.masked_account, "101209036***3");
  assert(!("balance" in result.record), "balance must never be returned");
  assert(
    !("account" in result.record),
    "an unmasked account must never be returned",
  );
  assert(
    result.record.masked_account.includes("*"),
    "handler account must stay masked",
  );
});

Deno.test("ignores a withdrawal using exact transaction-word matching", () => {
  const result = parseBusanSms(
    "[Web발신] 부산07/22 07:18 101209036***3 홍길동 출금10,000 잔액3,456,789",
    "2026-07-22T07:20:00+09:00",
  );

  assertEquals(result.kind, "ignore");
  if (result.kind === "ignore") {
    assertEquals(result.reason, "not-deposit");
  }
});

Deno.test("rejects a malformed comma-grouped amount", () => {
  const result = parseBusanSms(
    "[Web발신] 부산07/22 07:18 101209036***3 홍길동 입금1,,098 잔액3,456,789",
    "2026-07-22T07:20:00+09:00",
  );

  assertEquals(result.kind, "error");
  if (result.kind === "error") {
    assertEquals(result.reason, "amount");
  }
});

Deno.test("rejects an impossible calendar date", () => {
  const result = parseBusanSms(
    "[Web발신] 부산02/30 07:18 101209036***3 홍길동 입금10,000 잔액3,456,789",
    "2026-02-28T07:20:00+09:00",
  );

  assertEquals(result.kind, "error");
});

Deno.test("marks a Korean-name payer as non-card", () => {
  const result = parseBusanSms(
    "[Web발신] 부산07/22 07:18 101209036***3 홍길동 입금10,000 잔액3,456,789",
    "2026-07-22T07:20:00+09:00",
  );

  assertEquals(result.kind, "ok");
  if (result.kind === "ok") {
    assertEquals(result.record.payer_raw, "홍길동");
    assertEquals(result.record.is_card, false);
  }
});

Deno.test("tolerates leading and trailing whitespace", () => {
  const result = parseBusanSms(
    " \t[Web발신] 부산07/22 07:18 101209036***3 홍길동 입금10,000 잔액3,456,789 \r\n",
    "2026-07-22T07:20:00+09:00",
  );

  assertEquals(result.kind, "ok");
});

Deno.test("resolves Dec 31 to the prior year near New Year", () => {
  const result = parseBusanSms(
    "[Web발신] 부산12/31 23:59 101209036***3 홍길동 입금10,000 잔액3,456,789",
    "2027-01-01T00:05:00+09:00",
  );

  assertEquals(result.kind, "ok");
  if (result.kind === "ok") {
    assertEquals(result.record.bank_dt, "2026-12-31T14:59:00.000Z");
  }
});

Deno.test("parses a Busan Bank deposit with a newline after Web발신", () => {
  const result = parseBusanSms(
    "[Web발신]\n부산07/31 08:35 101209036***3 정용태 입금10,000 잔액115,561,706",
    "2026-07-31T08:36:00+09:00",
  );

  assertEquals(result.kind, "ok");
  if (result.kind !== "ok") return;

  assertEquals(result.record.amount, 10_000);
  assertEquals(result.record.payer_raw, "정용태");
  assertEquals(result.record.is_card, false);
  assertEquals(result.record.account_tail, "***3");
  assertEquals(result.record.bank_dt, "2026-07-30T23:35:00.000Z");
});

Deno.test("parses a Busan Bank deposit with newlines between fields", () => {
  const result = parseBusanSms(
    "[Web발신]\n부산07/31 08:35 101209036***3 정용태\n입금10,000 잔액115,561,706",
    "2026-07-31T08:36:00+09:00",
  );
  assertEquals(result.kind, "ok");
  if (result.kind !== "ok") return;
  assertEquals(result.record.amount, 10_000);
  assertEquals(result.record.payer_raw, "정용태");
  assertEquals(result.record.is_card, false);
  assertEquals(result.record.account_tail, "***3");
  assertEquals(result.record.bank_dt, "2026-07-30T23:35:00.000Z");
});

Deno.test("extractPayload reads a text/plain SMS body with event_id from the query", async () => {
  const req = new Request(
    "https://x.functions.supabase.co/deposit-webhook?event_id=evt-123",
    {
      method: "POST",
      headers: { "Content-Type": "text/plain" },
      body:
        "[Web발신]\n부산07/31 08:35 101209036***3 정용태 입금10,000 잔액115,561,706",
    },
  );
  const payload = await extractPayload(req);
  assert(payload.ok, "payload should be ok");
  if (!payload.ok) return;
  assertEquals(payload.eventId, "evt-123");
  assertEquals(payload.receivedAt, null);
  assert(payload.msg.includes("정용태"), "msg should contain the payer");
});

Deno.test("extractPayload still accepts the legacy JSON body", async () => {
  const req = new Request(
    "https://x.functions.supabase.co/deposit-webhook",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        msg:
          "[Web발신] 부산07/22 07:18 101209036***3 홍길동 입금10,000 잔액3,456,789",
        event_id: "evt-json-1",
      }),
    },
  );
  const payload = await extractPayload(req);
  assert(payload.ok, "payload should be ok");
  if (!payload.ok) return;
  assertEquals(payload.eventId, "evt-json-1");
  assertEquals(payload.receivedAt, null);
});

Deno.test("extractPayload falls back to raw text when a JSON content-type carries an invalid JSON body", async () => {
  const req = new Request(
    "https://x.functions.supabase.co/deposit-webhook?event_id=evt-raw-1",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body:
        "[Web발신]\n부산07/31 08:35 101209036***3 정용태 입금10,000 잔액115,561,706",
    },
  );
  const payload = await extractPayload(req);
  assert(payload.ok, "should fall back to raw text");
  if (!payload.ok) return;
  assertEquals(payload.eventId, "evt-raw-1");
  assert(payload.msg.includes("[Web발신]"), "msg should be the raw SMS");
});

Deno.test("extractPayload derives a stable sms: event_id when the query has none", async () => {
  const body =
    "[Web발신]\n부산07/31 08:35 101209036***3 정용태 입금10,000 잔액115,561,706";
  const make = () =>
    new Request("https://x.functions.supabase.co/deposit-webhook", {
      method: "POST",
      headers: { "Content-Type": "text/plain" },
      body,
    });
  const a = await extractPayload(make());
  const b = await extractPayload(make());
  assert(a.ok, "payload should be ok");
  assert(b.ok, "payload should be ok");
  if (!a.ok || !b.ok) return;
  assert(a.eventId.startsWith("sms:"), "event_id should be hash-derived");
  assertEquals(a.eventId, b.eventId);
  assert(a.msg.includes("정용태"), "msg should be the raw SMS");
});

Deno.test("extractPayload gives different sms: event_ids for different SMS", async () => {
  const mk = (body: string) =>
    new Request("https://x.functions.supabase.co/deposit-webhook", {
      method: "POST",
      headers: { "Content-Type": "text/plain" },
      body,
    });
  const a = await extractPayload(
    mk("[Web발신]\n부산07/31 08:35 101209036***3 정용태 입금10,000 잔액115,561,706"),
  );
  const b = await extractPayload(
    mk("[Web발신]\n부산07/31 08:40 101209036***3 정용태 입금10,000 잔액115,571,706"),
  );
  assert(a.ok && b.ok, "both ok");
  if (!a.ok || !b.ok) return;
  assert(a.eventId !== b.eventId, "different SMS must hash differently");
});

Deno.test("extractPayload still rejects an empty text body", async () => {
  const req = new Request("https://x.functions.supabase.co/deposit-webhook", {
    method: "POST",
    headers: { "Content-Type": "text/plain" },
    body: "   ",
  });
  const payload = await extractPayload(req);
  assertEquals(payload.ok, false);
});

Deno.test("buildTelegramMessage formats a name deposit without balance or masked account", () => {
  const record = {
    bank_dt: "2026-07-31T10:32:00.000Z",
    amount: 10_000,
    payer_raw: "정용태",
    is_card: false,
    account_tail: "***3",
    masked_account: "101209036***3",
  };
  const msg = buildTelegramMessage(record);
  assert(msg.includes("10,000원"), "should show the formatted amount");
  assert(msg.includes("정용태"), "should show the payer name");
  assert(!msg.includes(record.masked_account), "must never include the masked account");
  assert(!msg.includes("잔액"), "must never include a balance label");
});

Deno.test("buildTelegramMessage formats a card deposit as a card label, not the approval code as a name", () => {
  const record = {
    bank_dt: "2026-07-22T07:18:00.000Z",
    amount: 1_098_093,
    payer_raw: "NH17576386",
    is_card: true,
    account_tail: "***3",
    masked_account: "101209036***3",
  };
  const msg = buildTelegramMessage(record);
  assert(msg.includes("카드결제"), "should label it as a card payment");
  assert(msg.includes("1,098,093원"), "should show the formatted amount");
  assert(!msg.includes(record.masked_account), "must never include the masked account");
});
