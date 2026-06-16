import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { readChapter } from "@/lib/content/chapters";
import { readWork } from "@/lib/content/works";
import { chunkChapter } from "@/lib/tts/chunker";
import { ensureChunk, isTTSConfigured } from "@/lib/tts/provider";
import { normalizeNarration, narrationVoiceString } from "@/lib/tts/narration-server";
import { getCurrentUserId } from "@/lib/auth/session";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 600;

const Body = z.object({
  workSlug: z.string().min(1),
  chapterSlug: z.string().min(1),
});

// Fire-and-forget: synth all chunks of a chapter in the background.
// Returns immediately with the total chunk count. The reader's AudioPlayer
// will find cached files as they become available.
//
// Trigger: chapter publish, manual button, or Design commit to a published work.
export async function POST(req: NextRequest) {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  if (!isTTSConfigured()) {
    return NextResponse.json(
      { error: "TTS not configured" },
      { status: 503 },
    );
  }
  const body = await req.json().catch(() => null);
  const parsed = Body.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const { workSlug, chapterSlug } = parsed.data;

  let work;
  try {
    work = await readWork(userId, workSlug);
  } catch {
    return NextResponse.json({ error: "work not found" }, { status: 404 });
  }
  const narration = normalizeNarration(work.narration);
  const voice = narrationVoiceString(narration);

  let chapter;
  try {
    chapter = await readChapter(userId, workSlug, chapterSlug);
  } catch {
    return NextResponse.json({ error: "chapter not found" }, { status: 404 });
  }

  const chunks = chunkChapter(chapter.content);
  if (chunks.length === 0) {
    return NextResponse.json({ ok: true, totalChunks: 0, message: "empty chapter" });
  }

  // Detached: synth runs after we return. Next.js Node runtime keeps the
  // promise alive as long as the server process is running.
  void (async () => {
    let done = 0;
    for (let i = 0; i < chunks.length; i++) {
      try {
        await ensureChunk(userId, workSlug, chapterSlug, i, voice, chunks[i], { narration });
        done++;
        if (done % 5 === 0) {
          console.log(`[tts:prefetch] ${workSlug}/${chapterSlug}: ${done}/${chunks.length} chunks done`);
        }
      } catch (err) {
        console.error(`[tts:prefetch] chunk ${i} failed:`, (err as Error).message);
        // continue with next chunk
      }
    }
    console.log(`[tts:prefetch] ${workSlug}/${chapterSlug}: complete (${done}/${chunks.length})`);
  })();

  return NextResponse.json({
    ok: true,
    totalChunks: chunks.length,
    voice,
    message: `prefetching ${chunks.length} chunks in background`,
  });
}
