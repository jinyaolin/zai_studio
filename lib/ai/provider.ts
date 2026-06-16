// AI provider dispatch.
//
// Current policy: ALL users go through the server's z.ai key (server pays).
// The per-user Gemini OAuth / BYO-quota code is left in place but dormant —
// to re-enable, flip `USE_GEMINI_OAUTH` below to true. For now every call
// uses ZAI_API_KEY from .env regardless of who's signed in.

import OpenAI from "openai";
import type {
  ChatOptions,
  ChatResponse,
  ProviderChatMessage,
} from "@/lib/types";

export interface AIProvider {
  chat(messages: ProviderChatMessage[], opts?: ChatOptions): Promise<ChatResponse>;
  stream(messages: ProviderChatMessage[], opts?: ChatOptions): AsyncIterable<string>;
}

// ─── z.ai (OpenAI-compatible, server-paid) ────────────────────────

interface ZaiConfig {
  baseURL?: string;
  apiKey: string;
  model: string;
  disableThinking: boolean;
}

function readZaiConfig(): ZaiConfig {
  const apiKey = process.env.ZAI_API_KEY;
  if (!apiKey) {
    throw new Error("ZAI_API_KEY is not set. Copy .env.example to .env and fill it in.");
  }
  return {
    baseURL: process.env.ZAI_BASE_URL,
    apiKey,
    model: process.env.ZAI_MODEL ?? "glm-5-turbo",
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

function resolveThinkingOff(envDefault: boolean, override?: boolean): boolean {
  if (override === undefined) return envDefault;
  return override;
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

// ─── Provider dispatch ────────────────────────────────────────────

// Flip to true to re-enable per-user Gemini OAuth (BYO quota model).
// When false: every user hits the server's z.ai key.
const USE_GEMINI_OAUTH = false;

/** True iff z.ai env is configured. */
export function isZaiConfigured(): boolean {
  return Boolean(process.env.ZAI_API_KEY);
}

/**
 * Returns the AI provider for the given user. Currently always returns
 * the server z.ai provider — per-user Gemini is dormant.
 */
export async function getProvider(_userId: string): Promise<AIProvider> {
  if (USE_GEMINI_OAUTH) {
    const { loadGoogleTokens } = await import("@/lib/auth/token-store");
    const tokens = await loadGoogleTokens(_userId);
    if (tokens) {
      const { createGeminiProvider } = await import("./gemini");
      return createGeminiProvider(_userId);
    }
  }
  if (isZaiConfigured()) {
    return zaiProvider;
  }
  throw new Error("AI_NOT_CONFIGURED");
}

/** True if AI is available for this user. */
export async function isAIConfiguredForUser(_userId: string): Promise<boolean> {
  if (USE_GEMINI_OAUTH) {
    const { loadGoogleTokens } = await import("@/lib/auth/token-store");
    const tokens = await loadGoogleTokens(_userId);
    if (tokens) return true;
  }
  return isZaiConfigured();
}

/** What's actually serving this user's calls right now. */
export async function getActiveProviderName(_userId: string): Promise<"gemini" | "zai" | "none"> {
  if (USE_GEMINI_OAUTH) {
    const { loadGoogleTokens } = await import("@/lib/auth/token-store");
    const tokens = await loadGoogleTokens(_userId);
    if (tokens) return "gemini";
  }
  if (isZaiConfigured()) return "zai";
  return "none";
}

// Sync helpers

export function isAIConfigured(): boolean {
  return isZaiConfigured();
}

export function getCurrentModel(): string {
  if (process.env.ZAI_API_KEY) return readZaiConfig().model;
  return "(not configured)";
}

export function isThinkingDisabled(): boolean {
  return readZaiConfig().disableThinking;
}

