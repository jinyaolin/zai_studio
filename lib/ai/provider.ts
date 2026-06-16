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

interface ProviderConfig {
  baseURL?: string;
  apiKey: string;
  model: string;
  /** When true, send `thinking: { type: "disabled" }` — z.ai GLM-5.x only. */
  disableThinking: boolean;
}

function readConfig(): ProviderConfig {
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

let _client: OpenAI | null = null;
function getClient(): OpenAI {
  if (_client) return _client;
  const cfg = readConfig();
  _client = new OpenAI({ baseURL: cfg.baseURL, apiKey: cfg.apiKey });
  return _client;
}

export function getCurrentModel(): string {
  return readConfig().model;
}

export function isAIConfigured(): boolean {
  return Boolean(process.env.ZAI_API_KEY);
}

export function isThinkingDisabled(): boolean {
  return readConfig().disableThinking;
}

export const zaiProvider: AIProvider = {
  async chat(messages, opts): Promise<ChatResponse> {
    const client = getClient();
    const cfg = readConfig();
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
    const client = getClient();
    const cfg = readConfig();
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

export function getProvider(): AIProvider {
  return zaiProvider;
}
