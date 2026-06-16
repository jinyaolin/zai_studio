import matter from "gray-matter";
import type { Chapter, ChapterStatus } from "@/lib/types";

export interface ChapterFrontmatter {
  order: number;
  title: string;
  status: ChapterStatus;
  wordCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface ParsedChapterFile {
  frontmatter: ChapterFrontmatter;
  body: string;
}

export function parseChapterFile(raw: string): ParsedChapterFile {
  const { data, content } = matter(raw);
  return {
    frontmatter: data as ChapterFrontmatter,
    body: content.trim(),
  };
}

export function serializeChapter(chapter: Chapter): string {
  const frontmatter: ChapterFrontmatter = {
    order: chapter.order,
    title: chapter.title,
    status: chapter.status,
    wordCount: chapter.wordCount,
    createdAt: chapter.createdAt,
    updatedAt: chapter.updatedAt,
  };
  const fm = Object.entries(frontmatter)
    .map(([k, v]) => `${k}: ${JSON.stringify(v)}`)
    .join("\n");
  return `---\n${fm}\n---\n\n${chapter.content.trim()}\n`;
}

export function countWords(text: string): number {
  // CJK characters + latin words. Rough but good enough for progress tracking.
  const cjk = (text.match(/[一-鿿぀-ヿ가-힯]/g) ?? []).length;
  const latin = (text.match(/[a-zA-Z][a-zA-Z']*/g) ?? []).length;
  return cjk + latin;
}

export function slugifyChapter(order: number, title: string): string {
  const padded = String(order).padStart(2, "0");
  const slug = title
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  return slug ? `${padded}-${slug}` : padded;
}

export function slugifyWork(title: string): string {
  return (
    title
      .toLowerCase()
      .replace(/[^\p{L}\p{N}]+/gu, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || `work-${Date.now()}`
  );
}
