import type { Character, MemoryRef, PlotThread, WorkMemory, WorldEntry } from "@/lib/types";
import { retrieveByQuery } from "./vectors";

// Find character / world / plot entries whose names or aliases appear in the user's message.
// Simple keyword match — used as fallback when vectors aren't available.
export function retrieveRelevantMemory(
  memory: WorkMemory,
  message: string,
  options?: { maxPer?: number },
): { characters: Character[]; world: WorldEntry[]; plot: PlotThread[]; refs: MemoryRef[] } {
  const maxPer = options?.maxPer ?? 6;
  const msg = message.toLowerCase();

  const matchesText = (needles: string[]): boolean =>
    needles.some((n) => n.trim().length > 0 && msg.includes(n.trim().toLowerCase()));

  const characters = memory.characters
    .filter((c) => matchesText([c.name, ...(c.aliases ?? [])]))
    .slice(0, maxPer);

  const world = memory.worldbuilding
    .filter((w) => matchesText([w.name]))
    .slice(0, maxPer);

  const plot = memory.plot
    .filter((p) => matchesText([p.title, ...p.linkedChapters]))
    .slice(0, maxPer);

  const refs: MemoryRef[] = [
    ...characters.map((c) => ({ kind: "character" as const, id: c.id, snippet: `${c.name}：${c.description.slice(0, 60)}` })),
    ...world.map((w) => ({ kind: "world" as const, id: w.id, snippet: `${w.name}：${w.description.slice(0, 60)}` })),
    ...plot.map((p) => ({ kind: "plot" as const, id: p.id, snippet: `${p.title}：${p.summary.slice(0, 60)}` })),
  ];

  return { characters, world, plot, refs };
}

// Embedding-based retrieval. Falls back to keyword matching if no vectors
// exist yet for this work (e.g. memory written before embeddings shipped).
export async function retrieveRelevantMemoryWithEmbeddings(
  workSlug: string,
  memory: WorkMemory,
  message: string,
  options?: { topK?: number },
): Promise<{ characters: Character[]; world: WorldEntry[]; plot: PlotThread[]; refs: MemoryRef[]; source: "vectors" | "keyword" }> {
  const topK = options?.topK ?? 6;
  try {
    const hits = await retrieveByQuery(workSlug, message, topK);
    if (hits.length > 0) {
      const characters: Character[] = [];
      const world: WorldEntry[] = [];
      const plot: PlotThread[] = [];
      const refs: MemoryRef[] = [];

      for (const h of hits) {
        if (h.kind === "characters" && h.id) {
          const c = memory.characters.find((x) => x.id === h.id);
          if (c) {
            characters.push(c);
            refs.push({ kind: "character", id: c.id, snippet: `${c.name}：${c.description.slice(0, 60)}` });
          }
        } else if (h.kind === "worldbuilding" && h.id) {
          const w = memory.worldbuilding.find((x) => x.id === h.id);
          if (w) {
            world.push(w);
            refs.push({ kind: "world", id: w.id, snippet: `${w.name}：${w.description.slice(0, 60)}` });
          }
        } else if (h.kind === "plot" && h.id) {
          const p = memory.plot.find((x) => x.id === h.id);
          if (p) {
            plot.push(p);
            refs.push({ kind: "plot", id: p.id, snippet: `${p.title}：${p.summary.slice(0, 60)}` });
          }
        }
      }

      if (characters.length || world.length || plot.length) {
        return { characters, world, plot, refs, source: "vectors" };
      }
    }
  } catch (err) {
    console.warn(`[retrieve] vector lookup failed for ${workSlug}:`, (err as Error).message);
  }

  // Fallback: keyword match.
  const r = retrieveRelevantMemory(memory, message);
  return { ...r, source: "keyword" };
}

export function summarizeMemoryForPrompt(memory: WorkMemory): string {
  const lines: string[] = [];

  // Preamble: enforce compliance. Without this, models tend to treat memory as
  // background reference rather than canon — especially during convergent
  // stages (intent, draft) where they should be pinning every choice to it.
  const hasAnything =
    memory.style.trim() ||
    memory.characters.length ||
    memory.worldbuilding.length ||
    memory.plot.length;
  if (hasAnything) {
    lines.push(
      "**以下記憶是這部作品的正史（canon）。你的所有產出都必須與之一致：**",
      "- 角色的性格、關係、用字、不能說的話——都不能違背。",
      "- 世界觀的設定（地點、規則、物件、年代）——不能憑空捏造或改寫。",
      "- 進行中的情節線——不能跳過未收束的、不能回收未鋪陳的。",
      "- 風格指南——POV、語氣、motif、禁忌都適用於你寫的每一段。",
      "- 若覺得既有記憶有矛盾或缺漏，在討論類產出裡指出；不要在正文裡偷改設定。",
      "",
    );
  }

  if (memory.style.trim()) {
    lines.push("## 風格指南", memory.style.trim(), "");
  }

  if (memory.characters.length > 0) {
    lines.push("## 主要角色");
    for (const c of memory.characters) {
      const aliases = c.aliases?.length ? `（另稱：${c.aliases.join("、")}）` : "";
      lines.push(`- **${c.name}**${aliases} — ${c.role}。${c.description}`);
    }
    lines.push("");
  }

  if (memory.worldbuilding.length > 0) {
    lines.push("## 世界觀");
    for (const w of memory.worldbuilding) {
      lines.push(`- **${w.name}**（${w.category}）：${w.description}`);
    }
    lines.push("");
  }

  if (memory.plot.length > 0) {
    lines.push("## 進行中的情節線");
    for (const p of memory.plot) {
      lines.push(`- [${p.status}] **${p.title}**：${p.summary}`);
    }
    lines.push("");
  }

  return lines.join("\n");
}
