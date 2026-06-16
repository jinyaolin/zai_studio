import Link from "next/link";
import { notFound } from "next/navigation";
import { listChapters, readChapter } from "@/lib/content/chapters";
import { chunkForReader } from "@/lib/tts/chunker";
import { marked } from "marked";
import { decodeParam } from "@/lib/utils/params";
import {
  queryChaptersByPublishedWork,
  queryPublishedWorkByHandle,
  queryUserByHandle,
} from "@/lib/content/db";
import ReaderChapter from "./ReaderChapter";

export const dynamic = "force-dynamic";

// Public reader: one chapter. Scoped by handle + work slug + chapter slug.
// No login required.
//
// TTS is disabled for anonymous readers — the TTS API requires auth (we
// don't want anonymous users consuming server TTS compute). Could be added
// later via a separate rate-limited public TTS endpoint.
export default async function ReaderChapterPage({
  params,
}: {
  params: { handle: string; slug: string; chapter: string };
}) {
  const handle = decodeParam(params.handle);
  const slug = decodeParam(params.slug);
  const chapterSlug = decodeParam(params.chapter);

  const row = queryPublishedWorkByHandle(handle, slug);
  if (!row) notFound();

  const user = queryUserByHandle(handle);
  if (!user) notFound();

  let chapter;
  try {
    chapter = await readChapter(user.id, slug, chapterSlug);
  } catch {
    notFound();
  }

  const chapters = await listChapters(user.id, slug);
  const index = chapters.findIndex((c) => c.slug === chapterSlug);
  const prev = index > 0 ? chapters[index - 1] : null;
  const next = index < chapters.length - 1 ? chapters[index + 1] : null;
  const encodedHandle = encodeURIComponent(handle);
  const encodedSlug = encodeURIComponent(slug);

  const rawChunks = chunkForReader(chapter.content);
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
  const displayParagraphs = paragraphs.filter(Boolean);
  const totalChunks = rawChunks.length;

  return (
    <main className="max-w-3xl mx-auto px-6 py-12">
      <div className="mb-6 text-sm">
        <Link
          href={`/works/${encodedHandle}/${encodedSlug}`}
          className="text-stone-500 hover:text-stone-700"
        >
          ← {row.title}
        </Link>
      </div>

      <article>
        <header className="mb-8">
          <p className="text-xs text-stone-400 mb-2">
            {row.title} · 第 {chapter.order} 章
          </p>
          <h1 className="font-serif text-4xl">{chapter.title}</h1>
        </header>

        <ReaderChapter
          workSlug={slug}
          chapterSlug={chapter.slug}
          paragraphs={displayParagraphs}
          totalChunks={totalChunks}
          ttsReady={false}
          voice=""
        />
      </article>

      <nav className="mt-12 pt-6 border-t border-stone-200 flex justify-between text-sm">
        {prev ? (
          <Link
            href={`/works/${encodedHandle}/${encodedSlug}/${encodeURIComponent(prev.slug)}`}
            className="text-stone-600 hover:text-stone-900"
          >
            ← {prev.title}
          </Link>
        ) : (
          <span className="text-stone-300">最前一章</span>
        )}
        {next ? (
          <Link
            href={`/works/${encodedHandle}/${encodedSlug}/${encodeURIComponent(next.slug)}`}
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

void queryChaptersByPublishedWork;
