// Google Gemini AIProvider — calls generativelanguage.googleapis.com using
// the user's stored OAuth access_token. Auto-refreshes on token expiry.
//
// Auth model: every request sends `Authorization: Bearer <access_token>`.
// The user pays Google directly; we never see an API key.
//
// Each provider instance is bound to a single userId at construction time.
// Use `getProvider(userId)` from ./provider.ts which handles the
// connection check + factory call.

import type {
  ChatOptions,
  ChatResponse,
  ProviderChatMessage,
} from "@/lib/types";
import type { AIProvider } from "./provider";
import {
  loadGoogleTokens,
  saveGoogleTokens,
  loadAISettings,
} from "@/lib/auth/token-store";
import { isTokenExpired, refreshAccessToken } from "@/lib/auth/google-oauth";

const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta";
const DEFAULT_MODEL = "gemini-2.5-pro";

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

// ─── Factory ──────────────────────────────────────────────────────

/**
 * Gemini provider bound to a specific user. Pass userId at construction;
 * chat/stream use that user's OAuth tokens.
 */
export function createGeminiProvider(userId: string): AIProvider {
  async function resolveModel(): Promise<string> {
    const settings = await loadAISettings(userId);
    return settings.geminiModel?.trim() || process.env.GEMINI_MODEL || DEFAULT_MODEL;
  }

  /** Refresh if expired; throw NOT_CONNECTED if user has no tokens. */
  async function getAccessToken(): Promise<string> {
    const data = await loadGoogleTokens(userId);
    if (!data) throw new Error("NOT_CONNECTED");
    let { tokens } = data;
    if (isTokenExpired(tokens)) {
      if (!tokens.refresh_token) {
        throw new Error("Gemini token expired and no refresh_token — reconnect Google.");
      }
      const refreshed = await refreshAccessToken(tokens.refresh_token);
      await saveGoogleTokens(refreshed, data.userInfo, userId);
      tokens = refreshed;
    }
    return tokens.access_token;
  }

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
    return fetch(`${GEMINI_BASE}${path}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(body),
      signal,
    });
  }

  return {
    async chat(messages, opts): Promise<ChatResponse> {
      const model = await resolveModel();
      const body = await buildRequestBody(messages, opts);
      const res = await fetchGemini(
        `/models/${model}:generateContent`,
        body,
        opts?.signal,
      );
      if (res.status === 401) {
        const err = await res.text().catch(() => "");
        throw new Error(`Gemini auth failed (401): ${err || "token rejected"}`);
      }
      if (!res.ok) {
        const err = await res.text().catch(() => "");
        throw new Error(`Gemini API error ${res.status}: ${err}`);
      }
      const data = await res.json();
      return { content: extractText(data.candidates?.[0]) };
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
            // Partial JSON across chunks — ignore; retried on next line.
          }
        }
      }
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
}
