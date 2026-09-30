// ai-assistant-chat 핸들러 시험 — 사용량 예약(ai_usage_reserve)·결과 update 흐름.
// 실행: deno test --node-modules-dir=none supabase/functions/ai-assistant-chat/handler_test.ts
// DB·AI 회사는 가짜 의존성으로 주입한다(실제 호출 없음).
import { createAiAssistantChatHandler } from "./index.ts";
import { apiKeyFor, buildOpenAIResponsesInput, callModel } from "./providers.ts";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}
function assertEquals(actual: unknown, expected: unknown, message = "") {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`${message} expected ${JSON.stringify(expected)} got ${JSON.stringify(actual)}`);
  }
}

const opus = { id: "m-opus", provider: "anthropic", model_id: "claude-opus-5-5", label: "Claude Opus 5.5", enabled: true, supports_images: true, price_in_usd_per_mtok: 4, price_out_usd_per_mtok: 20 };
const haiku = { id: "m-haiku", provider: "anthropic", model_id: "claude-haiku-4-5", label: "Claude Haiku 4.5", enabled: true, supports_images: true, price_in_usd_per_mtok: 1, price_out_usd_per_mtok: 5 };
const assistant = { id: "a-1", name: "리뷰 답글", instructions: "", knowledge: "", model_ref: "m-opus", fallback_model_ref: "m-haiku", effort: "low", max_output_tokens: 4000, visible_roles: ["staff", "owner"], enabled: true };
const baseEnv: Record<string, string> = { SUPABASE_URL: "http://x", SUPABASE_SERVICE_ROLE_KEY: "svc", SUPABASE_ANON_KEY: "anon" };

type Row = { id: number; user_id: string; status: string; [k: string]: unknown };

/** 가짜 DB: usage 행을 메모리에 두고 ai_usage_reserve(원자적 한도 확인+예약)와 update를 흉내 낸다. */
function makeDb(opts: { existing?: number; limit?: number; role?: string; models?: any[]; providerRows?: any[]; providerError?: { message: string }; reserveError?: { code?: string; message: string }; updateError?: { code?: string; message: string } } = {}) {
  const rows: Row[] = [];
  for (let i = 0; i < (opts.existing ?? 0); i++) rows.push({ id: i + 1, user_id: "u1", status: "ok" });
  let nextId = rows.length + 1;
  const reserveCalls: unknown[] = [];
  const savedConversations: any[] = [];
  const savedMessages: any[] = [];
  const admin = {
    rpc(name: string, args: any) {
      assert(name === "ai_usage_reserve", "예약 RPC 이름");
      reserveCalls.push(args);
      if (opts.reserveError) return Promise.resolve({ data: null, error: opts.reserveError });
      // 실제 함수처럼 한 덩어리(잠금 아래): 건수 확인 → 넣기
      const count = rows.filter((r) => r.user_id === args.p_user).length;
      if (count >= args.p_limit) return Promise.resolve({ data: null, error: { code: "P0001", message: "rate_limited" } });
      const row: Row = { id: nextId++, user_id: args.p_user, status: "pending", provider: args.p_provider, model_id: args.p_model_id };
      rows.push(row);
      return Promise.resolve({ data: row.id, error: null });
    },
    from(table: string) {
      const filters: Record<string, unknown> = {};
      let patch: Record<string, unknown> | null = null;
      const api: any = {
        select() { return api; },
        order() { return Promise.resolve({ data: table === "ai_providers" ? (opts.providerRows ?? []) : [], error: null }); },
        insert(rows: any) { if (table === "ai_assistant_messages") savedMessages.push(...(Array.isArray(rows) ? rows : [rows])); return Promise.resolve({ error: null }); },
        upsert(row: any) { if (table === "ai_assistant_conversations") savedConversations.push(row); return Promise.resolve({ error: null }); },
        update(p: Record<string, unknown>) { patch = p; return api; },
        eq(col: string, val: unknown) {
          filters[col] = val;
          if (patch) {
            // update(...).eq("id", n) → 곧바로 await 되는 결과
            if (opts.updateError) return Promise.resolve({ error: opts.updateError });
            const row = rows.find((r) => r.id === filters.id);
            if (row) Object.assign(row, patch);
            return Promise.resolve({ error: null });
          }
          return api;
        },
        maybeSingle() {
          if (table === "profiles") return Promise.resolve({ data: { role: opts.role ?? "staff", approved: true }, error: null });
          if (table === "ai_providers") {
            if (opts.providerError) return Promise.resolve({ data: null, error: opts.providerError });
            return Promise.resolve({ data: (opts.providerRows ?? []).find((r: any) => r.id === filters.id) ?? null, error: null });
          }
          if (table === "ai_assistants") return Promise.resolve({ data: filters.id === assistant.id ? assistant : null, error: null });
          if (table === "ai_models") return Promise.resolve({ data: (opts.models ?? [opus, haiku]).find((m) => m.id === filters.id) ?? null, error: null });
          return Promise.resolve({ data: null, error: null });
        },
      };
      return api;
    },
  };
  const user = {
    auth: { getUser: () => Promise.resolve({ data: { user: { id: "u1" } }, error: null }) },
    rpc: () => Promise.resolve({ data: true, error: null }),
  };
  return { rows, reserveCalls, savedConversations, savedMessages, admin, user };
}

