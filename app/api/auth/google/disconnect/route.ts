import { NextResponse } from "next/server";
import { clearGoogleTokens, loadAISettings, saveAISettings } from "@/lib/auth/token-store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Disconnect: clear stored tokens AND fall back to z.ai so getProvider()
// doesn't blow up trying to call Gemini with no credentials.
export async function POST() {
  await clearGoogleTokens();
  const settings = await loadAISettings();
  if (settings.activeProvider === "gemini-oauth") {
    await saveAISettings({ ...settings, activeProvider: "zai" });
  }
  return NextResponse.json({ ok: true });
}
