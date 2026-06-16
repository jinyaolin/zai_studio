// Google Gemini AIProvider — calls generativelanguage.googleapis.com using
// the author's stored OAuth access_token. Handles auto-refresh on 401.
//
// Auth model: every request sends `Authorization: Bearer <access_token>`.
// The user pays Google directly; we never see an API key.
//
// Model selection order: settings.geminiModel → GEMINI_MODEL env → default.
//
// Streaming: Gemini's streamGenerateContent returns a stream of JSON objects
// (not SSE — it's chunked JSON array elements). We parse incrementally.
//
// Thinking: Gemini 2.5+ has "thinking" mode but uses different parameters
// than GLM. For now we ignore ChatOptions.disableThinking and let Gemini
// use its default behavior.

import type {
  ChatOptions,
  ChatResponse,
  ProviderChatMessage,
} from "@/lib/types";
import type { AIProvider } from "./provider";
import {
  loadGoogleTokens,
  saveGoogleTokens,
} from "@/lib/auth/token-store";
import {
  isTokenExpired,
  refreshAccessToken,
} from "@/lib/auth/google-oauth";
import { loadAISettings } from "@/lib/auth/token-store";

const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta";
const DEFAULT_MODEL = "gemini-2.5-pro";

async function resolveModel(): Promise<string> {
  const settings = await loadAISettings();
  return settings.geminiModel?.trim() || process.env.GEMINI_MODEL || DEFAULT_MODEL;
}

/** Get a fresh access_token, refreshing if necessary. Returns null if disconnected. */
async function getAccessToken(): Promise<string | null> {
  const data = await loadGoogleTokens();
  if (!data) return null;
  let { tokens } = data;
  if (isTokenExpired(tokens)) {
    if (!tokens.refresh_token) {
      throw new Error("Gemini access token expired and no refresh_token available — reconnect Google account.");
    }
    const refreshed = await refreshAccessToken(tokens.refresh_token);
    await saveGoogleTokens(refreshed, data.userInfo);
    tokens = refreshed;
  }
  return tokens.access_token;
}

// ─── Message format conversion ───────────────────────────────────

interface GeminiPart { text: string }
interface GeminiContent {
  role: "user" | "model";
  parts: GeminiPart[];
}

function toGeminiContents(messages: ProviderChatMessage[]): {
  systemInstruction?: { parts: GeminiPart[] };
  contents: GeminiContent[];
} {
  const contents: GeminiContent[] = [];
  const systemParts: GeminiPart[] = [];

  for (const m of messages) {
    if (m.role === "system") {
      systemParts.push({ text: m.content });
      continue;
    }
    contents.push({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.content }],
    });
  }

  return {
    systemInstruction: systemParts.length > 0 ? { parts: systemParts } : undefined,
    contents,
  };
}

function extractText(candidate: unknown): string {
  if (!candidate || typeof candidate !== "object") return "";
  const c = candidate as { content?: { parts?: Array<{ text?: string }> } };
  return (c.content?.parts ?? []).map((p) => p.text ?? "").join("");
}

// ─── Provider implementation ─────────────────────────────────────

async function buildRequestBody(
  messages: ProviderChatMessage[],
  opts?: ChatOptions,
): Promise<Record<string, unknown>> {
  const model = await resolveModel();
  const { systemInstruction, contents } = toGeminiContents(messages);
  return {
    model,
    contents,
    systemInstruction,
    generationConfig: {
      temperature: opts?.temperature ?? 0.8,
      maxOutputTokens: opts?.maxTokens,
    },
  };
}

async function fetchGemini(
  path: string,
  body: Record<string, unknown>,
  signal?: AbortSignal,
): Promise<Response> {
  const token = await getAccessToken();
  if (!token) {
    throw new Error("Google account not connected. Visit /studio/settings to connect.");
  }
  const res = await fetch(`${GEMINI_BASE}${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
    signal,
  });
  return res;
}

export const geminiProvider: AIProvider = {
  async chat(messages, opts): Promise<ChatResponse> {
    const model = await resolveModel();
    const body = await buildRequestBody(messages, opts);
    let res = await fetchGemini(
      `/models/${model}:generateContent`,
      body,
      opts?.signal,
    );
    // Single retry on 401 — refresh has already happened in getAccessToken,
    // but if Google still rejects, surface the error.
    if (res.status === 401) {
      const err = await res.text().catch(() => "");
      throw new Error(`Gemini auth failed (401): ${err || "token rejected"}`);
    }
    if (!res.ok) {
      const err = await res.text().catch(() => "");
      throw new Error(`Gemini API error ${res.status}: ${err}`);
    }
    const data = await res.json();
    const text = extractText(data.candidates?.[0]);
    return { content: text };
  },

  async *stream(messages, opts): AsyncIterable<string> {
    const model = await resolveModel();
    const body = await buildRequestBody(messages, opts);
    const res = await fetchGemini(
      `/models/${model}:streamGenerateContent?alt=sse`,
      body,
      opts?.signal,
    );
    if (res.status === 401) {
      const err = await res.text().catch(() => "");
      throw new Error(`Gemini auth failed (401): ${err || "token rejected"}`);
    }
    if (!res.ok || !res.body) {
      const err = await res.text().catch(() => "");
      throw new Error(`Gemini stream error ${res.status}: ${err}`);
    }

    // Gemini with ?alt=sse returns proper SSE: lines starting with "data: ".
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      // Keep the last partial line for next iteration.
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith("data:")) continue;
        const json = trimmed.slice(5).trim();
        if (!json) continue;
        try {
          const parsed = JSON.parse(json);
          const text = extractText(parsed.candidates?.[0]);
          if (text) yield text;
        } catch {
          // Partial JSON across chunks — ignore, will be retried on next line.
        }
      }
    }
    // Flush any remaining buffered data.
    if (buffer.trim().startsWith("data:")) {
      try {
        const json = buffer.trim().slice(5).trim();
        const parsed = JSON.parse(json);
        const text = extractText(parsed.candidates?.[0]);
        if (text) yield text;
      } catch {}
    }
  },
};
