import type { Chapter, ChatMode, ConversationScope, MemoryKind, WorkMemory } from "@/lib/types";
import { summarizeMemoryForPrompt } from "@/lib/memory/retrieve";
import { retrieveChapterChunks } from "@/lib/memory/vectors";
import { PROPOSAL_OPEN, PROPOSAL_CLOSE, extractProposal, parseProposalJson } from "./proposal";
import { CHAT_MODES } from "./chat-modes";

// Re-export so existing server-side callers can keep importing from here.
export { PROPOSAL_OPEN, PROPOSAL_CLOSE, extractProposal, parseProposalJson, CHAT_MODES };

export function buildSystemPrompt(
  mode: ChatMode,
  memorySummary: string,
  workTitle: string,
): string {
  const spec = CHAT_MODES[mode];
  const parts: string[] = [
    spec.systemPrefix,
    "",
    `目前作品：《${workTitle}》`,
  ];
  if (memorySummary.trim()) {
    parts.push("", "── 作品記憶 ──", memorySummary.trim(), "");
  }
  parts.push("── 開始 ──");
  return parts.join("\n");
}

// ─── Memory item scope ─────────────────────────────────────────────
const MEMORY_KIND_LABEL: Record<MemoryKind, string> = {
  characters: "角色",
  worldbuilding: "世界觀條目",
  plot: "情節線",
};

export function buildMemoryItemSystemPrompt(args: {
  workTitle: string;
  scope: Extract<ConversationScope, { kind: "memory" }>;
  itemJson: string;
  memory: WorkMemory;
}): string {
  const { workTitle, scope, itemJson, memory } = args;
  const label = MEMORY_KIND_LABEL[scope.memoryKind];
  return [
    `你是《${workTitle}》的${label}顧問。現在要和使用者一起深化、修正、擴展「這一個」特定${label}。`,
    "",
    `── 目前這個${label}的內容（JSON）──`,
    "```json",
    itemJson,
    "```",
    "",
    "── 作品整體記憶（僅供參考，不要把整段覆寫進 proposal）──",
    summarizeMemoryForPrompt(memory),
    "",
    "討論規則：",
    "- 用作品既有的語氣與設定來思考，不要無中生有。",
    "- 對使用者的問題給出**具體**的建議，不要列點敷衍；舉例而非口號。",
    "- 當使用者要求更新、或討論已收斂到具體變更時，把**完整**的新內容包在 `<PROPOSAL>...</PROPOSAL>` 裡輸出。",
    `- PROPOSAL 內容是這個${label}更新後的完整 JSON（同上方的 schema）。不要省略未變動的欄位。`,
    "- PROPOSAL 之外可以加簡短說明（為什麼這樣改、留了什麼彈性）。",
    "- 還在發散討論時，不要輸出 PROPOSAL；先聊。",
    "",
    "── 開始 ──",
  ].join("\n");
}

// ─── Chapter scope ─────────────────────────────────────────────────
export async function buildChapterSystemPrompt(args: {
  userId: string;
  workSlug: string;
  workTitle: string;
  chapter: Chapter;
  memory: WorkMemory;
  mode: ChatMode;
  previousChapter?: Chapter | null;
  nextChapter?: Chapter | null;
  /** Optional query to drive chunk retrieval from earlier chapters. */
  retrievalQuery?: string;
}): Promise<string> {
  const { userId, workSlug, workTitle, chapter, memory, mode, previousChapter, nextChapter, retrievalQuery } = args;
  const spec = CHAT_MODES[mode];
  const parts: string[] = [
    `你是《${workTitle}》第 ${chapter.order} 章「${chapter.title}」的專屬編輯。`,
    spec.systemPrefix,
    "",
    "── 這一章目前的完整內容 ──",
    "```markdown",
    chapter.content,
    "```",
  ];

  if (previousChapter) {
    parts.push(
      "",
      `── 前一章（${previousChapter.title}）的內容，避免與之矛盾 ──`,
      "```markdown",
      previousChapter.content,
      "```",
    );
  }
  if (nextChapter) {
    parts.push(
      "",
      `── 後一章（${nextChapter.title}）的內容，改寫時別破壞它的接續 ──`,
      "```markdown",
      nextChapter.content,
      "```",
    );
  }

  // Pull semantically related fragments from OTHER chapters (excluding the
  // immediate prev/next which are already shown verbatim above). Useful when
  // the discussion touches something established many chapters back.
  if (retrievalQuery) {
    try {
      const chunks = await retrieveChapterChunks(userId, workSlug, retrievalQuery, {
        excludeChapter: chapter.slug,
        topK: 4,
      });
      const shown = new Set([previousChapter?.slug, nextChapter?.slug].filter(Boolean) as string[]);
      const filtered = chunks.filter((c) => !shown.has(c.chapterSlug));
      if (filtered.length > 0) {
        parts.push("", "── 與這次討論相關的前情片段（從其他章檢索）──");
        for (const c of filtered) {
          parts.push(`> 【${c.chapterTitle}】${c.text}`);
        }
        parts.push("");
      }
    } catch (err) {
      console.warn(`[prompts] chapter chunk retrieval failed:`, (err as Error).message);
    }
  }

  parts.push(
    "",
    "── 作品記憶 ──",
    summarizeMemoryForPrompt(memory),
    "",
    "規則：",
    "- 討論這一章的問題（結構、節奏、角色聲音、伏筆…）。",
    "- 與前後章節保持一致：角色性格、時間線、用過的意象、未回收的伏筆。",
    "- 當使用者要改寫，或討論已收斂到具體改動時，把**改寫後的整章完整 markdown** 包在 `<PROPOSAL>...</PROPOSAL>` 裡輸出。",
    "- PROPOSAL 內容必須是這一章的**完整新內容**（不是 diff、不是節錄）。沿用未變動的段落，不要憑空刪除。",
    "- PROPOSAL 之外可以加簡短說明你改了什麼、為什麼。",
    "- 還在討論方向時不要輸出 PROPOSAL；先聊。",
    "",
    "── 開始 ──",
  );
  return parts.join("\n");
}
