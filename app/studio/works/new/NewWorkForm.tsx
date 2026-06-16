"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export default function NewWorkForm() {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [type, setType] = useState<"long" | "medium" | "short">("short");
  const [synopsis, setSynopsis] = useState("");
  const [genre, setGenre] = useState("");
  const [tags, setTags] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    setSubmitting(true);
    setError(null);
    const res = await fetch("/api/works", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        title: title.trim(),
        type,
        synopsis: synopsis.trim() || undefined,
        genre: genre.trim() || undefined,
        tags: tags
          .split(/[、,\s]+/)
          .map((t) => t.trim())
          .filter(Boolean),
      }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: "建立失敗" }));
      setError(typeof err.error === "string" ? err.error : "建立失敗");
      setSubmitting(false);
      return;
    }
    const { work } = await res.json();
    router.push(`/studio/works/${encodeURIComponent(work.slug)}`);
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5">
      <div>
        <label className="block text-sm font-medium text-stone-700 mb-1">標題 *</label>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          autoFocus
          required
          maxLength={120}
          className="w-full px-3 py-2 border border-stone-300 rounded-md bg-white focus:outline-none focus:ring-2 focus:ring-stone-400"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-stone-700 mb-1">類型</label>
        <div className="flex gap-2">
          {(["short", "medium", "long"] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setType(t)}
              className={`px-4 py-2 rounded-md border text-sm ${
                type === t
                  ? "border-stone-900 bg-stone-900 text-stone-50"
                  : "border-stone-300 bg-white text-stone-700 hover:border-stone-500"
              }`}
            >
              {t === "short" ? "短篇" : t === "medium" ? "中篇" : "長篇"}
            </button>
          ))}
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-stone-700 mb-1">簡介</label>
        <textarea
          value={synopsis}
          onChange={(e) => setSynopsis(e.target.value)}
          rows={4}
          maxLength={2000}
          className="w-full px-3 py-2 border border-stone-300 rounded-md bg-white focus:outline-none focus:ring-2 focus:ring-stone-400 resize-y"
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-stone-700 mb-1">類型標籤</label>
          <input
            value={genre}
            onChange={(e) => setGenre(e.target.value)}
            placeholder="奇幻、懸疑、言情…"
            maxLength={60}
            className="w-full px-3 py-2 border border-stone-300 rounded-md bg-white focus:outline-none focus:ring-2 focus:ring-stone-400"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-stone-700 mb-1">標籤（以空白或、分隔）</label>
          <input
            value={tags}
            onChange={(e) => setTags(e.target.value)}
            placeholder="成長、冒險"
            className="w-full px-3 py-2 border border-stone-300 rounded-md bg-white focus:outline-none focus:ring-2 focus:ring-stone-400"
          />
        </div>
      </div>

      {error && <p className="text-sm text-red-700">{error}</p>}

      <div className="flex gap-3 pt-2">
        <button
          type="submit"
          disabled={submitting || !title.trim()}
          className="px-5 py-2 bg-stone-900 text-stone-50 rounded-md text-sm hover:bg-stone-800 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {submitting ? "建立中…" : "建立"}
        </button>
        <button
          type="button"
          onClick={() => router.back()}
          className="px-5 py-2 border border-stone-300 text-stone-700 rounded-md text-sm hover:bg-stone-100"
        >
          取消
        </button>
      </div>
    </form>
  );
}
