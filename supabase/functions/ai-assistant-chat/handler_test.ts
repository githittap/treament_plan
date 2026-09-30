// ai-assistant-chat 핸들러 시험 — 사용량 예약(ai_usage_reserve)·결과 update 흐름.
// 실행: deno test --node-modules-dir=none supabase/functions/ai-assistant-chat/handler_test.ts
// DB·AI 회사는 가짜 의존성으로 주입한다(실제 호출 없음).
import { createAiAssistantChatHandler } from "./index.ts";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}
function assertEquals(actual: unknown, expected: unknown, message = "") {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`${message} expected ${JSON.stringify(expected)} got ${JSON.stringify(actual)}`);
  }
}

const opus = { id: "m-opus", provider: "anthropic", model_id: "claude-opus-5-5", label: "Claude Opus 5.5", enabled: true, price_in_usd_per_mtok: 4, price_out_usd_per_mtok: 20 };
const haiku = { id: "m-haiku", provider: "anthropic", model_id: "claude-haiku-4-5", label: "Claude Haiku 4.5", enabled: true, price_in_usd_per_mtok: 1, price_out_usd_per_mtok: 5 };
const assistant = { id: "a-1", name: "리뷰 답글", instructions: "", knowledge: "", model_ref: "m-opus", fallback_model_ref: "m-haiku", effort: "low", max_output_tokens: 4000, visible_roles: ["staff", "owner"], enabled: true };
const baseEnv: Record<string, string> = { SUPABASE_URL: "http://x", SUPABASE_SERVICE_ROLE_KEY: "svc", SUPABASE_ANON_KEY: "anon" };

type Row = { id: number; user_id: string; status: string; [k: string]: unknown };

/** 가짜 DB: usage 행을 메모리에 두고 ai_usage_reserve(원자적 한도 확인+예약)와 update를 흉내 낸다. */
function makeDb(opts: { existing?: number; limit?: number; reserveError?: { code?: string; message: string }; updateError?: { code?: string; message: string } } = {}) {
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
          if (table === "profiles") return Promise.resolve({ data: { role: "staff", approved: true }, error: null });
          if (table === "ai_assistants") return Promise.resolve({ data: filters.id === assistant.id ? assistant : null, error: null });
          if (table === "ai_models") return Promise.resolve({ data: [opus, haiku].find((m) => m.id === filters.id) ?? null, error: null });
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
const chatReq = () =>
  new Request("http://local/ai-assistant-chat", {
    method: "POST",
    headers: { Authorization: "Bearer x", "content-type": "application/json" },
    body: JSON.stringify({ action: "chat", assistant_id: "a-1", conversation_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", messages: [{ role: "user", content: "안녕" }] }),
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
