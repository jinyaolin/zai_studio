import { cookies } from "next/headers";
import {
  SESSION_COOKIE_NAME,
  SESSION_MAX_AGE,
  makeSessionToken as makeToken,
  verifySessionToken as verifyToken,
  verifyPassword as verifyPw,
} from "./token";

// Server-only helpers (route handlers & server components). For middleware,
// import from `./token` directly to avoid pulling `next/headers`.

export async function makeSessionToken(): Promise<string> {
  return makeToken();
}

export async function verifySessionToken(token: string | undefined | null): Promise<boolean> {
  return verifyToken(token);
}

export function verifyPassword(password: string): boolean {
  return verifyPw(password);
}

export async function setSessionCookie(token: string): Promise<void> {
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
  return verifyToken(token);
}

export { SESSION_COOKIE_NAME };
