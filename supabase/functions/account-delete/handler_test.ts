import {
  type AccountDeleteDeps,
  type AdminClient,
  buildDepsFromEnv,
  type CallerClient,
  handleRequest,
  mapAssertError,
} from "./index.ts";

function assert(
  condition: unknown,
  message = "assertion failed",
): asserts condition {
  if (!condition) throw new Error(message);
}

function assertEquals<T>(actual: T, expected: T, message?: string): void {
  if (!Object.is(actual, expected)) {
    throw new Error(
      message ?? `expected ${String(expected)}, got ${String(actual)}`,
    );
  }
}

const TARGET = "22222222-2222-2222-2222-222222222222";

function makeReq(
  body: unknown,
  opts: {
    method?: string;
    auth?: string | null;
    headers?: Record<string, string>;
    rawBody?: string;
  } = {},
): Request {
  const headers = new Headers(opts.headers ?? {});
  if (opts.auth !== null) headers.set("authorization", opts.auth ?? "Bearer test-jwt");
  headers.set("content-type", "application/json");
  const finalBody = opts.rawBody !== undefined ? opts.rawBody : JSON.stringify(body);
  return new Request("https://example.com/account-delete", {
    method: opts.method ?? "POST",
    headers,
    body: opts.method === "GET" ? undefined : finalBody,
  });
}

type Overrides = Partial<{
  assertError: string | null;
  deleteError: string | null;
  recordError: string | null;
}>;

function makeMockDeps(overrides: Overrides = {}) {
  const calls: {
    rpc: Array<[string, Record<string, unknown>]>;
    deleteUser: string[];
  } = { rpc: [], deleteUser: [] };

  const callerClient: CallerClient = {
    rpc: (fn, args) => {
      calls.rpc.push([fn, args]);
      if (fn === "assert_can_hard_delete_account") {
        return Promise.resolve(
          overrides.assertError
            ? { data: null, error: { message: overrides.assertError } }
            : {
              data: "11111111-1111-1111-1111-111111111111",
              error: null,
            },
        );
      }
      if (fn === "record_account_hard_deleted") {
        return Promise.resolve(
          overrides.recordError
            ? { data: null, error: { message: overrides.recordError } }
            : { data: null, error: null },
        );
      }
      throw new Error("unexpected rpc: " + fn);
    },
  };

  const adminClient: AdminClient = {
    auth: {
      admin: {
        deleteUser: (id: string) => {
          calls.deleteUser.push(id);
          return Promise.resolve(
            overrides.deleteError
              ? { data: null, error: { message: overrides.deleteError } }
              : { data: { id }, error: null },
          );
        },
      },
    },
  };

  const deps: AccountDeleteDeps = {
    makeCallerClient: () => callerClient,
    makeAdminClient: () => adminClient,
  };

  return { deps, calls };
}

Deno.test("POST가 아니면 405", async () => {
  const { deps } = makeMockDeps();
  const res = await handleRequest(
    makeReq({ user_id: TARGET, confirm_name: "김직원" }, { method: "GET" }),
    deps,
  );
  assertEquals(res.status, 405);
});

Deno.test("Authorization 헤더가 없으면 401", async () => {
  const { deps } = makeMockDeps();
  const res = await handleRequest(
    makeReq({ user_id: TARGET, confirm_name: "김직원" }, { auth: null }),
    deps,
  );
  assertEquals(res.status, 401);
});

Deno.test("Bearer 형식이 아니면 401", async () => {
  const { deps } = makeMockDeps();
  const res = await handleRequest(
    makeReq({ user_id: TARGET, confirm_name: "김직원" }, { auth: "Basic abc" }),
    deps,
  );
  assertEquals(res.status, 401);
});

Deno.test("content-length가 한도를 넘으면 413", async () => {
  const { deps } = makeMockDeps();
  const req = makeReq({ user_id: TARGET, confirm_name: "김직원" }, {
    headers: { "content-length": "999999" },
  });
  const res = await handleRequest(req, deps);
  assertEquals(res.status, 413);
});

Deno.test("잘못된 JSON 본문이면 400", async () => {
  const { deps } = makeMockDeps();
  const res = await handleRequest(
    makeReq(null, { rawBody: "{not-json" }),
    deps,
  );
  assertEquals(res.status, 400);
  const body = await res.json();
  assertEquals(body.error, "invalid_body");
});

