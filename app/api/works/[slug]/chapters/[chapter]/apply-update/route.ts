import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { applyChapterUpdate } from "@/lib/content/chapters";
import { syncWork } from "@/lib/content/sync";
import { decodeParam } from "@/lib/utils/params";

export const dynamic = "force-dynamic";

const Body = z.object({
  content: z.string(),
  title: z.string().min(1).max(120).optional(),
  status: z.enum(["draft", "final"]).optional(),
  reason: z.string().max(60).optional(),
});

// Applies a chapter update while snapshotting the current content first.
// Used by: chapter discussion "採用" button, design-session commit, restore.
export async function POST(req: NextRequest, { params }: { params: { slug: string; chapter: string } }) {
  const slug = decodeParam(params.slug);
  const chapterSlug = decodeParam(params.chapter);
  const body = await req.json().catch(() => null);
  const parsed = Body.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const { content, title, status, reason } = parsed.data;
  const result = await applyChapterUpdate(
    slug,
    chapterSlug,
    {
      content,
      ...(title !== undefined ? { title } : {}),
      ...(status !== undefined ? { status } : {}),
    },
    reason ?? "ai-edit",
  );
  await syncWork(slug);
  const { renamedTo, ...chapter } = result;
  return NextResponse.json({ chapter, renamedTo: renamedTo ?? null });
}
