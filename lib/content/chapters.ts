import { promises as fs } from "node:fs";
import path from "node:path";
import type { Chapter, ChapterStatus, ChapterVersion } from "@/lib/types";
import { chapterPath, chaptersDir } from "./paths";
import { countWords, parseChapterFile, serializeChapter, slugifyChapter } from "./markdown";
import { chapterVersionsDir } from "./versions";
import { parseVersionTimestamp, timestampForFilename } from "@/lib/utils/version-format";
import { removeChapterVectors, syncChapterVectors } from "@/lib/memory/vectors";

export async function getAdjacentChapters(
  userId: string,
  workSlug: string,
  chapterSlug: string,
): Promise<{ previous: Chapter | null; next: Chapter | null; currentIndex: number }> {
  const all = await listChapters(userId, workSlug);
  const index = all.findIndex((c) => c.slug === chapterSlug);
  if (index === -1) return { previous: null, next: null, currentIndex: -1 };
  return {
    previous: index > 0 ? all[index - 1] : null,
    next: index < all.length - 1 ? all[index + 1] : null,
    currentIndex: index,
  };
}

export async function listChapters(userId: string, workSlug: string): Promise<Chapter[]> {
  try {
    const entries = await fs.readdir(chaptersDir(userId, workSlug));
    const chapters: Chapter[] = [];
    for (const file of entries) {
      if (!file.endsWith(".md")) continue;
      const slug = file.replace(/\.md$/, "");
      try {
        chapters.push(await readChapter(userId, workSlug, slug));
      } catch {
        // skip malformed
      }
    }
    return chapters.sort((a, b) => a.order - b.order);
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw err;
  }
}

export async function readChapter(
  userId: string,
  workSlug: string,
  chapterSlug: string,
): Promise<Chapter> {
  const raw = await fs.readFile(chapterPath(userId, workSlug, chapterSlug), "utf8");
  const { frontmatter, body } = parseChapterFile(raw);
  return {
    slug: chapterSlug,
    workSlug,
    order: frontmatter.order,
    title: frontmatter.title,
    content: body,
    status: frontmatter.status,
    wordCount: frontmatter.wordCount,
    createdAt: frontmatter.createdAt,
    updatedAt: frontmatter.updatedAt,
  };
}

export interface CreateChapterInput {
  title: string;
  content?: string;
  status?: ChapterStatus;
}

export async function createChapter(
  userId: string,
  workSlug: string,
  input: CreateChapterInput,
): Promise<Chapter> {
  const existing = await listChapters(userId, workSlug);
  const order = existing.length === 0 ? 1 : Math.max(...existing.map((c) => c.order)) + 1;
  const now = new Date().toISOString();
  const slug = slugifyChapter(order, input.title);
  const content = (input.content ?? "").trim();
  const chapter: Chapter = {
    slug,
    workSlug,
    order,
    title: input.title,
    content,
    status: input.status ?? "draft",
    wordCount: countWords(content),
    createdAt: now,
    updatedAt: now,
  };
  await fs.mkdir(chaptersDir(userId, workSlug), { recursive: true });
  await fs.writeFile(chapterPath(userId, workSlug, slug), serializeChapter(chapter), "utf8");
  try {
    await syncChapterVectors(userId, workSlug, slug, chapter.title, chapter.content);
  } catch (err) {
    console.warn(`[chapters] vector sync failed for ${workSlug}/${slug}:`, (err as Error).message);
  }
  return chapter;
}

