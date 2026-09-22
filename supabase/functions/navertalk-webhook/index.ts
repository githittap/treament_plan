// Deploy with `supabase functions deploy navertalk-webhook --no-verify-jwt` (config.toml also sets verify_jwt=false).
// 네이버 톡톡(챗봇API)은 웹훅에 서명을 제공하지 않는다(공식 문서 확인) — ?token= 값이 유일한 수신 인증이며,
// public.webhook_secrets(name='navertalk_webhook_sha256')의 SHA-256 해시와 상수시간 비교한다(ai-usage-sync와 같은 패턴).
// send(고객 메시지)만 기존 consultation_inbox_ingest_service RPC로 저장한다(source='naver_talktalk').
// echo(상담사 수동 발송)·open·leave·friend 등은 현재 문의함이 발신 메시지를 담지 않으므로 200 no-op.
// 메시지 원문과 토큰은 어떤 경로로도 로그에 남기지 않는다.
import { createClient } from "npm:@supabase/supabase-js@2.110.9";
import { handleNaverTalkTalkWebhook, type WebhookDeps } from "./core.ts";
import { sameHex, sha256Hex } from "./payload.mjs";

Deno.serve(async (req) => {
  const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  if (!supabaseUrl || !serviceKey) {
    return new Response(JSON.stringify({ error: "server_config" }), {
      status: 500,
      headers: { "content-type": "application/json" },
    });
  }
  const sb = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false },
    global: { headers: { Authorization: `Bearer ${serviceKey}` } },
  });

  const deps: WebhookDeps = {
    verifyToken: async (token) => {
      if (token.length < 32 || token.length > 256) return false;
      const { data, error } = await sb
        .from("webhook_secrets")
        .select("value")
        .eq("name", "navertalk_webhook_sha256")
        .maybeSingle();
      if (error || !data?.value) return false;
      return sameHex(await sha256Hex(token), String(data.value));
    },
    ingestConsultation: async ({ eventId, contact, message }) => {
      const { error } = await sb.rpc("consultation_inbox_ingest_service", {
        p_source: "naver_talktalk",
        p_event_id: eventId,
        p_received_at: null,
        p_sender_name: null,
        p_contact: contact,
        p_subject: null,
        p_message: message,
      });
      return { ok: !error };
    },
  };

  return handleNaverTalkTalkWebhook(req, deps);
});
