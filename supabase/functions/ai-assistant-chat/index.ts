// supabase/functions/ai-assistant-chat/index.ts — 직원허브 AI 도우미 1단계 Edge 함수.
// 설계서_1단계.md 3장의 계약대로: action으로 chat/list_models/test_model을 나누고, 비밀키는 서버(Edge 환경변수)에만 둔다.
// 구조는 supabase/functions/contract-pdf-sign/index.ts(사용자 JWT형: CORS·OPTIONS·userClient.auth.getUser())를 따른다.
import { createClient } from "npm:@supabase/supabase-js@2.57.4";
import {
  buildSystemPrompt,
  estimateCostUsd,
  errorMessageFor,
  httpStatusForError,
  publicErrorKind,
  shouldFallback,
  validateMessages,
} from "./core.mjs";
import { apiKeyFor, baseUrlFor, callModel, listModelsFor } from "./providers.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

const DEFAULT_PROVIDERS = ["anthropic", "openai", "deepseek", "stepfun", "moonshot", "google", "xai"];
const RATE_LIMIT_PER_HOUR = 120;
const TEST_MODEL_MESSAGE = "안녕하세요라고만 답하세요";

function fail(errorKind: string) {
  return { ok: false as const, error_kind: errorKind, message: errorMessageFor(errorKind), status: httpStatusForError(errorKind) };
}

