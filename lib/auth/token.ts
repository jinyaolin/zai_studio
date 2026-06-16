// Pure token helpers using Web Crypto API. Works in both edge (middleware)
// and node.js runtimes. Keep this side-effect free and free of `next/*`
// imports so it is safe to import from middleware.
//
// Multi-user session model: cookie carries `u=<userId>;exp=<ms>` + HMAC.
// Middleware verifies HMAC and signature only — it does NOT hit the DB
// (better-sqlite3 can't run on the edge runtime). The userId extracted
// here is the source of truth for which user is making the request.

const COOKIE_NAME = "zai_session";
const MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

export const SESSION_COOKIE_NAME = COOKIE_NAME;
export const SESSION_MAX_AGE = MAX_AGE_SECONDS;

function getSecret(): string | null {
  return process.env.AUTH_COOKIE_SECRET ?? null;
}

async function hmac(payload: string): Promise<string> {
  const secret = getSecret();
  if (!secret) throw new Error("AUTH_COOKIE_SECRET is not set. See .env.example.");
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
  return Buffer.from(new Uint8Array(sig)).toString("hex");
}

function timingEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

// ─── User session tokens ──────────────────────────────────────────
// Format: `u=<userId>;exp=<expiresAtMs>.<hmac>`
// HMAC is over the entire `u=...;exp=...` prefix.

export async function makeUserSessionToken(userId: string): Promise<string> {
  const exp = Date.now() + MAX_AGE_SECONDS * 1000;
  const payload = `u=${userId};exp=${exp}`;
  return `${payload}.${await hmac(payload)}`;
}

export async function verifyUserSessionToken(
  token: string | undefined | null,
): Promise<{ userId: string; expiresAt: number } | null> {
  if (!token) return null;
  if (!getSecret()) return null;
  const dotIdx = token.lastIndexOf(".");
  if (dotIdx < 0) return null;
  const payload = token.slice(0, dotIdx);
  const sig = token.slice(dotIdx + 1);
  const expected = await hmac(payload);
  if (!timingEqual(sig, expected)) return null;

  // Parse payload: u=<userId>;exp=<expiresAtMs>
  const m = payload.match(/^u=([^;]+);exp=(\d+)$/);
  if (!m) return null;
  const userId = m[1];
  const expiresAt = Number(m[2]);
  if (!userId || !Number.isFinite(expiresAt)) return null;
  if (Date.now() >= expiresAt) return null;
  return { userId, expiresAt };
}

// ─── Legacy (single-password) — kept for typecheck only, no longer used ────

export async function makeSessionToken(): Promise<string> {
  return makeUserSessionToken("legacy");
}

export async function verifySessionToken(token: string | undefined | null): Promise<boolean> {
  const result = await verifyUserSessionToken(token);
  return result !== null;
}

export function verifyPassword(_password: string): boolean {
  return false;
}
