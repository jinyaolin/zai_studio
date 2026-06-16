import { NextRequest, NextResponse } from "next/server";
import { readMemory } from "@/lib/memory/store";
import { getAdjacentChapters, readChapter } from "@/lib/content/chapters";
import { readWork } from "@/lib/content/works";
import { getProvider } from "@/lib/ai/provider";
import { getCurrentUserId } from "@/lib/auth/session";
import { buildMemoryExtractionPrompt } from "@/lib/ai/memory-extract";
import { DISABLE_THINKING_FOR_EXTRACTION } from "@/lib/ai/thinking-policy";
import { decodeParam } from "@/lib/utils/params";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 120;

// Streams NDJSON: {"type":"delta","text":"..."} ... {"type":"done"}
// The accumulated text contains a <PROPOSAL>{json}</PROPOSAL> with the proposed
// full memory update. The client parses it.
export async function POST(_req: NextRequest, { params }: { params: { slug: string; chapter: string } }) {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const workSlug = decodeParam(params.slug);
  const chapterSlug = decodeParam(params.chapter);

  let work, chapter;
  try {
    work = await readWork(userId, workSlug);
    chapter = await readChapter(userId, workSlug, chapterSlug);
  } catch {
    return new Response(JSON.stringify({ error: "not found" }), {
      status: 404,
      headers: { "content-type": "application/json" },
    });
  }

  const memory = await readMemory(userId, workSlug);
  const adj = await getAdjacentChapters(userId, workSlug, chapterSlug);

  const { system, user } = buildMemoryExtractionPrompt({
    work,
    chapter,
    memory,
    previousChapter: adj.previous,
  });

  const abort = new AbortController();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const encoder = new TextEncoder();
      const send = (o: unknown) =>
        controller.enqueue(encoder.encode(JSON.stringify(o) + "\n"));
      send({ type: "meta" });

      let output = "";
      const provider = await getProvider(userId);
      try {
        for await (const delta of provider.stream(
          [
            { role: "system", content: system },
            { role: "user", content: user },
          ],
          {
            temperature: 0.4, // low temp: this is structured work
            signal: abort.signal,
            disableThinking: DISABLE_THINKING_FOR_EXTRACTION, // keep reasoning on for structural analysis
          },
        )) {
          output += delta;
          send({ type: "delta", text: delta });
        }
        send({ type: "done" });
      } catch (err) {
        send({ type: "error", error: (err as Error).message });
      } finally {
        controller.close();
      }
    },
    cancel() {
      abort.abort();
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "application/x-ndjson; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      "x-accel-buffering": "no",
    },
  });
}
