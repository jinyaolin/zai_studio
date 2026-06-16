import { promises as fs } from "node:fs";
import type { Character, PlotThread, WorkMemory, WorldEntry } from "@/lib/types";
import { emptyMemory } from "@/lib/types";
import { memoryDir, memoryFilePath, styleFilePath } from "@/lib/content/paths";
import { syncVectors } from "./vectors";

export { newMemoryId } from "./id";

async function readJson<T>(path: string, fallback: T): Promise<T> {
  try {
    const raw = await fs.readFile(path, "utf8");
    return JSON.parse(raw) as T;
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return fallback;
    throw err;
  }
}

export async function readMemory(workSlug: string): Promise<WorkMemory> {
  await fs.mkdir(memoryDir(workSlug), { recursive: true });
  const [characters, worldbuilding, plot, styleBuf] = await Promise.all([
    readJson<Character[]>(memoryFilePath(workSlug, "characters"), []),
    readJson<WorldEntry[]>(memoryFilePath(workSlug, "worldbuilding"), []),
    readJson<PlotThread[]>(memoryFilePath(workSlug, "plot"), []),
    fs.readFile(styleFilePath(workSlug), "utf8").catch(() => ""),
  ]);
  return { characters, worldbuilding, plot, style: styleBuf };
}

export async function writeMemory(
  workSlug: string,
  memory: WorkMemory,
  options?: { syncVectors?: boolean },
): Promise<void> {
  await fs.mkdir(memoryDir(workSlug), { recursive: true });
  await Promise.all([
    fs.writeFile(memoryFilePath(workSlug, "characters"), JSON.stringify(memory.characters, null, 2) + "\n", "utf8"),
    fs.writeFile(memoryFilePath(workSlug, "worldbuilding"), JSON.stringify(memory.worldbuilding, null, 2) + "\n", "utf8"),
    fs.writeFile(memoryFilePath(workSlug, "plot"), JSON.stringify(memory.plot, null, 2) + "\n", "utf8"),
    fs.writeFile(styleFilePath(workSlug), memory.style ?? "", "utf8"),
  ]);
  // Sync the vector index after a successful write. Failures are non-fatal —
  // the memory itself is saved; we just lose retrieval quality until next sync.
  if (options?.syncVectors !== false) {
    try {
      await syncVectors(workSlug, memory);
    } catch (err) {
      console.warn(`[memory] vector sync failed for ${workSlug}:`, (err as Error).message);
    }
  }
}

export async function readCharacters(workSlug: string): Promise<Character[]> {
  return readJson<Character[]>(memoryFilePath(workSlug, "characters"), []);
}

export async function writeCharacters(workSlug: string, characters: Character[]): Promise<void> {
  await fs.writeFile(memoryFilePath(workSlug, "characters"), JSON.stringify(characters, null, 2) + "\n", "utf8");
}

export async function readWorldbuilding(workSlug: string): Promise<WorldEntry[]> {
  return readJson<WorldEntry[]>(memoryFilePath(workSlug, "worldbuilding"), []);
}

export async function writeWorldbuilding(workSlug: string, entries: WorldEntry[]): Promise<void> {
  await fs.writeFile(memoryFilePath(workSlug, "worldbuilding"), JSON.stringify(entries, null, 2) + "\n", "utf8");
}

export async function readPlot(workSlug: string): Promise<PlotThread[]> {
  return readJson<PlotThread[]>(memoryFilePath(workSlug, "plot"), []);
}

export async function writePlot(workSlug: string, threads: PlotThread[]): Promise<void> {
  await fs.writeFile(memoryFilePath(workSlug, "plot"), JSON.stringify(threads, null, 2) + "\n", "utf8");
}

export async function readStyle(workSlug: string): Promise<string> {
  try {
    return await fs.readFile(styleFilePath(workSlug), "utf8");
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return "";
    throw err;
  }
}

export async function writeStyle(workSlug: string, style: string): Promise<void> {
  await fs.writeFile(styleFilePath(workSlug), style, "utf8");
}

export function emptyWorkMemory(): WorkMemory {
  return emptyMemory();
}
