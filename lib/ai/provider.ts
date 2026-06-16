// AI provider — Gemini only, called with the current user's OAuth tokens.
//
// No more z.ai fallback. Users must connect their Google account before
// using any AI feature (chat / Design Thinking / memory extraction).
//
// All functions take `userId` so they can read the user's encrypted tokens
// from data/users/<userId>/google-tokens.json.

import type {
  ChatOptions,
  ChatResponse,
  ProviderChatMessage,
} from "@/lib/types";
import { loadGoogleTokens } from "@/lib/auth/token-store";

export interface AIProvider {
  chat(messages: ProviderChatMessage[], opts?: ChatOptions): Promise<ChatResponse>;
  stream(messages: ProviderChatMessage[], opts?: ChatOptions): AsyncIterable<string>;
}

/**
 * Get the AI provider for a given user. Throws "NOT_CONNECTED" if they
 * haven't connected Google yet — caller should surface a friendly error /
 * redirect to settings.
 */
export async function getProvider(userId: string): Promise<AIProvider> {
  const tokens = await loadGoogleTokens(userId);
  if (!tokens) {
    throw new Error("NOT_CONNECTED");
  }
  const { createGeminiProvider } = await import("./gemini");
  return createGeminiProvider(userId);
}

/** True iff the user has Google tokens stored. Doesn't verify they're fresh. */
export async function isAIConfiguredForUser(userId: string): Promise<boolean> {
  const tokens = await loadGoogleTokens(userId);
  return tokens !== null;
}

// Legacy single-user helpers retained for callers we haven't migrated yet.
// They'll be removed as P4 wraps up. Treat as deprecated.

export function isAIConfigured(): boolean {
  return false;
}

export function getCurrentModel(): string {
  return "(gemini — per-user)";
}

export function isThinkingDisabled(): boolean {
  return false;
}
