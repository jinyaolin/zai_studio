import path from "node:path";
import { workDir } from "./paths";

export function versionsDir(workSlug: string) {
  return path.join(workDir(workSlug), "versions");
}

export function chapterVersionsDir(workSlug: string, chapterSlug: string) {
  return path.join(versionsDir(workSlug), chapterSlug);
}

// Re-export the pure helpers for server-only callers (chapters.ts).
export { timestampForFilename, parseVersionTimestamp, filenameToIso } from "@/lib/utils/version-format";
