import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createWork } from "@/lib/content/works";
import { syncWork } from "@/lib/content/sync";
import { listWorks } from "@/lib/content/works";

export const dynamic = "force-dynamic";

const CreateBody = z.object({
  title: z.string().min(1).max(120),
  type: z.enum(["long", "medium", "short"]),
  synopsis: z.string().max(2000).optional(),
  genre: z.string().max(60).optional(),
  tags: z.array(z.string().max(30)).max(20).optional(),
});

export async function GET() {
  const works = await listWorks();
  return NextResponse.json({ works });
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const parsed = CreateBody.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const work = await createWork(parsed.data);
  await syncWork(work.slug);
  return NextResponse.json({ work }, { status: 201 });
}
