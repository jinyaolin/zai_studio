import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { DB_PATH, DATA_DIR } from "./paths";

// Single shared connection. better-sqlite3 is synchronous; safe to reuse.
let _db: Database.Database | null = null;

const SCHEMA = `
CREATE TABLE IF NOT EXISTS works (
  slug TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  type TEXT NOT NULL,
  status TEXT NOT NULL,
  synopsis TEXT DEFAULT '',
  genre TEXT,
  tags TEXT DEFAULT '[]',
  word_count INTEGER DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  published_at TEXT
);

CREATE TABLE IF NOT EXISTS chapters (
  slug TEXT NOT NULL,
  work_slug TEXT NOT NULL,
  chapter_order INTEGER NOT NULL,
  title TEXT NOT NULL,
  word_count INTEGER DEFAULT 0,
  status TEXT DEFAULT 'draft',
  audio_status TEXT DEFAULT 'none',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (work_slug, slug),
  FOREIGN KEY (work_slug) REFERENCES works(slug) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS conversations (
  id TEXT PRIMARY KEY,
  work_slug TEXT NOT NULL,
  title TEXT,
  message_count INTEGER DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (work_slug) REFERENCES works(slug) ON DELETE CASCADE
);

CREATE VIRTUAL TABLE IF NOT EXISTS chapters_fts USING fts5(
  work_slug UNINDEXED,
  chapter_slug UNINDEXED,
  title,
  content,
  tokenize = 'unicode61'
);

CREATE INDEX IF NOT EXISTS idx_chapters_work_order ON chapters(work_slug, chapter_order);
CREATE INDEX IF NOT EXISTS idx_works_status ON works(status);
CREATE INDEX IF NOT EXISTS idx_conversations_work ON conversations(work_slug);
`;

export function getDb(): Database.Database {
  if (_db) return _db;
  mkdirSync(DATA_DIR, { recursive: true });
  mkdirSync(path.dirname(DB_PATH), { recursive: true });
  _db = new Database(DB_PATH);
  _db.pragma("journal_mode = WAL");
  _db.pragma("foreign_keys = ON");
  _db.exec(SCHEMA);
  return _db;
}

export interface WorkRow {
  slug: string;
  title: string;
  type: string;
  status: string;
  synopsis: string;
  genre: string | null;
  tags: string;
  word_count: number;
  created_at: string;
  updated_at: string;
  published_at: string | null;
}

export interface ChapterRow {
  slug: string;
  work_slug: string;
  chapter_order: number;
  title: string;
  word_count: number;
  status: string;
  audio_status: string;
  created_at: string;
  updated_at: string;
}

export interface ConversationRow {
  id: string;
  work_slug: string;
  title: string | null;
  message_count: number;
  created_at: string;
  updated_at: string;
}

// ─── Work queries ─────────────────────────────────────────────────
const stmtUpsertWork = () =>
  getDb().prepare<
    [string, string, string, string, string, string | null, string, number, string, string, string | null]
  >(
    `INSERT INTO works (slug, title, type, status, synopsis, genre, tags, word_count, created_at, updated_at, published_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(slug) DO UPDATE SET
       title=excluded.title, type=excluded.type, status=excluded.status,
       synopsis=excluded.synopsis, genre=excluded.genre, tags=excluded.tags,
       word_count=excluded.word_count, updated_at=excluded.updated_at,
       published_at=excluded.published_at`,
  );

export function upsertWorkRow(w: {
  slug: string;
  title: string;
  type: string;
  status: string;
  synopsis: string;
  genre?: string | null;
  tags: string[];
  wordCount: number;
  createdAt: string;
  updatedAt: string;
  publishedAt: string | null;
}) {
  stmtUpsertWork().run(
    w.slug,
    w.title,
    w.type,
    w.status,
    w.synopsis,
    w.genre ?? null,
    JSON.stringify(w.tags),
    w.wordCount,
    w.createdAt,
    w.updatedAt,
    w.publishedAt,
  );
}

export function deleteWorkRow(slug: string) {
  getDb().prepare(`DELETE FROM works WHERE slug = ?`).run(slug);
}

