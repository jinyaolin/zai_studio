import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { restoreVersion } from "@/lib/content/chapters";
import { syncWork } from "@/lib/content/sync";
import { decodeParam } from "@/lib/utils/params";
import { getCurrentUserId } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

const Body = z.object({ timestamp: z.string().min(1) });

export async function POST(req: NextRequest, { params }: { params: { slug: string; chapter: string } }) {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const slug = decodeParam(params.slug);
  const chapterSlug = decodeParam(params.chapter);
  const body = await req.json().catch(() => null);
  const parsed = Body.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  try {
    const chapter = await restoreVersion(userId, slug, chapterSlug, parsed.data.timestamp);
    await syncWork(userId, slug);
    return NextResponse.json({ chapter });
  } catch {
    return NextResponse.json({ error: "version not found" }, { status: 404 });
  }
}
