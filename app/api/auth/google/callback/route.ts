import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import {
  exchangeCode,
  fetchUserInfo,
} from "@/lib/auth/google-oauth";
import { saveGoogleTokens } from "@/lib/auth/token-store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Google redirects here with ?code=...&state=... after the user consents.
// Verify state, exchange code for tokens, persist encrypted, redirect home.
export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const error = url.searchParams.get("error");

  const settingsUrl = new URL("/studio/settings", url.origin);

  if (error) {
    return NextResponse.redirect(`${settingsUrl}?google_error=${encodeURIComponent(error)}`);
  }
  if (!code || !state) {
    return NextResponse.redirect(`${settingsUrl}?google_error=missing_params`);
  }

  const expectedState = cookies().get("zai_oauth_state")?.value;
  cookies().delete("zai_oauth_state");

  if (!expectedState || expectedState !== state) {
    return NextResponse.redirect(`${settingsUrl}?google_error=state_mismatch`);
  }

  try {
    const tokens = await exchangeCode(code);
    const userInfo = await fetchUserInfo(tokens.access_token);
    await saveGoogleTokens(tokens, userInfo);
    return NextResponse.redirect(`${settingsUrl}?google_connected=1`);
  } catch (err) {
    console.error("[google:callback] token exchange failed:", (err as Error).message);
    return NextResponse.redirect(
      `${settingsUrl}?google_error=${encodeURIComponent((err as Error).message)}`,
    );
  }
}
