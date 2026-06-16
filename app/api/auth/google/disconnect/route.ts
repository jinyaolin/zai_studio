import { NextResponse } from "next/server";
import { clearGoogleTokens } from "@/lib/auth/token-store";
import { getCurrentUserId } from "@/lib/auth/session";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Disconnect the current user's Google account. Clears their stored tokens.
export async function POST() {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  await clearGoogleTokens(userId);
  return NextResponse.json({ ok: true });
}
