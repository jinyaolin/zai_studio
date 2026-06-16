import { NextRequest } from "next/server";
import { z } from "zod";
import { generateStage } from "@/lib/design/generate";
import { isAIConfigured } from "@/lib/ai/provider";
import { decodeParam } from "@/lib/utils/params";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 120;

const Body = z.object({
  stageIndex: z.number().int().min(0).max(3),
});

// NDJSON: {"type":"meta"} then {"type":"delta","text":"..."} ... then {"type":"done"}
// or {"type":"error","error":"..."}.
export async function POST(
  req: NextRequest,
  { params }: { params: { slug: string; sessionId: string } },
) {
  if (!isAIConfigured()) {
    return new Response(
      JSON.stringify({ error: "AI not configured. Set ZAI_API_KEY in .env" }),
      { status: 503, headers: { "content-type": "application/json" } },
    );
  }
  const workSlug = decodeParam(params.slug);
  const sessionId = params.sessionId;

  const body = await req.json().catch(() => null);
  const parsed = Body.safeParse(body);
  if (!parsed.success) {
    return new Response(JSON.stringify({ error: "invalid body" }), {
      status: 400,
      headers: { "content-type": "application/json" },
    });
  }
  const { stageIndex } = parsed.data;

  const abort = new AbortController();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const encoder = new TextEncoder();
      const send = (o: unknown) =>
        controller.enqueue(encoder.encode(JSON.stringify(o) + "\n"));
      send({ type: "meta", stageIndex });

      const result = await generateStage(
        { workSlug, sessionId, stageIndex },
        {
          onDelta: (text) => send({ type: "delta", text }),
          signal: abort.signal,
        },
      );
      if (result.ok) {
        send({ type: "done", stageIndex });
      } else {
        send({ type: "error", error: result.error ?? "unknown" });
      }
      controller.close();
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
