import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { newSession, writeSession } from "@/lib/design/session";
import { decodeParam } from "@/lib/utils/params";

export const dynamic = "force-dynamic";

const Body = z.object({
  chapterSlug: z.string().nullable(),
  mode: z.enum(["continue", "rewrite", "fresh"]),
  goal: z.string().min(1).max(2000),
});

export async function POST(req: NextRequest, { params }: { params: { slug: string } }) {
  const slug = decodeParam(params.slug);
  const body = await req.json().catch(() => null);
  const parsed = Body.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const session = newSession({
    workSlug: slug,
    chapterSlug: parsed.data.chapterSlug,
    mode: parsed.data.mode,
    goal: parsed.data.goal,
  });
  const saved = await writeSession(session);
  return NextResponse.json({ session: saved }, { status: 201 });
}

export async function GET(_req: NextRequest, { params }: { params: { slug: string } }) {
  const slug = decodeParam(params.slug);
  const { listSessions } = await import("@/lib/design/session");
  const sessions = await listSessions(slug);
  const summaries = sessions.map((s) => ({
    id: s.id,
    chapterSlug: s.chapterSlug,
    mode: s.mode,
    goal: s.goal.slice(0, 80),
    committed: s.committed,
    createdAt: s.createdAt,
    updatedAt: s.updatedAt,
  }));
  return NextResponse.json({ sessions: summaries });
}
