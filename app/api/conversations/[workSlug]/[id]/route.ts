import { NextRequest, NextResponse } from "next/server";
import { deleteConversation } from "@/lib/memory/conversations";
import { deleteConversationRow } from "@/lib/content/db";
import { decodeParam } from "@/lib/utils/params";
import { getCurrentUserId } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export async function DELETE(_req: NextRequest, { params }: { params: { workSlug: string; id: string } }) {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const workSlug = decodeParam(params.workSlug);
  await deleteConversation(userId, workSlug, params.id);
  deleteConversationRow(userId, params.id);
  return NextResponse.json({ ok: true });
}
