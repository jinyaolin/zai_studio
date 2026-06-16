// Chunk a chapter's markdown into embedding-friendly pieces.
// Strategy: strip markdown, split by blank line into paragraphs; if a paragraph
// is too long, split further by sentence terminators.

const MAX_CHARS = 400;
const MIN_CHARS = 80;

export function stripMarkdown(md: string): string {
  return md
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/\*\*|__|[*_`~]/g, "")
    .replace(/!\[[^\]]*\]\([^)]+\)/g, "")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/^\s*[-*+]\s+/gm, "")
    .replace(/^\s*>\s?/gm, "")
    .replace(/---+/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function splitLongParagraph(para: string): string[] {
  const sentences = para
    .split(/(?<=[。！？!?…])\s*/)
    .map((s) => s.trim())
    .filter(Boolean);
  const out: string[] = [];
  let current = "";
  for (const s of sentences) {
    if ((current + s).length > MAX_CHARS) {
      if (current) out.push(current);
      current = s;
    } else {
      current = current ? current + s : s;
    }
  }
  if (current) out.push(current);
  return out;
}

export interface ChapterChunk {
  index: number;
  text: string;
}

export function chunkForEmbedding(markdown: string): ChapterChunk[] {
  const plain = stripMarkdown(markdown);
  const paragraphs = plain
    .split(/\n{2,}/)
    .map((p) => p.replace(/\n/g, " ").trim())
    .filter(Boolean);

  const chunks: string[] = [];
  for (const p of paragraphs) {
    if (p.length > MAX_CHARS) {
      chunks.push(...splitLongParagraph(p));
    } else if (p.length >= MIN_CHARS) {
      chunks.push(p);
    } else if (chunks.length > 0) {
      // Too short — fold into the previous chunk.
      chunks[chunks.length - 1] += " " + p;
    } else {
      chunks.push(p);
    }
  }

  return chunks.map((text, index) => ({ index, text }));
}
