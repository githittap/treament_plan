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

const ALL_PROVIDERS = ["anthropic", "openai", "deepseek", "stepfun", "moonshot", "google"];
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
        const wanted = body?.provider && ALL_PROVIDERS.includes(body.provider) ? [body.provider] : ALL_PROVIDERS;
        const providers: Record<string, string[]> = {};
        const errors: Record<string, string> = {};
        for (const provider of wanted) {
          const apiKey = apiKeyFor(provider, readEnv);
          const result = await doListModels(provider, apiKey, baseUrlFor(provider, readEnv));
          if (result.ok) providers[provider] = result.ids;
          else errors[provider] = publicErrorKind(result.reason);
        }
        return json({ ok: true, providers, errors });
      }

      if (action === "test_model") {
        if (!isOwner) return json(fail("forbidden_role"), 403);
        const modelRef = body?.model_ref;
        if (!modelRef) return json(fail("invalid_input"), 400);
        const { data: model, error: modelError } = await admin.from("ai_models").select("*").eq("id", modelRef).maybeSingle();
        if (modelError || !model) return json(fail("model_not_set"), 404);
        const apiKey = apiKeyFor(model.provider, readEnv);
        const startedAt = Date.now();
        const result = await doCallModel({
          provider: model.provider,
          apiKey,
          baseUrl: baseUrlFor(model.provider, readEnv),
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
      if (!assistantId) return json(fail("invalid_input"), 400);

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

      // --- 7. 과다 사용 막기 ---
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
      const { count: recentCount } = await admin
        .from("ai_assistant_usage")
        .select("id", { count: "exact", head: true })
        .eq("user_id", user.id)
        .gte("created_at", oneHourAgo);
      if ((recentCount ?? 0) >= RATE_LIMIT_PER_HOUR) return json(fail("rate_limited"), 429);

      // --- 8. 시스템 프롬프트 ---
      const system = buildSystemPrompt(assistant.instructions, assistant.knowledge);
      const messages = validated.messages;

      async function recordUsage(model: any, result: any, fallbackUsed: boolean, latencyMs: number) {
        const est = result.ok
          ? estimateCostUsd({
              inputTokens: result.input_tokens,
              outputTokens: result.output_tokens,
              priceInUsdPerMtok: model.price_in_usd_per_mtok,
              priceOutUsdPerMtok: model.price_out_usd_per_mtok,
            })
          : null;
        await admin.from("ai_assistant_usage").insert({
          user_id: user.id,
          assistant_id: assistant.id,
          assistant_name: assistant.name,
          provider: model.provider,
          model_id: model.model_id,
          fallback_used: fallbackUsed,
          status: result.ok ? "ok" : "error",
          error_kind: result.ok ? null : result.reason,
          input_tokens: result.ok ? result.input_tokens : 0,
          output_tokens: result.ok ? result.output_tokens : 0,
          est_cost_usd: est,
          latency_ms: latencyMs,
        });
      }

      // --- 9. 1차 호출 ---
      const primaryStart = Date.now();
      let result = await doCallModel({
        provider: primaryModel.provider,
        apiKey: apiKeyFor(primaryModel.provider, readEnv),
        baseUrl: baseUrlFor(primaryModel.provider, readEnv),
        modelId: primaryModel.model_id,
        system,
        messages,
        maxOutputTokens: assistant.max_output_tokens,
        effort: assistant.effort,
        timeoutMs: 55000,
      });
      await recordUsage(primaryModel, result, false, Date.now() - primaryStart);

      let usedModel = primaryModel;
      let fallbackUsed = false;
      if (!result.ok && shouldFallback(result.reason) && fallbackModel) {
        const fallbackStart = Date.now();
        result = await doCallModel({
          provider: fallbackModel.provider,
          apiKey: apiKeyFor(fallbackModel.provider, readEnv),
          baseUrl: baseUrlFor(fallbackModel.provider, readEnv),
          modelId: fallbackModel.model_id,
          system,
          messages,
          maxOutputTokens: assistant.max_output_tokens,
          effort: assistant.effort,
          timeoutMs: 55000,
        });
        await recordUsage(fallbackModel, result, true, Date.now() - fallbackStart);
        usedModel = fallbackModel;
        fallbackUsed = true;
      }

      if (!result.ok) {
        const kind = publicErrorKind(result.reason || "upstream_error");
        return json(fail(kind), httpStatusForError(kind));
      }

      const est = estimateCostUsd({
        inputTokens: result.input_tokens,
        outputTokens: result.output_tokens,
        priceInUsdPerMtok: usedModel.price_in_usd_per_mtok,
        priceOutUsdPerMtok: usedModel.price_out_usd_per_mtok,
      });

      return json({
        ok: true,
        text: result.text,
        provider: usedModel.provider,
        model_id: usedModel.model_id,
        model_label: usedModel.label,
        fallback_used: fallbackUsed,
        usage: { input_tokens: result.input_tokens, output_tokens: result.output_tokens, est_cost_usd: est },
      });
    } catch (error) {
      return json({ ok: false, error_kind: "unknown", message: errorMessageFor("unknown") }, 500);
    }
  };
}

if (import.meta.main) Deno.serve(createAiAssistantChatHandler());
