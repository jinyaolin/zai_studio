// Pure token helpers using Web Crypto API. Works in both edge (middleware)
// and node.js runtimes. Keep this side-effect free and free of `next/*`
// imports so it is safe to import from middleware.

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

export async function makeSessionToken(): Promise<string> {
  const payload = `auth:${Date.now()}`;
  return `${payload}.${await hmac(payload)}`;
}

export async function verifySessionToken(token: string | undefined | null): Promise<boolean> {
  if (!token) return false;
  // If secret is missing (e.g. dev env without .env), fail closed but don't crash middleware.
  if (!getSecret()) return false;
  const [payload, sig] = token.split(".");
  if (!payload || !sig) return false;
  const expected = await hmac(payload);
  if (expected.length !== sig.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) {
    diff |= expected.charCodeAt(i) ^ sig.charCodeAt(i);
  }
  return diff === 0;
}

export function verifyPassword(password: string): boolean {
  const expected = process.env.AUTH_PASSWORD;
  if (!expected) return false;
  if (expected.length !== password.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) {
    diff |= expected.charCodeAt(i) ^ password.charCodeAt(i);
  }
  return diff === 0;
}