function makeHandler(db: ReturnType<typeof makeDb>, callModel: (a: any) => Promise<any>) {
  return createAiAssistantChatHandler({
    env: (n: string) => baseEnv[n],
    createClient: (_u: string, key: string) => (key === "svc" ? db.admin : db.user),
    callModel,
  });
}
const chatReq = (messages: any[] = [{ role: "user", content: "안녕" }], extra: Record<string, unknown> = {}) =>
  new Request("http://local/ai-assistant-chat", {
    method: "POST",
    headers: { Authorization: "Bearer x", "content-type": "application/json" },
    body: JSON.stringify({ action: "chat", assistant_id: "a-1", conversation_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", messages, ...extra }),
  });
const actionReq = (body: Record<string, unknown>) =>
  new Request("http://local/ai-assistant-chat", {
    method: "POST",
    headers: { Authorization: "Bearer x", "content-type": "application/json" },
    body: JSON.stringify(body),
  });

Deno.test("API key 이름 검증은 Supabase 비밀 이름과 잘못된 이름을 거절한다", () => {
  assertEquals(apiKeyFor("xai", () => "dummy", "XAI_API_KEY"), "dummy");
  assertEquals(apiKeyFor("xai", () => "dummy", "SUPABASE_SERVICE_ROLE_KEY"), undefined);
  assertEquals(apiKeyFor("xai", () => "dummy", "bad-name"), undefined);
});

Deno.test("Gemini Interactions 검색 결과와 총 토큰을 사용량·출처로 변환한다", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (() => Promise.resolve(new Response(JSON.stringify({
    steps: [
      { type: "google_search_call", arguments: { queries: ["official docs"] } },
      { type: "google_search_result", result: [{ title: "Official docs", url: "https://ai.google.dev/api/interactions-api" }] },
      { type: "model_output", content: [{ type: "text", text: "The endpoint is /v1/interactions." }] },
    ],
    usage: { total_input_tokens: 19, total_output_tokens: 7 },
  }), { status: 200, headers: { "Content-Type": "application/json" } }))) as typeof fetch;
  try {
    const result = await callModel({ provider: "google", apiKey: "test-key", baseUrl: "https://generativelanguage.googleapis.com/v1beta", modelId: "gemini-3.8-flash", system: "", messages: [{ role: "user", content: "search" }], maxOutputTokens: 80, webSearch: true });
    assert(result.ok, "Google Search 응답 성공");
    if (result.ok) {
      assertEquals(result.input_tokens, 19, "입력 토큰");
      assertEquals(result.output_tokens, 7, "출력 토큰");
      assertEquals(result.web_search_used, true, "검색 사용 여부");
      assertEquals(result.sources, [{ title: "Official docs", url: "https://ai.google.dev/api/interactions-api" }], "검색 출처");
    }
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test("웹검색 설정과 사진 data URL을 모델 호출 및 기록으로 전달한다", async () => {
  const db = makeDb();
  const original = (assistant as any).web_search;
  (assistant as any).web_search = true;
  let request: any;
  try {
    const image = "data:image/jpeg;base64,AA==";
    const res = await makeHandler(db, (a) => { request = a; return Promise.resolve(okResult); })(chatReq([{ role: "user", content: [{ type: "text", text: "사진 설명" }, { type: "image_url", image_url: { url: image } }] }]));
    assertEquals(res.status, 200, JSON.stringify(await res.json()));
    assertEquals(request.webSearch, true);
    assertEquals(request.messages[0].content[1].image_url.url, image);
    assertEquals(db.savedMessages[0].image_count, 1);
  } finally {
    (assistant as any).web_search = original;
  }
});
const okResult = { ok: true, text: "답", input_tokens: 10, output_tokens: 20 };

Deno.test("정상: 호출 전 1번 예약하고 같은 행을 ok·토큰·금액으로 갱신한다", async () => {
  const db = makeDb();
  let calls = 0;
  const res = await makeHandler(db, () => { calls++; return Promise.resolve(okResult); })(chatReq());
  const body = await res.json();
  assertEquals(res.status, 200);
  assertEquals(body.ok, true);
  assertEquals(calls, 1);
  assertEquals(db.reserveCalls.length, 1);
  assertEquals(db.rows.length, 1);
  assertEquals(db.rows[0].status, "ok");
  assertEquals(db.rows[0].input_tokens, 10);
  assertEquals(db.rows[0].est_cost_usd, (10 * 4 + 20 * 20) / 1e6);
  assertEquals(db.rows[0].fallback_used, false);
  assertEquals(db.savedConversations.length, 1);
  assertEquals(db.savedMessages.length, 2);
  assertEquals(db.savedMessages[0].role, "user");
  assertEquals(db.savedMessages[1].role, "assistant");
});

Deno.test("예비 모델: 1차·예비 각각 예약하고, 1차 행은 error·예비 행은 ok+fallback_used", async () => {
  const db = makeDb();
  const res = await makeHandler(db, (a) => Promise.resolve(a.modelId === "claude-opus-5-5" ? { ok: false, reason: "rate_limited" } : okResult))(chatReq());
  const body = await res.json();
  assertEquals(body.ok, true);
  assertEquals(body.fallback_used, true);
  assertEquals(db.reserveCalls.length, 2);
  assertEquals(db.rows.map((r) => [r.status, r.fallback_used, r.error_kind ?? null]), [["error", false, "rate_limited"], ["ok", true, null]]);
});

Deno.test("한도(120건)에 닿으면 429 rate_limited, AI는 부르지 않는다", async () => {
  const db = makeDb({ existing: 120 });
  let calls = 0;
  const res = await makeHandler(db, () => { calls++; return Promise.resolve(okResult); })(chatReq());
  const body = await res.json();
  assertEquals(res.status, 429);
  assertEquals(body.error_kind, "rate_limited");
  assertEquals(calls, 0);
  assertEquals(db.rows.length, 120, "새 행이 생기지 않음");
});

Deno.test("동시 요청 8개(기존 119건): 정확히 1개만 통과하고 나머지는 429, AI 호출은 1번", async () => {
  const db = makeDb({ existing: 119 });
  let calls = 0;
  const handler = makeHandler(db, async () => { calls++; await new Promise((r) => setTimeout(r, 20)); return okResult; });
  const responses = await Promise.all(Array.from({ length: 8 }, () => handler(chatReq())));
  const statuses = responses.map((r) => r.status).sort();
  assertEquals(statuses, [200, 429, 429, 429, 429, 429, 429, 429]);
  assertEquals(calls, 1);
  assertEquals(db.rows.length, 120);
});

Deno.test("예약 RPC가 DB 오류면 AI를 부르지 않고 503 usage_unavailable(fail closed)", async () => {
  const db = makeDb({ reserveError: { code: "XX000", message: "connection lost" } });
  let calls = 0;
  const orig = console.error;
  console.error = () => {};
  try {
    const res = await makeHandler(db, () => { calls++; return Promise.resolve(okResult); })(chatReq());
    const body = await res.json();
    assertEquals(res.status, 503);
    assertEquals(body.error_kind, "usage_unavailable");
    assertEquals(calls, 0);
  } finally {
    console.error = orig;
  }
});

Deno.test("결과 갱신이 실패해도 답은 돌려주고, 서버 로그에 남기며 행은 pending으로 남는다", async () => {
  const db = makeDb({ updateError: { code: "XX000", message: "update failed" } });
  const logs: unknown[][] = [];
  const orig = console.error;
  console.error = (...a: unknown[]) => { logs.push(a); };
  try {
    const res = await makeHandler(db, () => Promise.resolve(okResult))(chatReq());
    const body = await res.json();
    assertEquals(res.status, 200);
    assertEquals(body.ok, true);
    assertEquals(db.rows[0].status, "pending");
    assert(logs.some((l) => String(l[0]).includes("ai_assistant_usage update failed")), "console.error 기록");
  } finally {
    console.error = orig;
  }
});

Deno.test("예비 모델 예약이 한도에 걸리면 429로 멈추고 예비 AI는 부르지 않는다", async () => {
  const db = makeDb({ existing: 119 });
  let calls = 0;
  const res = await makeHandler(db, () => { calls++; return Promise.resolve({ ok: false, reason: "timeout" }); })(chatReq());
  const body = await res.json();
  assertEquals(res.status, 429);
  assertEquals(body.error_kind, "rate_limited");
  assertEquals(calls, 1, "1차만 호출");
  assertEquals(db.rows[119].status, "error");
});

Deno.test("실패해도 회사가 토큰 수를 알려 주면 금액을 계산해 기록하고, 토큰을 모르면 null(미상)", async () => {
  const db = makeDb();
  const res = await makeHandler(db, (a) =>
    Promise.resolve(a.modelId === "claude-opus-5-5" ? { ok: false, reason: "refusal", input_tokens: 100, output_tokens: 50 } : { ok: false, reason: "timeout" })
  )(chatReq());
  await res.json();
  assertEquals(db.rows.length, 2);
  assertEquals(db.rows[0].status, "error");
  assertEquals(db.rows[0].input_tokens, 100);
  assertEquals(db.rows[0].est_cost_usd, (100 * 4 + 50 * 20) / 1e6, "opus 가격으로 계산");
  assertEquals(db.rows[1].status, "error");
  assertEquals(db.rows[1].est_cost_usd, null, "토큰을 모르면 미상");
  assertEquals(db.rows[1].input_tokens, 0);
});

const PNG_URL = "data:image/png;base64,AA==";
const multiTurn = [
  { role: "user", content: "안녕" },
  { role: "assistant", content: "안녕하세요!" },
  { role: "user", content: [{ type: "text", text: "이 사진은?" }, { type: "image_url", image_url: { url: PNG_URL } }] },
];

Deno.test("OpenAI Responses 입력: 직원은 input_text·input_image, 이전 AI 답은 output_text로 보낸다", () => {
  const input = buildOpenAIResponsesInput("시스템", multiTurn);
  assertEquals(input.map((m: any) => m.role), ["system", "user", "assistant", "user"]);
  assertEquals(input[1].content, [{ type: "input_text", text: "안녕" }]);
  assertEquals(input[2].content, [{ type: "output_text", text: "안녕하세요!" }], "AI 답은 output_text(input_text면 OpenAI가 400으로 거절)");
  assertEquals(input[3].content, [{ type: "input_text", text: "이 사진은?" }, { type: "input_image", image_url: PNG_URL }]);
});

Deno.test("OpenAI 웹검색 호출: 이어 묻는 대화의 실제 요청 본문 모양(가짜 fetch)", async () => {
  const originalFetch = globalThis.fetch;
  let url = "";
  let sent: any = null;
  globalThis.fetch = ((u: string, init: any) => {
    url = String(u);
    sent = JSON.parse(init.body);
    return Promise.resolve(new Response(JSON.stringify({
      output: [
        { type: "web_search_call" },
        { type: "message", content: [{ type: "output_text", text: "답입니다", annotations: [{ type: "url_citation", title: "출처", url: "https://example.com/a" }] }] },
      ],
      usage: { input_tokens: 30, output_tokens: 5 },
    }), { status: 200, headers: { "Content-Type": "application/json" } }));
  }) as typeof fetch;
  try {
    const result = await callModel({ provider: "openai", apiKey: "test-key", baseUrl: "https://api.openai.com/v1", modelId: "gpt-6-luna", system: "시스템", messages: multiTurn, maxOutputTokens: 100, webSearch: true });
    assertEquals(url, "https://api.openai.com/v1/responses");
    assertEquals(sent.tools, [{ type: "web_search" }]);
    assertEquals(sent.input[2], { role: "assistant", content: [{ type: "output_text", text: "안녕하세요!" }] });
    assert(result.ok, "성공");
    if (result.ok) {
      assertEquals(result.web_search_used, true);
      assertEquals(result.sources, [{ title: "출처", url: "https://example.com/a" }]);
      assertEquals(result.input_tokens, 30);
    }
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test("옛 화면: conversation_id 없이 보내도 정상으로 답하고 대화 저장만 건너뛴다(사용 기록은 그대로)", async () => {
  const db = makeDb();
  const req = new Request("http://local/ai-assistant-chat", {
    method: "POST",
    headers: { Authorization: "Bearer x", "content-type": "application/json" },
    body: JSON.stringify({ action: "chat", assistant_id: "a-1", messages: [{ role: "user", content: "안녕" }] }),
  });
  const res = await makeHandler(db, () => Promise.resolve(okResult))(req);
  const body = await res.json();
  assertEquals(res.status, 200);
  assertEquals(body.ok, true);
  assertEquals(db.savedConversations.length, 0);
  assertEquals(db.savedMessages.length, 0);
  assertEquals(db.rows.length, 1, "사용 기록은 남음");
});

Deno.test("conversation_id가 왔는데 모양이 틀리면 400", async () => {
  const db = makeDb();
  const res = await makeHandler(db, () => Promise.resolve(okResult))(chatReq([{ role: "user", content: "안녕" }], { conversation_id: "not-a-uuid" }));
  assertEquals(res.status, 400);
});

Deno.test("예비 모델로 답하면 대화 기록의 usage_id는 예비(성공) 사용 기록 행을 가리킨다", async () => {
  const db = makeDb();
  const res = await makeHandler(db, (a) => Promise.resolve(a.modelId === "claude-opus-5-5" ? { ok: false, reason: "rate_limited" } : okResult))(chatReq());
  const body = await res.json();
  assertEquals(body.fallback_used, true);
  assertEquals(db.rows.map((r) => r.id), [1, 2]);
  assertEquals(db.savedMessages[1].usage_id, 2, "예비 행(2)을 가리킴 — 1차(실패) 행(1)이 아님");
  assertEquals(db.savedMessages[1].fallback_used, true);
});

Deno.test("provider_status: 원장이 아니면 거절", async () => {
  const db = makeDb({ role: "staff" });
  const res = await makeHandler(db, () => Promise.resolve(okResult))(actionReq({ action: "provider_status" }));
  assertEquals(res.status, 403);
  assertEquals((await res.json()).error_kind, "forbidden_role");
});

Deno.test("provider_status: 원장에게 회사마다 configured true/false만 주고 열쇠 값은 싣지 않는다", async () => {
  const db = makeDb({
    role: "owner",
    providerRows: [
      { id: "anthropic", key_env: "ANTHROPIC_API_KEY", enabled: true },
      { id: "openai", key_env: "OPENAI_API_KEY", enabled: true },
      { id: "xai", key_env: "XAI_API_KEY", enabled: true },
      { id: "bad", key_env: "SUPABASE_SERVICE_ROLE_KEY", enabled: true },
    ],
  });
  const env: Record<string, string> = { ...baseEnv, ANTHROPIC_API_KEY: "secret-anthropic-value", OPENAI_API_KEY: "" };
  const handler = createAiAssistantChatHandler({
    env: (n: string) => env[n],
    createClient: (_u: string, key: string) => (key === "svc" ? db.admin : db.user),
    callModel: () => Promise.resolve(okResult),
  });
  const res = await handler(actionReq({ action: "provider_status" }));
  const text = await res.text();
  assertEquals(res.status, 200);
  const body = JSON.parse(text);
  assertEquals(body.providers, [
    { id: "anthropic", configured: true },
    { id: "openai", configured: false },
    { id: "xai", configured: false },
    { id: "bad", configured: false },
  ]);
  assert(!text.includes("secret-anthropic-value"), "열쇠 값이 응답에 없음");
  assert(!text.includes("svc"), "서비스 키가 응답에 없음");
});

const anthropicOff = { id: "anthropic", label: "Anthropic", kind: "anthropic", base_url: "https://api.anthropic.com", key_env: "ANTHROPIC_API_KEY", enabled: false };

Deno.test("회사 끄기: 표에 행이 있고 꺼져 있으면 기본 6곳이어도 호출하지 않는다(provider_disabled)", async () => {
  const db = makeDb({ providerRows: [anthropicOff] });
  let calls = 0;
  const res = await makeHandler(db, () => { calls++; return Promise.resolve(okResult); })(chatReq());
  const body = await res.json();
  assertEquals(res.status, 502);
  assertEquals(body.error_kind, "provider_disabled");
  assertEquals(calls, 0, "끈 회사는 호출하지 않음");
  assertEquals(db.rows.length, 0, "호출하지 않았으니 사용 기록도 없음");
});

Deno.test("회사 표를 못 읽으면(오류) 내장 회사 값으로 그대로 호출한다", async () => {
  const db = makeDb({ providerError: { message: "relation does not exist" } });
  let calls = 0;
  const res = await makeHandler(db, () => { calls++; return Promise.resolve(okResult); })(chatReq());
  assertEquals(res.status, 200);
  assertEquals(calls, 1);
});

Deno.test("기본 모델 회사가 꺼져 있고 예비 모델 회사는 켜져 있으면 예비로 넘어간다", async () => {
  const gpt = { id: "m-haiku", provider: "openai", model_id: "gpt-6-luna", label: "GPT Luna", enabled: true, supports_images: true, price_in_usd_per_mtok: 0.1, price_out_usd_per_mtok: 0.5 };
  const db = makeDb({ models: [opus, gpt], providerRows: [anthropicOff] });
  const used: string[] = [];
  const res = await makeHandler(db, (a) => { used.push(a.modelId); return Promise.resolve(okResult); })(chatReq());
  const body = await res.json();
  assertEquals(body.ok, true);
  assertEquals(body.fallback_used, true);
  assertEquals(used, ["gpt-6-luna"], "꺼진 Anthropic은 부르지 않고 예비만 호출");
  assertEquals(db.rows.length, 1, "예비 호출 1건만 사용 기록");
});