export function createAiAssistantChatHandler(deps: { createClient?: any; env?: (name: string) => string | undefined; callModel?: any; listModelsFor?: any } = {}) {
  const supabaseCreateClient = deps.createClient ?? createClient;
  const readEnv = deps.env ?? ((name: string) => Deno.env.get(name));
  const doCallModel = deps.callModel ?? callModel;
  const doListModels = deps.listModelsFor ?? listModelsFor;
  /**
   * 회사 설정 찾기. 결과는 세 가지다.
   * - row: 표(ai_providers)에 켜진 행이 있음 → 그 주소·열쇠 이름을 쓴다.
   * - disabled: 표에 행이 있고 꺼져 있음(원장이 끔) → 그 회사는 호출하지 않는다.
   * - builtin: 표를 못 읽었거나(2단계 DB 적용 전·일시 오류) 행이 없음 → 내장 6곳 값을 쓴다.
   */
  async function providerLookup(admin: any, provider: string): Promise<{ state: "row"; cfg: any } | { state: "disabled" } | { state: "builtin" }> {
    try {
      const { data, error } = await admin.from("ai_providers").select("*").eq("id", provider).maybeSingle();
      if (error || !data) return { state: "builtin" };
      if (!data.enabled) return { state: "disabled" };
      const valid = data.kind &&
        /^https:\/\/[^\s]+$/.test(data.base_url || "") &&
        /^[A-Z][A-Z0-9_]{1,60}_API_KEY$/.test(data.key_env || "") &&
        !String(data.key_env).startsWith("SUPABASE");
      return valid ? { state: "row", cfg: data } : { state: "builtin" };
    } catch {
      return { state: "builtin" };
    }
  }

  return async (req: Request) => {
    if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
    if (req.method !== "POST") return json({ ok: false, error_kind: "invalid_input", message: "POST required" }, 405);

    const url = readEnv("SUPABASE_URL");
    const serviceKey = readEnv("SUPABASE_SERVICE_ROLE_KEY");
    const anonKey = readEnv("SUPABASE_ANON_KEY");
    const authHeader = req.headers.get("Authorization");
    if (!authHeader || !url || !serviceKey || !anonKey) return json({ ok: false, error_kind: "unknown", message: "server configuration unavailable" }, 500);

    const userClient = supabaseCreateClient(url, anonKey, { global: { headers: { Authorization: authHeader } } });
    const admin = supabaseCreateClient(url, serviceKey);

    try {
      const { data: { user }, error: userError } = await userClient.auth.getUser();
      if (userError || !user) return json(fail("unauthenticated"), 401);

      const { data: hubOk } = await userClient.rpc("employee_hub_access_allowed");
      if (!hubOk) return json(fail("hub_access_denied"), 403);

      const { data: profile, error: profileError } = await admin.from("profiles").select("role,approved").eq("user_id", user.id).maybeSingle();
      if (profileError || !profile) return json(fail("hub_access_denied"), 403);
      const role = profile.role || "staff";
      const isOwner = role === "owner";

      const body = await req.json().catch(() => ({}));
      const action = body?.action;

      if (action === "list_models") {
        if (!isOwner) return json(fail("forbidden_role"), 403);
        let providersList = DEFAULT_PROVIDERS;
        try { const pr = await admin.from("ai_providers").select("id,key_env,base_url,enabled,sort_order").eq("enabled", true).order("sort_order"); if (pr.data?.length) providersList = pr.data.map((x: any) => x.id); } catch { /* legacy fallback */ }
        const wanted = body?.provider && providersList.includes(body.provider) ? [body.provider] : providersList;
        const providers: Record<string, string[]> = {};
        const errors: Record<string, string> = {};
        for (const provider of wanted) {
          const lookup = await providerLookup(admin, provider);
          const cfg = lookup.state === "row" ? lookup.cfg : null;
          const apiKey = apiKeyFor(provider, readEnv, cfg?.key_env);
          const result = await doListModels(provider, apiKey, cfg?.base_url || baseUrlFor(provider, readEnv));
          if (result.ok) providers[provider] = result.ids;
          else errors[provider] = publicErrorKind(result.reason);
        }
        return json({ ok: true, providers, errors });
      }

      if (action === "provider_status") {
        // 원장 전용. 회사마다 「서버에 열쇠가 등록돼 있는지」만 돌려준다(열쇠 값·길이·앞글자는 절대 주지 않음).
        if (!isOwner) return json(fail("forbidden_role"), 403);
        let rows: Array<{ id: string; key_env?: string }> = [];
        try {
          const pr = await admin.from("ai_providers").select("id,key_env").order("sort_order");
          if (!pr.error && Array.isArray(pr.data) && pr.data.length) rows = pr.data;
        } catch { /* 2단계 DB 적용 전이면 내장 회사 목록으로 */ }
        if (!rows.length) rows = DEFAULT_PROVIDERS.map((id) => ({ id }));
        return json({ ok: true, providers: rows.map((r) => ({ id: r.id, configured: !!apiKeyFor(r.id, readEnv, r.key_env) })) });
      }

      if (action === "test_model") {
        if (!isOwner) return json(fail("forbidden_role"), 403);
        const modelRef = body?.model_ref;
        if (!modelRef) return json(fail("invalid_input"), 400);
        const { data: model, error: modelError } = await admin.from("ai_models").select("*").eq("id", modelRef).maybeSingle();
        if (modelError || !model) return json(fail("model_not_set"), 404);
        const lookup = await providerLookup(admin, model.provider);
        if (lookup.state === "disabled") return json({ ok: false, latency_ms: 0, error_kind: "provider_disabled", message: errorMessageFor("provider_disabled") });
        const cfg = lookup.state === "row" ? lookup.cfg : null;
        const apiKey = apiKeyFor(model.provider, readEnv, cfg?.key_env);
        const startedAt = Date.now();
        const result = await doCallModel({
          provider: model.provider,
          apiKey,
          baseUrl: cfg?.base_url || baseUrlFor(model.provider, readEnv),
          modelId: model.model_id,
          system: "간단히 답하는 시험 호출입니다.",
          messages: [{ role: "user", content: TEST_MODEL_MESSAGE }],
          maxOutputTokens: 64,
          effort: null,
          timeoutMs: 20000,
        });
        const latencyMs = Date.now() - startedAt;
        if (!result.ok) {
          const kind = publicErrorKind(result.reason);
          return json({ ok: false, latency_ms: latencyMs, error_kind: kind, message: errorMessageFor(kind) });
        }
        return json({ ok: true, latency_ms: latencyMs, text: result.text });
      }

      if (action !== "chat") return json(fail("invalid_input"), 400);

      // --- 4. 입력 검사 ---
      const validated = validateMessages(body?.messages);
      if (!validated.ok) return json(fail(validated.error_kind), httpStatusForError(validated.error_kind));
      const assistantId = body?.assistant_id;
      // 대화 번호는 2단계 화면이 보낸다. 옛 화면(번호 없음)도 정상으로 답하되 대화 저장만 건너뛴다. 번호가 왔는데 모양이 틀리면 거절한다.
      const rawConversationId = body?.conversation_id;
      const hasConversationId = rawConversationId !== undefined && rawConversationId !== null && rawConversationId !== "";
      if (!assistantId || (hasConversationId && !/^[0-9a-f-]{36}$/i.test(String(rawConversationId)))) return json(fail("invalid_input"), 400);
      const conversationId: string | null = hasConversationId ? String(rawConversationId) : null;

      // --- 5. 도우미 읽기 ---
      const { data: assistant, error: assistantError } = await admin.from("ai_assistants").select("*").eq("id", assistantId).maybeSingle();
      if (assistantError || !assistant) return json(fail("assistant_not_found"), 404);
      if (!isOwner) {
        if (!assistant.enabled) return json(fail("assistant_disabled"), 403);
        if (!Array.isArray(assistant.visible_roles) || !assistant.visible_roles.includes(role)) return json(fail("forbidden_role"), 403);
      }

      // --- 6. 모델 결정 ---
      if (!assistant.model_ref) return json(fail("model_not_set"), 409);
      const { data: primaryModel } = await admin.from("ai_models").select("*").eq("id", assistant.model_ref).maybeSingle();
      if (!primaryModel) return json(fail("model_not_set"), 409);
      if (!primaryModel.enabled) return json(fail("model_disabled"), 409);
      let fallbackModel: any = null;
      if (assistant.fallback_model_ref) {
        const { data: fm } = await admin.from("ai_models").select("*").eq("id", assistant.fallback_model_ref).maybeSingle();
        if (fm && fm.enabled) fallbackModel = fm;
      }

      // --- 8. 시스템 프롬프트 ---
      const system = buildSystemPrompt(assistant.instructions, assistant.knowledge);
      const messages = validated.messages;
      const userMessage = messages[messages.length - 1];
      const userText = typeof userMessage.content === "string" ? userMessage.content : userMessage.content.filter((p: any) => p.type === "text").map((p: any) => p.text).join("\n");
      const imageCount = Array.isArray(userMessage.content) ? userMessage.content.filter((p: any) => p.type === "image_url" || p.type === "image").length : 0;
      if (conversationId) {
        const prior = await admin.from("ai_assistant_conversations").select("user_id,assistant_id").eq("id", conversationId).maybeSingle();
        if (prior.error) return json(fail("usage_unavailable"), 503);
        if (prior.data && (prior.data.user_id !== user.id || prior.data.assistant_id !== assistant.id)) return json(fail("forbidden_role"), 403);
      }
      async function saveConversation(reply: string, status: "ok" | "error", model: any = null, fallback: boolean = false, usageId: number | null = null) {
        if (!conversationId) return; // 옛 화면: 대화 번호가 없으면 저장하지 않는다.
        try {
          const now = new Date().toISOString();
          const { error: convError } = await admin.from("ai_assistant_conversations").upsert({ id: conversationId, user_id: user.id, assistant_id: assistant.id, assistant_name: assistant.name, last_at: now }, { onConflict: "id" });
          if (convError) throw convError;
          const { error } = await admin.from("ai_assistant_messages").insert([
            { conversation_id: conversationId, role: "user", content: userText, image_count: imageCount, status: "ok" },
            { conversation_id: conversationId, role: "assistant", content: reply, provider: model?.provider || null, model_id: model?.model_id || null, fallback_used: fallback, status, usage_id: usageId },
          ]);
          if (error) throw error;
        } catch (e) { console.error("ai_assistant_conversation save failed", e instanceof Error ? e.message : "unknown"); }
      }

      // --- 7. 과다 사용 막기 + 사용 기록: 시도마다(1차·예비 각각) DB 예약 RPC로 「한도 확인 + pending 행」을 한 번에(사용자별 잠금)
      //     하고, 호출이 끝나면 같은 행을 결과로 update한다. 예약이 실패하면 AI를 부르지 않는다(fail closed).
      async function reserveUsage(model: any): Promise<{ ok: true; id: number } | { ok: false; kind: string }> {
        const { data, error } = await admin.rpc("ai_usage_reserve", {
          p_user: user.id,
          p_assistant: assistant.id,
          p_assistant_name: assistant.name,
          p_provider: model.provider,
          p_model_id: model.model_id,
          p_limit: RATE_LIMIT_PER_HOUR,
        });
        if (error) {
          if (error.message === "rate_limited") return { ok: false, kind: "rate_limited" };
          console.error("ai_usage_reserve failed", error.code, error.message);
          return { ok: false, kind: "usage_unavailable" };
        }
        if (data === null || data === undefined) {
          console.error("ai_usage_reserve returned no id");
          return { ok: false, kind: "usage_unavailable" };
        }
        return { ok: true, id: Number(data) };
      }

      // 결과 기록 실패는 답을 막지 않는다(이미 호출이 끝났음). 서버 로그에만 남기고 행은 pending으로 남는다(건수에는 이미 포함).
      async function finishUsage(usageId: number, model: any, result: any, fallbackUsed: boolean, latencyMs: number) {
        try {
          // 성공은 물론, 실패여도 회사 응답에 토큰 수가 있으면(거절·빈 답 등) 같은 식으로 금액을 계산해 남긴다. 토큰을 모르면 null(=미상).
          const hasTokens = typeof result.input_tokens === "number" && typeof result.output_tokens === "number";
          const est = hasTokens
            ? estimateCostUsd({
                inputTokens: result.input_tokens,
                outputTokens: result.output_tokens,
                priceInUsdPerMtok: model.price_in_usd_per_mtok,
                priceOutUsdPerMtok: model.price_out_usd_per_mtok,
              })
            : null;
          const { error } = await admin
            .from("ai_assistant_usage")
            .update({
              fallback_used: fallbackUsed,
              status: result.ok ? "ok" : "error",
              error_kind: result.ok ? null : result.reason,
              input_tokens: hasTokens ? result.input_tokens : 0,
              output_tokens: hasTokens ? result.output_tokens : 0,
              est_cost_usd: est,
              latency_ms: latencyMs,
            })
            .eq("id", usageId);
          if (error) console.error("ai_assistant_usage update failed", usageId, error.code, error.message);
        } catch (e) {
          console.error("ai_assistant_usage update threw", usageId, e instanceof Error ? e.message : String(e));
        }
      }

      const attempt = async (model: any, fallbackUsed: boolean) => {
        if (imageCount && !model.supports_images) return { result: { ok: false, reason: "unsupported_image" } };
        const lookup = await providerLookup(admin, model.provider);
        if (lookup.state === "disabled") return { result: { ok: false, reason: "provider_disabled" } };
        const reserved = await reserveUsage(model);
        if (!reserved.ok) return { blocked: reserved.kind as string };
        const cfg = lookup.state === "row" ? lookup.cfg : null;
        const canSearch = ["openai", "anthropic", "google"].includes(model.provider);
        const startedAt = Date.now();
        const callResult = await doCallModel({
          provider: model.provider,
          apiKey: apiKeyFor(model.provider, readEnv, cfg?.key_env),
          baseUrl: cfg?.base_url || baseUrlFor(model.provider, readEnv),
          modelId: model.model_id,
          system,
          messages,
          maxOutputTokens: assistant.max_output_tokens,
          effort: assistant.effort,
          webSearch: !!assistant.web_search && canSearch,
          timeoutMs: 55000,
        });
        await finishUsage(reserved.id, model, callResult, fallbackUsed, Date.now() - startedAt);
        return { result: callResult, usageId: reserved.id };
      };

      // --- 9. 1차 호출 ---
      const first = await attempt(primaryModel, false);
      if ("blocked" in first) { await saveConversation("[" + first.blocked + "] " + errorMessageFor(first.blocked!), "error", primaryModel); return json(fail(first.blocked!), httpStatusForError(first.blocked!)); }
      let result = first.result;

      let usedModel = primaryModel;
      let usedUsageId = first.usageId ?? null;
      let fallbackUsed = false;
      if (!result.ok && fallbackModel && (shouldFallback(result.reason) || (result.reason === "unsupported_image" && fallbackModel.supports_images))) {
        const second = await attempt(fallbackModel, true);
        if ("blocked" in second) { await saveConversation("[" + second.blocked + "] " + errorMessageFor(second.blocked!), "error", fallbackModel, true); return json(fail(second.blocked!), httpStatusForError(second.blocked!)); }
        result = second.result;
        usedModel = fallbackModel;
        usedUsageId = second.usageId ?? null; // 예비로 답했으면 대화 기록은 예비(성공) 사용 기록 행을 가리킨다.
        fallbackUsed = true;
      }

      if (!result.ok) {
        const kind = result.reason === "unsupported_image" ? "image_not_supported" : publicErrorKind(result.reason || "upstream_error");
        await saveConversation("[" + kind + "] " + errorMessageFor(kind), "error", usedModel, fallbackUsed, usedUsageId);
        return json(fail(kind), httpStatusForError(kind));
      }

      const est = estimateCostUsd({
        inputTokens: result.input_tokens,
        outputTokens: result.output_tokens,
        priceInUsdPerMtok: usedModel.price_in_usd_per_mtok,
        priceOutUsdPerMtok: usedModel.price_out_usd_per_mtok,
      });

      await saveConversation(result.text, "ok", usedModel, fallbackUsed, usedUsageId);
      return json({
        ok: true,
        text: result.text,
        provider: usedModel.provider,
        model_id: usedModel.model_id,
        model_label: usedModel.label,
        fallback_used: fallbackUsed,
        web_search_used: !!result.web_search_used,
        web_search_unsupported: !!assistant.web_search && !["openai", "anthropic", "google"].includes(usedModel.provider),
        sources: result.sources || [],
        images: [],
        usage: { input_tokens: result.input_tokens, output_tokens: result.output_tokens, est_cost_usd: est },
      });
    } catch (error) {
      return json({ ok: false, error_kind: "unknown", message: errorMessageFor("unknown") }, 500);
    }
  };
}

if (import.meta.main) Deno.serve(createAiAssistantChatHandler());