export async function updateChapter(
  userId: string,
  workSlug: string,
  chapterSlug: string,
  patch: { title?: string; content?: string; status?: ChapterStatus },
): Promise<Chapter & { renamedTo?: string }> {
  const chapter = await readChapter(userId, workSlug, chapterSlug);
  const oldTitle = chapter.title;
  if (patch.title !== undefined) chapter.title = patch.title;
  if (patch.content !== undefined) chapter.content = patch.content;
  if (patch.status !== undefined) chapter.status = patch.status;
  chapter.wordCount = countWords(chapter.content);
  chapter.updatedAt = new Date().toISOString();

  let activeSlug = chapterSlug;
  let renamedTo: string | undefined;
  const titleChanged = patch.title !== undefined && patch.title !== oldTitle;
  let workDraft = true;
  try {
    const { readWork } = await import("./works");
    const w = await readWork(userId, workSlug);
    workDraft = w.status === "draft";
  } catch {
    // can't read work → assume draft (safer to allow rename)
  }
  if (titleChanged && workDraft) {
    const desired = slugifyChapter(chapter.order, chapter.title);
    if (desired !== chapterSlug) {
      const target = await resolveUniqueSlug(userId, workSlug, desired, chapterSlug);
      if (target !== chapterSlug) {
        await renameChapterFiles(userId, workSlug, chapterSlug, target);
        activeSlug = target;
        renamedTo = target;
      }
    }
  }

  await fs.writeFile(chapterPath(userId, workSlug, activeSlug), serializeChapter(chapter), "utf8");
  try {
    await syncChapterVectors(userId, workSlug, activeSlug, chapter.title, chapter.content);
  } catch (err) {
    console.warn(`[chapters] vector sync failed for ${workSlug}/${activeSlug}:`, (err as Error).message);
  }
  return { ...chapter, slug: activeSlug, renamedTo };
}

async function resolveUniqueSlug(
  userId: string,
  workSlug: string,
  desired: string,
  excludeSlug: string,
): Promise<string> {
  const existing = await listChapters(userId, workSlug);
  const others = existing.filter((c) => c.slug !== excludeSlug).map((c) => c.slug);
  if (!others.includes(desired)) return desired;
  const base = desired.replace(/-\d+$/, "");
  for (let i = 2; ; i++) {
    const candidate = `${base}-${i}`;
    if (!others.includes(candidate)) return candidate;
  }
}

async function renameChapterFiles(
  userId: string,
  workSlug: string,
  oldSlug: string,
  newSlug: string,
): Promise<void> {
  const oldFile = chapterPath(userId, workSlug, oldSlug);
  const newFile = chapterPath(userId, workSlug, newSlug);
  try {
    await fs.rename(oldFile, newFile);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return;
    throw err;
  }

  const oldVersions = chapterVersionsDir(userId, workSlug, oldSlug);
  const newVersions = chapterVersionsDir(userId, workSlug, newSlug);
  try {
    await fs.access(oldVersions);
    await fs.rename(oldVersions, newVersions);
  } catch {
    // no versions dir yet — fine
  }

  try {
    const { renameChapterVectorsKey } = await import("@/lib/memory/vectors");
    await renameChapterVectorsKey(userId, workSlug, oldSlug, newSlug);
  } catch (err) {
    console.warn(`[chapters] vector re-key failed for ${workSlug} ${oldSlug}→${newSlug}:`, (err as Error).message);
  }

  try {
    const { renameChapterRow } = await import("@/lib/content/db");
    renameChapterRow(userId, workSlug, oldSlug, newSlug);
  } catch (err) {
    console.warn(`[chapters] DB row re-key failed:`, (err as Error).message);
  }
}

export async function deleteChapter(userId: string, workSlug: string, chapterSlug: string): Promise<void> {
  await fs.rm(chapterPath(userId, workSlug, chapterSlug), { force: true });
  try {
    await removeChapterVectors(userId, workSlug, chapterSlug);
  } catch {
    // best effort
  }
}

export async function reorderChapters(
  userId: string,
  workSlug: string,
  orderedSlugs: string[],
): Promise<void> {
  for (let i = 0; i < orderedSlugs.length; i++) {
    const chapter = await readChapter(userId, workSlug, orderedSlugs[i]);
    if (chapter.order !== i + 1) {
      chapter.order = i + 1;
      chapter.updatedAt = new Date().toISOString();
      await fs.writeFile(
        chapterPath(userId, workSlug, chapter.slug),
        serializeChapter(chapter),
        "utf8",
      );
    }
  }
}

