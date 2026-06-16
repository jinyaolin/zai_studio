import Link from "next/link";
import { notFound } from "next/navigation";
import { readWork } from "@/lib/content/works";
import { listChapters } from "@/lib/content/chapters";
import { formatDate, formatWordCount } from "@/lib/utils";
import { decodeParam } from "@/lib/utils/params";

export const dynamic = "force-dynamic";

const TYPE_LABEL = { long: "長篇", medium: "中篇", short: "短篇" } as const;

export default async function ReaderWorkTocPage({
  params,
}: {
  params: { slug: string };
}) {
  const slug = decodeParam(params.slug);
  let work;
  try {
    work = await readWork(slug);
  } catch {
    notFound();
  }
  if (work.status !== "published") {
    notFound();
  }
  const chapters = await listChapters(work.slug);
  const totalWords = chapters.reduce((sum, c) => sum + c.wordCount, 0);
  const encoded = encodeURIComponent(work.slug);

  return (
    <main className="max-w-3xl mx-auto px-6 py-12">
      <div className="mb-6 text-sm">
        <Link href="/works" className="text-stone-500 hover:text-stone-700">← 作品列表</Link>
      </div>

      <header className="mb-10">
        <div className="flex items-baseline gap-3">
          <h1 className="font-serif text-5xl">{work.title}</h1>
          <span className="text-sm text-stone-500">{TYPE_LABEL[work.type]}</span>
        </div>
        {work.synopsis && (
          <p className="text-stone-700 mt-4 leading-loose text-lg">{work.synopsis}</p>
        )}
        <div className="flex flex-wrap gap-4 mt-4 text-sm text-stone-500">
          <span>{chapters.length} 章</span>
          <span>共 {formatWordCount(totalWords)}</span>
          {work.genre && <span>{work.genre}</span>}
          <span>發表於 {formatDate(work.publishedAt)}</span>
        </div>
        {work.tags.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-3">
            {work.tags.map((t) => (
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
                  href={`/works/${encoded}/${encodeURIComponent(c.slug)}`}
                  className="flex items-baseline gap-4 px-3 py-2.5 rounded hover:bg-stone-100 group"
                >
                  <span className="text-xs text-stone-400 tabular-nums w-8">
                    {String(c.order).padStart(2, "0")}
                  </span>
                  <span className="font-serif text-lg text-stone-900 flex-1">{c.title}</span>
                  <span className="text-xs text-stone-400">{formatWordCount(c.wordCount)}</span>
                </Link>
              </li>
            ))}
          </ol>
          {chapters.length > 0 && (
            <div className="mt-6">
              <Link
                href={`/works/${encoded}/${encodeURIComponent(chapters[0].slug)}`}
                className="inline-block px-5 py-2 bg-stone-900 text-stone-50 rounded-md text-sm hover:bg-stone-800"
              >
                從第一章開始 →
              </Link>
            </div>
          )}
        </section>
      )}
    </main>
  );
}
