import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { nanoid } from "nanoid";
import type { ChatMessage, ConversationScope } from "@/lib/types";
import { readMemory } from "@/lib/memory/store";
import { readCharacters, readPlot, readWorldbuilding } from "@/lib/memory/store";
import { getAdjacentChapters, readChapter } from "@/lib/content/chapters";
import { disableThinkingForChatMode } from "@/lib/ai/thinking-policy";
import {
  appendMessage,
  listConversationsByScope,
  newConversation,
  readConversation,
  writeConversation,
} from "@/lib/memory/conversations";
import { preparePrompt, buildProviderMessages } from "@/lib/ai/context";
import { getProvider } from "@/lib/ai/provider";
import { getCurrentUserId } from "@/lib/auth/session";
import { CHAT_MODES } from "@/lib/ai/prompts";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const ScopeSchema = z.union([
  z.object({ kind: z.literal("general") }),
  z.object({
    kind: z.literal("memory"),
    memoryKind: z.enum(["characters", "worldbuilding", "plot"]),
    itemId: z.string().min(1),
  }),
  z.object({ kind: z.literal("chapter"), chapterSlug: z.string().min(1) }),
  z.object({ kind: z.literal("design"), sessionId: z.string().min(1) }),
]);

const Body = z.object({
  workSlug: z.string().min(1),
  conversationId: z.string().nullable().optional(),
  mode: z.enum(["brainstorm", "continue", "check", "roleplay", "edit", "research"]),
  message: z.string().min(1).max(8000),
  scope: ScopeSchema.optional(),
});

// NDJSON event-stream protocol:
//   {"type":"meta","conversationId":"...","mode":"..."}
//   {"type":"delta","text":"..."}            (zero or more)
//   {"type":"done","messageId":"..."}
//   {"type":"error","error":"..."}
export async function POST(req: NextRequest) {
  const userId = await getCurrentUserId();
  if (!userId) {
    return new Response(JSON.stringify({ error: "unauthorized" }), {
      status: 401,
      headers: { "content-type": "application/json" },
    });
  }

  const abort = new AbortController();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const encoder = new TextEncoder();
      const send = (obj: unknown) =>
        controller.enqueue(encoder.encode(JSON.stringify(obj) + "\n"));

      try {
        const body = await req.json();
        const parsed = Body.safeParse(body);
        if (!parsed.success) {
          send({ type: "error", error: "invalid body" });
          controller.close();
          return;
        }
        const { workSlug, mode, message } = parsed.data;
        const scope: ConversationScope = parsed.data.scope ?? { kind: "general" };
        let conversationId = parsed.data.conversationId;

        // Load or create conversation. For non-general scopes, find existing
        // scoped conversation (one per memory item / chapter) or create new.
        let conversation = conversationId
          ? await readConversation(userId, workSlug, conversationId)
          : null;

        if (!conversation) {
          if (scope.kind !== "general") {
            const existing = await listConversationsByScope(userId, workSlug, scope);
            conversation = existing[0] ?? newConversation(workSlug, scope);
          } else {
            conversation = newConversation(workSlug, scope);
          }
        }

        // Append user message
        const userMsg: ChatMessage = {
          id: nanoid(12),
          role: "user",
          content: message,
          mode,
          createdAt: new Date().toISOString(),
        };
        conversation = appendMessage(conversation, userMsg);

        // Build context. Load whatever the scope needs.
        const memory = await readMemory(userId, workSlug);
        let memoryItemJson: string | undefined;
        let chapter;

        if (scope.kind === "memory") {
          const list =
            scope.memoryKind === "characters"
              ? await readCharacters(userId, workSlug)
              : scope.memoryKind === "worldbuilding"
                ? await readWorldbuilding(userId, workSlug)
                : await readPlot(userId, workSlug);
          const item = list.find((x) => x.id === scope.itemId);
          if (!item) {
            send({ type: "error", error: "memory item not found" });
            controller.close();
            return;
          }
          memoryItemJson = JSON.stringify(item, null, 2);
        } else if (scope.kind === "chapter") {
          try {
            chapter = await readChapter(userId, workSlug, scope.chapterSlug);
          } catch {
            send({ type: "error", error: "chapter not found" });
            controller.close();
            return;
          }
        }

        // For chapter scope, also load adjacent chapters so the model can keep
        // the story continuous across chapter boundaries.
        let previousChapter = null;
        let nextChapter = null;
        if (scope.kind === "chapter") {
          const adj = await getAdjacentChapters(userId, workSlug, scope.chapterSlug);
          previousChapter = adj.previous;
          nextChapter = adj.next;
        }

        const prepared = await preparePrompt({
          userId,
          workSlug,
          memory,
          history: conversation.messages,
          workTitle: conversation.title === "未命名對話" ? workSlug : conversation.title,
          mode,
          scope,
          chapter,
          previousChapter,
          nextChapter,
          memoryItemJson,
        });
        const providerMessages = buildProviderMessages(prepared);

        send({
          type: "meta",
          conversationId: conversation.id,
          mode,
          model: "(gemini)",
        });

        // Stream tokens
        let assistantText = "";
        const provider = await getProvider(userId);
        const spec = CHAT_MODES[mode];
        // Per-call thinking policy:
        //   - chapter scope writes prose / proposals → keep reasoning on
        //   - memory scope is conversational → disable
        //   - general: by mode (check/edit/continue on, brainstorm/roleplay/research off)
        const disableThinking =
          scope?.kind === "chapter"
            ? false
            : scope?.kind === "memory"
              ? true
              : disableThinkingForChatMode(mode);
        try {
          for await (const delta of provider.stream(providerMessages, {
            mode,
            temperature: spec.temperature,
            signal: abort.signal,
            disableThinking,
          })) {
            assistantText += delta;
            send({ type: "delta", text: delta });
          }
        } catch (err) {
          send({ type: "error", error: (err as Error).message });
          controller.close();
          return;
        }

        // Persist assistant message + conversation
        const assistantMsg: ChatMessage = {
          id: nanoid(12),
          role: "assistant",
          content: assistantText,
          mode,
          createdAt: new Date().toISOString(),
        };
        conversation = appendMessage(conversation, assistantMsg);
        await writeConversation(userId, conversation);
        conversationId = conversation.id;

        send({ type: "done", messageId: assistantMsg.id, conversationId });
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
