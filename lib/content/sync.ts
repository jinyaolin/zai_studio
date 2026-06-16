import { promises as fs } from "node:fs";
import path from "node:path";
import { listChapters } from "./chapters";
import { listWorks, readWork } from "./works";
import { USERS_DIR } from "./paths";
import {
  deleteChapterRow,
  deleteWorkRow,
  queryChaptersByWork,
  queryAllWorks,
  upsertChapterRow,
  upsertWorkRow,
} from "./db";

export interface SyncReport {
  users: number;
  works: { added: number; updated: number; removed: number };
  chapters: { added: number; updated: number; removed: number };
}

// Files are the source of truth. Bring the SQLite index into sync with the
// contents of content/users/<userId>/works/. Safe to run repeatedly.
//
// When called with no userId, scans all users under content/users/. Used by
// the CLI `npm run db:sync`. Per-user `syncWork(userId, slug)` is called by
// API routes after every write.
export async function syncIndex(userId?: string): Promise<SyncReport> {
  const report: SyncReport = {
    users: 0,
    works: { added: 0, updated: 0, removed: 0 },
    chapters: { added: 0, updated: 0, removed: 0 },
  };

  const userIds = userId ? [userId] : await listUserIds();
  for (const uid of userIds) {
    report.users++;
    const r = await syncUserWorks(uid);
    report.works.added += r.works.added;
    report.works.updated += r.works.updated;
    report.works.removed += r.works.removed;
    report.chapters.added += r.chapters.added;
    report.chapters.updated += r.chapters.updated;
    report.chapters.removed += r.chapters.removed;
  }
  return report;
}

async function listUserIds(): Promise<string[]> {
  try {
    const entries = await fs.readdir(USERS_DIR, { withFileTypes: true });
    return entries.filter((e) => e.isDirectory()).map((e) => e.name);
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw err;
  }
}

async function syncUserWorks(userId: string): Promise<SyncReport> {
  const report: SyncReport = {
    users: 1,
    works: { added: 0, updated: 0, removed: 0 },
    chapters: { added: 0, updated: 0, removed: 0 },
  };

  const fileWorks = await listWorks(userId);
  const dbWorks = new Map(queryAllWorks(userId).map((w) => [w.slug, w]));
  const fileSlugs = new Set(fileWorks.map((w) => w.slug));

  for (const work of fileWorks) {
    const wasInDb = dbWorks.has(work.slug);
    upsertWorkRow(userId, {
      slug: work.slug,
      title: work.title,
      type: work.type,
      status: work.status,
      synopsis: work.synopsis,
      genre: work.genre ?? null,
      tags: work.tags,
      wordCount: 0,
      createdAt: work.createdAt,
      updatedAt: work.updatedAt,
      publishedAt: work.publishedAt,
    });
    if (wasInDb) report.works.updated++;
    else report.works.added++;

    const fileChapters = await listChapters(userId, work.slug);
    const dbChapters = new Map(
      queryChaptersByWork(userId, work.slug).map((c) => [c.slug, c]),
    );
    const fileChapterSlugs = new Set(fileChapters.map((c) => c.slug));
    let workWordCount = 0;

    for (const chapter of fileChapters) {
      const wasInDb = dbChapters.has(chapter.slug);
      upsertChapterRow(userId, {
        workSlug: work.slug,
        slug: chapter.slug,
        order: chapter.order,
        title: chapter.title,
        wordCount: chapter.wordCount,
        status: chapter.status,
        audioStatus: "none",
        createdAt: chapter.createdAt,
        updatedAt: chapter.updatedAt,
      });
      workWordCount += chapter.wordCount;
      if (wasInDb) report.chapters.updated++;
      else report.chapters.added++;
    }

    for (const [slug] of dbChapters) {
      if (!fileChapterSlugs.has(slug)) {
        deleteChapterRow(userId, work.slug, slug);
        report.chapters.removed++;
      }
    }

    upsertWorkRow(userId, {
      slug: work.slug,
      title: work.title,
      type: work.type,
      status: work.status,
      synopsis: work.synopsis,
      genre: work.genre ?? null,
      tags: work.tags,
      wordCount: workWordCount,
      createdAt: work.createdAt,
      updatedAt: work.updatedAt,
      publishedAt: work.publishedAt,
    });
  }

  for (const [slug] of dbWorks) {
    if (!fileSlugs.has(slug)) {
      deleteWorkRow(userId, slug);
      report.works.removed++;
    }
  }

  return report;
}

export async function syncWork(userId: string, workSlug: string): Promise<void> {
  const work = await readWork(userId, workSlug);
  const chapters = await listChapters(userId, workSlug);
  let total = 0;
  for (const chapter of chapters) {
    upsertChapterRow(userId, {
      workSlug,
      slug: chapter.slug,
      order: chapter.order,
      title: chapter.title,
      wordCount: chapter.wordCount,
      status: chapter.status,
      audioStatus: "none",
      createdAt: chapter.createdAt,
      updatedAt: chapter.updatedAt,
    });
    total += chapter.wordCount;
  }
  upsertWorkRow(userId, {
    slug: work.slug,
    title: work.title,
    type: work.type,
    status: work.status,
    synopsis: work.synopsis,
    genre: work.genre ?? null,
    tags: work.tags,
    wordCount: total,
    createdAt: work.createdAt,
    updatedAt: work.updatedAt,
    publishedAt: work.publishedAt,
  });
}

// Keep import for callers that still use the legacy name (no-op reference).
void path;
