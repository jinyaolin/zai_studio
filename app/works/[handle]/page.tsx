import Link from "next/link";
import { notFound } from "next/navigation";
import {
  queryAllPublishedWorks,
  queryUserByHandle,
} from "@/lib/content/db";
import { formatDate } from "@/lib/utils";
import { decodeParam } from "@/lib/utils/params";

export const dynamic = "force-dynamic";

const TYPE_LABEL = { long: "長篇", medium: "中篇", short: "短篇" } as const;

// Public reader: one author's published works, listed by handle.
export default function AuthorWorksPage({
  params,
}: {
  params: { handle: string };
}) {
  const handle = decodeParam(params.handle);
  const user = queryUserByHandle(handle);
  if (!user) notFound();

  const all = queryAllPublishedWorks();
  const works = all.filter((w) => w.handle === handle);
  const encodedHandle = encodeURIComponent(handle);

  return (
    <main className="max-w-4xl mx-auto px-6 py-12">
      <div className="mb-6 text-sm">
        <Link href="/works" className="text-stone-500 hover:text-stone-700">← 全部作品</Link>
      </div>

      <header className="mb-8">
        <h1 className="font-serif text-4xl">@{handle}</h1>
        <p className="text-stone-500 text-sm mt-1">
          {works.length > 0 ? `${works.length} 部公開作品` : "這位作者還沒有公開作品"}
        </p>
      </header>

      {works.length === 0 ? (
        <div className="border border-dashed border-stone-300 rounded-lg p-12 text-center">
          <p className="text-stone-500">沒有作品。</p>
        </div>
      ) : (
        <ul className="space-y-3">
          {works.map((w) => (
            <li key={w.slug}>
              <Link
                href={`/works/${encodedHandle}/${encodeURIComponent(w.slug)}`}
                className="block p-4 bg-white border border-stone-200 rounded-md hover:border-stone-400 transition"
              >
                <div className="flex items-baseline justify-between gap-4">
                  <h2 className="font-serif text-xl text-stone-900">{w.title}</h2>
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
          ))}
        </ul>
      )}
    </main>
  );
}
