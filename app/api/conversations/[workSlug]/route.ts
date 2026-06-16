import { NextRequest, NextResponse } from "next/server";
import { listConversations, readConversation } from "@/lib/memory/conversations";
import { decodeParam } from "@/lib/utils/params";
import { getCurrentUserId } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, { params }: { params: { workSlug: string } }) {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const workSlug = decodeParam(params.workSlug);
  const id = req.nextUrl.searchParams.get("id");
  if (id) {
    try {
      const conv = await readConversation(userId, workSlug, id);
      return NextResponse.json({ conversation: conv });
    } catch {
      return NextResponse.json({ error: "not found" }, { status: 404 });
    }
  }
  const conversations = await listConversations(userId, workSlug);
  const summaries = conversations.map((c) => ({
    id: c.id,
    title: c.title,
    messageCount: c.messages.length,
    createdAt: c.createdAt,
    updatedAt: c.updatedAt,
  }));
  return NextResponse.json({ conversations: summaries });
}
