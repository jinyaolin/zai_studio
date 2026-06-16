import { NextRequest, NextResponse } from "next/server";
import { readVersionContent } from "@/lib/content/chapters";
import { decodeParam } from "@/lib/utils/params";
import { getCurrentUserId } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  { params }: { params: { slug: string; chapter: string; timestamp: string } },
) {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const slug = decodeParam(params.slug);
  const chapterSlug = decodeParam(params.chapter);
  try {
    const { content, title } = await readVersionContent(userId, slug, chapterSlug, params.timestamp);
    return NextResponse.json({ content, title });
  } catch {
    return NextResponse.json({ error: "version not found" }, { status: 404 });
  }
}
