import Link from "next/link";
import { queryAllPublishedWorks } from "@/lib/content/db";
import { formatDate } from "@/lib/utils";

export const dynamic = "force-dynamic";

const TYPE_LABEL = { long: "長篇", medium: "中篇", short: "短篇" } as const;

// Public reader landing: lists all published works across ALL authors.
// Anonymous-accessible (no login).
export default function WorksIndexPage() {
  const works = queryAllPublishedWorks();

  return (
    <main className="max-w-4xl mx-auto px-6 py-12">
      <header className="mb-8">
        <h1 className="font-serif text-4xl">作品</h1>
        <p className="text-stone-500 text-sm mt-1">
          {works.length > 0 ? `${works.length} 部公開作品` : "目前沒有公開作品"}
        </p>
      </header>

      {works.length === 0 ? (
        <div className="border border-dashed border-stone-300 rounded-lg p-12 text-center">
          <p className="text-stone-500">還沒有作品發表。</p>
        </div>
      ) : (
        <ul className="space-y-3">
          {works.map((w) => {
            const handle = w.handle ?? "unknown";
            return (
              <li key={`${handle}-${w.slug}`}>
                <Link
                  href={`/works/${encodeURIComponent(handle)}/${encodeURIComponent(w.slug)}`}
                  className="block p-4 bg-white border border-stone-200 rounded-md hover:border-stone-400 transition"
                >
                  <div className="flex items-baseline justify-between gap-4">
                    <div>
                      <h2 className="font-serif text-xl text-stone-900">{w.title}</h2>
                      <p className="text-xs text-stone-500 mt-0.5">@{handle}</p>
                    </div>
                    <span className="text-xs text-stone-500 shrink-0">
                      {TYPE_LABEL[w.type as keyof typeof TYPE_LABEL]}
                    </span>
                  </div>
                  {w.synopsis && (
                    <p className="text-stone-600 text-sm mt-1 line-clamp-2">{w.synopsis}</p>
                  )}
                  {w.published_at && (
                    <div className="text-xs text-stone-400 mt-2">
                      發表於 {formatDate(w.published_at)}
                    </div>
                  )}
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
