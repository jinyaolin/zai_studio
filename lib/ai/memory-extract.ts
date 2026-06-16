import type { Chapter, Work, WorkMemory } from "@/lib/types";
import { summarizeMemoryForPrompt } from "@/lib/memory/retrieve";

// Build the prompt asking zai to read the just-written chapter + existing
// memory, and output a proposed updated memory object (full JSON) wrapped in
// <PROPOSAL>...</PROPOSAL>. The new memory should:
//   - ADD new characters/world/plot threads the chapter introduced
//   - UPDATE existing entries when the chapter advanced/revealed something
//   - NEVER remove items unless they're clearly contradicted (the model should
//     explain its reasoning in the discussion text outside PROPOSAL)
//   - APPEND to style.md only if a new motif/禁忌 emerged
export function buildMemoryExtractionPrompt(args: {
  work: Work;
  chapter: Chapter;
  memory: WorkMemory;
  previousChapter?: Chapter | null;
}): { system: string; user: string } {
  const { work, chapter, memory, previousChapter } = args;

  const system = [
    `你是《${work.title}》的記憶管理員。`,
    "作者剛完成 / 改寫了一章。你的任務是讀完這一章，對照現有的「角色 / 世界觀 / 情節 / 風格」記憶，",
    "提出**更新後的完整記憶 JSON**——把這一章新揭露的、改變的、推進的東西沉澱進去。",
    "",
    "規則：",
    "- **保守新增**：只有當這章明確建立了一個新角色 / 新地點 / 新情節線，才加入新條目。",
    "- **更新而非刪除**：除非現有條目被這章直接否定（例如某角色的設定被翻盤），否則不要刪除。被翻盤時請改寫 description，不要整條移除。",
    "- **每個新條目都要有 id**：用 `new-${Date.now()}-<隨機>` 之類的字串當 id（避免和現有重複）。",
    "- **保留既有 id**：update 既有條目時用原本的 id，不要換。",
    "- **風格**：style 欄位如果整段都還對，原樣保留；只在新 motif / 新禁忌浮現時 append 一段到末尾，不要覆寫掉原來的內容。",
    "- **簡明**：description / summary 不要長篇大論；保留可檢索的關鍵字。每個條目最多 200 字。",
    "",
    "── 現有的記憶 JSON（你要輸出更新版的這個物件）──",
    "```json",
    JSON.stringify({
      characters: memory.characters,
      worldbuilding: memory.worldbuilding,
      plot: memory.plot,
      style: memory.style,
    }, null, 2),
    "```",
    "",
    "輸出格式：",
    "1. 先用簡短條列說明你打算做哪些更新（給作者審查時看）。",
    "2. 然後輸出 `<PROPOSAL>` 包住**完整更新後的記憶 JSON**（同上方的物件 schema），`</PROPOSAL>` 結束。",
    "3. PROPOSAL 內的 JSON 必須是合法 JSON，包含完整 4 個欄位（characters / worldbuilding / plot / style），不要省略未變動的部分。",
  ].join("\n");

  const user = [
    "以下是這一章的內容。請提出記憶更新。",
    "",
    `── 作品類型／狀態 ──`,
    `${work.type} / ${work.genre ?? ""} / ${work.tags.join("、")}`,
    "",
    `── 這一章（${chapter.title}）──`,
    "```markdown",
    chapter.content,
    "```",
    previousChapter
      ? ["", `── 前一章（${previousChapter.title}）供你判斷哪些是真正「新」的東西 ──`, "```markdown", previousChapter.content, "```"].join("\n")
      : "",
  ].join("\n");

  return { system, user };
}
