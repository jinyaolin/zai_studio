import { cookies } from "next/headers";
import {
  SESSION_COOKIE_NAME,
  SESSION_MAX_AGE,
  makeUserSessionToken,
  verifyUserSessionToken,
} from "./token";

// Server-only helpers (route handlers & server components). For middleware,
// import from `./token` directly to avoid pulling `next/headers`.

export async function makeSessionToken(userId: string): Promise<string> {
  return makeUserSessionToken(userId);
}

export async function verifySessionToken(token: string | undefined | null) {
  return verifyUserSessionToken(token);
}

export async function setSessionCookie(userId: string): Promise<void> {
  const token = await makeUserSessionToken(userId);
  cookies().set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: SESSION_MAX_AGE,
    path: "/",
  });
}

export async function clearSessionCookie(): Promise<void> {
  cookies().delete(SESSION_COOKIE_NAME);
}

export async function isAuthenticated(): Promise<boolean> {
  const token = cookies().get(SESSION_COOKIE_NAME)?.value;
  return (await verifyUserSessionToken(token)) !== null;
}

/**
 * Read the authenticated user's id from the session cookie.
 * Returns null if not signed in. Route handlers should treat null as 401.
 *
 * Server-side only. For middleware, use verifyUserSessionToken directly
 * (next/headers can't be imported in edge runtime).
 */
export async function getCurrentUserId(): Promise<string | null> {
  const token = cookies().get(SESSION_COOKIE_NAME)?.value;
  const result = await verifyUserSessionToken(token);
  return result?.userId ?? null;
}

export { SESSION_COOKIE_NAME };
