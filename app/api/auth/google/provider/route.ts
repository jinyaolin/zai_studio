import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  loadAISettings,
  saveAISettings,
  type AIProviderName,
} from "@/lib/auth/token-store";
import { loadGoogleTokens } from "@/lib/auth/token-store";
import { invalidateProviderCache } from "@/lib/ai/provider";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const Body = z.object({
  provider: z.enum(["zai", "gemini-oauth"]).optional(),
  geminiModel: z.string().max(80).nullable().optional(),
});

// PATCH-style POST: update active provider and/or gemini model.
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const parsed = Body.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const { provider, geminiModel } = parsed.data;
  const current = await loadAISettings();

  // Guard: switching to gemini-oauth requires an active connection.
  if (provider === "gemini-oauth") {
    const tokens = await loadGoogleTokens();
    if (!tokens) {
      return NextResponse.json(
        { error: "Google 尚未連線，無法切換到 Gemini" },
        { status: 400 },
      );
    }
  }

  const next = { ...current };
  if (provider) next.activeProvider = provider as AIProviderName;
  if (geminiModel !== undefined) next.geminiModel = geminiModel || undefined;
  await saveAISettings(next);

  invalidateProviderCache();
  return NextResponse.json({
    activeProvider: next.activeProvider,
    geminiModel: next.geminiModel ?? null,
  });
}
