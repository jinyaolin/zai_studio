import path from "node:path";

export const ROOT = process.cwd();

export const CONTENT_DIR = path.join(ROOT, "content");
export const USERS_DIR = path.join(CONTENT_DIR, "users");

export const DATA_DIR = path.join(ROOT, "data");
export const DB_PATH = process.env.SQLITE_PATH
  ? path.resolve(ROOT, process.env.SQLITE_PATH)
  : path.join(DATA_DIR, "index.db");

export const AUDIO_DIR = path.join(ROOT, "public", "audio");

// ─── Per-user path helpers ────────────────────────────────────────
//
// Every helper takes userId as the first param. Content lives at
// content/users/<userId>/works/<slug>/... and per-user TTS cache at
// public/audio/<userId>/<workSlug>/...

export function userContentDir(userId: string) {
  return path.join(USERS_DIR, userId);
}

export function workDir(userId: string, slug: string) {
  return path.join(userContentDir(userId), "works", slug);
}

export function workJsonPath(userId: string, slug: string) {
  return path.join(workDir(userId, slug), "work.json");
}

export function chaptersDir(userId: string, slug: string) {
  return path.join(workDir(userId, slug), "chapters");
}

export function memoryDir(userId: string, slug: string) {
  return path.join(workDir(userId, slug), "memory");
}

export function conversationsDir(userId: string, slug: string) {
  return path.join(workDir(userId, slug), "conversations");
}

export function versionsDir(userId: string, slug: string) {
  return path.join(workDir(userId, slug), "versions");
}

export function designSessionsDir(userId: string, slug: string) {
  return path.join(workDir(userId, slug), "design-sessions");
}

export function chapterPath(userId: string, workSlug: string, chapterSlug: string) {
  return path.join(chaptersDir(userId, workSlug), `${chapterSlug}.md`);
}

export function memoryFilePath(
  userId: string,
  workSlug: string,
  kind: "characters" | "worldbuilding" | "plot",
) {
  return path.join(memoryDir(userId, workSlug), `${kind}.json`);
}

export function styleFilePath(userId: string, workSlug: string) {
  return path.join(memoryDir(userId, workSlug), "style.md");
}

export function vectorsFilePath(userId: string, workSlug: string) {
  return path.join(memoryDir(userId, workSlug), "vectors.json");
}

export function conversationPath(userId: string, workSlug: string, conversationId: string) {
  return path.join(conversationsDir(userId, workSlug), `${conversationId}.json`);
}

export function audioChunkPath(
  userId: string,
  workSlug: string,
  chapterSlug: string,
  chunkIndex: number,
  voice: string,
) {
  return path.join(
    AUDIO_DIR,
    userId,
    workSlug,
    chapterSlug,
    `${voice}`,
    `${chunkIndex}.mp3`,
  );
}

export function audioChunkPublicPath(
  userId: string,
  workSlug: string,
  chapterSlug: string,
  chunkIndex: number,
  voice: string,
) {
  return `/audio/${userId}/${workSlug}/${chapterSlug}/${voice}/${chunkIndex}.mp3`;
}
