import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createChapter, listChapters } from "@/lib/content/chapters";
import { syncWork } from "@/lib/content/sync";
import { decodeParam } from "@/lib/utils/params";
import { getCurrentUserId } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

const CreateBody = z.object({
  title: z.string().min(1).max(120),
  content: z.string().optional(),
  status: z.enum(["draft", "final"]).optional(),
});

export async function GET(_req: NextRequest, { params }: { params: { slug: string } }) {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const slug = decodeParam(params.slug);
  const chapters = await listChapters(userId, slug);
  return NextResponse.json({ chapters });
}

export async function POST(req: NextRequest, { params }: { params: { slug: string } }) {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const slug = decodeParam(params.slug);
  const body = await req.json().catch(() => null);
  const parsed = CreateBody.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const chapter = await createChapter(userId, slug, parsed.data);
  await syncWork(userId, slug);
  return NextResponse.json({ chapter }, { status: 201 });
}
