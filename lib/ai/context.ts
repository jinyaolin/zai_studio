import type {
  ChatMessage,
  ChatMode,
  Chapter,
  ConversationScope,
  ProviderChatMessage,
  WorkMemory,
} from "@/lib/types";
import { retrieveRelevantMemoryWithEmbeddings, summarizeMemoryForPrompt } from "@/lib/memory/retrieve";
import { buildSystemPrompt, buildMemoryItemSystemPrompt, buildChapterSystemPrompt } from "./prompts";

export interface PreparedPrompt {
  systemPrompt: string;
  history: ProviderChatMessage[];
  mode: ChatMode;
  /** Whether the retrieval used vector similarity or fell back to keyword matching. */
  retrievalSource: "vectors" | "keyword" | "all" | "none";
}

interface PrepareArgs {
  userId: string;
  workSlug: string;
  memory: WorkMemory;
  history: ChatMessage[];
  workTitle: string;
  mode: ChatMode;
  scope?: ConversationScope;
  chapter?: Chapter;          // required when scope.kind === "chapter"
  previousChapter?: Chapter | null;
  nextChapter?: Chapter | null;
  memoryItemJson?: string;    // required when scope.kind === "memory"
}

// Decide what context to inject based on scope + mode.
//   - general: top-K relevant items via embedding similarity (falls back to keyword)
//   - check:   ALL memory (need the whole picture to find contradictions)
//   - memory:  focused on ONE entry; entry JSON included verbatim
//   - chapter: focused on ONE chapter; chapter markdown included
//   - design:  handled separately by lib/design/prompt.ts
export async function preparePrompt(args: PrepareArgs): Promise<PreparedPrompt> {
  const { userId, workSlug, memory, history, workTitle, mode, scope } = args;

  let systemPrompt: string;
  let retrievalSource: PreparedPrompt["retrievalSource"] = "none";

  if (scope?.kind === "memory" && args.memoryItemJson) {
    systemPrompt = buildMemoryItemSystemPrompt({
      workTitle,
      scope,
      itemJson: args.memoryItemJson,
      memory,
    });
    retrievalSource = "all"; // single-item scope, no retrieval needed
  } else if (scope?.kind === "chapter" && args.chapter) {
    // Use the most recent user message as the retrieval query.
    const lastUser = [...history].reverse().find((m) => m.role === "user");
    systemPrompt = await buildChapterSystemPrompt({
      userId,
      workSlug,
      workTitle,
      chapter: args.chapter,
      memory,
      mode,
      previousChapter: args.previousChapter,
      nextChapter: args.nextChapter,
      retrievalQuery: lastUser?.content,
    });
    retrievalSource = "all"; // chapter scope shows full memory
  } else {
    let memorySummary: string;
    if (mode === "check") {
      memorySummary = summarizeMemoryForPrompt(memory);
      retrievalSource = "all";
    } else {
      const lastUser = [...history].reverse().find((m) => m.role === "user");
      const message = lastUser?.content ?? "";
      const relevant = await retrieveRelevantMemoryWithEmbeddings(userId, workSlug, memory, message);
      memorySummary = summarizeMemoryForPrompt({
        style: memory.style,
        characters: relevant.characters,
        worldbuilding: relevant.world,
        plot: relevant.plot,
      });
      retrievalSource = relevant.source;
    }
    systemPrompt = buildSystemPrompt(mode, memorySummary, workTitle);
  }

  const providerHistory: ProviderChatMessage[] = history
    .filter((m) => m.role === "user" || m.role === "assistant")
    .map((m) => ({ role: m.role, content: m.content }));

  return { systemPrompt, history: providerHistory, mode, retrievalSource };
}

export function buildProviderMessages(prompt: PreparedPrompt): ProviderChatMessage[] {
  return [{ role: "system", content: prompt.systemPrompt }, ...prompt.history];
}
