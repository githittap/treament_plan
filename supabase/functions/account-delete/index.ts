// Deploy only with verify_jwt:true (supabase/config.toml). Caller must be the browser session of an active
// approved owner (hr.html) — the platform gateway already verifies the JWT before this code runs.
//
// 퇴사자 로그인 계정을 auth.users에서 영구 삭제한다. public.profiles와 그 아래 근무 기록
// (근태·연차·계약·급여·서명·감사이력)은 db/account_hard_delete_draft.sql이 이미 FK를 끊어 두었으므로 그대로 남는다.
//
// 순서(각 단계는 실패하면 다음 단계로 넘어가지 않는다):
//   1) assert_can_hard_delete_account — 호출자 자신의 세션(캐스팅한 Authorization)으로 호출한다.
//      auth.uid()가 PostgREST에서 그대로 검증되므로, 여기서 통과했다는 것은 "활성 승인된 원장이 이미 차단된
//      비원장 계정을, 이름을 정확히 확인하고" 요청했다는 뜻이다. 어떤 행도 바꾸지 않는다.
//   2) transfer_storage_objects_to_owner — 대상이 소유한 storage.objects의 소유자만 요청한 원장으로 넘긴다.
//      파일은 하나도 지우지 않는다. 이걸 건너뛰면 storage.objects.owner의 auth.users FK 때문에 3)이 반드시 실패한다.
//   3) auth.admin.deleteUser — 이 호출만 서비스 롤 키가 필요하다(GoTrue 관리자 API).
//   4) record_account_hard_deleted — 다시 호출자 세션으로, profiles.auth_deleted_at/by와
//      profile_employment_history에 "기록만" 남긴다(행 삭제 없음). 소유권 이전 건수를 감사 메모로 함께 남긴다.
//
// 응답에는 stage(before_delete | deleted_record_failed | already_deleted)를 담아, 화면이 "무엇이 이미
// 지워졌는지"를 구분해 안내할 수 있게 한다. 모든 응답에 CORS 헤더를 붙인다(허용 출처만).
import { createClient } from "npm:@supabase/supabase-js@2";

const MAX_BODY_BYTES = 4096;

export type RpcResult = { data: unknown; error: { message: string } | null };

export interface CallerClient {
  rpc: (fn: string, args: Record<string, unknown>) => Promise<RpcResult>;
}

export interface AdminClient {
  auth: {
    admin: {
      deleteUser: (
        id: string,
      ) => Promise<{ data: unknown; error: { message: string } | null }>;
    };
  };
}

export interface AccountDeleteDeps {
  makeCallerClient: (authHeader: string) => CallerClient;
  makeAdminClient: () => AdminClient;
}

// deps를 주지 않은 실제 배포 환경에서만 호출된다 — 환경변수가 없으면 null을 돌려주고, 있어도 실제 클라이언트는
// 나중에(호출 시점에) 만든다. 그래서 시험은 deps를 주입해 이 함수와 Deno.env/네트워크를 아예 타지 않는다.
export function buildDepsFromEnv(): AccountDeleteDeps | null {
  const url = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !anonKey || !serviceKey) return null;
  return {
    makeCallerClient: (authHeader: string) =>
      createClient(url, anonKey, {
        auth: { persistSession: false },
        global: { headers: { Authorization: authHeader } },
      }) as unknown as CallerClient,
    makeAdminClient: () =>
      createClient(url, serviceKey, {
        auth: { persistSession: false },
      }) as unknown as AdminClient,
  };
}

// hr.html(jung-plant.com)은 브라우저에서 functions.invoke로 이 함수를 부른다 — 사전요청(OPTIONS)을 통과시키고
// 모든 응답에 CORS 헤더를 붙여야 한다. 특히 오류 응답에 헤더가 없으면 브라우저가 본문을 못 읽어
// "부분 성공"(로그인은 지워졌고 기록만 실패) 안내가 화면에서 사라진다.
// contract-pdf-sign과 같은 헤더 구성을 쓰되, 허용 출처는 "*"로 열지 않고 우리 출처만 반사한다.
const ALLOWED_ORIGINS = [
  "https://jung-plant.com",
  "https://www.jung-plant.com",
  "https://githittap.github.io",
];

