import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { readSession, updateStage } from "@/lib/design/session";
import { decodeParam } from "@/lib/utils/params";
import type { DesignStageStatus } from "@/lib/types";
import { getCurrentUserId } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

const PatchBody = z.object({
  status: z.enum(["pending", "generating", "done", "skipped"]).optional(),
  /** Author's edited version of the AI output (or free-form replacement if skipped). */
  output: z.string().optional(),
  /** Marks the variant the author locked in for downstream stages. */
  acceptedOutput: z.string().optional(),
});

export async function GET(_req: NextRequest, { params }: { params: { slug: string; sessionId: string; n: string } }) {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const slug = decodeParam(params.slug);
  const session = await readSession(userId, slug, params.sessionId);
  const idx = Number(params.n);
  if (Number.isNaN(idx) || idx < 0 || idx > 3) {
    return NextResponse.json({ error: "invalid stage" }, { status: 400 });
  }
  return NextResponse.json({ stage: session.stages[idx] });
}

export async function PATCH(req: NextRequest, { params }: { params: { slug: string; sessionId: string; n: string } }) {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const slug = decodeParam(params.slug);
  const idx = Number(params.n);
  if (Number.isNaN(idx) || idx < 0 || idx > 3) {
    return NextResponse.json({ error: "invalid stage" }, { status: 400 });
  }
  const body = await req.json().catch(() => null);
  const parsed = PatchBody.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const session = await readSession(userId, slug, params.sessionId);
  const current = session.stages[idx];
  const patch: Partial<typeof current> = {};
  if (parsed.data.status !== undefined) {
    patch.status = parsed.data.status as DesignStageStatus;
  }
  if (parsed.data.output !== undefined) patch.output = parsed.data.output;
  if (parsed.data.acceptedOutput !== undefined) {
    patch.acceptedOutput = parsed.data.acceptedOutput;
    patch.userEditedOutput = parsed.data.acceptedOutput;
  }

  const updated = await updateStage(userId, slug, params.sessionId, idx, patch);
  return NextResponse.json({ session: updated });
}
