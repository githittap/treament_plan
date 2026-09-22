import { handleNaverTalkTalkWebhook, type WebhookDeps } from "./core.ts";

function assert(condition: unknown, message = "assertion failed"): asserts condition {
  if (!condition) throw new Error(message);
}

function assertEquals<T>(actual: T, expected: T, label = ""): void {
  if (!Object.is(actual, expected)) {
    throw new Error(`${label} expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

const URL_BASE = "https://x.functions.supabase.co/navertalk-webhook";
const VALID_TOKEN = "a".repeat(48);

function mockDeps(overrides: Partial<WebhookDeps> = {}): {
  deps: WebhookDeps;
  calls: { eventId: string; contact: string; message: string }[];
} {
  const calls: { eventId: string; contact: string; message: string }[] = [];
  const deps: WebhookDeps = {
    verifyToken: async (token) => token === VALID_TOKEN,
    ingestConsultation: async (params) => {
      calls.push(params);
      return { ok: true };
    },
    ...overrides,
  };
  return { deps, calls };
}

function post(body: string, opts: { token?: string; contentLength?: number } = {}): Request {
  const url = new URL(URL_BASE);
  if (opts.token !== undefined) url.searchParams.set("token", opts.token);
  const headers = new Headers({ "content-type": "application/json" });
  if (opts.contentLength !== undefined) headers.set("content-length", String(opts.contentLength));
  return new Request(url, { method: "POST", headers, body });
}

Deno.test("non-POST is rejected with 405 without touching deps", async () => {
  const { deps, calls } = mockDeps();
  const req = new Request(`${URL_BASE}?token=${VALID_TOKEN}`, { method: "GET" });
  const res = await handleNaverTalkTalkWebhook(req, deps);
  assertEquals(res.status, 405);
  assertEquals(calls.length, 0);
});

Deno.test("a Content-Length header over 64KB is rejected with 413 before reading the body", async () => {
  const { deps, calls } = mockDeps();
  const req = post('{"event":"send"}', { token: VALID_TOKEN, contentLength: 70_000 });
  const res = await handleNaverTalkTalkWebhook(req, deps);
  assertEquals(res.status, 413);
  assertEquals(calls.length, 0);
});

Deno.test("an actual body over 64KB is rejected with 413 even without a Content-Length header", async () => {
  const { deps, calls } = mockDeps();
  const bigText = "x".repeat(70_000);
  const body = JSON.stringify({ event: "send", user: "u1", textContent: { text: bigText } });
  const req = post(body, { token: VALID_TOKEN });
  const res = await handleNaverTalkTalkWebhook(req, deps);
  assertEquals(res.status, 413);
  assertEquals(calls.length, 0);
});

Deno.test("a missing token is rejected with 401 without calling verifyToken's dependents", async () => {
  const { deps, calls } = mockDeps();
  const req = post('{"event":"send"}', {});
  const res = await handleNaverTalkTalkWebhook(req, deps);
  assertEquals(res.status, 401);
  assertEquals(calls.length, 0);
});

Deno.test("a wrong token is rejected with 401", async () => {
  const { deps, calls } = mockDeps();
  const req = post('{"event":"send"}', { token: "wrong-token-value-not-matching-1234567" });
  const res = await handleNaverTalkTalkWebhook(req, deps);
  assertEquals(res.status, 401);
  assertEquals(calls.length, 0);
});

Deno.test("verifyToken is only ever asked about the value in the query string, never a hardcoded one", async () => {
  let seen = "";
  const { deps } = mockDeps({ verifyToken: async (token) => { seen = token; return true; } });
  const req = post(JSON.stringify({ event: "open", user: "u1" }), { token: "custom-token-value-zzz-1234567890" });
  await handleNaverTalkTalkWebhook(req, deps);
  assertEquals(seen, "custom-token-value-zzz-1234567890");
});

Deno.test("invalid JSON is rejected with 400", async () => {
  const { deps, calls } = mockDeps();
  const req = post("not json at all", { token: VALID_TOKEN });
  const res = await handleNaverTalkTalkWebhook(req, deps);
  assertEquals(res.status, 400);
  assertEquals(calls.length, 0);
});

Deno.test("JSON without an event field is rejected with 400", async () => {
  const { deps, calls } = mockDeps();
  const req = post(JSON.stringify({ user: "u1" }), { token: VALID_TOKEN });
  const res = await handleNaverTalkTalkWebhook(req, deps);
  assertEquals(res.status, 400);
  assertEquals(calls.length, 0);
});

for (const event of ["open", "leave", "friend", "action", "persistentMenu", "somethingUnknownFromAFutureNaverRelease"]) {
  Deno.test(`${event} event is a 200 no-op and never reaches ingestConsultation`, async () => {
    const { deps, calls } = mockDeps();
    const req = post(JSON.stringify({ event, user: "u1" }), { token: VALID_TOKEN });
    const res = await handleNaverTalkTalkWebhook(req, deps);
    assertEquals(res.status, 200);
    assertEquals(calls.length, 0);
  });
}

Deno.test("echo (staff manual reply from Partner Center) is a 200 no-op because the inbox has no outbound column", async () => {
  const { deps, calls } = mockDeps();
  const echoBody = JSON.stringify({
    event: "echo",
    echoedEvent: "send",
    user: "5KcCQTARWKNKv1IOvXwYQw",
    partner: "wc8b1i",
    textContent: { text: "명함을 보냈습니다.", inputType: "nameCard" },
    options: { mobile: false },
  });
  const req = post(echoBody, { token: VALID_TOKEN });
  const res = await handleNaverTalkTalkWebhook(req, deps);
  assertEquals(res.status, 200);
  assertEquals(calls.length, 0);
});

Deno.test("a send event with textContent is stored via ingestConsultation and acknowledged 200", async () => {
  const { deps, calls } = mockDeps();
  const body = JSON.stringify({
    event: "send",
    user: "al-2eGuGr5WQOnco1_V-FQ",
    textContent: { text: "hello world", inputType: "typing" },
  });
  const req = post(body, { token: VALID_TOKEN });
  const res = await handleNaverTalkTalkWebhook(req, deps);
  assertEquals(res.status, 200);
  assertEquals(calls.length, 1);
  assertEquals(calls[0].contact, "al-2eGuGr5WQOnco1_V-FQ");
  assertEquals(calls[0].message, "hello world");
  assert(/^[0-9a-f]{64}$/.test(calls[0].eventId), "eventId must be a sha256 hex digest");
});

Deno.test("a send event with imageContent stores a placeholder, never the image URL", async () => {
  const { deps, calls } = mockDeps();
  const body = JSON.stringify({
    event: "send",
    user: "u-image",
    imageContent: { imageUrl: "http://blogfiles5.naver.net/some/private-looking/path.jpg" },
  });
  const req = post(body, { token: VALID_TOKEN });
  const res = await handleNaverTalkTalkWebhook(req, deps);
  assertEquals(res.status, 200);
  assertEquals(calls.length, 1);
  assertEquals(calls[0].message, "[이미지 메시지]");
  assert(!calls[0].message.includes("naver.net"), "the image URL must never be stored as the message");
});

Deno.test("a send event with compositeContent stores a placeholder", async () => {
  const { deps, calls } = mockDeps();
  const body = JSON.stringify({ event: "send", user: "u-composite", compositeContent: { composite: [] } });
  const req = post(body, { token: VALID_TOKEN });
  const res = await handleNaverTalkTalkWebhook(req, deps);
  assertEquals(res.status, 200);
  assertEquals(calls[0].message, "[복합 메시지]");
});

Deno.test("a send event with no user, and no recognized content, are both 200 no-ops that skip ingestConsultation", async () => {
  const { deps, calls } = mockDeps();
  const noUser = post(JSON.stringify({ event: "send", textContent: { text: "hi" } }), { token: VALID_TOKEN });
  assertEquals((await handleNaverTalkTalkWebhook(noUser, deps)).status, 200);
  const noContent = post(JSON.stringify({ event: "send", user: "u1" }), { token: VALID_TOKEN });
  assertEquals((await handleNaverTalkTalkWebhook(noContent, deps)).status, 200);
  const blankText = post(JSON.stringify({ event: "send", user: "u1", textContent: { text: "   " } }), { token: VALID_TOKEN });
  assertEquals((await handleNaverTalkTalkWebhook(blankText, deps)).status, 200);
  assertEquals(calls.length, 0);
});

Deno.test("retrying the identical delivery twice reuses the same idempotency key (no duplicate insert attempt)", async () => {
  const { deps, calls } = mockDeps();
  const body = JSON.stringify({ event: "send", user: "u1", textContent: { text: "네" } });
  await handleNaverTalkTalkWebhook(post(body, { token: VALID_TOKEN }), deps);
  await handleNaverTalkTalkWebhook(post(body, { token: VALID_TOKEN }), deps);
  assertEquals(calls.length, 2);
  assertEquals(calls[0].eventId, calls[1].eventId, "identical raw retries must derive the same event id");
});

Deno.test("two genuinely different messages get different idempotency keys", async () => {
  const { deps, calls } = mockDeps();
  await handleNaverTalkTalkWebhook(
    post(JSON.stringify({ event: "send", user: "u1", textContent: { text: "네" } }), { token: VALID_TOKEN }),
    deps,
  );
  await handleNaverTalkTalkWebhook(
    post(JSON.stringify({ event: "send", user: "u1", textContent: { text: "아니오" } }), { token: VALID_TOKEN }),
    deps,
  );
  assert(calls[0].eventId !== calls[1].eventId, "different message content must not collide");
});

Deno.test("a failed ingest is reported as 500 so Naver retries, instead of being swallowed as 200", async () => {
  const { deps } = mockDeps({ ingestConsultation: async () => ({ ok: false }) });
  const body = JSON.stringify({ event: "send", user: "u1", textContent: { text: "hi" } });
  const res = await handleNaverTalkTalkWebhook(post(body, { token: VALID_TOKEN }), deps);
  assertEquals(res.status, 500);
});

Deno.test("the JSON response never echoes back the message text", async () => {
  const { deps } = mockDeps();
  const secretText = "이 문장은 응답에 그대로 나오면 안 됩니다";
  const body = JSON.stringify({ event: "send", user: "u1", textContent: { text: secretText } });
  const res = await handleNaverTalkTalkWebhook(post(body, { token: VALID_TOKEN }), deps);
  const text = await res.text();
  assert(!text.includes(secretText), "response body must never contain the inbound message text");
});

Deno.test("a long message is truncated to fit the inbox column instead of being dropped", async () => {
  const { deps, calls } = mockDeps();
  const longText = "가".repeat(5000);
  const body = JSON.stringify({ event: "send", user: "u1", textContent: { text: longText } });
  const res = await handleNaverTalkTalkWebhook(post(body, { token: VALID_TOKEN }), deps);
  assertEquals(res.status, 200);
  assertEquals(calls[0].message.length, 4000);
});