export function corsHeaders(origin: string | null): Record<string, string> {
  if (!origin || !ALLOWED_ORIGINS.includes(origin)) return {};
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
}

function json(
  status: number,
  body: Record<string, unknown>,
  cors: Record<string, string> = {},
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "content-type": "application/json; charset=utf-8" },
  });
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// 화면이 "무엇이 이미 지워졌는지"를 구분해 안내할 수 있게 단계를 함께 내려보낸다.
//   before_delete        — 아직 아무것도 지워지지 않았다(그대로 다시 시도하면 된다).
//   deleted_record_failed — 로그인 계정은 이미 지워졌고(되돌릴 수 없다) 기록만 실패했다.
//   already_deleted       — 이미 영구 삭제가 끝난 계정이다(추가로 지워진 것은 없다).
export type DeleteStage =
  | "before_delete"
  | "deleted_record_failed"
  | "already_deleted";

type ErrorMap = {
  status: number;
  error: string;
  message: string;
  stage: DeleteStage;
};

// public.assert_can_hard_delete_account / assert_employment_owner가 raise exception으로 내보내는 메시지를
// 원장이 바로 이해할 한국어로 옮긴다. 순서가 곧 우선순위(먼저 매치되는 것을 쓴다).
const ASSERT_ERROR_MAP: Array<[string, Omit<ErrorMap, "stage">]> = [
  ["employee hub access required", {
    status: 403,
    error: "access_blocked",
    message: "권한이 없습니다. 호출자 계정이 차단됐거나 접근 권한이 없습니다.",
  }],
  ["active approved owner required", {
    status: 403,
    error: "owner_required",
    message: "활성 승인된 원장만 로그인 계정을 삭제할 수 있습니다.",
  }],
  ["profile not found", {
    status: 404,
    error: "target_not_found",
    message: "대상 직원 프로필을 찾을 수 없습니다.",
  }],
  ["cannot change last active owner", {
    status: 409,
    error: "last_owner_protected",
    message: "마지막 활성 원장 계정은 삭제할 수 없습니다.",
  }],
  ["cannot change your own employment status", {
    status: 400,
    error: "self_target",
    message: "본인 계정은 이 기능으로 삭제할 수 없습니다.",
  }],
  ["owner account cannot be hard-deleted", {
    status: 403,
    error: "owner_target_protected",
    message: "원장 계정은 이 기능으로 삭제할 수 없습니다.",
  }],
  ["account must be blocked before hard delete", {
    status: 409,
    error: "not_blocked",
    message: "먼저 계정을 차단한 뒤에만 삭제할 수 있습니다.",
  }],
  ["account already hard-deleted", {
    status: 409,
    error: "already_deleted",
    message: "이미 영구 삭제된 계정입니다.",
  }],
  ["confirmation name mismatch", {
    status: 400,
    error: "confirm_mismatch",
    message: "확인 문구가 대상자 이름과 정확히 일치하지 않습니다.",
  }],
];

export function mapAssertError(rawMessage: string): ErrorMap {
  // 사전 검증은 어떤 행도 바꾸지 않으므로, 여기서 나온 거절은 already_deleted 하나만 빼고
  // 전부 "아직 아무것도 지워지지 않았다"(before_delete)에 해당한다.
  const hit = ASSERT_ERROR_MAP.find(([needle]) => rawMessage.includes(needle));
  if (hit) {
    return {
      ...hit[1],
      stage: hit[1].error === "already_deleted"
        ? "already_deleted"
        : "before_delete",
    };
  }
  if (/jwt|token/i.test(rawMessage)) {
    return {
      status: 401,
      error: "unauthorized",
      message: "인증이 만료됐거나 올바르지 않습니다. 다시 로그인해 주세요.",
      stage: "before_delete",
    };
  }
  return {
    status: 400,
    error: "rejected",
    message: "요청을 처리할 수 없습니다: " + rawMessage,
    stage: "before_delete",
  };
}

