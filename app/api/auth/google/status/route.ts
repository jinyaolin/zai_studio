import { NextResponse } from "next/server";
import { isGoogleConfigured } from "@/lib/auth/google-oauth";
import { loadGoogleTokens, loadAISettings } from "@/lib/auth/token-store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Front-end uses this to render connect/disconnect + provider selector.
export async function GET() {
  const configured = isGoogleConfigured();
  if (!configured) {
    return NextResponse.json({
      configured: false,
      connected: false,
      activeProvider: "zai",
    });
  }
  const [tokenData, settings] = await Promise.all([loadGoogleTokens(), loadAISettings()]);
  return NextResponse.json({
    configured: true,
    connected: tokenData !== null,
    email: tokenData?.userInfo.email ?? null,
    activeProvider: settings.activeProvider,
    geminiModel: settings.geminiModel ?? null,
  });
}
