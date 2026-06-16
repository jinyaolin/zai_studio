import { NextRequest, NextResponse } from "next/server";
import { deleteSession, readSession } from "@/lib/design/session";
import { decodeParam } from "@/lib/utils/params";

export const dynamic = "force-dynamic";

export async function DELETE(_req: NextRequest, { params }: { params: { slug: string; sessionId: string } }) {
  const slug = decodeParam(params.slug);
  try {
    await readSession(slug, params.sessionId);
  } catch {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  await deleteSession(slug, params.sessionId);
  return NextResponse.json({ ok: true });
}