// GoTrue의 auth.admin.deleteUser()는 이미 없는 사용자에게 "not found" 계열 오류를 준다.
// 재시도 흐름(삭제는 이전 시도에서 이미 끝났고 기록만 실패했던 경우)에서 이 오류는 실패가 아니라
// "이미 삭제된 상태"라는 뜻이다.
export function isAlreadyDeletedError(rawMessage: string): boolean {
  return /not[\s_-]?found/i.test(rawMessage);
}

export async function handleRequest(
  req: Request,
  deps?: AccountDeleteDeps,
): Promise<Response> {
  const cors = corsHeaders(req.headers.get("origin"));

  // 사전요청(preflight)은 브라우저가 실제 POST 전에 자동으로 보낸다 — 여기서 막으면 함수를 부를 수 없다.
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: cors });
  }

  if (req.method !== "POST") {
    return json(405, {
      ok: false,
      error: "method_not_allowed",
      message: "POST 요청만 허용합니다.",
      stage: "before_delete",
    }, cors);
  }

  const authHeader = req.headers.get("authorization") ??
    req.headers.get("Authorization");
  if (!authHeader || !/^Bearer\s+.+/i.test(authHeader)) {
    return json(401, {
      ok: false,
      error: "unauthorized",
      message: "인증 정보가 없습니다.",
      stage: "before_delete",
    }, cors);
  }

  if (Number(req.headers.get("content-length") || 0) > MAX_BODY_BYTES) {
    return json(413, {
      ok: false,
      error: "payload_too_large",
      message: "요청 본문이 너무 큽니다.",
      stage: "before_delete",
    }, cors);
  }

  const raw = await req.text();
  if (new TextEncoder().encode(raw).length > MAX_BODY_BYTES) {
    return json(413, {
      ok: false,
      error: "payload_too_large",
      message: "요청 본문이 너무 큽니다.",
      stage: "before_delete",
    }, cors);
  }

  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return json(400, {
      ok: false,
      error: "invalid_body",
      message: "요청 본문이 올바른 JSON이 아닙니다.",
      stage: "before_delete",
    }, cors);
  }

  const record = typeof body === "object" && body !== null
    ? body as Record<string, unknown>
    : {};
  const userId = typeof record.user_id === "string" ? record.user_id : "";
  const confirmName = typeof record.confirm_name === "string"
    ? record.confirm_name.trim()
    : "";

  if (!UUID_RE.test(userId) || confirmName === "") {
    return json(400, {
      ok: false,
      error: "invalid_body",
      message: "user_id(uuid)와 confirm_name(대상자 이름)을 정확히 입력하세요.",
      stage: "before_delete",
    }, cors);
  }

  const activeDeps = deps ?? buildDepsFromEnv();
  if (!activeDeps) {
    return json(500, {
      ok: false,
      error: "server_config",
      message: "서버 설정 오류입니다. 관리자에게 문의하세요.",
      stage: "before_delete",
    }, cors);
  }

  const callerClient = activeDeps.makeCallerClient(authHeader);

  const assertResult = await callerClient.rpc("assert_can_hard_delete_account", {
    p_user_id: userId,
    p_confirm_name: confirmName,
  });
  if (assertResult.error) {
    const mapped = mapAssertError(assertResult.error.message);
    return json(mapped.status, {
      ok: false,
      error: mapped.error,
      message: mapped.message,
      stage: mapped.stage,
    }, cors);
  }

  // 직원이 자기 세션으로 올린 파일(개인서명·서류·연차 증빙)은 storage.objects.owner가 본인이고,
  // 그 칼럼이 auth.users를 참조하므로 소유권이 남아 있으면 아래 deleteUser가 반드시 실패한다.
  // 그래서 삭제를 시작하기 "전에" 소유권만 요청한 원장 계정으로 넘긴다(파일 자체는 그대로 둔다).
  // 이전이 실패하면 아무것도 지우지 않은 상태로 멈춘다 — 증빙 파일 삭제는 절대 해결책이 아니다.
  const transferResult = await callerClient.rpc(
    "transfer_storage_objects_to_owner",
    { p_user_id: userId },
  );
  if (transferResult.error) {
    return json(409, {
      ok: false,
      error: "storage_transfer_failed",
      message:
        "이 직원이 올린 파일의 소유권을 원장 계정으로 넘기지 못해, 로그인 계정 삭제를 시작하지 않았습니다. 아무것도 지워지지 않았으니 잠시 후 다시 시도하고, 계속 같은 증상이면 관리자에게 문의하세요. (" +
        transferResult.error.message + ")",
      stage: "before_delete",
    }, cors);
  }
  const transferred = typeof transferResult.data === "number"
    ? transferResult.data
    : 0;

  const adminClient = activeDeps.makeAdminClient();
  const deleteResult = await adminClient.auth.admin.deleteUser(userId);
  // "이미 없는 사용자" 오류는 실패가 아니다 — 이전 시도에서 삭제 자체는 이미 끝났고 기록만 실패했을 수 있다.
  // 그 경우 재시도가 여기서 다시 deleteUser를 부르면 GoTrue가 "없는 사용자"라고 답하는 게 정상이므로,
  // 이걸 진짜 실패로 취급하면 재시도가 영영 성공할 수 없다. record 단계에서 auth.users 존재 여부를
  // 다시 확인하므로(하드닝), 여기서는 진행만 시키고 최종 안전판은 그 RPC가 맡는다.
  if (deleteResult.error && !isAlreadyDeletedError(deleteResult.error.message)) {
    // deleteUser가 실패했다는 것은 로그인 계정이 아직 그대로 있다는 뜻이다 — 아무것도 지워지지 않았다.
    return json(502, {
      ok: false,
      error: "auth_delete_failed",
      message:
        "로그인 계정 삭제에 실패했습니다. 아무것도 지워지지 않았으니 잠시 후 다시 시도하거나 관리자에게 문의하세요.",
      stage: "before_delete",
    }, cors);
  }

  const recordResult = await callerClient.rpc("record_account_hard_deleted", {
    p_user_id: userId,
    p_note: transferred > 0
      ? `Storage 객체 ${transferred}건 소유권을 원장 계정으로 이전`
      : null,
  });
  if (recordResult.error) {
    // 여기부터는 로그인 계정이 실제로 지워진 뒤다 — 되돌릴 수 없다. 화면이 이걸 "실패"로만 보여주면 안 된다.
    return json(500, {
      ok: false,
      error: "record_failed_after_delete",
      message:
        "로그인 계정은 이미 삭제됐습니다(되돌릴 수 없습니다). 기록 저장에만 실패했으니, 같은 요청으로 다시 시도해 주세요 — 재시도하면 남은 기록만 채웁니다.",
      stage: "deleted_record_failed",
      target_user_id: userId,
      target_name: confirmName,
      storage_objects_transferred: transferred,
    }, cors);
  }

  return json(200, {
    ok: true,
    message: `${confirmName}님의 로그인 계정을 영구 삭제했습니다. 근무 기록은 그대로 보존됩니다.` +
      (transferred > 0
        ? ` (올린 파일 ${transferred}건은 지우지 않고 소유권만 원장 계정으로 옮겼습니다.)`
        : ""),
    target_user_id: userId,
    target_name: confirmName,
    deleted_at: new Date().toISOString(),
    storage_objects_transferred: transferred,
  }, cors);
}

if (import.meta.main) {
  Deno.serve((req) => handleRequest(req));
}
