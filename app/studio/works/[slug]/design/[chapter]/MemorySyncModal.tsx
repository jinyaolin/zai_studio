"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { WorkMemory } from "@/lib/types";
import { extractProposal, parseProposalJson } from "@/lib/ai/proposal";

interface Props {
  workSlug: string;
  currentMemory: WorkMemory;
  onClose: () => void;
  onApplied: () => void;
  /** Where to extract memory updates from. */
  source:
    | { kind: "chapter"; chapterSlug: string }
    | { kind: "conversation"; conversationId: string };
  /** Optional title shown in the modal header. */
  title?: string;
}

interface DiffStats {
  characters: { added: number; modified: number; removed: number };
  world: { added: number; modified: number; removed: number };
  plot: { added: number; modified: number; removed: number };
  styleChanged: boolean;
  styleDelta: number;
}

function computeDiff(prev: WorkMemory, next: WorkMemory): DiffStats {
  function sectionDiff<T extends { id: string }>(a: T[], b: T[]) {
    const aById = new Map(a.map((x) => [x.id, x]));
    const bById = new Map(b.map((x) => [x.id, x]));
    let added = 0;
    let modified = 0;
    let removed = 0;
    for (const [id, item] of bById) {
      if (!aById.has(id)) added++;
      else if (JSON.stringify(aById.get(id)) !== JSON.stringify(item)) modified++;
    }
    for (const id of aById.keys()) if (!bById.has(id)) removed++;
    return { added, modified, removed };
  }
  return {
    characters: sectionDiff(prev.characters, next.characters),
    world: sectionDiff(prev.worldbuilding, next.worldbuilding),
    plot: sectionDiff(prev.plot, next.plot),
    styleChanged: prev.style.trim() !== next.style.trim(),
    styleDelta: next.style.length - prev.style.length,
  };
}

