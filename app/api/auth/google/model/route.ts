import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUserId } from "@/lib/auth/session";
import { setGeminiModel } from "@/lib/auth/token-store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const Body = z.object({
  geminiModel: z.string().max(80).nullable().optional(),
});

// Set the current user's preferred Gemini model. Empty / null clears it
// (falls back to gemini-2.5-pro default).
export async function POST(req: NextRequest) {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const parsed = Body.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }

  const settings = await setGeminiModel(userId, parsed.data.geminiModel ?? undefined);
  return NextResponse.json({ geminiModel: settings.geminiModel ?? null });
}
