import { NextRequest, NextResponse } from "next/server";
import { deleteSession, readSession } from "@/lib/design/session";
import { decodeParam } from "@/lib/utils/params";
import { getCurrentUserId } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export async function DELETE(_req: NextRequest, { params }: { params: { slug: string; sessionId: string } }) {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const slug = decodeParam(params.slug);
  try {
    await readSession(userId, slug, params.sessionId);
  } catch {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  await deleteSession(userId, slug, params.sessionId);
  return NextResponse.json({ ok: true });
}
