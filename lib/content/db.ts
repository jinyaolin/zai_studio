import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { DB_PATH, DATA_DIR } from "./paths";

// Single shared connection. better-sqlite3 is synchronous; safe to reuse.
let _db: Database.Database | null = null;

// Per-user schema. Every content row is scoped by user_id; queries filter
// accordingly. Composite PKs (user_id, slug) so two users can have the same
// work slug without colliding.
const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  sub TEXT NOT NULL UNIQUE,
  handle TEXT UNIQUE,
  display_name TEXT,
  created_at TEXT NOT NULL,
  last_login_at TEXT
);

CREATE TABLE IF NOT EXISTS works (
  user_id TEXT NOT NULL,
  slug TEXT NOT NULL,
  title TEXT NOT NULL,
  type TEXT NOT NULL,
  status TEXT NOT NULL,
  synopsis TEXT DEFAULT '',
  genre TEXT,
  tags TEXT DEFAULT '[]',
  word_count INTEGER DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  published_at TEXT,
  PRIMARY KEY (user_id, slug),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS chapters (
  user_id TEXT NOT NULL,
  work_slug TEXT NOT NULL,
  slug TEXT NOT NULL,
  chapter_order INTEGER NOT NULL,
  title TEXT NOT NULL,
  word_count INTEGER DEFAULT 0,
  status TEXT DEFAULT 'draft',
  audio_status TEXT DEFAULT 'none',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (user_id, work_slug, slug),
  FOREIGN KEY (user_id, work_slug) REFERENCES works(user_id, slug) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS conversations (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  work_slug TEXT NOT NULL,
  title TEXT,
  message_count INTEGER DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (user_id, work_slug) REFERENCES works(user_id, slug) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_chapters_work_order ON chapters(user_id, work_slug, chapter_order);
CREATE INDEX IF NOT EXISTS idx_works_user_status ON works(user_id, status);
CREATE INDEX IF NOT EXISTS idx_works_status ON works(status);
CREATE INDEX IF NOT EXISTS idx_conversations_work ON conversations(user_id, work_slug);
CREATE INDEX IF NOT EXISTS idx_users_handle ON users(handle);
`;

// Migrate from pre-multi-user schema (single-author: PK was slug only, no
// user_id column). Drop & recreate — the data is wiped in P6 anyway, and
// existing rows would have NULL user_id which violates NOT NULL.
function migrateFromLegacySchema(db: Database.Database) {
  const needsMigration = (() => {
    try {
      const cols = db.pragma(`table_info(works)`) as Array<{ name: string }>;
      return cols.length > 0 && !cols.some((c) => c.name === "user_id");
    } catch {
      return false;
    }
  })();
  if (!needsMigration) return;
  console.warn("[db] legacy schema detected — dropping pre-multi-user tables for migration");
  db.exec(`DROP TABLE IF EXISTS chapters`);
  db.exec(`DROP TABLE IF EXISTS conversations`);
  db.exec(`DROP TABLE IF EXISTS works`);
  // users table is new in this schema; safe to leave alone or recreate.
}

export function getDb(): Database.Database {
  if (_db) return _db;
  mkdirSync(DATA_DIR, { recursive: true });
  mkdirSync(path.dirname(DB_PATH), { recursive: true });
  _db = new Database(DB_PATH);
  _db.pragma("journal_mode = WAL");
  _db.pragma("foreign_keys = ON");
  migrateFromLegacySchema(_db);
  _db.exec(SCHEMA);
  return _db;
}

export interface WorkRow {
  user_id: string;
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
  user_id: string;
  work_slug: string;
  slug: string;
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
  user_id: string;
  work_slug: string;
  title: string | null;
  message_count: number;
  created_at: string;
  updated_at: string;
}

// ─── Work queries ─────────────────────────────────────────────────
const stmtUpsertWork = () =>
  getDb().prepare<
    [string, string, string, string, string, string, string | null, string, number, string, string, string | null]
  >(
    `INSERT INTO works (user_id, slug, title, type, status, synopsis, genre, tags, word_count, created_at, updated_at, published_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(user_id, slug) DO UPDATE SET
       title=excluded.title, type=excluded.type, status=excluded.status,
       synopsis=excluded.synopsis, genre=excluded.genre, tags=excluded.tags,
       word_count=excluded.word_count, updated_at=excluded.updated_at,
       published_at=excluded.published_at`,
  );

export function upsertWorkRow(userId: string, w: {
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
    userId,
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

export function deleteWorkRow(userId: string, slug: string) {
  getDb().prepare(`DELETE FROM works WHERE user_id = ? AND slug = ?`).run(userId, slug);
}

// Cascade rename of a work's slug across every table that references it.
// Wrapped in a transaction so we never end up with rows pointing at a
// directory that no longer exists.
export function renameWorkRow(userId: string, oldSlug: string, newSlug: string): void {
  if (oldSlug === newSlug) return;
  const db = getDb();
  const tx = db.transaction(() => {
    const w = db
      .prepare<unknown[], WorkRow>(`SELECT * FROM works WHERE user_id = ? AND slug = ?`)
      .get(userId, oldSlug);
    if (!w) return;
    db.prepare(`DELETE FROM works WHERE user_id = ? AND slug = ?`).run(userId, oldSlug);
    db.prepare<
      [string, string, string, string, string, string, string | null, string, number, string, string, string | null]
    >(
      `INSERT INTO works (user_id, slug, title, type, status, synopsis, genre, tags, word_count, created_at, updated_at, published_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      userId,
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

    db.prepare(`UPDATE chapters SET work_slug = ? WHERE user_id = ? AND work_slug = ?`)
      .run(newSlug, userId, oldSlug);
    db.prepare(`UPDATE conversations SET work_slug = ? WHERE user_id = ? AND work_slug = ?`)
      .run(newSlug, userId, oldSlug);
  });
  tx();
}

export function queryWorksByStatus(userId: string, status: string): WorkRow[] {
  return getDb()
    .prepare(`SELECT * FROM works WHERE user_id = ? AND status = ? ORDER BY updated_at DESC`)
    .all(userId, status) as WorkRow[];
}

/** Cross-user: list all published works (for public reader side). */
export function queryAllPublishedWorks(): Array<WorkRow & { handle: string | null }> {
  return getDb()
    .prepare<
      unknown[],
      WorkRow & { handle: string | null }
    >(
      `SELECT w.*, u.handle FROM works w
       LEFT JOIN users u ON u.id = w.user_id
       WHERE w.status = 'published'
       ORDER BY w.updated_at DESC`,
    )
    .all();
}

export function queryAllWorks(userId: string): WorkRow[] {
  return getDb()
    .prepare(`SELECT * FROM works WHERE user_id = ? ORDER BY updated_at DESC`)
    .all(userId) as WorkRow[];
}

export function queryWork(userId: string, slug: string): WorkRow | undefined {
  return getDb()
    .prepare(`SELECT * FROM works WHERE user_id = ? AND slug = ?`)
    .get(userId, slug) as WorkRow | undefined;
}

/** Look up a work by author handle + slug (public reader side). */
export function queryPublishedWorkByHandle(
  handle: string,
  slug: string,
): (WorkRow & { handle: string | null }) | undefined {
  return getDb()
    .prepare<
      unknown[],
      WorkRow & { handle: string | null }
    >(
      `SELECT w.*, u.handle FROM works w
       INNER JOIN users u ON u.id = w.user_id
       WHERE u.handle = ? AND w.slug = ? AND w.status = 'published'`,
    )
    .get(handle, slug) as (WorkRow & { handle: string | null }) | undefined;
}

// ─── Chapter queries ──────────────────────────────────────────────
const stmtUpsertChapter = () =>
  getDb().prepare<
    [string, string, string, number, string, number, string, string, string, string]
  >(
    `INSERT INTO chapters (user_id, work_slug, slug, chapter_order, title, word_count, status, audio_status, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(user_id, work_slug, slug) DO UPDATE SET
       chapter_order=excluded.chapter_order, title=excluded.title,
       word_count=excluded.word_count, status=excluded.status,
       audio_status=excluded.audio_status, updated_at=excluded.updated_at`,
  );

export function upsertChapterRow(userId: string, c: {
  workSlug: string;
  slug: string;
  order: number;
  title: string;
  wordCount: number;
  status: string;
  audioStatus: string;
  createdAt: string;
  updatedAt: string;
}) {
  stmtUpsertChapter().run(
    userId,
    c.workSlug,
    c.slug,
    c.order,
    c.title,
    c.wordCount,
    c.status,
    c.audioStatus,
    c.createdAt,
    c.updatedAt,
  );
}

export function deleteChapterRow(userId: string, workSlug: string, slug: string) {
  getDb()
    .prepare(`DELETE FROM chapters WHERE user_id = ? AND work_slug = ? AND slug = ?`)
    .run(userId, workSlug, slug);
}

export function renameChapterRow(
  userId: string,
  workSlug: string,
  oldSlug: string,
  newSlug: string,
): void {
  if (oldSlug === newSlug) return;
  const db = getDb();
  const tx = db.transaction(() => {
    const row = db
      .prepare<unknown[], ChapterRow>(
        `SELECT * FROM chapters WHERE user_id = ? AND work_slug = ? AND slug = ?`,
      )
      .get(userId, workSlug, oldSlug);
    if (!row) return;
    db.prepare(
      `DELETE FROM chapters WHERE user_id = ? AND work_slug = ? AND slug = ?`,
    ).run(userId, workSlug, oldSlug);
    stmtUpsertChapter().run(
      userId,
      workSlug,
      newSlug,
      row.chapter_order,
      row.title,
      row.word_count,
      row.status,
      row.audio_status,
      row.created_at,
      row.updated_at,
    );
  });
  tx();
}

export function queryChaptersByWork(userId: string, workSlug: string): ChapterRow[] {
  return getDb()
    .prepare(`SELECT * FROM chapters WHERE user_id = ? AND work_slug = ? ORDER BY chapter_order ASC`)
    .all(userId, workSlug) as ChapterRow[];
}

/** Public reader: chapters by author handle + work slug. */
export function queryChaptersByPublishedWork(
  handle: string,
  workSlug: string,
): ChapterRow[] {
  return getDb()
    .prepare<
      unknown[],
      ChapterRow
    >(
      `SELECT c.* FROM chapters c
       INNER JOIN users u ON u.id = c.user_id
       WHERE u.handle = ? AND c.work_slug = ?
       ORDER BY c.chapter_order ASC`,
    )
    .all(handle, workSlug) as ChapterRow[];
}

// ─── Conversation queries ─────────────────────────────────────────
export function upsertConversationRow(userId: string, c: {
  id: string;
  workSlug: string;
  title: string | null;
  messageCount: number;
  createdAt: string;
  updatedAt: string;
}) {
  getDb()
    .prepare<
      [string, string, string, string | null, number, string, string]
    >(
      `INSERT INTO conversations (id, user_id, work_slug, title, message_count, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         user_id=excluded.user_id,
         title=excluded.title, message_count=excluded.message_count, updated_at=excluded.updated_at`,
    )
    .run(c.id, userId, c.workSlug, c.title, c.messageCount, c.createdAt, c.updatedAt);
}

export function deleteConversationRow(userId: string, id: string) {
  getDb()
    .prepare(`DELETE FROM conversations WHERE user_id = ? AND id = ?`)
    .run(userId, id);
}

export function queryConversationsByWork(userId: string, workSlug: string): ConversationRow[] {
  return getDb()
    .prepare(`SELECT * FROM conversations WHERE user_id = ? AND work_slug = ? ORDER BY updated_at DESC`)
    .all(userId, workSlug) as ConversationRow[];
}

// ─── User queries ─────────────────────────────────────────────────
export interface UserRow {
  id: string;
  email: string;
  sub: string;
  handle: string | null;
  display_name: string | null;
  created_at: string;
  last_login_at: string | null;
}

export function queryUserBySub(sub: string): UserRow | undefined {
  return getDb()
    .prepare(`SELECT * FROM users WHERE sub = ?`)
    .get(sub) as UserRow | undefined;
}

export function queryUserById(id: string): UserRow | undefined {
  return getDb()
    .prepare(`SELECT * FROM users WHERE id = ?`)
    .get(id) as UserRow | undefined;
}

export function queryUserByHandle(handle: string): UserRow | undefined {
  return getDb()
    .prepare(`SELECT * FROM users WHERE handle = ?`)
    .get(handle) as UserRow | undefined;
}

export function isHandleTaken(handle: string, excludeUserId?: string): boolean {
  const row = getDb()
    .prepare(`SELECT 1 FROM users WHERE lower(handle) = lower(?) AND (? IS NULL OR id != ?) LIMIT 1`)
    .get(handle.toLowerCase(), excludeUserId ?? null, excludeUserId ?? "") as
    | { 1: number }
    | undefined;
  return row !== undefined;
}

export function insertUser(input: {
  id: string;
  email: string;
  sub: string;
  createdAt: string;
}): UserRow {
  getDb()
    .prepare(
      `INSERT INTO users (id, email, sub, created_at, last_login_at)
       VALUES (?, ?, ?, ?, ?)`,
    )
    .run(input.id, input.email, input.sub, input.createdAt, input.createdAt);
  return queryUserById(input.id)!;
}

export function touchUserLogin(id: string, lastLoginAt: string): void {
  getDb()
    .prepare(`UPDATE users SET last_login_at = ? WHERE id = ?`)
    .run(lastLoginAt, id);
}

export function setUserHandle(userId: string, handle: string): UserRow {
  getDb()
    .prepare(`UPDATE users SET handle = ? WHERE id = ? AND handle IS NULL`)
    .run(handle, userId);
  return queryUserById(userId)!;
}
