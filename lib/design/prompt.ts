import type { DesignMode, DesignSession, DesignStageName, WorkMemory, Chapter } from "@/lib/types";
import { summarizeMemoryForPrompt } from "@/lib/memory/retrieve";
import { retrieveChapterChunks } from "@/lib/memory/vectors";

interface BuildArgs {
  workSlug: string;
  workTitle: string;
  memory: WorkMemory;
  chapter: Chapter | null;        // current chapter content (null if fresh)
  previousChapter: Chapter | null; // immediately preceding chapter — keep story continuous
  session: DesignSession;
  stage: DesignStageName;
}

const MODE_LABEL: Record<DesignMode, string> = {
  continue: "續寫（在現有內容後接續）",
  rewrite: "重寫（整章重新來過，但沿用設定）",
  fresh: "全新章節",
};

const STAGE_INSTRUCTIONS: Record<DesignStageName, string> = {
  directions: [
    "你的任務：**發散探索**這一章可以怎麼寫。",
    "列出 3-5 個可能的方向，每個方向包含：",
    "  - 一個清楚的標題",
    "  - 一段 60-120 字的說明（這個方向的核心戲劇動作是什麼）",
    "  - 為什麼這個方向對這個故事有意義（呼應了什麼角色弧 / 情節線 / motif）",
    "  - 這個方向最大的風險（可能會寫壞的地方）",
    "每個方向都必須在「作品記憶」的範圍內——不能提議違背既有角色或設定的方向。",
    "不要直接寫正文。給作者選擇。每個方向都要夠具體，不要空話。",
  ].join("\n"),
  intent: [
    "你的任務：**收斂**為這一章的核心意圖。",
    "根據前面選定的方向，寫出一段 80-150 字的「章節意圖聲明」，包含：",
    "  - 這一章結束時，讀者應該感受到什麼",
    "  - 這一章的核心戲劇動作（誰對誰做了什麼，引爆了什麼）",
    "  - 與前一 / 後一章的敘事張力關係",
    "  - 為什麼這個章節「必須存在」（刪掉的話故事會少掉什麼）",
    "**收斂階段規則——記憶優先：**",
    "  - 意圖必須推進或呼應記憶中至少一條「進行中的情節線」，明確指出是哪一條。",
    "  - 意圖不能違背任何角色的性格 / 關係 / 角色弧；若需要角色做出反常行為，必須是「被事件推著走」而非人設崩壞。",
    "  - 意圖觸及的世界觀細節（地點 / 物件 / 規則）必須是記憶中既有的，或合理推論出來的；不要無中生有。",
    "  - 意圖必須能被「風格指南」執行（POV / 語氣 / motif / 禁忌都過得了）。",
    "這會成為接下來寫正文時的脊幹。不要太長。",
  ].join("\n"),
  details: [
    "你的任務：**發散設計**這一章的具體細節。",
    "針對剛剛定的章節意圖，提出 4-6 個具體的細節提案，每個有標題 + 簡短說明，分布在不同類別：",
    "  - **對話亮點**：一兩句能定義角色關係的對話（給出具體台詞，符合該角色的說話方式）",
    "  - **意象 / motif**：呼應整部作品 motif 的具體意象（從記憶中既有的 motif 出發）",
    "  - **伏筆 / 回收**：埋一個將來會回頭的細節，或回收之前埋的（對照記憶中的情節線）",
    "  - **節奏 / 結構**：節奏建議（例如「前 1/3 慢，中段一個急轉，收尾開放」）",
    "  - **感官細節**：可以讓讀者「看見 / 聽見 / 聞到」的具體描寫建議",
    "每個建議都要具體到可以寫進正文，不要口號。每個都必須符合記憶。不要寫正文。",
  ].join("\n"),
  draft: [
    "你的任務：**收斂寫出完整正文**。",
    "綜合前面的方向、意圖、細節，產出這一章的完整 markdown 正文。",
    "**收斂階段規則——記憶優先（這是最重要的一條）：**",
    "  - 角色言行必須符合記憶中的設定（性格、用字、關係、弧線）。任何反常必須是被事件推動，不是人設崩壞。",
    "  - 世界觀細節（地點、物件、年代、規則）只能用記憶既有的或合理延伸；不要發明新設定。",
    "  - 進行中的情節線要往前推進或埋新伏筆，不要假裝它們不存在；已收束的不要重啟。",
    "  - 風格指南（POV、語氣、motif、禁忌）套用到每一段——禁忌尤其重要，違背就是錯。",
    "**格式規則：**",
    "  - 不要寫章節標題（系統會自動加），從正文第一段開始。",
    "  - 不要加註解、不要寫「以下是正文」之類的 meta 文字。",
    "  - 續寫模式：接在現有內容後，不要重複已寫過的。",
    "  - 重寫模式：完整改寫整章，不要重複現有內容。",
    "  - 全新模式：直接開始新章節的內容，並接續前一章（若有）的時間線與情緒。",
    "",
    "**記憶修正（在正文寫完之後接著輸出）：**",
    "正文結束後，回顧這一章你**實際寫了什麼**——是否揭露了新角色、推進了既有情節線、觸及了新地點、形成新的 motif？",
    "若有，輸出一個 `<MEMORY_PATCH>...</MEMORY_PATCH>` 區塊包住**只包含需要變更的 diff JSON**，schema：",
    "```json",
    "{",
    "  \"addCharacters\": [{...完整 Character...}],",
    "  \"updateCharacters\": [{\"id\": \"<既有 id>\", \"patch\": {部分欄位}}],",
    "  \"removeCharacters\": [\"<id>\"],",
    "  \"addWorldbuilding\": [...], \"updateWorldbuilding\": [...], \"removeWorldbuilding\": [...],",
    "  \"addPlot\": [...], \"updatePlot\": [...], \"removePlot\": [...],",
    "  \"styleAppend\": \"要附加到 style.md 末尾的一段（不是取代）\"",
    "}",
    "```",
    "規則：",
    "- 只列出**這章實際造成變更**的條目。沒用到的不要重複輸出。",
    "- 完全沒變更就輸出空物件 `{}`——不要硬擠。",
    "- 新增條目用完整物件（會被 append 進記憶陣列）。新 id 用 `new-<隨機>` 格式。",
    "- 修改既有條目用 `{id, patch}`，patch 內只放要改的欄位。",
    "- 不要把整份記憶重新輸出——那是 diff，不是完整 JSON。",
    "- styleAppend 是「附加」，原本的 style.md 內容會保留；只放這章新確立的 motif / 禁忌 / POV 決定。",
  ].join("\n"),
};

