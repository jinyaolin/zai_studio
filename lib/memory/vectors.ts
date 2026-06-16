import { promises as fs } from "node:fs";
import type { Character, PlotThread, WorkMemory, WorldEntry } from "@/lib/types";
import { vectorsFilePath } from "@/lib/content/paths";
import { getEmbeddingProvider } from "@/lib/ai/embeddings";
import { chunkForEmbedding } from "./chunker";

// On-disk vector store. Stored as JSON next to the memory files:
//   content/works/<slug>/memory/vectors.json
//
// Shape:
//   {
//     "provider": "zai" | "local",
//     "characters":   { "<id>": { "text": "...", "vector": [...] } },
//     "worldbuilding": { ... },
//     "plot":          { ... },
//     "style":         { "text": "...", "vector": [...] },
//     "chapters": {
//       "<chapterSlug>": {
//         "title": "...",
//         "chunks": [{ "text": "...", "vector": [...] }, ...]
//       }
//     }
//   }
//
// `text` is cached so we can detect if an item changed (no need to re-embed).

interface VectorEntry {
  text: string;
  vector: number[];
}

interface ChapterEntry {
  title: string;
  chunks: VectorEntry[];
}

interface VectorFile {
  provider: string;
  characters: Record<string, VectorEntry>;
  worldbuilding: Record<string, VectorEntry>;
  plot: Record<string, VectorEntry>;
  style: VectorEntry | null;
  chapters: Record<string, ChapterEntry>;
}

const EMPTY: VectorFile = {
  provider: "",
  characters: {},
  worldbuilding: {},
  plot: {},
  style: null,
  chapters: {},
};

function vectorsPath(userId: string, workSlug: string): string {
  return vectorsFilePath(userId, workSlug);
}

async function readVectors(userId: string, workSlug: string): Promise<VectorFile> {
  try {
    const raw = await fs.readFile(vectorsPath(userId, workSlug), "utf8");
    return { ...EMPTY, ...(JSON.parse(raw) as Partial<VectorFile>) };
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return { ...EMPTY };
    throw err;
  }
}

async function writeVectors(userId: string, workSlug: string, data: VectorFile): Promise<void> {
  // Ensure parent dir exists.
  const { memoryDir } = await import("@/lib/content/paths");
  await fs.mkdir(memoryDir(userId, workSlug), { recursive: true });
  await fs.writeFile(vectorsPath(userId, workSlug), JSON.stringify(data, null, 2), "utf8");
}

// Text we embed for each kind. Compact but distinctive.
function characterText(c: Character): string {
  return [c.name, c.aliases.join(" "), c.role, c.description, c.traits.join(" "), c.arc]
    .filter(Boolean)
    .join(" | ");
}

function worldText(w: WorldEntry): string {
  return [w.name, w.category, w.description, w.notes].filter(Boolean).join(" | ");
}

function plotText(p: PlotThread): string {
  return [p.title, p.status, p.summary, p.foreshadowing].filter(Boolean).join(" | ");
}

