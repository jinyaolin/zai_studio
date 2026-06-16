import Link from "next/link";
import { notFound } from "next/navigation";
import {
  queryChaptersByPublishedWork,
  queryPublishedWorkByHandle,
} from "@/lib/content/db";
import { formatDate, formatWordCount } from "@/lib/utils";
import { decodeParam } from "@/lib/utils/params";
import { readChapter } from "@/lib/content/chapters";

export const dynamic = "force-dynamic";

const TYPE_LABEL = { long: "長篇", medium: "中篇", short: "短篇" } as const;

// Public reader: work table of contents, scoped by author handle + work slug.
// Anyone (no login) can read published works.
export default async function ReaderWorkTocPage({
  params,
}: {
  params: { handle: string; slug: string };
}) {
  const handle = decodeParam(params.handle);
  const slug = decodeParam(params.slug);

  const row = queryPublishedWorkByHandle(handle, slug);
  if (!row) notFound();

  const chapters = queryChaptersByPublishedWork(handle, slug);
  // Need full chapter content (for wordCount etc) — but list query gives us
  // enough; word_count is in the row.
  const totalWords = chapters.reduce((sum, c) => sum + c.word_count, 0);
  const encodedHandle = encodeURIComponent(handle);
  const encodedSlug = encodeURIComponent(slug);

  return (
    <main className="max-w-3xl mx-auto px-6 py-12">
      <div className="mb-6 text-sm">
        <Link href={`/works/${encodedHandle}`} className="text-stone-500 hover:text-stone-700">
          ← @{handle}
        </Link>
      </div>

      <header className="mb-10">
        <div className="flex items-baseline gap-3">
          <h1 className="font-serif text-5xl">{row.title}</h1>
          <span className="text-sm text-stone-500">{TYPE_LABEL[row.type as keyof typeof TYPE_LABEL]}</span>
        </div>
        {row.synopsis && (
          <p className="text-stone-700 mt-4 leading-loose text-lg">{row.synopsis}</p>
        )}
        <div className="flex flex-wrap gap-4 mt-4 text-sm text-stone-500">
          <span>{chapters.length} 章</span>
          <span>共 {formatWordCount(totalWords)}</span>
          {row.genre && <span>{row.genre}</span>}
          {row.published_at && <span>發表於 {formatDate(row.published_at)}</span>}
        </div>
        {row.tags && row.tags !== "[]" && (
          <div className="flex flex-wrap gap-1 mt-3">
            {(JSON.parse(row.tags) as string[]).map((t) => (
              <span key={t} className="text-xs px-2 py-0.5 bg-stone-200 text-stone-700 rounded">
                {t}
              </span>
            ))}
          </div>
        )}
      </header>

      {chapters.length > 0 && (
        <section>
          <h2 className="font-serif text-xl text-stone-700 mb-3">目錄</h2>
          <ol className="space-y-1">
            {chapters.map((c) => (
              <li key={c.slug}>
                <Link
                  href={`/works/${encodedHandle}/${encodedSlug}/${encodeURIComponent(c.slug)}`}
                  className="flex items-baseline gap-4 px-3 py-2.5 rounded hover:bg-stone-100 group"
                >
                  <span className="text-xs text-stone-400 tabular-nums w-8">
                    {String(c.chapter_order).padStart(2, "0")}
                  </span>
                  <span className="font-serif text-lg text-stone-900 flex-1">{c.title}</span>
                  <span className="text-xs text-stone-400">{formatWordCount(c.word_count)}</span>
                </Link>
              </li>
            ))}
          </ol>
          <div className="mt-6">
            <Link
              href={`/works/${encodedHandle}/${encodedSlug}/${encodeURIComponent(chapters[0].slug)}`}
              className="inline-block px-5 py-2 bg-stone-900 text-stone-50 rounded-md text-sm hover:bg-stone-800"
            >
              從第一章開始 →
            </Link>
          </div>
        </section>
      )}
    </main>
  );
}

// readChapter import retained for future "first chapter preview" expansion.
void readChapter;
