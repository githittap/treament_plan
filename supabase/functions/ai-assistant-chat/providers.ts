// ai-assistant-chat/providers.ts — 실제 AI 회사 호출(네트워크 있음). 요청 본문·응답 풀기 로직은 core.mjs(순수 함수)를 그대로 쓴다.
// 설계서 3-3절: Claude는 공식 SDK, 나머지 5곳은 OpenAI 호환 fetch.
import Anthropic from "npm:@anthropic-ai/sdk@0.129.0";
import {
  buildAnthropicRequest,
  buildOpenAICompatRequest,
  parseAnthropicResponse,
  parseOpenAICompatResponse,
  reasonFromHttpStatus,
} from "./core.mjs";

type Message = { role: string; content: string };
type ReadEnv = (name: string) => string | undefined;
type CallResult =
  | { ok: true; text: string; input_tokens: number; output_tokens: number }
  | { ok: false; reason: string; httpStatus?: number; input_tokens?: number; output_tokens?: number }; // 실패여도 회사가 토큰 수를 알려 줬으면 싣는다(금액 기록용)
type ListModelsResult = { ok: true; ids: string[] } | { ok: false; reason: string; httpStatus?: number };

const DEFAULT_TIMEOUT_MS = 55000;

const OPENAI_COMPAT_BASE_URL: Record<string, string> = {
  openai: "https://api.openai.com/v1",
  deepseek: "https://api.deepseek.com/v1",
  stepfun: "https://api.stepfun.ai/v1",
  google: "https://generativelanguage.googleapis.com/v1beta/openai",
};

/** provider -> openai 호환 base URL. moonshot만 환경변수(MOONSHOT_BASE_URL)로 바꿀 수 있다. */
export function baseUrlFor(provider: string, readEnv: ReadEnv): string | null {
  if (provider === "moonshot") return readEnv("MOONSHOT_BASE_URL") || "https://api.moonshot.ai/v1";
  return OPENAI_COMPAT_BASE_URL[provider] || null;
}

/** provider별 Edge 환경변수 이름 -> 비밀키 값. 값은 로그·응답에 절대 싣지 않는다. */
const API_KEY_ENV: Record<string, string> = {
  anthropic: "ANTHROPIC_API_KEY",
  openai: "OPENAI_API_KEY",
  deepseek: "DEEPSEEK_API_KEY",
  stepfun: "STEP_API_KEY",
  moonshot: "MOONSHOT_API_KEY",
  google: "GEMINI_API_KEY",
};

export function apiKeyFor(provider: string, readEnv: ReadEnv): string | undefined {
  const envName = API_KEY_ENV[provider];
  return envName ? readEnv(envName) : undefined;
}

function classifyThrown(error: unknown): { reason: string; httpStatus?: number } {
  const err = error as { name?: string; status?: unknown } | null;
  if (err?.name === "AbortError") return { reason: "timeout" };
  if (error instanceof Anthropic.APIError && typeof error.status === "number") {
    return { reason: reasonFromHttpStatus(error.status) || "server_error", httpStatus: error.status };
  }
  return { reason: "network_error" };
}

/**
 * Claude(anthropic) 호출. 공식 SDK를 그대로 쓴다(요청 본문은 core.mjs가 만듦).
 */
export async function callAnthropic(args: {
  apiKey?: string;
  modelId: string;
  system: string;
  messages: Message[];
  maxOutputTokens: number;
  effort?: string | null;
  timeoutMs?: number;
}): Promise<CallResult> {
  const { apiKey, modelId, system, messages, maxOutputTokens, effort, timeoutMs = DEFAULT_TIMEOUT_MS } = args;
  if (!apiKey) return { ok: false, reason: "provider_not_configured" };
  const client = new Anthropic({ apiKey, timeout: timeoutMs, maxRetries: 0 });
  const req = buildAnthropicRequest({ modelId, system, messages, maxOutputTokens, effort });
  try {
    // core.mjs는 순수 JS라 params 타입이 SDK 파라미터 타입까지 좁혀지지 않는다 — 여기 경계에서만 캐스팅한다.
    const response = req.useBeta
      ? await client.beta.messages.create({ ...(req.params as object), betas: req.betas, fallbacks: req.fallbacks } as Anthropic.Beta.Messages.MessageCreateParamsNonStreaming)
      : await client.messages.create(req.params as Anthropic.MessageCreateParamsNonStreaming);
    const parsed = parseAnthropicResponse(response);
    if (parsed.refusal) return { ok: false, reason: "refusal", input_tokens: parsed.input_tokens, output_tokens: parsed.output_tokens };
    if (!parsed.text) return { ok: false, reason: "empty_response", input_tokens: parsed.input_tokens, output_tokens: parsed.output_tokens };
    return { ok: true, text: parsed.text, input_tokens: parsed.input_tokens, output_tokens: parsed.output_tokens };
  } catch (error) {
    return { ok: false, ...classifyThrown(error) };
  }
}