Deno.test("user_id가 uuid 형식이 아니면 400", async () => {
  const { deps } = makeMockDeps();
  const res = await handleRequest(
    makeReq({ user_id: "not-a-uuid", confirm_name: "김직원" }),
    deps,
  );
  assertEquals(res.status, 400);
});

Deno.test("confirm_name이 비어있으면 400", async () => {
  const { deps } = makeMockDeps();
  const res = await handleRequest(
    makeReq({ user_id: TARGET, confirm_name: "   " }),
    deps,
  );
  assertEquals(res.status, 400);
});

Deno.test("사전 검증 RPC가 owner 아님을 이유로 거절하면 403이고 삭제는 시도하지 않는다", async () => {
  const { deps, calls } = makeMockDeps({
    assertError: "active approved owner required",
  });
  const res = await handleRequest(
    makeReq({ user_id: TARGET, confirm_name: "김직원" }),
    deps,
  );
  assertEquals(res.status, 403);
  const body = await res.json();
  assertEquals(body.error, "owner_required");
  assertEquals(calls.deleteUser.length, 0, "삭제 호출이 발생하면 안 됨");
});

Deno.test("차단되지 않은 계정이면 409이고 삭제를 시도하지 않는다", async () => {
  const { deps, calls } = makeMockDeps({
    assertError: "account must be blocked before hard delete",
  });
  const res = await handleRequest(
    makeReq({ user_id: TARGET, confirm_name: "김직원" }),
    deps,
  );
  assertEquals(res.status, 409);
  const body = await res.json();
  assertEquals(body.error, "not_blocked");
  assertEquals(calls.deleteUser.length, 0);
});

Deno.test("원장 계정을 대상으로 하면 403이고 삭제를 시도하지 않는다", async () => {
  const { deps, calls } = makeMockDeps({
    assertError: "owner account cannot be hard-deleted",
  });
  const res = await handleRequest(
    makeReq({ user_id: TARGET, confirm_name: "부원장" }),
    deps,
  );
  assertEquals(res.status, 403);
  const body = await res.json();
  assertEquals(body.error, "owner_target_protected");
  assertEquals(calls.deleteUser.length, 0);
});

Deno.test("확인 문구 불일치면 400이고 삭제를 시도하지 않는다", async () => {
  const { deps, calls } = makeMockDeps({
    assertError: "confirmation name mismatch",
  });
  const res = await handleRequest(
    makeReq({ user_id: TARGET, confirm_name: "다른이름" }),
    deps,
  );
  assertEquals(res.status, 400);
  const body = await res.json();
  assertEquals(body.error, "confirm_mismatch");
  assertEquals(calls.deleteUser.length, 0);
});

Deno.test("auth.admin.deleteUser 실패면 502이고 기록 RPC는 호출하지 않는다", async () => {
  const { deps, calls } = makeMockDeps({ deleteError: "network error" });
  const res = await handleRequest(
    makeReq({ user_id: TARGET, confirm_name: "김직원" }),
    deps,
  );
  assertEquals(res.status, 502);
  const body = await res.json();
  assertEquals(body.error, "auth_delete_failed");
  const recordCalls = calls.rpc.filter(([fn]) => fn === "record_account_hard_deleted");
  assertEquals(recordCalls.length, 0, "삭제 실패 후 기록 RPC가 호출되면 안 됨");
});

Deno.test("삭제는 성공했지만 기록 RPC가 실패하면 500과 함께 대상 정보를 돌려준다", async () => {
  const { deps, calls } = makeMockDeps({ recordError: "db error" });
  const res = await handleRequest(
    makeReq({ user_id: TARGET, confirm_name: "김직원" }),
    deps,
  );
  assertEquals(res.status, 500);
  const body = await res.json();
  assertEquals(body.error, "record_failed_after_delete");
  assertEquals(body.target_user_id, TARGET);
  assertEquals(body.target_name, "김직원");
  assertEquals(calls.deleteUser.length, 1, "삭제 자체는 이미 실행됐어야 함");
});

