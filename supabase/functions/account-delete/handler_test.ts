import {
  type AccountDeleteDeps,
  type AdminClient,
  buildDepsFromEnv,
  type CallerClient,
  handleRequest,
  isAlreadyDeletedError,
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
  storageError: string | null;
  storageMoved: number;
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
      if (fn === "transfer_storage_objects_to_owner") {
        return Promise.resolve(
          overrides.storageError
            ? { data: null, error: { message: overrides.storageError } }
            : { data: overrides.storageMoved ?? 0, error: null },
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

// 재시도 시나리오 전용 목: 1차 호출은 삭제 성공 + 기록 실패(500), 2차 호출(재시도)은 deleteUser가
// "이미 없음"을 돌려주고(1차에서 실제로 지워졌으므로) 기록은 이번엔 성공한다. 같은 deps를 두 번
// handleRequest에 넘겨서 "같은 요청을 다시 보내면 성공한다"를 그대로 재현한다.
function makeRetryMockDeps() {
  const calls: {
    rpc: Array<[string, Record<string, unknown>]>;
    deleteUser: string[];
  } = { rpc: [], deleteUser: [] };
  let deleteAttempts = 0;
  let recordAttempts = 0;

  const callerClient: CallerClient = {
    rpc: (fn, args) => {
      calls.rpc.push([fn, args]);
      if (fn === "assert_can_hard_delete_account") {
        return Promise.resolve({
          data: "11111111-1111-1111-1111-111111111111",
          error: null,
        });
      }
      if (fn === "transfer_storage_objects_to_owner") {
        return Promise.resolve({ data: 0, error: null });
      }
      if (fn === "record_account_hard_deleted") {
        recordAttempts += 1;
        return Promise.resolve(
          recordAttempts === 1
            ? { data: null, error: { message: "db error" } }
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
          deleteAttempts += 1;
          return Promise.resolve(
            deleteAttempts === 1
              ? { data: { id }, error: null }
              : { data: null, error: { message: "User not found" } },
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

Deno.test("삭제는 성공했지만 기록 RPC가 실패하면 500과 함께 재시도 안내를 돌려준다", async () => {
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
  assert(
    typeof body.message === "string" && body.message.includes("이미 삭제") &&
      body.message.includes("다시 시도"),
    "삭제는 끝났고 재시도하면 된다는 안내가 있어야 함",
  );
  assertEquals(calls.deleteUser.length, 1, "삭제 자체는 이미 실행됐어야 함");
});

Deno.test("auth.admin.deleteUser가 이미 없다(not found)고 답하면 실패로 취급하지 않고 기록 단계로 넘어간다", async () => {
  const { deps, calls } = makeMockDeps({ deleteError: "User not found" });
  const res = await handleRequest(
    makeReq({ user_id: TARGET, confirm_name: "김직원" }),
    deps,
  );
  assertEquals(res.status, 200, "이미 삭제된 상태(not found)를 실패로 취급하면 안 됨");
  const body = await res.json();
  assertEquals(body.ok, true);
  const recordCalls = calls.rpc.filter(([fn]) =>
    fn === "record_account_hard_deleted"
  );
  assertEquals(recordCalls.length, 1, "not found여도 기록 RPC는 호출돼야 함");
});

Deno.test("재시도 흐름: 1차는 삭제 성공+기록 실패(500), 같은 요청을 다시 보내면 이번엔 성공(200)한다", async () => {
  const { deps, calls } = makeRetryMockDeps();

  const first = await handleRequest(
    makeReq({ user_id: TARGET, confirm_name: "김직원" }),
    deps,
  );
  assertEquals(first.status, 500);
  const firstBody = await first.json();
  assertEquals(firstBody.error, "record_failed_after_delete");

  const second = await handleRequest(
    makeReq({ user_id: TARGET, confirm_name: "김직원" }),
    deps,
  );
  assertEquals(second.status, 200, "재시도는 성공해야 함");
  const secondBody = await second.json();
  assertEquals(secondBody.ok, true);
  assertEquals(secondBody.target_user_id, TARGET);

  assertEquals(
    calls.deleteUser.length,
    2,
    "재시도도 deleteUser를 다시 부르고(이미 지워졌다는 응답을 받아) 넘어가야 함",
  );
  const recordCalls = calls.rpc.filter(([fn]) =>
    fn === "record_account_hard_deleted"
  );
  assertEquals(recordCalls.length, 2);
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

  assertEquals(
    calls.rpc.length,
    3,
    "assert -> storage 소유권 이전 -> record 세 번 호출돼야 함",
  );
  assertEquals(calls.rpc[0][0], "assert_can_hard_delete_account");
  assertEquals(calls.rpc[0][1].p_user_id, TARGET);
  assertEquals(calls.rpc[0][1].p_confirm_name, "김직원");
  assertEquals(calls.rpc[1][0], "transfer_storage_objects_to_owner");
  assertEquals(calls.rpc[1][1].p_user_id, TARGET);
  assertEquals(calls.deleteUser.length, 1);
  assertEquals(calls.deleteUser[0], TARGET);
  assertEquals(calls.rpc[2][0], "record_account_hard_deleted");
  assertEquals(calls.rpc[2][1].p_user_id, TARGET);
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

Deno.test("isAlreadyDeletedError: not found 계열 메시지를 인식한다", () => {
  assert(isAlreadyDeletedError("User not found"));
  assert(isAlreadyDeletedError("user_not_found"));
  assert(isAlreadyDeletedError("Not Found"));
  assert(!isAlreadyDeletedError("network error"));
  assert(!isAlreadyDeletedError("invalid service role key"));
});

/* ── 결함 1: 브라우저(hr.html)에서 부를 수 있어야 한다 — OPTIONS 사전요청 + CORS 헤더 ── */

const ALLOWED = "https://jung-plant.com";

// Response 본문을 읽지 않고 버리면 Deno가 리소스 누수로 시험을 실패시킨다.
async function drain(res: Response): Promise<void> {
  await res.arrayBuffer();
}

Deno.test("OPTIONS 사전요청은 허용 출처면 CORS 헤더와 함께 통과한다(405로 거절하면 안 됨)", async () => {
  const { deps, calls } = makeMockDeps();
  const res = await handleRequest(
    makeReq(null, { method: "OPTIONS", headers: { origin: ALLOWED } }),
    deps,
  );
  await drain(res);
  assert(
    res.status === 204 || res.status === 200,
    `사전요청이 ${res.status}로 거절됨 — 브라우저에서 함수를 부를 수 없다`,
  );
  assertEquals(res.headers.get("access-control-allow-origin"), ALLOWED);
  assert(
    (res.headers.get("access-control-allow-headers") ?? "").includes(
      "authorization",
    ),
    "authorization 헤더가 허용되지 않으면 JWT를 실어 보낼 수 없다",
  );
  assertEquals(calls.rpc.length, 0, "사전요청은 아무 RPC도 부르면 안 됨");
  assertEquals(calls.deleteUser.length, 0);
});

Deno.test("POST 성공 응답에도 CORS 헤더가 붙는다", async () => {
  const { deps } = makeMockDeps();
  const res = await handleRequest(
    makeReq({ user_id: TARGET, confirm_name: "김직원" }, {
      headers: { origin: ALLOWED },
    }),
    deps,
  );
  await drain(res);
  assertEquals(res.status, 200);
  assertEquals(res.headers.get("access-control-allow-origin"), ALLOWED);
});

Deno.test("POST 오류 응답에도 CORS 헤더가 붙는다(안 붙으면 브라우저가 본문을 못 읽어 안내가 사라진다)", async () => {
  const { deps } = makeMockDeps({ recordError: "db error" });
  const res = await handleRequest(
    makeReq({ user_id: TARGET, confirm_name: "김직원" }, {
      headers: { origin: ALLOWED },
    }),
    deps,
  );
  await drain(res);
  assertEquals(res.status, 500);
  assertEquals(res.headers.get("access-control-allow-origin"), ALLOWED);
});

Deno.test("허용 목록에 없는 출처에는 CORS 헤더를 붙이지 않는다(*로 열지 않는다)", async () => {
  for (
    const origin of [
      "https://evil.example.com",
      "https://jung-plant.com.evil.example.com",
      "http://jung-plant.com",
    ]
  ) {
    const { deps } = makeMockDeps();
    const res = await handleRequest(
      makeReq(null, { method: "OPTIONS", headers: { origin } }),
      deps,
    );
    await drain(res);
    assertEquals(
      res.headers.get("access-control-allow-origin"),
      null,
      `${origin}에 CORS 헤더가 붙었다`,
    );
  }
});

Deno.test("우리 출처 세 곳은 모두 허용한다", async () => {
  for (
    const origin of [
      "https://jung-plant.com",
      "https://www.jung-plant.com",
      "https://githittap.github.io",
    ]
  ) {
    const { deps } = makeMockDeps();
    const res = await handleRequest(
      makeReq(null, { method: "OPTIONS", headers: { origin } }),
      deps,
    );
    await drain(res);
    assertEquals(res.headers.get("access-control-allow-origin"), origin);
  }
});

/* ── 결함 2: 부분 성공을 화면이 구분할 수 있게 stage를 담아 응답한다 ── */

Deno.test("삭제 전 실패(가드 거절)는 stage=before_delete로 알린다", async () => {
  const { deps } = makeMockDeps({
    assertError: "account must be blocked before hard delete",
  });
  const res = await handleRequest(
    makeReq({ user_id: TARGET, confirm_name: "김직원" }),
    deps,
  );
  const body = await res.json();
  assertEquals(res.status, 409);
  assertEquals(body.stage, "before_delete");
});

Deno.test("auth 삭제 자체가 실패하면(아무것도 안 지워짐) stage=before_delete로 알린다", async () => {
  const { deps } = makeMockDeps({ deleteError: "network error" });
  const res = await handleRequest(
    makeReq({ user_id: TARGET, confirm_name: "김직원" }),
    deps,
  );
  const body = await res.json();
  assertEquals(res.status, 502);
  assertEquals(body.stage, "before_delete");
});

Deno.test("로그인은 지워졌고 기록만 실패하면 stage=deleted_record_failed로 알린다", async () => {
  const { deps } = makeMockDeps({ recordError: "db error" });
  const res = await handleRequest(
    makeReq({ user_id: TARGET, confirm_name: "김직원" }),
    deps,
  );
  const body = await res.json();
  assertEquals(res.status, 500);
  assertEquals(body.stage, "deleted_record_failed");
});

Deno.test("이미 영구 삭제된 계정이면 stage=already_deleted로 알린다", async () => {
  const { deps } = makeMockDeps({
    assertError: "account already hard-deleted",
  });
  const res = await handleRequest(
    makeReq({ user_id: TARGET, confirm_name: "김직원" }),
    deps,
  );
  const body = await res.json();
  assertEquals(res.status, 409);
  assertEquals(body.stage, "already_deleted");
});

Deno.test("mapAssertError: already_deleted만 already_deleted 단계이고 나머지는 before_delete", () => {
  assertEquals(mapAssertError("account already hard-deleted").stage, "already_deleted");
  assertEquals(mapAssertError("confirmation name mismatch").stage, "before_delete");
  assertEquals(mapAssertError("JWT expired").stage, "before_delete");
  assertEquals(mapAssertError("something totally unexpected").stage, "before_delete");
});

Deno.test("성공 응답은 '정상적으로 끝난다'고 약속하지 않는다(사실만 적는다)", async () => {
  const { deps } = makeMockDeps({ recordError: "db error" });
  const res = await handleRequest(
    makeReq({ user_id: TARGET, confirm_name: "김직원" }),
    deps,
  );
  const body = await res.json();
  assert(
    !String(body.message).includes("정상적으로 끝납니다"),
    "재시도가 반드시 성공한다고 약속하면 안 됨",
  );
});

/* ── 결함 3: Storage 객체를 소유한 직원도 삭제된다 — 삭제 전에 소유권을 원장에게 넘긴다 ── */

Deno.test("소유권 이전 RPC는 사전검증 통과 뒤·auth 삭제 전에 호출된다", async () => {
  const { deps, calls } = makeMockDeps({ storageMoved: 3 });
  const res = await handleRequest(
    makeReq({ user_id: TARGET, confirm_name: "김직원" }),
    deps,
  );
  await drain(res);
  const order = calls.rpc.map(([fn]) => fn);
  assertEquals(order[0], "assert_can_hard_delete_account");
  assertEquals(
    order[1],
    "transfer_storage_objects_to_owner",
    "소유권 이전이 사전검증 바로 뒤에 와야 함",
  );
  assertEquals(calls.deleteUser.length, 1, "이전이 성공했으면 삭제까지 진행해야 함");
});

Deno.test("소유권 이전이 실패하면 삭제를 시작하지 않고 무엇을 해야 하는지 알린다", async () => {
  const { deps, calls } = makeMockDeps({
    storageError: "storage ownership transfer incomplete; auth delete would fail",
  });
  const res = await handleRequest(
    makeReq({ user_id: TARGET, confirm_name: "김직원" }),
    deps,
  );
  const body = await res.json();
  assertEquals(calls.deleteUser.length, 0, "이전 실패인데 삭제를 시도했다");
  assertEquals(
    calls.rpc.filter(([fn]) => fn === "record_account_hard_deleted").length,
    0,
  );
  assertEquals(body.ok, false);
  assertEquals(body.error, "storage_transfer_failed");
  assertEquals(body.stage, "before_delete");
  assert(
    String(body.message).includes("파일"),
    "무엇이 문제인지(직원이 올린 파일의 소유권) 알려야 함",
  );
  assert(
    !String(body.message).includes("삭제하세요") &&
      !String(body.message).includes("파일을 지"),
    "증빙 파일 삭제를 해결책으로 안내하면 안 됨",
  );
});

Deno.test("옮긴 Storage 객체 수를 감사 기록 메모로 남기고 응답에도 담는다", async () => {
  const { deps, calls } = makeMockDeps({ storageMoved: 2 });
  const res = await handleRequest(
    makeReq({ user_id: TARGET, confirm_name: "김직원" }),
    deps,
  );
  const body = await res.json();
  assertEquals(res.status, 200);
  assertEquals(body.storage_objects_transferred, 2);
  const record = calls.rpc.find(([fn]) => fn === "record_account_hard_deleted");
  assert(record, "기록 RPC가 호출되지 않음");
  assert(
    String(record?.[1].p_note ?? "").includes("2"),
    "이전한 건수가 감사 기록 메모에 남아야 함",
  );
});

Deno.test("옮길 Storage 객체가 없으면 메모 없이(null) 기록한다", async () => {
  const { deps, calls } = makeMockDeps({ storageMoved: 0 });
  const res = await handleRequest(
    makeReq({ user_id: TARGET, confirm_name: "김직원" }),
    deps,
  );
  const body = await res.json();
  assertEquals(body.storage_objects_transferred, 0);
  const record = calls.rpc.find(([fn]) => fn === "record_account_hard_deleted");
  assertEquals(record?.[1].p_note, null);
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
