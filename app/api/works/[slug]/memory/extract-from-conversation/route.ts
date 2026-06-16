import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { readMemory } from "@/lib/memory/store";
import { readConversation } from "@/lib/memory/conversations";
import { getProvider } from "@/lib/ai/provider";
import { getCurrentUserId } from "@/lib/auth/session";
import { DISABLE_THINKING_FOR_EXTRACTION } from "@/lib/ai/thinking-policy";
import { summarizeMemoryForPrompt } from "@/lib/memory/retrieve";
import { decodeParam } from "@/lib/utils/params";
import type { ChatMessage, WorkMemory } from "@/lib/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 120;

const Body = z.object({
  conversationId: z.string().min(1),
});

// Streams NDJSON: {"type":"delta","text":"..."} ... {"type":"done"}
// AI reads the conversation history + current memory, outputs a proposed
// updated memory object wrapped in <PROPOSAL>{json}</PROPOSAL>.
export async function POST(req: NextRequest, { params }: { params: { slug: string } }) {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const workSlug = decodeParam(params.slug);
  const body = await req.json().catch(() => null);
  const parsed = Body.safeParse(body);
  if (!parsed.success) {
    return new Response(JSON.stringify({ error: "invalid body" }), {
      status: 400,
      headers: { "content-type": "application/json" },
    });
  }

  let conversation;
  try {
    conversation = await readConversation(userId, workSlug, parsed.data.conversationId);
  } catch {
    return new Response(JSON.stringify({ error: "conversation not found" }), {
      status: 404,
      headers: { "content-type": "application/json" },
    });
  }

  const memory = await readMemory(userId, workSlug);

  // Render conversation as a transcript the model can read.
  const transcript = conversation.messages
    .filter((m) => m.role === "user" || m.role === "assistant")
    .map((m: ChatMessage) => `${m.role === "user" ? "作者" : "zai"}：${m.content}`)
    .join("\n\n");

  const system = [
    "你是這部作品的記憶管理員。作者剛結束一段創作討論，要把討論中浮現的東西沉澱進記憶。",
    "",
    "規則：",
    "- 只把**討論中實際確定的東西**寫進記憶，不要過度引申或創造。",
    "- 角色新增：討論中明確建立的新角色才加；既有角色被深化→update。",
    "- 世界觀新增：討論中提及的具體地點 / 物件 / 規則 / 歷史背景才加。",
    "- 情節線：討論中決定要走的劇情線，或對既有情節線的推進。",
    "- 風格：只有當討論明確形成新的 motif / 禁忌 / POV 決定才 append；否則原樣保留。",
    "- 保留既有 id；新條目用 `new-<隨機>` 格式當 id。",
    "- 不要刪除既有條目，除非討論中明確推翻。",
    "- description / summary 簡明（每個 ≤ 200 字），保留可檢索關鍵字。",
    "",
    "── 現有的記憶 JSON（你要輸出更新版的這個物件）──",
    "```json",
    JSON.stringify(
      {
        characters: memory.characters,
        worldbuilding: memory.worldbuilding,
        plot: memory.plot,
        style: memory.style,
      },
      null,
      2,
    ),
    "```",
    "",
    "輸出格式：",
    "1. 先條列說明你打算新增 / 更新哪些條目（讓作者審查時看）。",
    "2. 然後輸出 `<PROPOSAL>` 包住**完整更新後的記憶 JSON**（4 個欄位都齊全），`</PROPOSAL>` 結束。",
  ].join("\n");

  const user = [
    "以下是剛結束的討論。請把該沉澱的東西整理進記憶。",
    "",
    "── 討論逐字稿 ──",
    transcript || "（空對話）",
  ].join("\n");

  const abort = new AbortController();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const encoder = new TextEncoder();
      const send = (o: unknown) =>
        controller.enqueue(encoder.encode(JSON.stringify(o) + "\n"));
      send({ type: "meta", conversationId: conversation.id });

      let output = "";
      const provider = await getProvider(userId);
      try {
        for await (const delta of provider.stream(
          [
            { role: "system", content: system },
            { role: "user", content: user },
          ],
          {
            temperature: 0.4,
            signal: abort.signal,
            disableThinking: DISABLE_THINKING_FOR_EXTRACTION,
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

// Type re-export to keep TS happy with the import above.
export type { WorkMemory };
