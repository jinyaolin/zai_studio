import { promises as fs } from "node:fs";
import path from "node:path";
import { nanoid } from "nanoid";
import type { Work, WorkStatus, WorkType } from "@/lib/types";
import {
  USERS_DIR,
  chaptersDir,
  conversationsDir,
  memoryDir,
  workDir,
  workJsonPath,
} from "./paths";
import { slugifyWork } from "./markdown";

/** List all of a user's works, sorted by updatedAt desc. */
export async function listWorks(userId: string): Promise<Work[]> {
  const dir = path.join(USERS_DIR, userId, "works");
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    const works: Work[] = [];
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      try {
        works.push(await readWork(userId, entry.name));
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

export async function readWork(userId: string, slug: string): Promise<Work> {
  const raw = await fs.readFile(workJsonPath(userId, slug), "utf8");
  return JSON.parse(raw) as Work;
}

export async function writeWork(userId: string, work: Work): Promise<void> {
  await fs.mkdir(workDir(userId, work.slug), { recursive: true });
  await fs.writeFile(workJsonPath(userId, work.slug), JSON.stringify(work, null, 2) + "\n", "utf8");
}

export interface CreateWorkInput {
  title: string;
  type: WorkType;
  synopsis?: string;
  genre?: string;
  tags?: string[];
}

export async function createWork(userId: string, input: CreateWorkInput): Promise<Work> {
  const now = new Date().toISOString();
  const slug = slugifyWork(input.title);
  const existing = await listWorks(userId);
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
  await fs.mkdir(chaptersDir(userId, uniqueSlug), { recursive: true });
  await fs.mkdir(conversationsDir(userId, uniqueSlug), { recursive: true });
  await fs.mkdir(memoryDir(userId, uniqueSlug), { recursive: true });
  await fs.writeFile(
    path.join(memoryDir(userId, uniqueSlug), "characters.json"),
    "[]\n",
    "utf8",
  );
  await fs.writeFile(
    path.join(memoryDir(userId, uniqueSlug), "worldbuilding.json"),
    "[]\n",
    "utf8",
  );
  await fs.writeFile(
    path.join(memoryDir(userId, uniqueSlug), "plot.json"),
    "[]\n",
    "utf8",
  );
  await fs.writeFile(
    path.join(memoryDir(userId, uniqueSlug), "style.md"),
    "# 風格指南\n\n（語氣、POV、用字、motif、禁忌…）\n",
    "utf8",
  );

  await writeWork(userId, work);
  return work;
}

export async function updateWorkStatus(userId: string, slug: string, status: WorkStatus): Promise<Work> {
  const work = await readWork(userId, slug);
  work.status = status;
  work.updatedAt = new Date().toISOString();
  if (status === "published" && !work.publishedAt) {
    work.publishedAt = work.updatedAt;
  }
  await writeWork(userId, work);
  return work;
}

export async function updateWork(
  userId: string,
  slug: string,
  patch: Partial<Omit<Work, "slug" | "createdAt">>,
): Promise<Work & { renamedTo?: string }> {
  const work = await readWork(userId, slug);
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
      const target = await resolveUniqueWorkSlug(userId, desired, slug);
      if (target !== slug) {
        await renameWorkDir(userId, slug, target);
        updated.slug = target;
        renamedTo = target;
      }
    }
  }

  await writeWork(userId, updated);
  return { ...updated, renamedTo };
}

async function resolveUniqueWorkSlug(
  userId: string,
  desired: string,
  excludeSlug: string,
): Promise<string> {
  const existing = await listWorks(userId);
  const others = existing.filter((w) => w.slug !== excludeSlug).map((w) => w.slug);
  if (!others.includes(desired)) return desired;
  const base = desired.replace(/-\d+$/, "");
  for (let i = 2; ; i++) {
    const candidate = `${base}-${i}`;
    if (!others.includes(candidate)) return candidate;
  }
}

// Rename the work's whole directory + cascade-update the DB rows that point
// at the old slug. Files inside the directory (chapters / memory /
// conversations / vectors.json / design-sessions) come along for the ride.
async function renameWorkDir(userId: string, oldSlug: string, newSlug: string): Promise<void> {
  if (oldSlug === newSlug) return;
  const oldDir = workDir(userId, oldSlug);
  const newDir = workDir(userId, newSlug);
  try {
    await fs.rename(oldDir, newDir);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return;
    throw err;
  }

  try {
    const { renameWorkRow } = await import("@/lib/content/db");
    renameWorkRow(userId, oldSlug, newSlug);
  } catch (err) {
    console.warn(`[works] DB cascade rename failed for ${oldSlug}→${newSlug}:`, (err as Error).message);
  }
}

export async function deleteWork(userId: string, slug: string): Promise<void> {
  await fs.rm(workDir(userId, slug), { recursive: true, force: true });
}

export function newId(): string {
  return nanoid();
}
