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

export async function readMemory(userId: string, workSlug: string): Promise<WorkMemory> {
  await fs.mkdir(memoryDir(userId, workSlug), { recursive: true });
  const [characters, worldbuilding, plot, styleBuf] = await Promise.all([
    readJson<Character[]>(memoryFilePath(userId, workSlug, "characters"), []),
    readJson<WorldEntry[]>(memoryFilePath(userId, workSlug, "worldbuilding"), []),
    readJson<PlotThread[]>(memoryFilePath(userId, workSlug, "plot"), []),
    fs.readFile(styleFilePath(userId, workSlug), "utf8").catch(() => ""),
  ]);
  return { characters, worldbuilding, plot, style: styleBuf };
}

export async function writeMemory(
  userId: string,
  workSlug: string,
  memory: WorkMemory,
  options?: { syncVectors?: boolean },
): Promise<void> {
  await fs.mkdir(memoryDir(userId, workSlug), { recursive: true });
  await Promise.all([
    fs.writeFile(memoryFilePath(userId, workSlug, "characters"), JSON.stringify(memory.characters, null, 2) + "\n", "utf8"),
    fs.writeFile(memoryFilePath(userId, workSlug, "worldbuilding"), JSON.stringify(memory.worldbuilding, null, 2) + "\n", "utf8"),
    fs.writeFile(memoryFilePath(userId, workSlug, "plot"), JSON.stringify(memory.plot, null, 2) + "\n", "utf8"),
    fs.writeFile(styleFilePath(userId, workSlug), memory.style ?? "", "utf8"),
  ]);
  if (options?.syncVectors !== false) {
    try {
      await syncVectors(userId, workSlug, memory);
    } catch (err) {
      console.warn(`[memory] vector sync failed for ${workSlug}:`, (err as Error).message);
    }
  }
}

export async function readCharacters(userId: string, workSlug: string): Promise<Character[]> {
  return readJson<Character[]>(memoryFilePath(userId, workSlug, "characters"), []);
}

export async function writeCharacters(userId: string, workSlug: string, characters: Character[]): Promise<void> {
  await fs.writeFile(memoryFilePath(userId, workSlug, "characters"), JSON.stringify(characters, null, 2) + "\n", "utf8");
}

export async function readWorldbuilding(userId: string, workSlug: string): Promise<WorldEntry[]> {
  return readJson<WorldEntry[]>(memoryFilePath(userId, workSlug, "worldbuilding"), []);
}

export async function writeWorldbuilding(userId: string, workSlug: string, entries: WorldEntry[]): Promise<void> {
  await fs.writeFile(memoryFilePath(userId, workSlug, "worldbuilding"), JSON.stringify(entries, null, 2) + "\n", "utf8");
}

export async function readPlot(userId: string, workSlug: string): Promise<PlotThread[]> {
  return readJson<PlotThread[]>(memoryFilePath(userId, workSlug, "plot"), []);
}

export async function writePlot(userId: string, workSlug: string, threads: PlotThread[]): Promise<void> {
  await fs.writeFile(memoryFilePath(userId, workSlug, "plot"), JSON.stringify(threads, null, 2) + "\n", "utf8");
}

export async function readStyle(userId: string, workSlug: string): Promise<string> {
  try {
    return await fs.readFile(styleFilePath(userId, workSlug), "utf8");
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return "";
    throw err;
  }
}

export async function writeStyle(userId: string, workSlug: string, style: string): Promise<void> {
  await fs.writeFile(styleFilePath(userId, workSlug), style, "utf8");
}

export function emptyWorkMemory(): WorkMemory {
  return emptyMemory();
}
