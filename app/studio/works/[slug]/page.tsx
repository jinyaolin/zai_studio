import Link from "next/link";
import { notFound } from "next/navigation";
import { listChapters } from "@/lib/content/chapters";
import { readWork } from "@/lib/content/works";
import { formatDate, formatWordCount } from "@/lib/utils";
import { decodeParam } from "@/lib/utils/params";
import ChapterListClient from "./ChapterListClient";
import NarrationSettings from "./NarrationSettings";
import StatusToggle from "./StatusToggle";
import WorkTitleEditor from "./WorkTitleEditor";

export const dynamic = "force-dynamic";

const TYPE_LABEL = { long: "長篇", medium: "中篇", short: "短篇" } as const;

export default async function WorkOverviewPage({
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
  const chapters = await listChapters(slug);
  const totalWords = chapters.reduce((sum, c) => sum + c.wordCount, 0);

  return (
    <div className="max-w-4xl mx-auto px-8 py-10">
      <div className="mb-6">
        <Link
          href="/studio"
          className="text-sm text-stone-500 hover:text-stone-700"
        >
          ← 作品列表
        </Link>
      </div>

      <header className="mb-8">
        <div className="flex items-baseline gap-3 mb-1">
          <WorkTitleEditor workSlug={work.slug} initialTitle={work.title} />
          <span className="text-sm text-stone-500 shrink-0">{TYPE_LABEL[work.type]}</span>
        </div>
        {work.synopsis && (
          <p className="text-stone-600 mt-2 leading-relaxed">{work.synopsis}</p>
        )}
        <div className="flex flex-wrap items-center gap-4 mt-4 text-sm text-stone-500">
          <span>{chapters.length} 章</span>
          <span>共 {formatWordCount(totalWords)}</span>
          <span>建立於 {formatDate(work.createdAt)}</span>
          <span>更新於 {formatDate(work.updatedAt)}</span>
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
        <div className="mt-4">
          <StatusToggle slug={work.slug} status={work.status} />
        </div>
      </header>

      <nav className="grid grid-cols-4 gap-3 mb-8">
        <Link
          href={`/studio/works/${encodeURIComponent(work.slug)}/memory`}
          className="px-4 py-3 border border-stone-300 rounded-md hover:border-stone-500 hover:bg-stone-100"
        >
          <div className="font-serif text-lg">記憶</div>
          <div className="text-xs text-stone-500 mt-0.5">角色、世界觀、情節、風格</div>
        </Link>
        <Link
          href={`/studio/works/${encodeURIComponent(work.slug)}/chat`}
          className="px-4 py-3 border border-stone-300 rounded-md hover:border-stone-500 hover:bg-stone-100"
        >
          <div className="font-serif text-lg">對話</div>
          <div className="text-xs text-stone-500 mt-0.5">與 zai 討論、續寫、找矛盾</div>
        </Link>
        <Link
          href={`/studio/works/${encodeURIComponent(work.slug)}/design/new`}
          className="px-4 py-3 border border-amber-300 bg-amber-50 rounded-md hover:border-amber-700"
        >
          <div className="font-serif text-lg">✨ 深度創作</div>
          <div className="text-xs text-stone-500 mt-0.5">Design Thinking 寫新章</div>
        </Link>
        <Link
          href={`/works/${encodeURIComponent(work.slug)}`}
          className="px-4 py-3 border border-stone-300 rounded-md hover:border-stone-500 hover:bg-stone-100"
        >
          <div className="font-serif text-lg">預覽 ↗</div>
          <div className="text-xs text-stone-500 mt-0.5">以讀者身份看見</div>
        </Link>
      </nav>

      <section>
        <div className="flex items-baseline justify-between mb-3">
          <h2 className="font-serif text-2xl">章節</h2>
        </div>
        <ChapterListClient workSlug={work.slug} initialChapters={chapters} />
      </section>

      <NarrationSettings workSlug={work.slug} initial={work.narration} />
    </div>
  );
}
