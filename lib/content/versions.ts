import path from "node:path";
import { workDir } from "./paths";

export function versionsDir(userId: string, workSlug: string) {
  return path.join(workDir(userId, workSlug), "versions");
}

export function chapterVersionsDir(userId: string, workSlug: string, chapterSlug: string) {
  return path.join(versionsDir(userId, workSlug), chapterSlug);
}

// Re-export the pure helpers for server-only callers (chapters.ts).
export { timestampForFilename, parseVersionTimestamp, filenameToIso } from "@/lib/utils/version-format";
