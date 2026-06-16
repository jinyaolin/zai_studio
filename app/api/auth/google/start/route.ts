import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { buildAuthUrl, isGoogleConfigured, newState } from "@/lib/auth/google-oauth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Kick off OAuth: stash a random state in a short-lived cookie, then redirect
// to Google's consent screen. state is checked in the callback to prevent CSRF.
export async function GET() {
  if (!isGoogleConfigured()) {
    return NextResponse.json(
      { error: "Google OAuth env not set. See .env.example." },
      { status: 503 },
    );
  }
  const state = newState();
  cookies().set("zai_oauth_state", state, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 600, // 10 min — plenty for the OAuth dance
    path: "/",
  });
  return NextResponse.redirect(buildAuthUrl(state));
}
