import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { readChapter } from "@/lib/content/chapters";
import { readWork } from "@/lib/content/works";
import { chunkChapter } from "@/lib/tts/chunker";
import { ensureChunk, isTTSConfigured } from "@/lib/tts/provider";
import { normalizeNarration, narrationVoiceString } from "@/lib/tts/narration-server";
import type { AudioManifest } from "@/lib/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

const Body = z.object({
  workSlug: z.string().min(1),
  chapterSlug: z.string().min(1),
  // If provided, only ensure these indices (lazy synthesis for first play).
  only: z.array(z.number().nonnegative()).optional(),
});

export async function POST(req: NextRequest) {
  if (!isTTSConfigured()) {
    return NextResponse.json(
      { error: "TTS not configured. Set TTS_API_KEY in .env" },
      { status: 503 },
    );
  }
  const body = await req.json().catch(() => null);
  const parsed = Body.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const { workSlug, chapterSlug } = parsed.data;

  // Resolve per-work narration → opaque voice string for cache keying.
  let work;
  try {
    work = await readWork(workSlug);
  } catch {
    return NextResponse.json({ error: "work not found" }, { status: 404 });
  }
  const narration = normalizeNarration(work.narration);
  const voice = narrationVoiceString(narration);

  let chapter;
  try {
    chapter = await readChapter(workSlug, chapterSlug);
  } catch {
    return NextResponse.json({ error: "chapter not found" }, { status: 404 });
  }

  const chunks = chunkChapter(chapter.content);
  const indices = parsed.data.only ?? chunks.map((_, i) => i);

  const audioChunks = [];
  for (const index of indices) {
    if (index >= chunks.length) continue;
    audioChunks.push(
      await ensureChunk(workSlug, chapterSlug, index, voice, chunks[index], { narration }),
    );
  }

  const manifest: AudioManifest = {
    workSlug,
    chapterSlug,
    voice,
    chunks: audioChunks.sort((a, b) => a.index - b.index),
  };
  return NextResponse.json({ manifest, totalChunks: chunks.length });
}
