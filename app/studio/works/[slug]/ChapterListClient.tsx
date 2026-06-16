"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { Chapter } from "@/lib/types";
import { formatDate, formatWordCount } from "@/lib/utils";

export default function ChapterListClient({
  workSlug,
  initialChapters,
}: {
  workSlug: string;
  initialChapters: Chapter[];
}) {
  const router = useRouter();
  const [chapters, setChapters] = useState(initialChapters);
  const [newTitle, setNewTitle] = useState("");
  const [adding, setAdding] = useState(false);

  async function addChapter(e: React.FormEvent) {
    e.preventDefault();
    if (!newTitle.trim()) return;
    setAdding(true);
    const res = await fetch(`/api/works/${encodeURIComponent(workSlug)}/chapters`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title: newTitle.trim() }),
    });
    if (res.ok) {
      const { chapter } = await res.json();
      setChapters((prev) => [...prev, chapter]);
      setNewTitle("");
      router.refresh();
    }
    setAdding(false);
  }

  async function deleteChapter(slug: string) {
    if (!confirm("確定刪除這章？檔案會被移除。")) return;
    const res = await fetch(
      `/api/works/${encodeURIComponent(workSlug)}/chapters/${encodeURIComponent(slug)}`,
      { method: "DELETE" },
    );
    if (res.ok) {
      setChapters((prev) => prev.filter((c) => c.slug !== slug));
      router.refresh();
    }
  }

  const encoded = encodeURIComponent(workSlug);

  return (
    <div>
      <ul className="space-y-1 mb-4">
        {chapters.map((c) => (
          <li
            key={c.slug}
            className="flex items-baseline gap-3 px-3 py-2.5 bg-white border border-stone-200 rounded-md hover:border-stone-400 group"
          >
            <span className="text-xs text-stone-400 tabular-nums w-8">
              {String(c.order).padStart(2, "0")}
            </span>
            <Link
              href={`/studio/works/${encoded}/editor/${encodeURIComponent(c.slug)}`}
              className="flex-1 min-w-0"
            >
              <div className="font-serif text-stone-900 truncate">{c.title}</div>
              <div className="text-xs text-stone-400 mt-0.5">
                {formatWordCount(c.wordCount)} · {c.status === "final" ? "完稿" : "草稿"} · {formatDate(c.updatedAt)}
              </div>
            </Link>
            <button
              onClick={() => deleteChapter(c.slug)}
              className="opacity-0 group-hover:opacity-100 text-xs text-red-700 hover:underline"
            >
              刪除
            </button>
          </li>
        ))}
        {chapters.length === 0 && (
          <li className="text-sm text-stone-500 px-3 py-6 text-center border border-dashed border-stone-300 rounded-md">
            尚無章節。先加一章試試。
          </li>
        )}
      </ul>

      <form onSubmit={addChapter} className="flex gap-2">
        <input
          value={newTitle}
          onChange={(e) => setNewTitle(e.target.value)}
          placeholder="新章節標題…"
          maxLength={120}
          className="flex-1 px-3 py-2 border border-stone-300 rounded-md bg-white text-sm focus:outline-none focus:ring-2 focus:ring-stone-400"
        />
        <button
          type="submit"
          disabled={adding || !newTitle.trim()}
          className="px-4 py-2 bg-stone-900 text-stone-50 rounded-md text-sm hover:bg-stone-800 disabled:opacity-50"
        >
          ＋ 新章
        </button>
      </form>
    </div>
  );
}
