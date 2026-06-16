import { NextRequest, NextResponse } from "next/server";
import { deleteConversation } from "@/lib/memory/conversations";
import { deleteConversationRow } from "@/lib/content/db";
import { decodeParam } from "@/lib/utils/params";

export const dynamic = "force-dynamic";

export async function DELETE(_req: NextRequest, { params }: { params: { workSlug: string; id: string } }) {
  const workSlug = decodeParam(params.workSlug);
  await deleteConversation(workSlug, params.id);
  deleteConversationRow(params.id);
  return NextResponse.json({ ok: true });
}