// ─── Sync: bring vectors.json into alignment with the current memory ──
// Re-embeds items whose text changed; removes items no longer in memory;
// passes through items that are unchanged. Safe to call after every write.
export async function syncVectors(
  userId: string,
  workSlug: string,
  memory: WorkMemory,
): Promise<{ embedded: number; reused: number; removed: number; provider: string }> {
  const provider = getEmbeddingProvider();
  const prev = await readVectors(userId, workSlug);

  // If the provider changed, everything needs to be re-embedded.
  const providerChanged = prev.provider !== provider.name;
  const next: VectorFile = {
    provider: provider.name,
    characters: {},
    worldbuilding: {},
    plot: {},
    style: null,
    // Preserve chapter vectors across memory-only writes — they're managed
    // by syncChapterVectors and don't depend on memory contents.
    chapters: providerChanged ? {} : prev.chapters,
  };

  const toEmbed: { kind: keyof VectorFile; key: string; text: string }[] = [];
  let reused = 0;

  function plan<T extends { id: string }>(
    kind: "characters" | "worldbuilding" | "plot",
    items: T[],
    textFn: (item: T) => string,
  ) {
    const prevMap = prev[kind] as Record<string, VectorEntry>;
    for (const item of items) {
      const text = textFn(item);
      const cached = prevMap[item.id];
      if (!providerChanged && cached && cached.text === text) {
        (next[kind] as Record<string, VectorEntry>)[item.id] = cached;
        reused++;
      } else {
        toEmbed.push({ kind, key: item.id, text });
      }
    }
  }

  plan("characters", memory.characters, characterText);
  plan("worldbuilding", memory.worldbuilding, worldText);
  plan("plot", memory.plot, plotText);

  // Style is one big chunk.
  if (memory.style.trim()) {
    if (!providerChanged && prev.style && prev.style.text === memory.style) {
      next.style = prev.style;
      reused++;
    } else {
      toEmbed.push({ kind: "style", key: "", text: memory.style });
    }
  }

  // Count removals (items in prev but not in next plan)
  const removed =
    Object.keys(prev.characters).filter((id) => !next.characters[id]).length +
    Object.keys(prev.worldbuilding).filter((id) => !next.worldbuilding[id]).length +
    Object.keys(prev.plot).filter((id) => !next.plot[id]).length;

  if (toEmbed.length === 0 && reused > 0) {
    await writeVectors(userId, workSlug, next);
    return { embedded: 0, reused, removed, provider: provider.name };
  }

  // Batch-embed.
  const vectors = await provider.embed(toEmbed.map((x) => x.text));
  for (let i = 0; i < toEmbed.length; i++) {
    const { kind, key, text } = toEmbed[i];
    const entry: VectorEntry = { text, vector: vectors[i] };
    if (kind === "style") {
      next.style = entry;
    } else {
      (next[kind] as Record<string, VectorEntry>)[key] = entry;
    }
  }

  await writeVectors(userId, workSlug, next);
  return { embedded: toEmbed.length, reused, removed, provider: provider.name };
}

// ─── Query: find top-K most similar items to a query string ───────
export interface RetrievedItem {
  kind: "characters" | "worldbuilding" | "plot" | "style";
  id?: string;
  score: number;
}

