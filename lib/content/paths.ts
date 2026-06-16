import path from "node:path";

export const ROOT = process.cwd();

export const CONTENT_DIR = path.join(ROOT, "content");
export const WORKS_DIR = path.join(CONTENT_DIR, "works");

export const DATA_DIR = path.join(ROOT, "data");
export const DB_PATH = process.env.SQLITE_PATH
  ? path.resolve(ROOT, process.env.SQLITE_PATH)
  : path.join(DATA_DIR, "index.db");

export const AUDIO_DIR = path.join(ROOT, "public", "audio");

export function workDir(slug: string) {
  return path.join(WORKS_DIR, slug);
}

export function workJsonPath(slug: string) {
  return path.join(workDir(slug), "work.json");
}

export function chaptersDir(slug: string) {
  return path.join(workDir(slug), "chapters");
}

export function memoryDir(slug: string) {
  return path.join(workDir(slug), "memory");
}

export function conversationsDir(slug: string) {
  return path.join(workDir(slug), "conversations");
}

export function chapterPath(workSlug: string, chapterSlug: string) {
  return path.join(chaptersDir(workSlug), `${chapterSlug}.md`);
}

export function memoryFilePath(workSlug: string, kind: "characters" | "worldbuilding" | "plot") {
  return path.join(memoryDir(workSlug), `${kind}.json`);
}

export function styleFilePath(workSlug: string) {
  return path.join(memoryDir(workSlug), "style.md");
}

export function conversationPath(workSlug: string, conversationId: string) {
  return path.join(conversationsDir(workSlug), `${conversationId}.json`);
}

export function audioChunkPath(
  workSlug: string,
  chapterSlug: string,
  chunkIndex: number,
  voice: string,
) {
  return path.join(
    AUDIO_DIR,
    workSlug,
    chapterSlug,
    `${voice}`,
    `${chunkIndex}.mp3`,
  );
}

export function audioChunkPublicPath(
  workSlug: string,
  chapterSlug: string,
  chunkIndex: number,
  voice: string,
) {
  return `/audio/${workSlug}/${chapterSlug}/${voice}/${chunkIndex}.mp3`;
}
