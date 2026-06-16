// Encrypted storage for Google OAuth tokens, scoped per user.
//
// Path: data/users/<userId>/google-tokens.json
// Encryption: AES-256-GCM with key derived (SHA-256) from AUTH_SECRET.
// access_token is short-lived (~1h) but refresh_token is long-lived and
// equivalent to a credential — encrypt at rest.

import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { DATA_DIR } from "@/lib/content/paths";
import type { GoogleTokens, GoogleUserInfo } from "./google-oauth";
import { getTokenEncryptionKey } from "./google-oauth";

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

// ─── Per-user path ────────────────────────────────────────────────

function userDir(userId: string): string {
  return path.join(DATA_DIR, "users", userId);
}

function tokensPath(userId: string): string {
  return path.join(userDir(userId), "google-tokens.json");
}

interface StoredTokens {
  ciphertext: string;
  iv: string;
  tag: string;
  userInfo: GoogleUserInfo;
  storedAt: string;
}

// ─── Token store ──────────────────────────────────────────────────

export async function saveGoogleTokens(
  tokens: GoogleTokens,
  userInfo: GoogleUserInfo,
  userId: string,
): Promise<void> {
  await fs.mkdir(userDir(userId), { recursive: true });
  const encrypted = encrypt(JSON.stringify(tokens));
  const stored: StoredTokens = {
    ...encrypted,
    userInfo,
    storedAt: new Date().toISOString(),
  };
  await fs.writeFile(tokensPath(userId), JSON.stringify(stored, null, 2) + "\n", "utf8");
}

export async function loadGoogleTokens(
  userId: string,
): Promise<{ tokens: GoogleTokens; userInfo: GoogleUserInfo } | null> {
  try {
    const raw = await fs.readFile(tokensPath(userId), "utf8");
    const stored = JSON.parse(raw) as StoredTokens;
    const tokens = JSON.parse(decrypt(stored)) as GoogleTokens;
    return { tokens, userInfo: stored.userInfo };
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
    console.warn(`[token-store] failed to load tokens for ${userId}:`, (err as Error).message);
    return null;
  }
}

export async function clearGoogleTokens(userId: string): Promise<void> {
  try {
    await fs.rm(tokensPath(userId));
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
  }
}

// ─── Per-user AI settings ─────────────────────────────────────────
// Currently just `geminiModel` per user (no provider switching — Gemini
// only). Lives next to the user's encrypted tokens.

export interface UserAISettings {
  geminiModel?: string;
}

function settingsPath(userId: string): string {
  return path.join(userDir(userId), "ai-settings.json");
}

export async function loadAISettings(userId: string): Promise<UserAISettings> {
  try {
    const raw = await fs.readFile(settingsPath(userId), "utf8");
    return JSON.parse(raw) as UserAISettings;
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return {};
    console.warn(`[token-store] failed to load ai settings for ${userId}:`, (err as Error).message);
    return {};
  }
}

export async function saveAISettings(userId: string, settings: UserAISettings): Promise<void> {
  await fs.mkdir(userDir(userId), { recursive: true });
  await fs.writeFile(settingsPath(userId), JSON.stringify(settings, null, 2) + "\n", "utf8");
}

export async function setGeminiModel(userId: string, model: string | undefined): Promise<UserAISettings> {
  const current = await loadAISettings(userId);
  const next = { ...current, geminiModel: model?.trim() || undefined };
  await saveAISettings(userId, next);
  return next;
}
