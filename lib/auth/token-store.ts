// Encrypted storage for Google OAuth tokens + active AI provider selection.
//
// Both live under data/ (gitignored). Single-user author model — no per-user
// namespacing needed; the file is the source of truth for the one author
// running this instance.
//
// Encryption: AES-256-GCM with a key derived (SHA-256) from AUTH_SECRET.
// access_token is short-lived (~1h) but refresh_token is long-lived and
// equivalent to a credential, so we encrypt at rest.

import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { DATA_DIR } from "@/lib/content/paths";
import type { GoogleTokens, GoogleUserInfo } from "./google-oauth";
import { getTokenEncryptionKey } from "./google-oauth";

const TOKENS_PATH = path.join(DATA_DIR, "google-tokens.json");
const SETTINGS_PATH = path.join(DATA_DIR, "ai-settings.json");

export type AIProviderName = "zai" | "gemini-oauth";

export interface AISettings {
  /** Which provider getProvider() should return. */
  activeProvider: AIProviderName;
  /** Gemini model override; falls back to GEMINI_MODEL env then default. */
  geminiModel?: string;
  /** When the user last connected / disconnected. */
  connectedAt?: string;
}

interface StoredTokens {
  /** Encrypted blob (base64). */
  ciphertext: string;
  /** AES-GCM IV (base64). */
  iv: string;
  /** AES-GCM auth tag (base64). */
  tag: string;
  /** Connected user info — not secret, but stored alongside for convenience. */
  userInfo: GoogleUserInfo;
  /** Stored at ISO-8601. */
  storedAt: string;
}

// ─── Encryption helpers ───────────────────────────────────────────

function encrypt(plaintext: string): { ciphertext: string; iv: string; tag: string } {
  const key = getTokenEncryptionKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const enc = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    ciphertext: enc.toString("base64"),
    iv: iv.toString("base64"),
    tag: tag.toString("base64"),
  };
}

function decrypt(blob: { ciphertext: string; iv: string; tag: string }): string {
  const key = getTokenEncryptionKey();
  const decipher = createDecipheriv(
    "aes-256-gcm",
    key,
    Buffer.from(blob.iv, "base64"),
  );
  decipher.setAuthTag(Buffer.from(blob.tag, "base64"));
  const dec = Buffer.concat([
    decipher.update(Buffer.from(blob.ciphertext, "base64")),
    decipher.final(),
  ]);
  return dec.toString("utf8");
}

// ─── Token store ──────────────────────────────────────────────────

export async function saveGoogleTokens(tokens: GoogleTokens, userInfo: GoogleUserInfo): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true });
  const encrypted = encrypt(JSON.stringify(tokens));
  const stored: StoredTokens = {
    ...encrypted,
    userInfo,
    storedAt: new Date().toISOString(),
  };
  await fs.writeFile(TOKENS_PATH, JSON.stringify(stored, null, 2) + "\n", "utf8");
}

export async function loadGoogleTokens(): Promise<{ tokens: GoogleTokens; userInfo: GoogleUserInfo } | null> {
  try {
    const raw = await fs.readFile(TOKENS_PATH, "utf8");
    const stored = JSON.parse(raw) as StoredTokens;
    const tokens = JSON.parse(decrypt(stored)) as GoogleTokens;
    return { tokens, userInfo: stored.userInfo };
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
    console.warn("[token-store] failed to load google tokens:", (err as Error).message);
    return null;
  }
}

export async function clearGoogleTokens(): Promise<void> {
  try {
    await fs.rm(TOKENS_PATH);
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
  }
}

// ─── AI settings ──────────────────────────────────────────────────

const DEFAULT_SETTINGS: AISettings = {
  activeProvider: "zai",
};

export async function loadAISettings(): Promise<AISettings> {
  try {
    const raw = await fs.readFile(SETTINGS_PATH, "utf8");
    const parsed = JSON.parse(raw) as Partial<AISettings>;
    return { ...DEFAULT_SETTINGS, ...parsed };
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return DEFAULT_SETTINGS;
    console.warn("[token-store] failed to load ai settings:", (err as Error).message);
    return DEFAULT_SETTINGS;
  }
}

export async function saveAISettings(settings: AISettings): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(SETTINGS_PATH, JSON.stringify(settings, null, 2) + "\n", "utf8");
}

export async function setActiveProvider(provider: AIProviderName): Promise<AISettings> {
  const current = await loadAISettings();
  const next = { ...current, activeProvider: provider };
  await saveAISettings(next);
  return next;
}

export async function setGeminiModel(model: string | undefined): Promise<AISettings> {
  const current = await loadAISettings();
  const next = { ...current, geminiModel: model?.trim() || undefined };
  await saveAISettings(next);
  return next;
}