export async function retrieveByQuery(
  userId: string,
  workSlug: string,
  query: string,
  topK = 6,
): Promise<RetrievedItem[]> {
  const provider = getEmbeddingProvider();
  const data = await readVectors(userId, workSlug);
  const [queryVec] = await provider.embed([query]);

  const candidates: { kind: RetrievedItem["kind"]; id?: string; vector: number[] }[] = [];
  for (const [id, e] of Object.entries(data.characters)) {
    candidates.push({ kind: "characters", id, vector: e.vector });
  }
  for (const [id, e] of Object.entries(data.worldbuilding)) {
    candidates.push({ kind: "worldbuilding", id, vector: e.vector });
  }
  for (const [id, e] of Object.entries(data.plot)) {
    candidates.push({ kind: "plot", id, vector: e.vector });
  }
  if (data.style) {
    candidates.push({ kind: "style", vector: data.style.vector });
  }

  // Cosine (vectors are pre-normalized).
  const scored = candidates
    .map((c) => {
      let dot = 0;
      const v = c.vector;
      for (let i = 0; i < v.length; i++) dot += v[i] * (queryVec[i] ?? 0);
      return { kind: c.kind, id: c.id, score: dot };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, topK)
    .filter((x) => x.score > 0.001); // drop orthogonal matches

  return scored;
}

// ─── Match: find nearest existing item to a proposed new item ─────
// Used by memory extraction to label proposed items as "新增" vs "更新 #X".
export interface MatchResult {
  bestKind?: "characters" | "worldbuilding" | "plot";
  bestId?: string;
  bestScore: number;
}

export async function findNearestItem(
  userId: string,
  workSlug: string,
  text: string,
  restrictKind?: "characters" | "worldbuilding" | "plot",
): Promise<MatchResult> {
  const provider = getEmbeddingProvider();
  const data = await readVectors(userId, workSlug);
  const [vec] = await provider.embed([text]);

  let bestScore = -Infinity;
  let bestKind: MatchResult["bestKind"];
  let bestId: string | undefined;

  function scan(
    kind: "characters" | "worldbuilding" | "plot",
    map: Record<string, VectorEntry>,
  ) {
    if (restrictKind && restrictKind !== kind) return;
    for (const [id, e] of Object.entries(map)) {
      let dot = 0;
      const v = e.vector;
      for (let i = 0; i < v.length; i++) dot += v[i] * (vec[i] ?? 0);
      if (dot > bestScore) {
        bestScore = dot;
        bestKind = kind;
        bestId = id;
      }
    }
  }

  scan("characters", data.characters);
  scan("worldbuilding", data.worldbuilding);
  scan("plot", data.plot);

  return { bestKind, bestId, bestScore: bestScore === -Infinity ? 0 : bestScore };
}

// ─── Chapter content vectors ──────────────────────────────────────
// Each chapter is split into paragraph-ish chunks and embedded separately.
// Used by Design Stage 4 + chapter-scope chat to pull semantically related
// fragments from OTHER chapters (not the current one being written).

export async function syncChapterVectors(
  userId: string,
  workSlug: string,
  chapterSlug: string,
  title: string,
  content: string,
): Promise<{ embedded: number; reused: number; provider: string }> {
  const provider = getEmbeddingProvider();
  const prev = await readVectors(userId, workSlug);
  const prevChapters = provider.name === prev.provider ? prev.chapters : {};
  const existing = prevChapters[chapterSlug];

  const chunks = chunkForEmbedding(content);

  if (
    existing &&
    existing.title === title &&
    existing.chunks.length === chunks.length &&
    chunks.every((c, i) => existing.chunks[i]?.text === c.text)
  ) {
    if (prev.chapters !== prevChapters || prev.chapters[chapterSlug] !== existing) {
      const next: VectorFile = { ...prev, provider: provider.name, chapters: { ...prevChapters, [chapterSlug]: existing } };
      await writeVectors(userId, workSlug, next);
    }
    return { embedded: 0, reused: chunks.length, provider: provider.name };
  }

  const texts = chunks.map((c) => c.text);
  const vectors = texts.length > 0 ? await provider.embed(texts) : [];
  const newEntry: ChapterEntry = {
    title,
    chunks: chunks.map((c, i) => ({ text: c.text, vector: vectors[i] })),
  };

  const next: VectorFile = {
    ...prev,
    provider: provider.name,
    chapters: { ...prevChapters, [chapterSlug]: newEntry },
  };
  await writeVectors(userId, workSlug, next);
  return { embedded: chunks.length, reused: 0, provider: provider.name };
}

export async function removeChapterVectors(userId: string, workSlug: string, chapterSlug: string): Promise<void> {
  const prev = await readVectors(userId, workSlug);
  if (!(chapterSlug in prev.chapters)) return;
  const next: VectorFile = {
    ...prev,
    chapters: { ...prev.chapters },
  };
  delete next.chapters[chapterSlug];
  await writeVectors(userId, workSlug, next);
}

export async function renameChapterVectorsKey(
  userId: string,
  workSlug: string,
  oldSlug: string,
  newSlug: string,
): Promise<void> {
  if (oldSlug === newSlug) return;
  const prev = await readVectors(userId, workSlug);
  const entry = prev.chapters[oldSlug];
  if (!entry) return;
  const nextChapters: Record<string, ChapterEntry> = {};
  for (const [k, v] of Object.entries(prev.chapters)) {
    if (k === oldSlug) nextChapters[newSlug] = v;
    else nextChapters[k] = v;
  }
  await writeVectors(userId, workSlug, { ...prev, chapters: nextChapters });
}

export interface RetrievedChunk {
  chapterSlug: string;
  chapterTitle: string;
  chunkIndex: number;
  text: string;
  score: number;
}

// Find top-K chapter chunks across the work (optionally excluding one chapter).
// Used to inject "relevant past content" context when writing/editing a chapter.
export async function retrieveChapterChunks(
  userId: string,
  workSlug: string,
  query: string,
  options?: { excludeChapter?: string; topK?: number },
): Promise<RetrievedChunk[]> {
  const topK = options?.topK ?? 4;
  const provider = getEmbeddingProvider();
  const data = await readVectors(userId, workSlug);
  const [queryVec] = await provider.embed([query]);

  const candidates: {
    chapterSlug: string;
    chapterTitle: string;
    chunkIndex: number;
    text: string;
    vector: number[];
  }[] = [];

  for (const [slug, entry] of Object.entries(data.chapters)) {
    if (options?.excludeChapter && slug === options.excludeChapter) continue;
    entry.chunks.forEach((c, i) => {
      candidates.push({
        chapterSlug: slug,
        chapterTitle: entry.title,
        chunkIndex: i,
        text: c.text,
        vector: c.vector,
      });
    });
  }

  return candidates
    .map((c) => {
      let dot = 0;
      const v = c.vector;
      for (let i = 0; i < v.length; i++) dot += v[i] * (queryVec[i] ?? 0);
      return { ...c, score: dot };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, topK)
    .filter((x) => x.score > 0.05);
}
