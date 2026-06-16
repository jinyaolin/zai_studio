import Link from "next/link";
import { listWorks } from "@/lib/content/works";
import { formatDate, formatWordCount } from "@/lib/utils";
import { queryChaptersByWork } from "@/lib/content/db";

export const dynamic = "force-dynamic";

const TYPE_LABEL = { long: "長篇", medium: "中篇", short: "短篇" } as const;
const STATUS_LABEL = {
  draft: { text: "草稿", cls: "bg-stone-200 text-stone-700" },
  published: { text: "已發表", cls: "bg-emerald-100 text-emerald-800" },
  archived: { text: "已封存", cls: "bg-stone-300 text-stone-600" },
} as const;

export default async function StudioHomePage() {
  const works = await listWorks();

  return (
    <div className="max-w-4xl mx-auto px-8 py-10">
      <header className="flex items-end justify-between mb-8">
        <div>
          <h1 className="font-serif text-3xl">作品</h1>
          <p className="text-stone-500 text-sm mt-1">
            {works.length > 0 ? `${works.length} 部作品` : "還沒有作品。先開始一個吧。"}
          </p>
        </div>
        <Link
          href="/studio/works/new"
          className="px-4 py-2 bg-stone-900 text-stone-50 rounded-md text-sm hover:bg-stone-800"
        >
          ＋ 新作品
        </Link>
      </header>

      {works.length === 0 ? (
        <div className="border border-dashed border-stone-300 rounded-lg p-12 text-center">
          <p className="text-stone-500 mb-4">點右上角建立你的第一個作品。</p>
          <p className="text-xs text-stone-400">
            每個作品都有自己的：章節 / 記憶 / 對話。檔案儲存在 <code>content/works/&lt;slug&gt;/</code>。
          </p>
        </div>
      ) : (
        <ul className="space-y-2">
          {works.map((w) => {
            const chapterCount = queryChaptersByWork(w.slug).length;
            const status = STATUS_LABEL[w.status];
            return (
              <li key={w.slug}>
                <Link
                  href={`/studio/works/${encodeURIComponent(w.slug)}`}
                  className="block p-4 bg-white border border-stone-200 rounded-md hover:border-stone-400 transition"
                >
                  <div className="flex items-baseline justify-between gap-4">
                    <h2 className="font-serif text-xl text-stone-900">{w.title}</h2>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-xs text-stone-500">{TYPE_LABEL[w.type]}</span>
                      <span className={`text-xs px-2 py-0.5 rounded ${status.cls}`}>
                        {status.text}
                      </span>
                    </div>
                  </div>
                  {w.synopsis && (
                    <p className="text-stone-600 text-sm mt-1 line-clamp-2">{w.synopsis}</p>
                  )}
                  <div className="text-xs text-stone-400 mt-2 flex gap-4">
                    <span>{chapterCount} 章</span>
                    <span>更新於 {formatDate(w.updatedAt)}</span>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
