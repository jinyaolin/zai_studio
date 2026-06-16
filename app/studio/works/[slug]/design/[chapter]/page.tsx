import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { listChapters, readChapter } from "@/lib/content/chapters";
import { readWork } from "@/lib/content/works";
import { findOpenSessionForChapter, readSession, writeSession } from "@/lib/design/session";
import { decodeParam } from "@/lib/utils/params";
import { getCurrentUserId } from "@/lib/auth/session";
import DesignWizard from "./DesignWizard";

export const dynamic = "force-dynamic";

export default async function DesignPage({
  params,
  searchParams,
}: {
  params: { slug: string; chapter: string };
  searchParams: { session?: string; fresh?: string };
}) {
  const userId = await getCurrentUserId();
  if (!userId) redirect("/studio/login");

  const slug = decodeParam(params.slug);
  const chapterParam = decodeParam(params.chapter);

  let work;
  try {
    work = await readWork(userId, slug);
  } catch {
    notFound();
  }

  const isNew = chapterParam === "new";
  let chapter = null;
  if (!isNew) {
    try {
      chapter = await readChapter(userId, slug, chapterParam);
    } catch {
      notFound();
    }
  }

  const chapters = await listChapters(userId, slug);
  const encoded = encodeURIComponent(slug);

  // Auto-resume: if there's an open (non-committed) session for this chapter,
  // load it. The author can click "重新設計思考" inside the wizard to clear it.
  // For "new" chapters we don't auto-resume — each visit is a fresh intent.
  // `?fresh=1` forces a blank start even for an existing chapter.
  let resumeSession = null;
  if (chapter && !searchParams.fresh) {
    if (searchParams.session) {
      try {
        const s = await readSession(userId, slug, searchParams.session);
        if (!s.committed && s.chapterSlug === chapter.slug) resumeSession = s;
      } catch {
        // invalid session id — ignore
      }
    } else {
      resumeSession = await findOpenSessionForChapter(userId, slug, chapter.slug);
    }
  }

  // Stale check: if a session says autoStatus="running" but it started more
  // than 10 minutes ago, the server probably restarted mid-run. Mark it
  // failed so the UI doesn't show "執行中" forever.
  if (
    resumeSession &&
    resumeSession.autoStatus === "running" &&
    resumeSession.autoStartedAt &&
    Date.now() - new Date(resumeSession.autoStartedAt).getTime() > 10 * 60 * 1000
  ) {
    resumeSession.autoStatus = "failed";
    resumeSession.autoError = "背景執行超時（超過 10 分鐘沒有進度）。可能 server 重啟了。";
    resumeSession.autoFinishedAt = new Date().toISOString();
    await writeSession(userId, resumeSession);
  }

  return (
    <div className="max-w-5xl mx-auto px-8 py-10">
      <div className="mb-6 flex items-center justify-between">
        <Link
          href={chapter ? `/studio/works/${encoded}/editor/${encodeURIComponent(chapter.slug)}` : `/studio/works/${encoded}`}
          className="text-sm text-stone-500 hover:text-stone-700"
        >
          ← {chapter ? "回編輯器" : "回作品"}
        </Link>
      </div>

      <header className="mb-8">
        <h1 className="font-serif text-3xl">✨ 深度創作 · {work.title}</h1>
        <p className="text-stone-500 text-sm mt-1">
          {chapter ? (
            <>對象：第 {chapter.order} 章「{chapter.title}」</>
          ) : (
            <>對象：全新章節</>
          )}
          {resumeSession && (
            <span className="ml-2 text-amber-700">· 接續上次未完成的設計</span>
          )}
        </p>
      </header>

      <DesignWizard
        workSlug={slug}
        workTitle={work.title}
        chapterSlug={chapter?.slug ?? null}
        chapterTitle={chapter?.title ?? null}
        chapterCount={chapters.length}
        initialSession={resumeSession}
      />
    </div>
  );
}