// Cascade rename of a work's slug across every table that references it.
// Wrapped in a transaction so we never end up with rows pointing at a
// directory that no longer exists. Files inside content/works/<slug>/ are
// renamed by lib/content/works.ts before this is called.
export function renameWorkRow(oldSlug: string, newSlug: string): void {
  if (oldSlug === newSlug) return;
  const db = getDb();
  const tx = db.transaction(() => {
    // 1) works PK
    const w = db
      .prepare<unknown[], WorkRow>(`SELECT * FROM works WHERE slug = ?`)
      .get(oldSlug);
    if (!w) return; // nothing to rename
    db.prepare(`DELETE FROM works WHERE slug = ?`).run(oldSlug);
    db.prepare<
      [string, string, string, string, string, string | null, string, number, string, string, string | null]
    >(
      `INSERT INTO works (slug, title, type, status, synopsis, genre, tags, word_count, created_at, updated_at, published_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      newSlug,
      w.title,
      w.type,
      w.status,
      w.synopsis,
      w.genre,
      w.tags,
      w.word_count,
      w.created_at,
      w.updated_at,
      w.published_at,
    );

    // 2) chapters.work_slug (FK with ON DELETE CASCADE, but UPDATE works too)
    db.prepare(`UPDATE chapters SET work_slug = ? WHERE work_slug = ?`).run(newSlug, oldSlug);

    // 3) conversations.work_slug
    db.prepare(`UPDATE conversations SET work_slug = ? WHERE work_slug = ?`).run(newSlug, oldSlug);

    // 4) chapters_fts.work_slug — FTS5 virtual tables can't UPDATE; copy + delete.
    const ftsRows = db
      .prepare<[string], { chapter_slug: string; title: string; content: string }>(
        `SELECT chapter_slug, title, content FROM chapters_fts WHERE work_slug = ?`,
      )
      .all(oldSlug);
    if (ftsRows.length > 0) {
      const insertFts = db.prepare<[string, string, string, string]>(
        `INSERT INTO chapters_fts (work_slug, chapter_slug, title, content) VALUES (?, ?, ?, ?)`,
      );
      for (const r of ftsRows) insertFts.run(newSlug, r.chapter_slug, r.title, r.content);
      db.prepare(`DELETE FROM chapters_fts WHERE work_slug = ?`).run(oldSlug);
    }
  });
  tx();
}

export function queryWorksByStatus(status: string): WorkRow[] {
  return getDb().prepare(`SELECT * FROM works WHERE status = ? ORDER BY updated_at DESC`).all(status) as WorkRow[];
}

export function queryAllWorks(): WorkRow[] {
  return getDb().prepare(`SELECT * FROM works ORDER BY updated_at DESC`).all() as WorkRow[];
}

export function queryWork(slug: string): WorkRow | undefined {
  return getDb().prepare(`SELECT * FROM works WHERE slug = ?`).get(slug) as WorkRow | undefined;
}

// ─── Chapter queries ──────────────────────────────────────────────
const stmtUpsertChapter = () =>
  getDb().prepare<
    [string, string, number, string, number, string, string, string, string]
  >(
    `INSERT INTO chapters (slug, work_slug, chapter_order, title, word_count, status, audio_status, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(work_slug, slug) DO UPDATE SET
       chapter_order=excluded.chapter_order, title=excluded.title,
       word_count=excluded.word_count, status=excluded.status,
       audio_status=excluded.audio_status, updated_at=excluded.updated_at`,
  );

export function upsertChapterRow(c: {
  slug: string;
  workSlug: string;
  order: number;
  title: string;
  wordCount: number;
  status: string;
  audioStatus: string;
  createdAt: string;
  updatedAt: string;
}) {
  stmtUpsertChapter().run(
    c.slug,
    c.workSlug,
    c.order,
    c.title,
    c.wordCount,
    c.status,
    c.audioStatus,
    c.createdAt,
    c.updatedAt,
  );
}

export function deleteChapterRow(workSlug: string, slug: string) {
  getDb().prepare(`DELETE FROM chapters WHERE work_slug = ? AND slug = ?`).run(workSlug, slug);
}

// Move a chapter row from old slug to new slug + re-key its FTS entries.
// Used when a draft chapter is renamed to keep its URL in sync with its title.
export function renameChapterRow(workSlug: string, oldSlug: string, newSlug: string): void {
  if (oldSlug === newSlug) return;
  const db = getDb();
  // Read existing row, then delete + insert under new key (PK is composite).
  const row = db
    .prepare<unknown[], ChapterRow>(`SELECT * FROM chapters WHERE work_slug = ? AND slug = ?`)
    .get(workSlug, oldSlug);
  if (!row) return;
  db.prepare(`DELETE FROM chapters WHERE work_slug = ? AND slug = ?`).run(workSlug, oldSlug);
  db.prepare<
    [string, string, number, string, number, string, string, string, string]
  >(
    `INSERT INTO chapters (slug, work_slug, chapter_order, title, word_count, status, audio_status, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    newSlug,
    row.work_slug,
    row.chapter_order,
    row.title,
    row.word_count,
    row.status,
    row.audio_status,
    row.created_at,
    row.updated_at,
  );
  // Re-key FTS rows.
  const ftsRows = db
    .prepare<[string, string], { title: string; content: string }>(
      `SELECT title, content FROM chapters_fts WHERE work_slug = ? AND chapter_slug = ?`,
    )
    .all(workSlug, oldSlug);
  if (ftsRows.length > 0) {
    db.prepare(`DELETE FROM chapters_fts WHERE work_slug = ? AND chapter_slug = ?`).run(workSlug, oldSlug);
    const insertFts = db.prepare<[string, string, string, string]>(
      `INSERT INTO chapters_fts (work_slug, chapter_slug, title, content) VALUES (?, ?, ?, ?)`,
    );
    for (const r of ftsRows) insertFts.run(workSlug, newSlug, r.title, r.content);
  }
}

export function queryChaptersByWork(workSlug: string): ChapterRow[] {
  return getDb()
    .prepare(`SELECT * FROM chapters WHERE work_slug = ? ORDER BY chapter_order ASC`)
    .all(workSlug) as ChapterRow[];
}

// ─── FTS ──────────────────────────────────────────────────────────
// FTS5 virtual tables don't support UPSERT / ON CONFLICT.
// Callers must delete-then-insert.
const stmtInsertFts = () =>
  getDb().prepare<[string, string, string, string]>(
    `INSERT INTO chapters_fts (work_slug, chapter_slug, title, content)
     VALUES (?, ?, ?, ?)`,
  );

export function upsertChapterFts(workSlug: string, chapterSlug: string, title: string, content: string) {
  const db = getDb();
  db.prepare(`DELETE FROM chapters_fts WHERE work_slug = ? AND chapter_slug = ?`).run(workSlug, chapterSlug);
  stmtInsertFts().run(workSlug, chapterSlug, title, content);
}

export function deleteChapterFts(workSlug: string, chapterSlug: string) {
  getDb()
    .prepare(`DELETE FROM chapters_fts WHERE work_slug = ? AND chapter_slug = ?`)
    .run(workSlug, chapterSlug);
}

export function searchChapters(query: string, limit = 20) {
  const escaped = query.replace(/["']/g, " ");
  const db = getDb();
  return db
    .prepare(
      `SELECT work_slug AS workSlug, chapter_slug AS chapterSlug, title,
              snippet(chapters_fts, 3, '⟦', '⟧', '…', 20) AS snippet,
              rank
       FROM chapters_fts
       WHERE chapters_fts MATCH ?
       ORDER BY rank
       LIMIT ?`,
    )
    .all(escaped, limit);
}

// ─── Conversation queries ─────────────────────────────────────────
export function upsertConversationRow(c: {
  id: string;
  workSlug: string;
  title: string | null;
  messageCount: number;
  createdAt: string;
  updatedAt: string;
}) {
  getDb()
    .prepare<
      [string, string, string | null, number, string, string]
    >(
      `INSERT INTO conversations (id, work_slug, title, message_count, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         title=excluded.title, message_count=excluded.message_count, updated_at=excluded.updated_at`,
    )
    .run(c.id, c.workSlug, c.title, c.messageCount, c.createdAt, c.updatedAt);
}

export function deleteConversationRow(id: string) {
  getDb().prepare(`DELETE FROM conversations WHERE id = ?`).run(id);
}

export function queryConversationsByWork(workSlug: string): ConversationRow[] {
  return getDb()
    .prepare(`SELECT * FROM conversations WHERE work_slug = ? ORDER BY updated_at DESC`)
    .all(workSlug) as ConversationRow[];
}
