// Google OAuth 2.0 helpers for delegated Gemini API access.
//
// Flow:
//   1. buildAuthUrl(state) → user visits Google consent screen
//   2. Google redirects back with ?code=...
//   3. exchangeCode(code) → { access_token, refresh_token, expires_at, ... }
//   4. Call Gemini API with `Authorization: Bearer <access_token>`
//   5. On 401, refresh(refresh_token) → new access_token
//
// Required env:
//   GOOGLE_CLIENT_ID
//   GOOGLE_CLIENT_SECRET
//   GOOGLE_REDIRECT_URI   (e.g. http://localhost:3100/api/auth/google/callback)
//
// Scopes:
//   - userinfo.email  — identify the connected account (shown in UI)
//   - generative-language.retriever — call Gemini API on user's behalf

import { createHash, randomBytes } from "node:crypto";

const GOOGLE_AUTH_BASE = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_USERINFO_URL = "https://www.googleapis.com/oauth2/v2/userinfo";

export const GOOGLE_SCOPES = [
  "https://www.googleapis.com/auth/userinfo.email",
  "https://www.googleapis.com/auth/generative-language.retriever",
] as const;

export interface GoogleTokens {
  access_token: string;
  refresh_token: string | null;
  /** ISO-8601 timestamp when access_token expires. */
  expires_at: string;
  /** Token type — always "Bearer" for Google. */
  token_type: string;
  /** Scope string granted by the user. */
  scope: string;
}

export interface GoogleUserInfo {
  email: string;
  /** Stable per-user ID — safe to display. */
  sub: string;
}

function getConfig() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri = process.env.GOOGLE_REDIRECT_URI;
  if (!clientId || !clientSecret || !redirectUri) {
    throw new Error(
      "Google OAuth env missing: GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET / GOOGLE_REDIRECT_URI must all be set.",
    );
  }
  return { clientId, clientSecret, redirectUri };
}

export function isGoogleConfigured(): boolean {
  try {
    getConfig();
    return true;
  } catch {
    return false;
  }
}

/** Random hex state for CSRF protection during OAuth dance. */
export function newState(): string {
  return randomBytes(16).toString("hex");
}

/** Build the Google consent URL. `state` is returned to callback as-is. */
export function buildAuthUrl(state: string): string {
  const { clientId, redirectUri } = getConfig();
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: GOOGLE_SCOPES.join(" "),
    access_type: "offline", // request refresh_token
    prompt: "consent",       // force consent so refresh_token is always issued
    state,
  });
  return `${GOOGLE_AUTH_BASE}?${params.toString()}`;
}

/** Exchange the authorization code for tokens. */
export async function exchangeCode(code: string): Promise<GoogleTokens> {
  const { clientId, clientSecret, redirectUri } = getConfig();
  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
  });
  if (!res.ok) {
    const err = await res.text().catch(() => "");
    throw new Error(`token exchange failed (${res.status}): ${err}`);
  }
  const data = await res.json();
  return normalizeTokenResponse(data);
}

/** Refresh an expired access_token using a stored refresh_token. */
export async function refreshAccessToken(refreshToken: string): Promise<GoogleTokens> {
  const { clientId, clientSecret } = getConfig();
  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: "refresh_token",
    }),
  });
  if (!res.ok) {
    const err = await res.text().catch(() => "");
    throw new Error(`token refresh failed (${res.status}): ${err}`);
  }
  const data = await res.json();
  // Google does NOT return a new refresh_token on refresh — keep the old one.
  return normalizeTokenResponse({ ...data, refresh_token: refreshToken });
}

/** Fetch the connected user's email + sub. */
export async function fetchUserInfo(accessToken: string): Promise<GoogleUserInfo> {
  const res = await fetch(GOOGLE_USERINFO_URL, {
    headers: { authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    throw new Error(`userinfo fetch failed (${res.status})`);
  }
  const data = await res.json();
  return { email: data.email, sub: data.sub };
}

/** True if the access_token has expired (with 60s safety margin). */
export function isTokenExpired(t: GoogleTokens): boolean {
  const expiresAt = Date.parse(t.expires_at);
  if (Number.isNaN(expiresAt)) return true;
  return Date.now() + 60_000 >= expiresAt;
}

function normalizeTokenResponse(data: {
  access_token: string;
  refresh_token?: string | null;
  expires_in?: number;
  token_type?: string;
  scope?: string;
}): GoogleTokens {
  const expiresInSec = typeof data.expires_in === "number" ? data.expires_in : 3600;
  const expiresAt = new Date(Date.now() + expiresInSec * 1000).toISOString();
  return {
    access_token: data.access_token,
    refresh_token: data.refresh_token ?? null,
    expires_at: expiresAt,
    token_type: data.token_type ?? "Bearer",
    scope: data.scope ?? "",
  };
}

// Derive a 32-byte AES-256 key from AUTH_SECRET (or fallback key for dev).
// The fallback is intentionally a fixed hash so the dev server doesn't crash
// when AUTH_SECRET is unset — production MUST set AUTH_SECRET to a random
// value (e.g. `openssl rand -hex 32`).
export function getTokenEncryptionKey(): Buffer {
  const secret = process.env.AUTH_SECRET;
  if (!secret) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("AUTH_SECRET must be set in production (use `openssl rand -hex 32`).");
    }
    // Dev-only deterministic fallback so the server still boots.
    return createHash("sha256").update("zai-dev-only-token-key").digest();
  }
  return createHash("sha256").update(secret).digest();
}
