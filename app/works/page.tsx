import Link from "next/link";
import { queryWorksByStatus, queryChaptersByWork } from "@/lib/content/db";
import { formatDate, formatWordCount } from "@/lib/utils";

export const dynamic = "force-dynamic";

const TYPE_LABEL = { long: "長篇", medium: "中篇", short: "短篇" } as const;

export default function ReaderWorksPage() {
  const works = queryWorksByStatus("published");
  return (
    <main className="max-w-3xl mx-auto px-6 py-12">
      <header className="mb-8">
        <h1 className="font-serif text-4xl">作品</h1>
        <p className="text-stone-500 mt-1">所有已發表的作品。</p>
      </header>

      {works.length === 0 ? (
        <p className="text-stone-500">目前沒有已發表的作品。</p>
      ) : (
        <ul className="space-y-4">
          {works.map((w) => {
            const chapterCount = queryChaptersByWork(w.slug).length;
            return (
              <li key={w.slug}>
                <Link
                  href={`/works/${encodeURIComponent(w.slug)}`}
                  className="block p-5 bg-white border border-stone-200 rounded-md hover:border-stone-400 transition"
                >
                  <div className="flex items-baseline justify-between gap-4">
                    <h2 className="font-serif text-2xl">{w.title}</h2>
                    <span className="text-xs text-stone-500">{TYPE_LABEL[w.type as keyof typeof TYPE_LABEL]}</span>
                  </div>
                  {w.synopsis && (
                    <p className="text-stone-600 mt-2 leading-relaxed line-clamp-3">{w.synopsis}</p>
                  )}
                  <div className="text-xs text-stone-400 mt-3 flex gap-4">
                    <span>{chapterCount} 章</span>
                    <span>{formatWordCount(w.word_count)}</span>
                    <span>{formatDate(w.published_at)}</span>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}

      <div className="mt-12 pt-6 border-t border-stone-200 text-sm text-stone-500">
        <Link href="/" className="hover:text-stone-700">← 回首頁</Link>
      </div>
    </main>
  );
}
