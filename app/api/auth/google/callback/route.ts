import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { exchangeCode, fetchUserInfo } from "@/lib/auth/google-oauth";
import { setSessionCookie } from "@/lib/auth/session";
import {
  insertUser,
  queryUserBySub,
  touchUserLogin,
} from "@/lib/content/db";
import { saveGoogleTokens } from "@/lib/auth/token-store";
import { newUserId } from "@/lib/content/ids";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Google redirects here with ?code=...&state=... after the user consents.
// 1. Verify state (CSRF protection)
// 2. Exchange code for OAuth tokens (encrypted, stored per-user)
// 3. Find-or-create user row by Google subject ID
// 4. Set session cookie carrying the userId
// 5. Redirect: handle-less users → /studio/welcome, others → /studio
export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const error = url.searchParams.get("error");

  const loginUrl = new URL("/studio/login", url.origin);
  const welcomeUrl = new URL("/studio/welcome", url.origin);
  const studioUrl = new URL("/studio", url.origin);

  if (error) {
    return NextResponse.redirect(`${loginUrl}?google_error=${encodeURIComponent(error)}`);
  }
  if (!code || !state) {
    return NextResponse.redirect(`${loginUrl}?google_error=missing_params`);
  }

  const expectedState = cookies().get("zai_oauth_state")?.value;
  cookies().delete("zai_oauth_state");

  if (!expectedState || expectedState !== state) {
    return NextResponse.redirect(`${loginUrl}?google_error=state_mismatch`);
  }

  try {
    const tokens = await exchangeCode(code);
    const userInfo = await fetchUserInfo(tokens.access_token);

    // Find or create user row keyed by Google subject ID.
    let user = queryUserBySub(userInfo.sub);
    if (!user) {
      const now = new Date().toISOString();
      user = insertUser({
        id: newUserId(),
        email: userInfo.email,
        sub: userInfo.sub,
        createdAt: now,
      });
    } else {
      touchUserLogin(user.id, new Date().toISOString());
    }

    // Persist OAuth tokens for this user (encrypted at rest).
    // Note: the path under data/users/<userId>/ will be created on write;
    // until P2 wraps up, this writes to a flat data/google-tokens.json —
    // we keep the per-user key as the userId so multi-user scoping is right
    // once the storage layout is sharded.
    await saveGoogleTokens(tokens, userInfo, user.id);

    // Set session cookie.
    await setSessionCookie(user.id);

    // First-time users without a handle go to onboarding.
    const target = user.handle ? studioUrl : welcomeUrl;
    return NextResponse.redirect(target);
  } catch (err) {
    console.error("[google:callback] failed:", (err as Error).message);
    return NextResponse.redirect(
      `${loginUrl}?google_error=${encodeURIComponent((err as Error).message)}`,
    );
  }
}