// Build the system + user prompts for one stage of a design session.
// Each stage sees memory + chapter context + the accepted outputs of prior stages.
// For the draft stage we also pull semantically related chunks from earlier
// chapters via the vector index — keeps long works coherent without bloating
// every prompt with the full text of every prior chapter.
export async function buildStagePrompt(args: BuildArgs): Promise<{ system: string; user: string }> {
  const { workSlug, workTitle, memory, chapter, previousChapter, session, stage } = args;

  const parts: string[] = [
    `你是《${workTitle}》的共同作者。我們正在用 Design Thinking 工作流處理一章。`,
    `模式：${MODE_LABEL[session.mode]}`,
    "",
    "── 作品記憶 ──",
    summarizeMemoryForPrompt(memory),
  ];

  // For "continue" / "rewrite", the chapter we're working on already has
  // content. For "fresh", it's a brand-new chapter — but the immediately
  // previous chapter (if any) still matters for continuity.
  if (chapter) {
    parts.push(
      "",
      `── 這一章（${chapter.title}）目前的內容 ──`,
      "```markdown",
      chapter.content || "（空白）",
      "```",
    );
  }
  if (previousChapter && stage === "draft") {
    // Only inject for the draft stage — earlier stages are about brainstorming
    // and don't need the verbatim prior text; doing so would just bloat context.
    parts.push(
      "",
      `── 前一章（${previousChapter.title}）的完整內容，續寫時要接得上 ──`,
      "```markdown",
      previousChapter.content,
      "```",
    );
  }

  // Draft stage: pull related chunks from earlier chapters by semantic similarity.
  // Caps the prompt growth on long works — instead of bringing in chapters 1..N-1
  // verbatim, we bring in only the fragments that actually relate to this goal.
  if (stage === "draft") {
    try {
      const query = [session.goal, chapter?.title, previousChapter?.title].filter(Boolean).join(" / ");
      const exclude = chapter?.slug;
      const chunks = await retrieveChapterChunks(workSlug, query, { excludeChapter: exclude, topK: 4 });
      if (chunks.length > 0) {
        parts.push("", `── 與這次目標語意相關的前情片段（從前幾章檢索，僅供連戲參考）──`);
        for (const c of chunks) {
          parts.push(`> 【${c.chapterTitle}】${c.text}`);
        }
        parts.push("");
      }
    } catch (err) {
      console.warn(`[design] chapter chunk retrieval failed:`, (err as Error).message);
    }
  }

  parts.push(
    "",
    `── 作者這次的目標 ──`,
    session.goal,
  );

  // Append accepted outputs of prior stages (skip ones the user skipped).
  const stageOrder: DesignStageName[] = ["directions", "intent", "details", "draft"];
  const stageIdx = stageOrder.indexOf(stage);
  for (let i = 0; i < stageIdx; i++) {
    const s = session.stages[i];
    if (s.status !== "done" && s.status !== "skipped") continue;
    const out = s.acceptedOutput ?? s.userEditedOutput ?? s.output;
    if (!out) continue;
    const label = stageOrder[i];
    parts.push(
      "",
      `── Stage ${i + 1}: ${label}（${s.status === "skipped" ? "作者選擇跳過" : "已確認"}）──`,
      out,
    );
  }

  parts.push("", "── 這個 Stage 的指示 ──", STAGE_INSTRUCTIONS[stage]);

  const system = parts.join("\n");
  const user = stage === "directions"
    ? `請幫這章探索 3-5 個方向。`
    : stage === "intent"
      ? `請幫這章定下意圖。`
      : stage === "details"
        ? `請幫這章設計細節。`
        : `請寫出這章的完整正文。`;

  return { system, user };
}