// ─── Versions ─────────────────────────────────────────────────────

export async function saveVersion(
  userId: string,
  workSlug: string,
  chapterSlug: string,
  reason = "manual",
): Promise<ChapterVersion | null> {
  let currentRaw: string;
  try {
    currentRaw = await fs.readFile(chapterPath(userId, workSlug, chapterSlug), "utf8");
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw err;
  }
  const { frontmatter } = parseChapterFile(currentRaw);
  const ts = timestampForFilename();
  const dir = chapterVersionsDir(userId, workSlug, chapterSlug);
  await fs.mkdir(dir, { recursive: true });

  const archivedFrontmatter = {
    ...frontmatter,
    archivedAt: new Date().toISOString(),
    archiveReason: reason,
  };
  const fmLines = Object.entries(archivedFrontmatter)
    .map(([k, v]) => `${k}: ${JSON.stringify(v)}`)
    .join("\n");
  const body = currentRaw.replace(/^---\n[\s\S]*?\n---/, "").trimStart();
  const versionRaw = `---\n${fmLines}\n---\n\n${body}\n`;
  const versionFile = path.join(dir, `${ts}.md`);
  await fs.writeFile(versionFile, versionRaw, "utf8");

  return {
    timestamp: ts,
    reason,
    title: frontmatter.title,
    status: frontmatter.status,
    wordCount: frontmatter.wordCount ?? 0,
    sizeBytes: Buffer.byteLength(versionRaw),
  };
}

export async function applyChapterUpdate(
  userId: string,
  workSlug: string,
  chapterSlug: string,
  patch: { title?: string; content?: string; status?: ChapterStatus },
  reason = "ai-edit",
): Promise<Chapter & { renamedTo?: string }> {
  await saveVersion(userId, workSlug, chapterSlug, reason);
  return updateChapter(userId, workSlug, chapterSlug, patch);
}

export async function listVersions(
  userId: string,
  workSlug: string,
  chapterSlug: string,
): Promise<ChapterVersion[]> {
  const dir = chapterVersionsDir(userId, workSlug, chapterSlug);
  let entries: string[];
  try {
    entries = await fs.readdir(dir);
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw err;
  }
  const versions: ChapterVersion[] = [];
  for (const file of entries) {
    const ts = parseVersionTimestamp(file);
    if (!ts) continue;
    try {
      const raw = await fs.readFile(path.join(dir, file), "utf8");
      const { frontmatter } = parseChapterFile(raw);
      const extra = frontmatter as typeof frontmatter & {
        archiveReason?: string;
        archivedAt?: string;
      };
      versions.push({
        timestamp: ts,
        reason: extra.archiveReason ?? "manual",
        title: frontmatter.title ?? "",
        status: frontmatter.status ?? "draft",
        wordCount: frontmatter.wordCount ?? 0,
        sizeBytes: Buffer.byteLength(raw),
      });
    } catch {
      // skip malformed
    }
  }
  return versions.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
}

export async function readVersionContent(
  userId: string,
  workSlug: string,
  chapterSlug: string,
  timestamp: string,
): Promise<{ title: string; content: string }> {
  const file = path.join(chapterVersionsDir(userId, workSlug, chapterSlug), `${timestamp}.md`);
  const raw = await fs.readFile(file, "utf8");
  const { frontmatter, body } = parseChapterFile(raw);
  return { title: frontmatter.title, content: body };
}

export async function restoreVersion(
  userId: string,
  workSlug: string,
  chapterSlug: string,
  timestamp: string,
): Promise<Chapter> {
  const { title, content } = await readVersionContent(userId, workSlug, chapterSlug, timestamp);
  return applyChapterUpdate(userId, workSlug, chapterSlug, { title, content }, "restore");
}
