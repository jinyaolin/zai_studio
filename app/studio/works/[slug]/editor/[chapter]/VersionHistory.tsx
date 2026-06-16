"use client";

import { useEffect, useState } from "react";
import type { ChapterVersion } from "@/lib/types";
import { formatDate, formatWordCount } from "@/lib/utils";
import { filenameToIso } from "@/lib/utils/version-format";

const REASON_LABEL: Record<string, string> = {
  manual: "手動",
  "ai-edit": "AI 改寫",
  design: "Design Thinking",
  restore: "還原",
  "chapter-chat": "章節討論",
};

export default function VersionHistory({
  workSlug,
  chapterSlug,
  onRestore,
  onClose,
}: {
  workSlug: string;
  chapterSlug: string;
  onRestore: () => Promise<void>;
  onClose: () => void;
}) {
  const [versions, setVersions] = useState<ChapterVersion[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [restoring, setRestoring] = useState<string | null>(null);
  const [preview, setPreview] = useState<{ timestamp: string; content: string } | null>(null);

  async function refresh() {
    const res = await fetch(
      `/api/works/${encodeURIComponent(workSlug)}/chapters/${encodeURIComponent(chapterSlug)}/versions`,
    );
    if (res.ok) {
      const data = await res.json();
      setVersions(data.versions);
    } else {
      setError("無法載入版本紀錄");
    }
  }

  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function viewVersion(ts: string) {
    const res = await fetch(
      `/api/works/${encodeURIComponent(workSlug)}/chapters/${encodeURIComponent(chapterSlug)}/versions/${encodeURIComponent(ts)}`,
    );
    if (res.ok) {
      const data = await res.json();
      setPreview({ timestamp: ts, content: data.content });
    }
  }

  async function restore(ts: string) {
    if (!confirm("還原這個版本？目前內容會先被自動快照（你之後還能回到它）。")) return;
    setRestoring(ts);
    try {
      const res = await fetch(
        `/api/works/${encodeURIComponent(workSlug)}/chapters/${encodeURIComponent(chapterSlug)}/restore`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ timestamp: ts }),
        },
      );
      if (res.ok) {
        await onRestore();
        await refresh();
        setPreview(null);
      }
    } finally {
      setRestoring(null);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-40 p-4">
      <div className="bg-stone-50 rounded-lg w-full max-w-4xl max-h-[85vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-3 border-b border-stone-200">
          <h2 className="font-serif text-xl">📜 版本紀錄</h2>
          <button onClick={onClose} className="text-stone-500 hover:text-stone-900 text-sm">✕ 關閉</button>
        </div>
        <div className="flex-1 overflow-hidden grid grid-cols-[1fr_1.5fr]">
          <ul className="border-r border-stone-200 overflow-y-auto p-3 space-y-1">
            {versions === null && <li className="text-sm text-stone-400">載入中…</li>}
            {versions !== null && versions.length === 0 && (
              <li className="text-sm text-stone-400">尚無歷史版本。改寫時會自動產生。</li>
            )}
            {versions?.map((v) => (
              <li key={v.timestamp}>
                <button
                  onClick={() => viewVersion(v.timestamp)}
                  className={`w-full text-left px-3 py-2 rounded text-sm ${
                    preview?.timestamp === v.timestamp
                      ? "bg-stone-900 text-stone-50"
                      : "hover:bg-stone-200"
                  }`}
                >
                  <div className="text-xs text-stone-400">{formatDate(filenameToIso(v.timestamp))}</div>
                  <div className="flex justify-between items-baseline">
                    <span className="font-medium">{REASON_LABEL[v.reason] ?? v.reason}</span>
                    <span className="text-xs text-stone-400">{formatWordCount(v.wordCount)}</span>
                  </div>
                  <div className="text-xs text-stone-500 truncate">{v.title}</div>
                </button>
              </li>
            ))}
          </ul>
          <div className="overflow-y-auto p-4">
            {preview ? (
              <>
                <div className="flex justify-between items-center mb-3">
                  <span className="text-sm text-stone-500">
                    {formatDate(filenameToIso(preview.timestamp))} 預覽
                  </span>
                  <button
                    onClick={() => restore(preview.timestamp)}
                    disabled={restoring !== null}
                    className="px-3 py-1 bg-emerald-700 text-white rounded text-xs hover:bg-emerald-800 disabled:opacity-50"
                  >
                    {restoring === preview.timestamp ? "還原中…" : "↺ 還原為此版本"}
                  </button>
                </div>
                <pre className="font-serif text-sm whitespace-pre-wrap text-stone-800 bg-white p-4 rounded border border-stone-200">
                  {preview.content}
                </pre>
              </>
            ) : (
              <p className="text-sm text-stone-400">點左邊任一版本來預覽。</p>
            )}
            {error && <p className="text-sm text-red-700 mt-2">{error}</p>}
          </div>
        </div>
      </div>
    </div>
  );
}
