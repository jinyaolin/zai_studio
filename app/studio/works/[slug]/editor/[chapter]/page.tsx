import Link from "next/link";
import { notFound } from "next/navigation";
import { listChapters, readChapter } from "@/lib/content/chapters";
import { readWork } from "@/lib/content/works";
import { normalizeNarration, narrationVoiceString } from "@/lib/tts/narration-server";
import { decodeParam } from "@/lib/utils/params";
import ChapterEditor from "./ChapterEditor";

export const dynamic = "force-dynamic";

export default async function ChapterEditorPage({
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

  let chapter;
  try {
    chapter = await readChapter(slug, chapterSlug);
  } catch {
    notFound();
  }

  const chapters = await listChapters(slug);
  const index = chapters.findIndex((c) => c.slug === chapterSlug);
  const prev = index > 0 ? chapters[index - 1] : null;
  const next = index < chapters.length - 1 ? chapters[index + 1] : null;
  const encoded = encodeURIComponent(slug);
  const voice = narrationVoiceString(normalizeNarration(work.narration));

  return (
    <div className="max-w-4xl mx-auto px-8 py-10">
      <div className="flex items-center justify-between mb-6">
        <Link
          href={`/studio/works/${encoded}`}
          className="text-sm text-stone-500 hover:text-stone-700"
        >
          ← 回作品
        </Link>
        <nav className="flex gap-3 text-sm">
          {prev ? (
            <Link
              href={`/studio/works/${encoded}/editor/${encodeURIComponent(prev.slug)}`}
              className="text-stone-500 hover:text-stone-700"
            >
              ← {prev.title}
            </Link>
          ) : (
            <span className="text-stone-300">← 最前</span>
          )}
          {next ? (
            <Link
              href={`/studio/works/${encoded}/editor/${encodeURIComponent(next.slug)}`}
              className="text-stone-500 hover:text-stone-700"
            >
              {next.title} →
            </Link>
          ) : (
            <span className="text-stone-300">最後 →</span>
          )}
        </nav>
      </div>

      <ChapterEditor workSlug={slug} initialChapter={chapter} voice={voice} />
    </div>
  );
}
