// 순수 오케스트레이션: Supabase 클라이언트를 직접 참조하지 않고 WebhookDeps로 주입받는다.
// index.ts가 실제 supabase-js를 연결하고, deno test는 네트워크 없는 모의(mock) deps로 이 함수만 부른다
// (push-dispatcher/dispatcher_core.ts와 같은 구조).
import { classifySendEvent, MAX_BODY_BYTES, parseNaverEvent, sha256Hex } from "./payload.mjs";

export interface WebhookDeps {
  // ?token= 값을 webhook_secrets의 SHA-256 해시와 상수시간 비교한다. 토큰 원문·비교 결과 상세는 로깅하지 않는다.
  verifyToken(token: string): Promise<boolean>;
  // consultation_inbox_ingest_service RPC 호출. eventId가 같으면(재전송) 같은 행을 가리켜 중복 저장되지 않는다.
  ingestConsultation(
    params: { eventId: string; contact: string; message: string },
  ): Promise<{ ok: boolean }>;
}

function json(body: Record<string, unknown>, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

// 네이버 톡톡은 연결 3초·읽기 5초 안에 HTTP 200을 요구한다(공식 스펙). 이 함수는 그 안에 끝나도록
// RPC 호출 한 번만 하고 체이닝된 외부 호출을 하지 않는다. 메시지 원문·토큰은 어떤 경로로도 로그에 남기지 않는다.
export async function handleNaverTalkTalkWebhook(
  req: Request,
  deps: WebhookDeps,
): Promise<Response> {
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  if (Number(req.headers.get("content-length") || 0) > MAX_BODY_BYTES) {
    return json({ error: "payload_too_large" }, 413);
  }

  const token = new URL(req.url).searchParams.get("token") || "";
  if (!token || !(await deps.verifyToken(token))) return json({ error: "unauthorized" }, 401);

  const raw = await req.text();
  if (new TextEncoder().encode(raw).length > MAX_BODY_BYTES) {
    return json({ error: "payload_too_large" }, 413);
  }

  const parsed = parseNaverEvent(raw);
  if (!parsed.ok) return json({ error: "invalid_body" }, 400);

  // echo(상담사가 파트너센터에서 수동 발송한 메시지)는 현재 문의함 모델이 발신 메시지를 담을 자리가 없어 저장하지
  // 않는다. open/leave/friend/action/persistentMenu와 그 외 모든 미지 이벤트도 200 no-op.
  if (parsed.value.event !== "send") {
    return json({ ok: true, ignored: parsed.value.event }, 200);
  }

  const extracted = classifySendEvent(parsed.value);
  if (!extracted) return json({ ok: true, ignored: "empty_content" }, 200);

  // 이벤트 고유 ID가 없는 스펙이라 원문 바이트 해시를 멱등키로 쓴다: 같은 배달 재시도(동일 바이트)는 안전하게
  // 중복 없이 병합되지만, 같은 사용자가 똑같은 텍스트를 시간 간격을 두고 두 번 보내면(예: "네" 두 번) 구분할
  // 시각·메시지ID가 스펙에 없어 한 행으로 합쳐진다 — 네이버 쪽 스펙 자체의 한계이며 우리 쪽 버그가 아니다.
  const eventId = await sha256Hex(raw);
  const result = await deps.ingestConsultation({
    eventId,
    contact: extracted.contact,
    message: extracted.message,
  });
  return json({ ok: result.ok }, result.ok ? 200 : 500);
}
