import { sql } from "drizzle-orm";
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

// ─── works ────────────────────────────────────────────────────────
export const works = sqliteTable("works", {
  slug: text("slug").primaryKey(),
  title: text("title").notNull(),
  type: text("type").notNull(), // long | medium | short
  status: text("status").notNull(), // draft | published | archived
  synopsis: text("synopsis").default(""),
  genre: text("genre"),
  tags: text("tags", { mode: "json" }).$type<string[]>().default([]),
  wordCount: integer("word_count").default(0),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
  publishedAt: text("published_at"),
});

// ─── chapters ─────────────────────────────────────────────────────
export const chapters = sqliteTable("chapters", {
  slug: text("slug").notNull(),
  workSlug: text("work_slug")
    .notNull()
    .references(() => works.slug, { onDelete: "cascade" }),
  chapterOrder: integer("chapter_order").notNull(),
  title: text("title").notNull(),
  wordCount: integer("word_count").default(0),
  status: text("status").default("draft"),
  audioStatus: text("audio_status").default("none"), // none | partial | complete
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

// ─── conversations ────────────────────────────────────────────────
export const conversations = sqliteTable("conversations", {
  id: text("id").primaryKey(),
  workSlug: text("work_slug")
    .notNull()
    .references(() => works.slug, { onDelete: "cascade" }),
  title: text("title"),
  messageCount: integer("message_count").default(0),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

// ─── Full-text search over chapter content ────────────────────────
// FTS5 virtual table; kept in sync with chapter file bodies.
export const chaptersFts = sqliteTable("chapters_fts", {
  workSlug: text("work_slug"),
  chapterSlug: text("chapter_slug"),
  title: text("title"),
  content: text("content"),
});