export default function MemorySyncModal({
  workSlug,
  currentMemory,
  onClose,
  onApplied,
  source,
  title,
}: Props) {
  const router = useRouter();
  const [phase, setPhase] = useState<"streaming" | "done" | "error">("streaming");
  const [streamText, setStreamText] = useState("");
  const [discussion, setDiscussion] = useState("");
  const [proposal, setProposal] = useState<WorkMemory | null>(null);
  const [diff, setDiff] = useState<DiffStats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [applying, setApplying] = useState(false);
  const [applied, setApplied] = useState(false);
  const startedRef = useRef(false);

  async function run() {
    if (startedRef.current) return;
    startedRef.current = true;
    let buffer = "";
    try {
      const endpoint =
        source.kind === "chapter"
          ? `/api/works/${encodeURIComponent(workSlug)}/chapters/${encodeURIComponent(source.chapterSlug)}/extract-memory`
          : `/api/works/${encodeURIComponent(workSlug)}/memory/extract-from-conversation`;
      const body =
        source.kind === "chapter"
          ? undefined
          : JSON.stringify({ conversationId: source.conversationId });
      const res = await fetch(endpoint, {
        method: "POST",
        ...(body ? { headers: { "content-type": "application/json" }, body } : {}),
      });
      if (!res.ok || !res.body) {
        setPhase("error");
        setError("提取失敗");
        return;
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let raw = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const evt = JSON.parse(line);
            if (evt.type === "delta") {
              raw += evt.text;
              setStreamText(raw);
            } else if (evt.type === "error") {
              setError(evt.error);
              setPhase("error");
              return;
            }
          } catch {
            // partial
          }
        }
      }
      const { proposal: rawProposal, discussion: disc } = extractProposal(raw);
      setDiscussion(disc);
      const parsed = rawProposal ? parseProposalJson<WorkMemory>(rawProposal) : null;
      if (!parsed) {
        setPhase("error");
        setError("AI 沒有給出合法的 PROPOSAL。底下是原始回應供你參考。");
        return;
      }
      setProposal(parsed);
      setDiff(computeDiff(currentMemory, parsed));
      setPhase("done");
    } catch (e) {
      setError((e as Error).message);
      setPhase("error");
    }
  }

  useEffect(() => {
    void run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function applyAll() {
    if (!proposal) return;
    setApplying(true);
    setError(null);
    try {
      const res = await fetch(`/api/works/${encodeURIComponent(workSlug)}/memory`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(proposal),
      });
      if (res.ok) {
        setApplied(true);
        router.refresh();
        onApplied();
      } else {
        const err = await res.json().catch(() => ({ error: "寫入失敗" }));
        // zod flatten returns nested formErrors; surface something readable.
        const detail = err.error;
        let msg = "寫入失敗";
        if (typeof detail === "string") msg = detail;
        else if (detail?.formErrors?.length) msg = detail.formErrors.join("; ");
        else if (detail?.fieldErrors) {
          const parts: string[] = [];
          for (const [k, v] of Object.entries(detail.fieldErrors)) {
            if (Array.isArray(v) && v.length) parts.push(`${k}: ${v.join("; ")}`);
          }
          if (parts.length) msg = parts.join(" | ");
        }
        setError(msg);
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setApplying(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-stone-50 rounded-lg w-full max-w-2xl max-h-[85vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-3 border-b border-stone-200">
          <h2 className="font-serif text-xl">
            {phase === "streaming"
              ? title ?? "🧠 提取記憶中…"
              : title ?? "🧠 記憶同步建議"}
          </h2>
          <button onClick={onClose} className="text-stone-500 hover:text-stone-900 text-sm">✕</button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {phase === "streaming" && (
            <div className="text-sm text-stone-600 whitespace-pre-wrap font-serif leading-relaxed">
              {streamText || "思考中…"}
              <span className="inline-block w-1.5 h-3 ml-0.5 bg-stone-500 animate-pulse align-text-bottom" />
            </div>
          )}

          {phase === "done" && diff && proposal && (
            <>
              {discussion && (
                <div className="text-sm text-stone-700 whitespace-pre-wrap font-serif leading-relaxed bg-white p-3 border border-stone-200 rounded">
                  {discussion}
                </div>
              )}

              <div className="bg-white border border-stone-200 rounded p-4 space-y-2">
                <h3 className="font-medium text-sm text-stone-700">變更摘要</h3>
                <DiffRow label="角色" stats={diff.characters} />
                <DiffRow label="世界觀" stats={diff.world} />
                <DiffRow label="情節線" stats={diff.plot} />
                <div className="flex justify-between text-sm pt-1 border-t border-stone-100">
                  <span className="text-stone-600">風格指南</span>
                  {diff.styleChanged ? (
                    <span className="text-amber-700">
                      {diff.styleDelta > 0 ? `追加 ${diff.styleDelta} 字` : `變更（差 ${diff.styleDelta} 字）`}
                    </span>
                  ) : (
                    <span className="text-stone-400">未變</span>
                  )}
                </div>
              </div>

              <details className="bg-white border border-stone-200 rounded p-3">
                <summary className="text-sm cursor-pointer text-stone-600">看完整 JSON</summary>
                <pre className="text-xs mt-2 max-h-60 overflow-auto bg-stone-50 p-2 rounded">
                  {JSON.stringify(proposal, null, 2)}
                </pre>
              </details>
            </>
          )}

          {phase === "error" && (
            <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded p-3">
              {error ?? "提取失敗"}
              {streamText && (
                <pre className="mt-2 text-xs text-stone-700 whitespace-pre-wrap max-h-60 overflow-auto">{streamText}</pre>
              )}
            </div>
          )}

          {/* Apply errors surface here too — phase is "done" at that point. */}
          {phase === "done" && error && (
            <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded p-3">
              採用失敗：{error}
            </div>
          )}
        </div>

        <div className="px-5 py-3 border-t border-stone-200 flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-1.5 text-sm text-stone-600 hover:bg-stone-100 rounded">
            略過
          </button>
          {phase === "done" && (
            <button
              onClick={applyAll}
              disabled={applying || applied}
              className="px-4 py-1.5 bg-emerald-700 text-white rounded text-sm hover:bg-emerald-800 disabled:opacity-50"
            >
              {applied ? "✓ 已同步" : applying ? "同步中…" : "採用全部更新"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function DiffRow({
  label,
  stats,
}: {
  label: string;
  stats: { added: number; modified: number; removed: number };
}) {
  const hasChange = stats.added || stats.modified || stats.removed;
  return (
    <div className="flex justify-between text-sm">
      <span className="text-stone-600">{label}</span>
      {hasChange ? (
        <span className="space-x-2">
          {stats.added > 0 && <span className="text-emerald-700">+{stats.added}</span>}
          {stats.modified > 0 && <span className="text-amber-700">~{stats.modified}</span>}
          {stats.removed > 0 && <span className="text-red-700">-{stats.removed}</span>}
        </span>
      ) : (
        <span className="text-stone-400">未變</span>
      )}
    </div>
  );
}
