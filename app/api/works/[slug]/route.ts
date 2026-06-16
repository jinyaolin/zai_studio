import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { deleteWork, readWork, updateWork, updateWorkStatus } from "@/lib/content/works";
import { syncWork } from "@/lib/content/sync";
import { deleteWorkRow } from "@/lib/content/db";
import { normalizeNarration } from "@/lib/tts/narration-server";
import { decodeParam } from "@/lib/utils/params";

export const dynamic = "force-dynamic";

const NarrationBody = z.object({
  voiceCharacter: z.string().min(1).max(60),
  stylePreset: z.string().min(1).max(60),
  customInstruct: z.string().max(1000),
  speed: z.number().min(0.5).max(2.0),
});

const PatchBody = z.object({
  title: z.string().min(1).max(120).optional(),
  type: z.enum(["long", "medium", "short"]).optional(),
  synopsis: z.string().max(2000).optional(),
  genre: z.string().max(60).nullable().optional(),
  tags: z.array(z.string().max(30)).max(20).optional(),
  status: z.enum(["draft", "published", "archived"]).optional(),
  narration: NarrationBody.optional(),
});

export async function GET(_req: NextRequest, { params }: { params: { slug: string } }) {
  const slug = decodeParam(params.slug);
  try {
    const work = await readWork(slug);
    return NextResponse.json({ work });
  } catch {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
}

export async function PATCH(req: NextRequest, { params }: { params: { slug: string } }) {
  const slug = decodeParam(params.slug);
  const body = await req.json().catch(() => null);
  const parsed = PatchBody.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const data = parsed.data;
  let work;
  let renamedTo: string | undefined;
  if (data.status) {
    work = await updateWorkStatus(slug, data.status);
  }
  const patch: Record<string, unknown> = { ...data };
  delete patch.status;
  // normalize null genre → undefined
  if (patch.genre === null) patch.genre = undefined;
  // Normalize narration through the canonical defaults so partial updates
  // (e.g. only changing style) still produce a complete, valid config.
  if (patch.narration) {
    patch.narration = normalizeNarration(patch.narration as z.infer<typeof NarrationBody>);
  }
  if (Object.keys(patch).length > 0) {
    const result = await updateWork(slug, patch);
    renamedTo = result.renamedTo;
    const { renamedTo: _drop, ...rest } = result;
    work = rest;
  }
  if (!work) work = await readWork(renamedTo ?? slug);
  await syncWork(renamedTo ?? slug);
  return NextResponse.json({ work, renamedTo: renamedTo ?? null });
}

export async function DELETE(_req: NextRequest, { params }: { params: { slug: string } }) {
  const slug = decodeParam(params.slug);
  await deleteWork(slug);
  deleteWorkRow(slug);
  return NextResponse.json({ ok: true });
}
