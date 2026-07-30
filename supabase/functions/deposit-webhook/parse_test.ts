import { parseBusanSms } from "./index.ts";

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
