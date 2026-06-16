import Link from "next/link";
import { notFound } from "next/navigation";
import { readWork } from "@/lib/content/works";
import { listChapters, readChapter } from "@/lib/content/chapters";
import { isTTSConfigured } from "@/lib/tts/provider";
import { chunkForReader } from "@/lib/tts/chunker";
import { normalizeNarration, narrationVoiceString } from "@/lib/tts/narration-server";
import { marked } from "marked";
import { decodeParam } from "@/lib/utils/params";
import ReaderChapter from "./ReaderChapter";

export const dynamic = "force-dynamic";

export default async function ReaderChapterPage({
  params,
}: {
  params: { slug: string; chapter: string };
}) {
  const slug = decodeParam(params.slug);
  const chapterSlug = decodeParam(params.chapter);
  let work;
  try {
    work = await readWork(slug);
  } catch {
    notFound();
  }
  if (work.status !== "published") notFound();

  let chapter;
  try {
    chapter = await readChapter(slug, chapterSlug);
  } catch {
    notFound();
  }

  const chapters = await listChapters(work.slug);
  const index = chapters.findIndex((c) => c.slug === chapterSlug);
  const prev = index > 0 ? chapters[index - 1] : null;
  const next = index < chapters.length - 1 ? chapters[index + 1] : null;
  const encoded = encodeURIComponent(work.slug);

  // Split chapter into per-paragraph chunks for display + TTS.
  const rawChunks = chunkForReader(chapter.content);

  // Group by paragraphIndex: each paragraph has 1+ TTS chunks but one HTML display.
  const paragraphs: Array<{ html: string; chunkIndices: number[] }> = [];
  for (const chunk of rawChunks) {
    const existing = paragraphs[chunk.paragraphIndex];
    if (existing) {
      existing.chunkIndices.push(chunk.index);
    } else {
      paragraphs[chunk.paragraphIndex] = {
        html: marked.parse(chunk.markdown, { async: false }) as string,
        chunkIndices: [chunk.index],
      };
    }
  }
  // Filter out holes (empty paragraphs) and compact.
  const displayParagraphs = paragraphs.filter(Boolean);
  const totalChunks = rawChunks.length;

  return (
    <main className="max-w-3xl mx-auto px-6 py-12">
      <div className="mb-6 text-sm">
        <Link href={`/works/${encoded}`} className="text-stone-500 hover:text-stone-700">
          ← {work.title}
        </Link>
      </div>

      <article>
        <header className="mb-8">
          <p className="text-xs text-stone-400 mb-2">
            {work.title} · 第 {chapter.order} 章
          </p>
          <h1 className="font-serif text-4xl">{chapter.title}</h1>
        </header>

        <ReaderChapter
          workSlug={work.slug}
          chapterSlug={chapter.slug}
          paragraphs={displayParagraphs}
          totalChunks={totalChunks}
          ttsReady={isTTSConfigured()}
          voice={narrationVoiceString(normalizeNarration(work.narration))}
        />
      </article>

      <nav className="mt-12 pt-6 border-t border-stone-200 flex justify-between text-sm">
        {prev ? (
          <Link
            href={`/works/${encoded}/${encodeURIComponent(prev.slug)}`}
            className="text-stone-600 hover:text-stone-900"
          >
            ← {prev.title}
          </Link>
        ) : (
          <span className="text-stone-300">最前一章</span>
        )}
        {next ? (
          <Link
            href={`/works/${encoded}/${encodeURIComponent(next.slug)}`}
            className="text-stone-600 hover:text-stone-900"
          >
            {next.title} →
          </Link>
        ) : (
          <span className="text-stone-300">最後一章</span>
        )}
      </nav>
    </main>
  );
}
