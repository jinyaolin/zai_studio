import OpenAI from "openai";
import type {
  ChatOptions,
  ChatResponse,
  ProviderChatMessage,
} from "@/lib/types";
import { loadAISettings, loadGoogleTokens, type AIProviderName } from "@/lib/auth/token-store";
import { isGoogleConfigured } from "@/lib/auth/google-oauth";

export interface AIProvider {
  chat(messages: ProviderChatMessage[], opts?: ChatOptions): Promise<ChatResponse>;
  stream(messages: ProviderChatMessage[], opts?: ChatOptions): AsyncIterable<string>;
}

// ─── z.ai (OpenAI-compatible) provider ────────────────────────────

interface ProviderConfig {
  baseURL?: string;
  apiKey: string;
  model: string;
  /** When true, send `thinking: { type: "disabled" }` — z.ai GLM-5.x only. */
  disableThinking: boolean;
}

function readZaiConfig(): ProviderConfig {
  const apiKey = process.env.ZAI_API_KEY;
  if (!apiKey) {
    throw new Error("ZAI_API_KEY is not set. Copy .env.example to .env and fill it in.");
  }
  return {
    baseURL: process.env.ZAI_BASE_URL,
    apiKey,
    model: process.env.ZAI_MODEL ?? "gpt-4o-mini",
    disableThinking: process.env.ZAI_DISABLE_THINKING === "true",
  };
}

let _zaiClient: OpenAI | null = null;
function getZaiClient(): OpenAI {
  if (_zaiClient) return _zaiClient;
  const cfg = readZaiConfig();
  _zaiClient = new OpenAI({ baseURL: cfg.baseURL, apiKey: cfg.apiKey });
  return _zaiClient;
}

export const zaiProvider: AIProvider = {
  async chat(messages, opts): Promise<ChatResponse> {
    const client = getZaiClient();
    const cfg = readZaiConfig();
    const wantOff = resolveThinkingOff(cfg.disableThinking, opts?.disableThinking);
    const body = {
      model: cfg.model,
      messages,
      temperature: opts?.temperature ?? 0.8,
      max_tokens: opts?.maxTokens,
      ...(wantOff ? { thinking: { type: "disabled" } } : {}),
    } as unknown as Parameters<typeof client.chat.completions.create>[0];
    const completion = await client.chat.completions.create(body, {
      signal: opts?.signal,
    });
    if ("choices" in completion) {
      return { content: completion.choices[0]?.message?.content ?? "" };
    }
    return { content: "" };
  },

  async *stream(messages, opts): AsyncIterable<string> {
    const client = getZaiClient();
    const cfg = readZaiConfig();
    const wantOff = resolveThinkingOff(cfg.disableThinking, opts?.disableThinking);
    const body = {
      model: cfg.model,
      messages,
      temperature: opts?.temperature ?? 0.8,
      max_tokens: opts?.maxTokens,
      stream: true,
      ...(wantOff ? { thinking: { type: "disabled" } } : {}),
    } as unknown as Parameters<typeof client.chat.completions.create>[0];
    const stream = (await client.chat.completions.create(body, {
      signal: opts?.signal,
    })) as AsyncIterable<{ choices: { delta: { content?: string } }[] }>;
    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta?.content;
      if (delta) yield delta;
    }
  },
};

// Resolve the per-call override against the env default.
//   explicit true/false on the call → wins
//   undefined on the call            → use env default
function resolveThinkingOff(envDefault: boolean, override?: boolean): boolean {
  if (override === undefined) return envDefault;
  return override;
}

// ─── Provider dispatch ────────────────────────────────────────────
//
// Active provider comes from data/ai-settings.json (set via /studio/settings).
// We lazy-import gemini to avoid loading it on instances that don't use it.

let _cachedProvider: AIProviderName | null = null;
let _cacheExpiry = 0;
const CACHE_TTL_MS = 5_000;

async function resolveActiveProvider(): Promise<AIProviderName> {
  // Fast path: cache for a few seconds so we don't hit the filesystem on every call.
  if (_cachedProvider && Date.now() < _cacheExpiry) return _cachedProvider;
  const settings = await loadAISettings();
  let provider = settings.activeProvider;

  // Auto-fall-back to z.ai if gemini-oauth is selected but no tokens are stored.
  if (provider === "gemini-oauth") {
    const connected = isGoogleConfigured() && (await loadGoogleTokens()) !== null;
    if (!connected) provider = "zai";
  }

  _cachedProvider = provider;
  _cacheExpiry = Date.now() + CACHE_TTL_MS;
  return provider;
}

/** Invalidate the provider cache (called after settings change). */
export function invalidateProviderCache(): void {
  _cachedProvider = null;
  _cacheExpiry = 0;
}

export async function getProvider(): Promise<AIProvider> {
  const provider = await resolveActiveProvider();
  if (provider === "gemini-oauth") {
    const { geminiProvider } = await import("./gemini");
    return geminiProvider;
  }
  return zaiProvider;
}

// Sync helper for places that can't await (e.g. `isAIConfigured` checks
// inside route guards). Returns the last resolved provider, or "zai" if
// nothing has resolved yet.
export function getCachedProviderName(): AIProviderName {
  return _cachedProvider ?? "zai";
}

export function getCurrentModel(): string {
  // Reflect the cached active provider so chat meta messages are honest.
  // If the cache is empty (first call before any AI request resolved), fall
  // back to z.ai model name — which matches the default `activeProvider: "zai"`.
  if (_cachedProvider === "gemini-oauth") {
    return "(gemini — model resolved per-call)";
  }
  if (process.env.ZAI_API_KEY) return readZaiConfig().model;
  return "(not configured)";
}

export function isAIConfigured(): boolean {
  if (process.env.ZAI_API_KEY) return true;
  return false;
}

export function isThinkingDisabled(): boolean {
  return readZaiConfig().disableThinking;
}
