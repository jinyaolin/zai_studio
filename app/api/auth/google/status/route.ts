import { NextResponse } from "next/server";
import { isGoogleConfigured } from "@/lib/auth/google-oauth";
import { loadGoogleTokens, loadAISettings } from "@/lib/auth/token-store";
import { getCurrentUserId } from "@/lib/auth/session";
import { queryUserById } from "@/lib/content/db";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Front-end uses this to render connect/disconnect + show Gemini model.
export async function GET() {
  const configured = isGoogleConfigured();
  if (!configured) {
    return NextResponse.json({ configured: false, connected: false });
  }

  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ configured: true, connected: false });

  const [tokenData, settings, user] = await Promise.all([
    loadGoogleTokens(userId),
    loadAISettings(userId),
    queryUserById(userId),
  ]);
  return NextResponse.json({
    configured: true,
    connected: tokenData !== null,
    email: tokenData?.userInfo.email ?? null,
    handle: user?.handle ?? null,
    geminiModel: settings.geminiModel ?? null,
  });
}
