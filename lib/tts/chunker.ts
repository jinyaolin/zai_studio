// Chunk a chapter for the reader: each paragraph becomes one chunk with
// BOTH the original markdown (for display) and stripped text (for TTS).
// Long paragraphs (> 800 chars) are sub-split for TTS; the display still
// shows the full paragraph — the UI just plays its sub-chunks sequentially.

const MAX_CHARS = 800;

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

export interface ReaderChunk {
  /** Unique index for cache keying (0, 1, 2, ...). */
  index: number;
  /** Original markdown — rendered to HTML for display. */
  markdown: string;
  /** Stripped plain text — sent to TTS. */
  ttsText: string;
  /** Which paragraph this chunk belongs to (for display grouping). */
  paragraphIndex: number;
}

// Legacy: plain string[] output (used by the TTS prefetch endpoint).
export function chunkChapter(markdown: string): string[] {
  return chunkForReader(markdown).map((c) => c.ttsText);
}

// Primary: structured chunks with both display + TTS text.
export function chunkForReader(markdown: string): ReaderChunk[] {
  const paragraphs = markdown
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);

  const chunks: ReaderChunk[] = [];
  let idx = 0;
  let paraIdx = 0;

  for (const para of paragraphs) {
    const ttsText = stripMarkdown(para);
    if (!ttsText) continue;

    if (ttsText.length <= MAX_CHARS) {
      chunks.push({ index: idx++, markdown: para, ttsText, paragraphIndex: paraIdx });
    } else {
      const sentences = splitLongParagraph(ttsText);
      sentences.forEach((s) => {
        chunks.push({ index: idx++, markdown: para, ttsText: s, paragraphIndex: paraIdx });
      });
    }
    paraIdx++;
  }
  return chunks;
}

function splitLongParagraph(text: string): string[] {
  const sentences = text
    .split(/(?<=[。！？!?…])\s*/)
    .map((s) => s.trim())
    .filter(Boolean);
  const result: string[] = [];
  let current = "";
  for (const s of sentences) {
    if ((current + s).length > MAX_CHARS) {
      if (current) result.push(current);
      current = s;
    } else {
      current = current ? current + s : s;
    }
  }
  if (current) result.push(current);
  return result.length > 0 ? result : [text];
}