Deno.test("정상 흐름: 사전검증 -> 삭제 -> 기록 순서로 호출하고 200을 반환한다", async () => {
  const { deps, calls } = makeMockDeps();
  const res = await handleRequest(
    makeReq({ user_id: TARGET, confirm_name: "김직원" }),
    deps,
  );
  assertEquals(res.status, 200);
  const body = await res.json();
  assertEquals(body.ok, true);
  assertEquals(body.target_user_id, TARGET);
  assertEquals(body.target_name, "김직원");
  assert(
    typeof body.deleted_at === "string" && body.deleted_at.length > 0,
    "deleted_at이 비어있음",
  );

  assertEquals(calls.rpc.length, 2, "assert -> record 두 번만 호출돼야 함");
  assertEquals(calls.rpc[0][0], "assert_can_hard_delete_account");
  assertEquals(calls.rpc[0][1].p_user_id, TARGET);
  assertEquals(calls.rpc[0][1].p_confirm_name, "김직원");
  assertEquals(calls.deleteUser.length, 1);
  assertEquals(calls.deleteUser[0], TARGET);
  assertEquals(calls.rpc[1][0], "record_account_hard_deleted");
  assertEquals(calls.rpc[1][1].p_user_id, TARGET);
});

Deno.test("confirm_name 앞뒤 공백은 트림해서 그대로 확인·표시에 쓴다", async () => {
  const { deps, calls } = makeMockDeps();
  const res = await handleRequest(
    makeReq({ user_id: TARGET, confirm_name: "  김직원  " }),
    deps,
  );
  assertEquals(res.status, 200);
  const body = await res.json();
  assertEquals(body.target_name, "김직원");
  assertEquals(calls.rpc[0][1].p_confirm_name, "김직원");
});

Deno.test("mapAssertError: 알려진 메시지를 한국어로 매핑한다", () => {
  assertEquals(
    mapAssertError("owner account cannot be hard-deleted").error,
    "owner_target_protected",
  );
  assertEquals(
    mapAssertError("cannot change your own employment status").error,
    "self_target",
  );
  const already = mapAssertError("account already hard-deleted");
  assertEquals(already.status, 409);
  assertEquals(already.error, "already_deleted");
});

Deno.test("mapAssertError: 알 수 없는 메시지는 400 rejected로 떨어진다", () => {
  const mapped = mapAssertError("something totally unexpected");
  assertEquals(mapped.status, 400);
  assertEquals(mapped.error, "rejected");
});

Deno.test("mapAssertError: JWT 관련 메시지는 401로 매핑한다", () => {
  const mapped = mapAssertError("JWT expired");
  assertEquals(mapped.status, 401);
  assertEquals(mapped.error, "unauthorized");
});

Deno.test("buildDepsFromEnv: 환경변수가 없으면 null(네트워크·클라이언트 생성 없음)", () => {
  const prevUrl = Deno.env.get("SUPABASE_URL");
  const prevAnon = Deno.env.get("SUPABASE_ANON_KEY");
  const prevService = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  Deno.env.delete("SUPABASE_URL");
  Deno.env.delete("SUPABASE_ANON_KEY");
  Deno.env.delete("SUPABASE_SERVICE_ROLE_KEY");
  try {
    assertEquals(buildDepsFromEnv(), null);
  } finally {
    if (prevUrl !== undefined) Deno.env.set("SUPABASE_URL", prevUrl);
    if (prevAnon !== undefined) Deno.env.set("SUPABASE_ANON_KEY", prevAnon);
    if (prevService !== undefined) {
      Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", prevService);
    }
  }
});

Deno.test("buildDepsFromEnv: 환경변수가 모두 있으면 deps 팩토리를 반환한다(클라이언트는 아직 만들지 않음)", () => {
  const prevUrl = Deno.env.get("SUPABASE_URL");
  const prevAnon = Deno.env.get("SUPABASE_ANON_KEY");
  const prevService = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  Deno.env.set("SUPABASE_URL", "https://example.supabase.co");
  Deno.env.set("SUPABASE_ANON_KEY", "test-anon-key");
  Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", "test-service-key");
  try {
    const deps = buildDepsFromEnv();
    assert(deps !== null, "deps가 null이면 안 됨");
    assertEquals(typeof deps?.makeCallerClient, "function");
    assertEquals(typeof deps?.makeAdminClient, "function");
  } finally {
    if (prevUrl === undefined) Deno.env.delete("SUPABASE_URL");
    else Deno.env.set("SUPABASE_URL", prevUrl);
    if (prevAnon === undefined) Deno.env.delete("SUPABASE_ANON_KEY");
    else Deno.env.set("SUPABASE_ANON_KEY", prevAnon);
    if (prevService === undefined) Deno.env.delete("SUPABASE_SERVICE_ROLE_KEY");
    else Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", prevService);
  }
});
