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

type Message = { role: string; content: string | any[] };
type ReadEnv = (name: string) => string | undefined;
type CallResult =
  | { ok: true; text: string; input_tokens: number; output_tokens: number; web_search_used?: boolean; web_search_unsupported?: boolean; sources?: Array<{title:string;url:string}> }
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

export function apiKeyFor(provider: string, readEnv: ReadEnv, configuredEnv?: string): string | undefined {
  const envName = configuredEnv || API_KEY_ENV[provider];
  if (envName && (!/^[A-Z][A-Z0-9_]{1,60}_API_KEY$/.test(envName) || envName.startsWith("SUPABASE"))) return undefined;
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
  webSearch?: boolean;
}): Promise<CallResult> {
  const { apiKey, modelId, system, messages, maxOutputTokens, effort, timeoutMs = DEFAULT_TIMEOUT_MS, webSearch = false } = args;
  if (!apiKey) return { ok: false, reason: "provider_not_configured" };
  const client = new Anthropic({ apiKey, timeout: timeoutMs, maxRetries: 0 });
  const req = buildAnthropicRequest({ modelId, system, messages, maxOutputTokens, effort });
  try {
    // core.mjs는 순수 JS라 params 타입이 SDK 파라미터 타입까지 좁혀지지 않는다 — 여기 경계에서만 캐스팅한다.
    const params: any = { ...req.params };
    if (webSearch) params.tools = [{ type: "web_search_20250305", name: "web_search", max_uses: 3 }];
    const response = req.useBeta || webSearch
      ? await client.beta.messages.create({ ...params, betas: [...(req.betas || []), ...(webSearch ? ["web-search-2025-03-05"] : [])], ...(req.fallbacks ? { fallbacks: req.fallbacks } : {}) } as Anthropic.Beta.Messages.MessageCreateParamsNonStreaming)
      : await client.messages.create(params as Anthropic.MessageCreateParamsNonStreaming);
    const parsed = parseAnthropicResponse(response);
    if (parsed.refusal) return { ok: false, reason: "refusal", input_tokens: parsed.input_tokens, output_tokens: parsed.output_tokens };
    if (!parsed.text) return { ok: false, reason: "empty_response", input_tokens: parsed.input_tokens, output_tokens: parsed.output_tokens };
    const sources = (response.content || []).filter((b: any) => b.type === "web_search_tool_result").flatMap((b: any) => b.content || []).filter((x: any) => x.url).map((x: any) => ({ title: x.title || x.url, url: x.url })).slice(0,5);
    return { ok: true, text: parsed.text, input_tokens: parsed.input_tokens, output_tokens: parsed.output_tokens, web_search_used: webSearch && sources.length > 0, sources };
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
  webSearch?: boolean;
}): Promise<CallResult> {
  const { provider, apiKey, baseUrl, modelId, system, messages, maxOutputTokens, timeoutMs = DEFAULT_TIMEOUT_MS, webSearch = false } = args;
  if (!apiKey || !baseUrl) return { ok: false, reason: "provider_not_configured" };
  if (webSearch && provider === "openai") return callOpenAIResponses({apiKey,modelId,system,messages,maxOutputTokens,timeoutMs});
  if (webSearch && provider === "google") return callGeminiNative({apiKey,modelId,system,messages,maxOutputTokens,timeoutMs});
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

/**
 * OpenAI Responses API 입력 만들기(웹검색을 켠 OpenAI 호출용).
 * Responses API는 역할마다 받는 칸이 다르다: 직원(user)은 input_text·input_image, 이전 AI 답(assistant)은 output_text만 받는다.
 * 이전 AI 답을 input_text로 보내면 두 번째 메시지부터 400 오류가 난다.
 */
export function buildOpenAIResponsesInput(system: string, messages: Message[]): any[] {
  const input: any[] = [{ role: "system", content: [{ type: "input_text", text: system }] }];
  for (const message of messages) {
    if (message.role === "assistant") {
      const text = typeof message.content === "string"
        ? message.content
        : message.content.filter((part: any) => part.type === "text").map((part: any) => part.text || "").join("\n");
      input.push({ role: "assistant", content: [{ type: "output_text", text }] });
      continue;
    }
    if (typeof message.content === "string") {
      input.push({ role: "user", content: [{ type: "input_text", text: message.content }] });
      continue;
    }
    input.push({
      role: "user",
      content: message.content.map((part: any) =>
        part.type === "text"
          ? { type: "input_text", text: part.text }
          : { type: "input_image", image_url: part.image_url?.url || part.source?.url }
      ),
    });
  }
  return input;
}

/** 웹검색을 켠 OpenAI 호출 — Responses API의 web_search 도구를 쓴다. */
async function callOpenAIResponses(args: { apiKey: string; modelId: string; system: string; messages: Message[]; maxOutputTokens: number; timeoutMs: number }): Promise<CallResult> {
  const input = buildOpenAIResponsesInput(args.system, args.messages);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), args.timeoutMs);
  try {
    const res = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${args.apiKey}` },
      body: JSON.stringify({ model: args.modelId, input, tools: [{ type: "web_search" }], max_output_tokens: args.maxOutputTokens }),
      signal: controller.signal,
    });
    if (!res.ok) return { ok: false, reason: reasonFromHttpStatus(res.status) || "server_error", httpStatus: res.status };
    const json: any = await res.json();
    const output = json.output || [];
    const contents = output.flatMap((o: any) => o.content || []);
    const text = contents.filter((c: any) => c.type === "output_text").map((c: any) => c.text || "").join("");
    const sources = contents
      .flatMap((c: any) => c.annotations || [])
      .filter((a: any) => a.type === "url_citation" && a.url)
      .map((a: any) => ({ title: a.title || a.url, url: a.url }))
      .slice(0, 5);
    if (!text) return { ok: false, reason: "empty_response" };
    return {
      ok: true,
      text,
      input_tokens: Number(json.usage?.input_tokens) || 0,
      output_tokens: Number(json.usage?.output_tokens) || 0,
      web_search_used: output.some((o: any) => o.type === "web_search_call"),
      sources,
    };
  } catch (e) {
    return { ok: false, ...classifyThrown(e) };
  } finally {
    clearTimeout(timer);
  }
}
async function callGeminiNative(args:{apiKey:string;modelId:string;system:string;messages:Message[];maxOutputTokens:number;timeoutMs:number}):Promise<CallResult>{
 const input=args.messages.map((m:any)=>({type:m.role==="assistant"?"model_output":"user_input",content:typeof m.content==="string"?[{type:"text",text:m.content}]:m.content.map((p:any)=>p.type==="text"?{type:"text",text:p.text}:{type:"image",mime_type:(p.image_url?.url||"").match(/^data:(image\/[^;]+);/)?.[1]||"image/jpeg",data:(p.image_url?.url||"").split(",")[1]})}));const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),args.timeoutMs);
  try{const res=await fetch("https://generativelanguage.googleapis.com/v1beta/interactions",{method:"POST",headers:{"Content-Type":"application/json","x-goog-api-key":args.apiKey},body:JSON.stringify({model:args.modelId,input,system_instruction:args.system,tools:[{type:"google_search"}],generation_config:{max_output_tokens:args.maxOutputTokens},store:false}),signal:controller.signal});if(!res.ok)return {ok:false,reason:reasonFromHttpStatus(res.status)||"server_error",httpStatus:res.status};const json:any=await res.json(),steps=json.steps||[];const text=steps.filter((s:any)=>s.type==="model_output").flatMap((s:any)=>s.content||[]).filter((c:any)=>c.type==="text").map((c:any)=>c.text||"").join("");const annotations=steps.filter((s:any)=>s.type==="model_output").flatMap((s:any)=>s.content||[]).flatMap((c:any)=>c.annotations||[]);const searchResults=steps.filter((s:any)=>s.type==="google_search_result").flatMap((s:any)=>Array.isArray(s.result)?s.result:Array.isArray(s.result?.result)?s.result.result:[]);const sources=[...annotations.map((a:any)=>({title:a.title||a.uri||a.url,url:a.uri||a.url})),...searchResults.map((r:any)=>({title:r.title||r.name||r.uri||r.url,url:r.uri||r.url}))].filter((a:any)=>/^https:\/\//i.test(a.url||"")).filter((a:any,i:number,all:any[])=>all.findIndex((b:any)=>b.url===a.url)===i).slice(0,5);if(!text)return {ok:false,reason:"empty_response"};return {ok:true,text,input_tokens:Number(json.usage?.total_input_tokens??json.usage?.input_tokens)||0,output_tokens:Number(json.usage?.total_output_tokens??json.usage?.output_tokens)||0,web_search_used:steps.some((s:any)=>s.type==="google_search_call"),sources};}catch(e){return {ok:false,...classifyThrown(e)}}finally{clearTimeout(timer)}
}

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
  webSearch?: boolean;
}): Promise<CallResult> {
  const { provider, apiKey, baseUrl, modelId, system, messages, maxOutputTokens, effort, timeoutMs } = args;
  const webSearch = !!(args as any).webSearch;
  if (provider === "anthropic") {
    return callAnthropic({ apiKey, modelId, system, messages, maxOutputTokens, effort, timeoutMs, webSearch });
  }
  if (provider === "openai" || provider === "google") return callOpenAICompat({ provider, apiKey, baseUrl, modelId, system, messages, maxOutputTokens, timeoutMs, webSearch });
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
