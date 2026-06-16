import { promises as fs } from "node:fs";
import path from "node:path";
import { nanoid } from "nanoid";
import type { Work, WorkStatus, WorkType } from "@/lib/types";
import {
  chaptersDir,
  conversationsDir,
  memoryDir,
  workDir,
  workJsonPath,
  WORKS_DIR,
} from "./paths";
import { slugifyWork } from "./markdown";

export async function listWorks(): Promise<Work[]> {
  try {
    const entries = await fs.readdir(WORKS_DIR, { withFileTypes: true });
    const works: Work[] = [];
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      try {
        works.push(await readWork(entry.name));
      } catch {
        // skip malformed dirs
      }
    }
    return works.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw err;
  }
}

export async function readWork(slug: string): Promise<Work> {
  const raw = await fs.readFile(workJsonPath(slug), "utf8");
  return JSON.parse(raw) as Work;
}

export async function writeWork(work: Work): Promise<void> {
  await fs.mkdir(workDir(work.slug), { recursive: true });
  await fs.writeFile(workJsonPath(work.slug), JSON.stringify(work, null, 2) + "\n", "utf8");
}

export interface CreateWorkInput {
  title: string;
  type: WorkType;
  synopsis?: string;
  genre?: string;
  tags?: string[];
}

export async function createWork(input: CreateWorkInput): Promise<Work> {
  const now = new Date().toISOString();
  const slug = slugifyWork(input.title);
  const existing = await listWorks();
  const baseSlug = slug;
  let uniqueSlug = slug;
  let i = 2;
  while (existing.some((w) => w.slug === uniqueSlug)) {
    uniqueSlug = `${baseSlug}-${i++}`;
  }

  const work: Work = {
    slug: uniqueSlug,
    title: input.title,
    type: input.type,
    status: "draft",
    synopsis: input.synopsis ?? "",
    genre: input.genre,
    tags: input.tags ?? [],
    createdAt: now,
    updatedAt: now,
    publishedAt: null,
  };

  // Scaffold the work directory with empty subdirs and default memory files
  await fs.mkdir(chaptersDir(uniqueSlug), { recursive: true });
  await fs.mkdir(conversationsDir(uniqueSlug), { recursive: true });
  await fs.mkdir(memoryDir(uniqueSlug), { recursive: true });
  await fs.writeFile(
    path.join(memoryDir(uniqueSlug), "characters.json"),
    "[]\n",
    "utf8",
  );
  await fs.writeFile(
    path.join(memoryDir(uniqueSlug), "worldbuilding.json"),
    "[]\n",
    "utf8",
  );
  await fs.writeFile(
    path.join(memoryDir(uniqueSlug), "plot.json"),
    "[]\n",
    "utf8",
  );
  await fs.writeFile(
    path.join(memoryDir(uniqueSlug), "style.md"),
    "# 風格指南\n\n（語氣、POV、用字、motif、禁忌…）\n",
    "utf8",
  );

  await writeWork(work);
  return work;
}

export async function updateWorkStatus(slug: string, status: WorkStatus): Promise<Work> {
  const work = await readWork(slug);
  work.status = status;
  work.updatedAt = new Date().toISOString();
  if (status === "published" && !work.publishedAt) {
    work.publishedAt = work.updatedAt;
  }
  await writeWork(work);
  return work;
}

export async function updateWork(
  slug: string,
  patch: Partial<Omit<Work, "slug" | "createdAt">>,
): Promise<Work & { renamedTo?: string }> {
  const work = await readWork(slug);
  const oldTitle = work.title;
  const oldStatus = work.status;
  const updated: Work = {
    ...work,
    ...patch,
    slug: work.slug,
    createdAt: work.createdAt,
    updatedAt: new Date().toISOString(),
  };

  // Same draft-only rename rule as chapters: only rename while unpublished,
  // because once a work URL is shared it must stay stable.
  let renamedTo: string | undefined;
  const titleChanged = patch.title !== undefined && patch.title !== oldTitle;
  const wasDraft = oldStatus === "draft";
  if (titleChanged && wasDraft) {
    const desired = slugifyWork(updated.title);
    if (desired && desired !== slug) {
      const target = await resolveUniqueWorkSlug(desired, slug);
      if (target !== slug) {
        await renameWorkDir(slug, target);
        updated.slug = target;
        renamedTo = target;
      }
    }
  }

  await writeWork(updated);
  return { ...updated, renamedTo };
}

async function resolveUniqueWorkSlug(desired: string, excludeSlug: string): Promise<string> {
  const existing = await listWorks();
  const others = existing.filter((w) => w.slug !== excludeSlug).map((w) => w.slug);
  if (!others.includes(desired)) return desired;
  const base = desired.replace(/-\d+$/, "");
  for (let i = 2; ; i++) {
    const candidate = `${base}-${i}`;
    if (!others.includes(candidate)) return candidate;
  }
}

// Rename the work's whole directory + cascade-update the DB rows that point
// at the old slug (works PK, chapters.work_slug FK, conversations.work_slug,
// chapters_fts.work_slug). Files inside the directory (chapters / memory /
// conversations / vectors.json / design-sessions) come along for the ride.
async function renameWorkDir(oldSlug: string, newSlug: string): Promise<void> {
  if (oldSlug === newSlug) return;
  const oldDir = workDir(oldSlug);
  const newDir = workDir(newSlug);
  try {
    await fs.rename(oldDir, newDir);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return;
    throw err;
  }

  // Cascade DB updates. Wrap in a transaction so the work doesn't end up
  // with rows pointing at a directory that no longer exists.
  try {
    const { renameWorkRow } = await import("@/lib/content/db");
    renameWorkRow(oldSlug, newSlug);
  } catch (err) {
    console.warn(`[works] DB cascade rename failed for ${oldSlug}→${newSlug}:`, (err as Error).message);
  }
}

export async function deleteWork(slug: string): Promise<void> {
  await fs.rm(workDir(slug), { recursive: true, force: true });
}

export function newId(): string {
  return nanoid();
}
