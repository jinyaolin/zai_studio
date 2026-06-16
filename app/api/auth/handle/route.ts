import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUserId } from "@/lib/auth/session";
import { isHandleTaken, queryUserById, setUserHandle } from "@/lib/content/db";
import { isValidHandle } from "@/lib/content/handle";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const Body = z.object({ handle: z.string().min(1).max(60) });

// First-time onboarding: claim a handle. Locked after selection — there is
// no rename endpoint by design (per architectural decision: avoid cascade).
export async function POST(req: NextRequest) {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const parsed = Body.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }
  const handle = parsed.data.handle.trim();

  if (!isValidHandle(handle)) {
    return NextResponse.json(
      { error: "代稱只能小寫英數字 / 連字號 / 底線，3-30 字" },
      { status: 400 },
    );
  }

  const user = queryUserById(userId);
  if (!user) return NextResponse.json({ error: "user not found" }, { status: 404 });
  if (user.handle) {
    return NextResponse.json({ error: "代稱已設定，無法變更" }, { status: 409 });
  }

  if (isHandleTaken(handle, userId)) {
    return NextResponse.json({ error: "代稱已被使用" }, { status: 409 });
  }

  const updated = setUserHandle(userId, handle);
  return NextResponse.json({ user: updated });
}