/**
 * OpenAI 호환 5곳(openai·deepseek·stepfun·moonshot·google) 호출.
 */
export async function callOpenAICompat(args: {
  provider: string;
  apiKey?: string;
  baseUrl?: string | null;
  modelId: string;
  system: string;
  messages: Message[];
  maxOutputTokens: number;
  timeoutMs?: number;
}): Promise<CallResult> {
  const { provider, apiKey, baseUrl, modelId, system, messages, maxOutputTokens, timeoutMs = DEFAULT_TIMEOUT_MS } = args;
  if (!apiKey || !baseUrl) return { ok: false, reason: "provider_not_configured" };
  const body = buildOpenAICompatRequest({ provider, modelId, system, messages, maxOutputTokens });
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (!res.ok) {
      return { ok: false, reason: reasonFromHttpStatus(res.status) || "server_error", httpStatus: res.status };
    }
    const json = await res.json();
    const parsed = parseOpenAICompatResponse(json);
    if (!parsed.text) return { ok: false, reason: "empty_response", input_tokens: parsed.input_tokens, output_tokens: parsed.output_tokens };
    return { ok: true, text: parsed.text, input_tokens: parsed.input_tokens, output_tokens: parsed.output_tokens };
  } catch (error) {
    return { ok: false, ...classifyThrown(error) };
  } finally {
    clearTimeout(timer);
  }
}

/** 도우미가 배정한 모델 정보로 한 번 호출(anthropic/openai 호환 갈래를 나눈다). */
export async function callModel(args: {
  provider: string;
  apiKey?: string;
  baseUrl?: string | null;
  modelId: string;
  system: string;
  messages: Message[];
  maxOutputTokens: number;
  effort?: string | null;
  timeoutMs?: number;
}): Promise<CallResult> {
  const { provider, apiKey, baseUrl, modelId, system, messages, maxOutputTokens, effort, timeoutMs } = args;
  if (provider === "anthropic") {
    return callAnthropic({ apiKey, modelId, system, messages, maxOutputTokens, effort, timeoutMs });
  }
  return callOpenAICompat({ provider, apiKey, baseUrl, modelId, system, messages, maxOutputTokens, timeoutMs });
}

/** owner 전용 `list_models` — 대화용 생성 호출이 아니라 회사별 모델 목록 조회. */
export async function listModelsFor(provider: string, apiKey: string | undefined, baseUrl: string | null): Promise<ListModelsResult> {
  if (!apiKey) return { ok: false, reason: "provider_not_configured" };
  try {
    if (provider === "anthropic") {
      const res = await fetch("https://api.anthropic.com/v1/models?limit=100", {
        headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
      });
      if (!res.ok) return { ok: false, reason: reasonFromHttpStatus(res.status) || "server_error", httpStatus: res.status };
      const json = await res.json();
      const data: Array<{ id: string }> = Array.isArray(json?.data) ? json.data : [];
      return { ok: true, ids: data.map((m) => m.id) };
    }
    if (provider === "google") {
      const res = await fetch("https://generativelanguage.googleapis.com/v1beta/models", {
        headers: { "x-goog-api-key": apiKey },
      });
      if (!res.ok) return { ok: false, reason: reasonFromHttpStatus(res.status) || "server_error", httpStatus: res.status };
      const json = await res.json();
      const models: Array<{ name?: string; supportedGenerationMethods?: string[] }> = Array.isArray(json?.models) ? json.models : [];
      const ids = models
        .filter((m) => Array.isArray(m.supportedGenerationMethods) && m.supportedGenerationMethods.includes("generateContent"))
        .map((m) => String(m.name || "").replace(/^models\//, ""));
      return { ok: true, ids };
    }
    if (!baseUrl) return { ok: false, reason: "provider_not_configured" };
    const res = await fetch(`${baseUrl}/models`, { headers: { Authorization: `Bearer ${apiKey}` } });
    if (!res.ok) return { ok: false, reason: reasonFromHttpStatus(res.status) || "server_error", httpStatus: res.status };
    const json = await res.json();
    const data: Array<{ id: string }> = Array.isArray(json?.data) ? json.data : [];
    let ids = data.map((m) => m.id);
    if (provider === "openai") ids = ids.filter((id) => /^(gpt|o[0-9])/i.test(id));
    return { ok: true, ids };
  } catch {
    return { ok: false, reason: "network_error" };
  }
}
