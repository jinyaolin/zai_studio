import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { deleteChapter, readChapter, updateChapter } from "@/lib/content/chapters";
import { syncWork } from "@/lib/content/sync";
import { deleteChapterRow } from "@/lib/content/db";
import { decodeParam } from "@/lib/utils/params";

export const dynamic = "force-dynamic";

const PatchBody = z.object({
  title: z.string().min(1).max(120).optional(),
  content: z.string().optional(),
  status: z.enum(["draft", "final"]).optional(),
});

export async function GET(_req: NextRequest, { params }: { params: { slug: string; chapter: string } }) {
  const slug = decodeParam(params.slug);
  const chapterSlug = decodeParam(params.chapter);
  try {
    const chapter = await readChapter(slug, chapterSlug);
    return NextResponse.json({ chapter });
  } catch {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
}

export async function PATCH(req: NextRequest, { params }: { params: { slug: string; chapter: string } }) {
  const slug = decodeParam(params.slug);
  const chapterSlug = decodeParam(params.chapter);
  const body = await req.json().catch(() => null);
  const parsed = PatchBody.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const result = await updateChapter(slug, chapterSlug, parsed.data);
  await syncWork(slug);
  // Surface the rename to the frontend so it can swap the URL.
  const { renamedTo, ...chapter } = result;
  return NextResponse.json({ chapter, renamedTo: renamedTo ?? null });
}

export async function DELETE(_req: NextRequest, { params }: { params: { slug: string; chapter: string } }) {
  const slug = decodeParam(params.slug);
  const chapterSlug = decodeParam(params.chapter);
  await deleteChapter(slug, chapterSlug);
  deleteChapterRow(slug, chapterSlug);
  await syncWork(slug);
  return NextResponse.json({ ok: true });
}
