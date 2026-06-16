import { listChapters } from "./chapters";
import { listWorks, readWork } from "./works";
import {
  deleteChapterFts,
  deleteChapterRow,
  deleteWorkRow,
  queryChaptersByWork,
  queryAllWorks,
  upsertChapterFts,
  upsertChapterRow,
  upsertWorkRow,
} from "./db";

export interface SyncReport {
  works: { added: number; updated: number; removed: number };
  chapters: { added: number; updated: number; removed: number };
}

// Files are the source of truth. Bring the SQLite index into sync with the
// contents of content/works/. Safe to run repeatedly.
export async function syncIndex(): Promise<SyncReport> {
  const report: SyncReport = {
    works: { added: 0, updated: 0, removed: 0 },
    chapters: { added: 0, updated: 0, removed: 0 },
  };

  const fileWorks = await listWorks();
  const dbWorks = new Map(queryAllWorks().map((w) => [w.slug, w]));
  const fileSlugs = new Set(fileWorks.map((w) => w.slug));

  for (const work of fileWorks) {
    const wasInDb = dbWorks.has(work.slug);
    upsertWorkRow({
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

    // Chapters
    const fileChapters = await listChapters(work.slug);
    const dbChapters = new Map(
      queryChaptersByWork(work.slug).map((c) => [c.slug, c]),
    );
    const fileChapterSlugs = new Set(fileChapters.map((c) => c.slug));
    let workWordCount = 0;

    for (const chapter of fileChapters) {
      const wasInDb = dbChapters.has(chapter.slug);
      upsertChapterRow({
        slug: chapter.slug,
        workSlug: work.slug,
        order: chapter.order,
        title: chapter.title,
        wordCount: chapter.wordCount,
        status: chapter.status,
        audioStatus: "none",
        createdAt: chapter.createdAt,
        updatedAt: chapter.updatedAt,
      });
      upsertChapterFts(work.slug, chapter.slug, chapter.title, chapter.content);
      workWordCount += chapter.wordCount;
      if (wasInDb) report.chapters.updated++;
      else report.chapters.added++;
    }

    // Remove DB chapters whose files are gone
    for (const [slug] of dbChapters) {
      if (!fileChapterSlugs.has(slug)) {
        deleteChapterRow(work.slug, slug);
        deleteChapterFts(work.slug, slug);
        report.chapters.removed++;
      }
    }

    // Update work word count
    upsertWorkRow({
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

  // Remove DB works whose files are gone
  for (const [slug] of dbWorks) {
    if (!fileSlugs.has(slug)) {
      deleteWorkRow(slug);
      report.works.removed++;
    }
  }

  return report;
}

export async function syncWork(workSlug: string): Promise<void> {
  const work = await readWork(workSlug);
  const chapters = await listChapters(workSlug);
  let total = 0;
  for (const chapter of chapters) {
    upsertChapterRow({
      slug: chapter.slug,
      workSlug,
      order: chapter.order,
      title: chapter.title,
      wordCount: chapter.wordCount,
      status: chapter.status,
      audioStatus: "none",
      createdAt: chapter.createdAt,
      updatedAt: chapter.updatedAt,
    });
    upsertChapterFts(workSlug, chapter.slug, chapter.title, chapter.content);
    total += chapter.wordCount;
  }
  upsertWorkRow({
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
