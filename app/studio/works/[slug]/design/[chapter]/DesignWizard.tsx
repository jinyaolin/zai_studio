"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { DesignMode, DesignSession } from "@/lib/types";

const STAGE_LABELS = [
  { name: "directions", label: "發散 · 方向探索", hint: "3-5 個可能的方向，每個有標題、說明、意義、風險" },
  { name: "intent", label: "收斂 · 章節意圖", hint: "80-150 字的核心意圖聲明：這一章為什麼必須存在" },
  { name: "details", label: "發散 · 細節設計", hint: "對話亮點 / 意象 / 伏筆 / 節奏 / 感官" },
  { name: "draft", label: "收斂 · 完整正文", hint: "綜合前面產出的整章 markdown" },
] as const;

export default function DesignWizard({
  workSlug,
  workTitle,
  chapterSlug,
  chapterTitle,
  chapterCount,
  initialSession,
}: {
  workSlug: string;
  workTitle: string;
  chapterSlug: string | null;
  chapterTitle: string | null;
  chapterCount: number;
  initialSession: DesignSession | null;
}) {
  const router = useRouter();
  const [session, setSession] = useState<DesignSession | null>(initialSession);
  const [generatingStage, setGeneratingStage] = useState<number | null>(null);
  const [streamBuffers, setStreamBuffers] = useState<string[]>(["", "", "", ""]);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resetting, setResetting] = useState(false);
  const [autoStarting, setAutoStarting] = useState(false);
  const [commitResult, setCommitResult] = useState<{
    chapterSlug: string;
    patch?: { applied?: boolean; added?: number; updated?: number; removed?: number; styleAppend?: boolean; skipped?: boolean };
  } | null>(null);

  // Poll session state while auto-continue is running in the background.
  useEffect(() => {
    if (!session || session.autoStatus !== "running") return;
    let cancelled = false;
    const poll = async () => {
      try {
        const res = await fetch(
          `/api/works/${encodeURIComponent(workSlug)}/design/${session.id}/auto-continue`,
        );
        if (cancelled) return;
        if (res.ok) {
          const { session: fresh } = await res.json();
          setSession(fresh);
        }
      } catch {
        // network blip — keep polling
      }
    };
    void poll();
    const t = setInterval(poll, 5000);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, [session?.id, session?.autoStatus, workSlug]);

  // ── Start a new session ──────────────────────────────────────────
  async function startSession(mode: DesignMode, goal: string) {
    setStarting(true);
    setError(null);
    try {
      const res = await fetch(`/api/works/${encodeURIComponent(workSlug)}/design/start`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          chapterSlug,
          mode,
          goal,
        }),
      });
      if (!res.ok) throw new Error("建立 session 失敗");
      const { session } = await res.json();
      setSession(session);
      setStreamBuffers(["", "", "", ""]);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setStarting(false);
    }
  }

  // ── Generate one stage ───────────────────────────────────────────
  async function generateStage(idx: number) {
    if (!session) return;
    setGeneratingStage(idx);
    setError(null);
    setStreamBuffers((prev) => {
      const next = [...prev];
      next[idx] = "";
      return next;
    });

    const res = await fetch(
      `/api/works/${encodeURIComponent(workSlug)}/design/${session.id}/generate`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ stageIndex: idx }),
      },
    );

    if (!res.ok || !res.body) {
      setGeneratingStage(null);
      setError("生成失敗");
      return;
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let accumulated = "";

    try {
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
              accumulated += evt.text;
              const snapshot = accumulated;
              setStreamBuffers((prev) => {
                const next = [...prev];
                next[idx] = snapshot;
                return next;
              });
            } else if (evt.type === "done") {
              // refresh session from server
              const sres = await fetch(
                `/api/works/${encodeURIComponent(workSlug)}/design/${session.id}/stages/${idx}`,
              );
              if (sres.ok) {
                const { stage } = await sres.json();
                setSession((cur) => {
                  if (!cur) return cur;
                  const updated = { ...cur };
                  updated.stages = [...cur.stages];
                  updated.stages[idx] = stage;
                  return updated;
                });
              }
            } else if (evt.type === "error") {
              setError(evt.error);
            }
          } catch {
            // partial
          }
        }
      }
    } finally {
      setGeneratingStage(null);
    }
  }

  // ── Accept current stream as the stage's acceptedOutput ──────────
  async function acceptStage(idx: number, edited: string) {
    if (!session) return;
    const res = await fetch(
      `/api/works/${encodeURIComponent(workSlug)}/design/${session.id}/stages/${idx}`,
      {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ acceptedOutput: edited }),
      },
    );
    if (res.ok) {
      const { session: updated } = await res.json();
      setSession(updated);
    }
  }

  async function skipStage(idx: number, note: string) {
    if (!session) return;
    const res = await fetch(
      `/api/works/${encodeURIComponent(workSlug)}/design/${session.id}/stages/${idx}`,
      {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status: "skipped", acceptedOutput: note || "(skipped)" }),
      },
    );
    if (res.ok) {
      const { session: updated } = await res.json();
      setSession(updated);
    }
  }

  async function commitDraft(opts?: { applyMemoryPatch?: boolean }) {
    if (!session) return;
    const res = await fetch(
      `/api/works/${encodeURIComponent(workSlug)}/design/${session.id}/commit`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ applyMemoryPatch: opts?.applyMemoryPatch ?? true }),
      },
    );
    if (!res.ok) {
      setError("commit 失敗");
      return;
    }
    const data = await res.json();
    const { chapter, patch } = data;
    setSession((cur) => (cur ? { ...cur, committed: true, chapterSlug: chapter.slug } : cur));
    setCommitResult({ chapterSlug: chapter.slug, patch });
  }

  function gotoEditor() {
    if (!commitResult?.chapterSlug && !session?.chapterSlug) return;
    const slug = commitResult?.chapterSlug ?? session?.chapterSlug;
    router.push(
      `/studio/works/${encodeURIComponent(workSlug)}/editor/${encodeURIComponent(slug!)}`,
    );
  }

  // ── Auto-continue: kick off background generation of all pending stages
  async function startAutoContinue() {
    if (!session || session.autoStatus === "running") return;
    if (!confirm("讓 zai 在背景自動跑完所有未完成的 stage？\n你可以離開這個頁面，回來時會看到結果等你確認。")) return;
    setAutoStarting(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/works/${encodeURIComponent(workSlug)}/design/${session.id}/auto-continue`,
        { method: "POST" },
      );
      if (res.ok) {
        const { session: fresh } = await res.json();
        setSession(fresh);
      } else if (res.status === 409) {
        // Already running — just sync state.
        const fresh = await fetch(
          `/api/works/${encodeURIComponent(workSlug)}/design/${session.id}/auto-continue`,
        ).then((r) => r.json());
        if (fresh?.session) setSession(fresh.session);
      } else {
        const err = await res.json().catch(() => ({ error: "啟動失敗" }));
        setError(err.error ?? "啟動失敗");
      }
    } finally {
      setAutoStarting(false);
    }
  }

  // ── Reset: clear the current session and start over ──────────────
  async function resetSession() {
    if (!session) return;
    if (!confirm("清除此章的設計歷程？此 session 會被刪除，無法復原。")) return;
    setResetting(true);
    try {
      await fetch(
        `/api/works/${encodeURIComponent(workSlug)}/design/${session.id}`,
        { method: "DELETE" },
      );
      // Reload this page with ?fresh=1 to start clean.
      const url = new URL(window.location.href);
      url.searchParams.set("fresh", "1");
      url.searchParams.delete("session");
      window.location.href = url.toString();
    } finally {
      setResetting(false);
    }
  }

  if (!session) {
    return (
      <StartForm
        chapterTitle={chapterTitle}
        chapterCount={chapterCount}
        starting={starting}
        error={error}
        onSubmit={startSession}
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="bg-amber-50 border border-amber-200 rounded-md p-3 text-sm text-stone-700">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="font-serif text-base mb-1">目標：{session.goal}</div>
            <div className="text-xs text-stone-500">
              模式：{session.mode === "continue" ? "續寫" : session.mode === "rewrite" ? "重寫" : "全新章節"}
              {" · "}
              {chapterTitle ? `章節：${chapterTitle}` : "新章節"}
              {session.committed && <span className="ml-2 text-emerald-700">· 已採用</span>}
            </div>
          </div>
          <button
            type="button"
            onClick={resetSession}
            disabled={resetting || session.committed}
            className="shrink-0 text-xs px-3 py-1 border border-stone-300 rounded text-stone-600 hover:bg-stone-100 disabled:opacity-40"
            title="清除這個章節的設計歷程，從頭開始"
          >
            ↺ 重新設計思考
          </button>
        </div>
      </div>

      {/* Auto-continue status / trigger */}
      {session.autoStatus === "running" && (
        <div className="bg-blue-50 border border-blue-300 rounded-md p-3 text-sm flex items-center gap-3">
          <span className="inline-block w-2 h-2 rounded-full bg-blue-600 animate-pulse" />
          <div className="flex-1">
            <div className="font-medium text-blue-900">背景執行中…</div>
            <div className="text-xs text-blue-700">
              zai 正在依序跑完所有 stage。你可以離開這個頁面，回來時會看到結果等你確認。
              {session.stages.filter((s) => s.status === "done").length}/4 已完成。
            </div>
          </div>
        </div>
      )}
      {session.autoStatus === "done" && !session.committed && (
        <div className="bg-emerald-50 border border-emerald-300 rounded-md p-3 text-sm">
          <div className="font-medium text-emerald-900">✓ 自動跑完了，請確認結果</div>
          <div className="text-xs text-emerald-800 mt-0.5">
            下方是 zai 自動產出的所有 stage。確認沒問題就按最底下的「採用為章節內容」；
            對某個 stage 不滿意就點該 stage 的「重新生成」或「編輯」。
          </div>
        </div>
      )}
      {session.autoStatus === "failed" && (
        <div className="bg-red-50 border border-red-300 rounded-md p-3 text-sm">
          <div className="font-medium text-red-900">背景執行失敗</div>
          <div className="text-xs text-red-800 mt-0.5">{session.autoError ?? "未知錯誤"}</div>
        </div>
      )}
      {session.autoStatus !== "running" && !session.committed && (
        <button
          type="button"
          onClick={startAutoContinue}
          disabled={autoStarting}
          className="text-xs px-3 py-1 bg-blue-700 text-white rounded hover:bg-blue-800 disabled:opacity-50"
          title="讓 zai 在背景自動跑完所有未完成的 stage"
        >
          ⚡ 自動跑完全部（可離開頁面）
        </button>
      )}

      {session.stages.map((stage, idx) => {
        const previousReady =
          idx === 0 ||
          session.stages[idx - 1].status === "done" ||
          session.stages[idx - 1].status === "skipped";
        const autoRunning = session.autoStatus === "running";
        return (
        <StageCard
          key={idx}
          index={idx}
          stage={stage}
          streamText={generatingStage === idx ? streamBuffers[idx] : ""}
          isGenerating={generatingStage === idx}
          canGenerate={generatingStage === null && previousReady && !autoRunning}
          previousReady={previousReady}
          autoRunning={autoRunning}
          committed={session.committed}
          onGenerate={() => generateStage(idx)}
          onAccept={(text) => acceptStage(idx, text)}
          onSkip={(note) => skipStage(idx, note)}
        />
        );
      })}

      <CommitBar
        session={session}
        onCommit={(applyPatch) => commitDraft({ applyMemoryPatch: applyPatch })}
        commitResult={commitResult}
        onGotoEditor={gotoEditor}
      />

      {error && <p className="text-sm text-red-700">{error}</p>}
    </div>
  );
}

function CommitBar({
  session,
  onCommit,
  commitResult,
  onGotoEditor,
}: {
  session: DesignSession;
  onCommit: (applyPatch: boolean) => void;
  commitResult: {
    chapterSlug: string;
    patch?: {
      applied?: boolean;
      added?: number;
      updated?: number;
      removed?: number;
      styleAppend?: boolean;
      skipped?: boolean;
    };
  } | null;
  onGotoEditor: () => void;
}) {
  const draftStage = session.stages[3];
  const hasDraft = Boolean(draftStage.acceptedOutput || draftStage.output);
  const patch = draftStage.memoryPatch;
  const hasPatch = Boolean(
    patch &&
      ((patch.addCharacters?.length ?? 0) ||
        (patch.updateCharacters?.length ?? 0) ||
        (patch.removeCharacters?.length ?? 0) ||
        (patch.addWorldbuilding?.length ?? 0) ||
        (patch.updateWorldbuilding?.length ?? 0) ||
        (patch.removeWorldbuilding?.length ?? 0) ||
        (patch.addPlot?.length ?? 0) ||
        (patch.updatePlot?.length ?? 0) ||
        (patch.removePlot?.length ?? 0) ||
        patch.styleAppend?.trim()),
  );

  const patchCounts = patch
    ? {
        add: (patch.addCharacters?.length ?? 0) + (patch.addWorldbuilding?.length ?? 0) + (patch.addPlot?.length ?? 0),
        upd: (patch.updateCharacters?.length ?? 0) + (patch.updateWorldbuilding?.length ?? 0) + (patch.updatePlot?.length ?? 0),
        rm: (patch.removeCharacters?.length ?? 0) + (patch.removeWorldbuilding?.length ?? 0) + (patch.removePlot?.length ?? 0),
        style: Boolean(patch.styleAppend?.trim()),
      }
    : null;

  // Post-commit summary (replaces auto MemorySyncModal).
  if (commitResult) {
    const p = commitResult.patch;
    return (
      <div className="bg-emerald-50 border border-emerald-300 rounded-md p-4 space-y-3">
        <div className="font-serif text-lg text-emerald-900">✓ 已採用為章節內容</div>
        <div className="text-sm text-emerald-800">
          {p?.applied && (
            <>
              記憶同步：+{p.added ?? 0} / ~{p.updated ?? 0} / -{p.removed ?? 0}
              {p.styleAppend ? " · 風格 +append" : ""}
            </>
          )}
          {p?.skipped && "（記憶修正已略過）"}
          {!p?.applied && !p?.skipped && "（這章沒有觸發記憶修正）"}
        </div>
        <button
          onClick={onGotoEditor}
          className="px-4 py-1.5 bg-emerald-700 text-white rounded text-sm hover:bg-emerald-800"
        >
          → 進編輯器
        </button>
      </div>
    );
  }

  return (
    <div className="bg-white border border-stone-300 rounded-md p-4 space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div className="text-sm text-stone-600">
          {hasDraft ? "✓ Stage 4 有產出，可以採用為章節內容。" : "完成 Stage 4 後才能 commit 到章節。"}
        </div>
      </div>

      {hasPatch && patchCounts && (
        <div className="text-xs bg-amber-50 border border-amber-200 rounded p-2 text-stone-700">
          📝 Stage 4 同時建議的記憶修正：
          <span className="ml-2 text-emerald-700">+{patchCounts.add}</span>
          {patchCounts.upd > 0 && <span className="ml-2 text-amber-700">~{patchCounts.upd}</span>}
          {patchCounts.rm > 0 && <span className="ml-2 text-red-700">-{patchCounts.rm}</span>}
          {patchCounts.style && <span className="ml-2 text-stone-600">風格+</span>}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2 justify-end">
        {hasPatch && (
          <button
            onClick={() => onCommit(false)}
            disabled={session.committed || !hasDraft}
            className="px-4 py-2 border border-stone-300 text-stone-600 rounded-md text-sm hover:bg-stone-100 disabled:opacity-40"
            title="只寫入章節內容，記憶保持不變"
          >
            只採用章節，略過記憶修正
          </button>
        )}
        <button
          onClick={() => onCommit(true)}
          disabled={session.committed || !hasDraft}
          className="px-5 py-2 bg-emerald-700 text-white rounded-md text-sm hover:bg-emerald-800 disabled:opacity-40"
        >
          {session.committed
            ? "✓ 已採用"
            : hasPatch
              ? "採用為章節內容（含記憶修正）"
              : "採用為章節內容（自動備份舊版）"}
        </button>
      </div>
    </div>
  );
}

// ─── Start form ───────────────────────────────────────────────────
function StartForm({
  chapterTitle,
  chapterCount,
  starting,
  error,
  onSubmit,
}: {
  chapterTitle: string | null;
  chapterCount: number;
  starting: boolean;
  error: string | null;
  onSubmit: (mode: DesignMode, goal: string) => void;
}) {
  const [mode, setMode] = useState<DesignMode>(chapterTitle ? "continue" : "fresh");
  const [goal, setGoal] = useState("");

  const modeOptions: { value: DesignMode; label: string; hint: string; disabled?: boolean }[] = [
    {
      value: "continue",
      label: "續寫",
      hint: "在現有章節內容之後接著寫",
      disabled: !chapterTitle,
    },
    {
      value: "rewrite",
      label: "重寫",
      hint: "整章重新來過，但沿用設定與方向",
      disabled: !chapterTitle,
    },
    {
      value: "fresh",
      label: "全新章節",
      hint: chapterTitle ? "把目前章節當新章節寫（會覆蓋）" : "從零開始建立新章節",
    },
  ];

  return (
    <div className="space-y-6 bg-white border border-stone-200 rounded-md p-6">
      <div>
        <h2 className="font-serif text-xl mb-3">這次想怎麼創作？</h2>
        <div className="grid grid-cols-3 gap-2">
          {modeOptions.map((o) => (
            <button
              key={o.value}
              type="button"
              disabled={o.disabled}
              onClick={() => setMode(o.value)}
              className={`p-3 border rounded text-left transition ${
                mode === o.value
                  ? "border-amber-700 bg-amber-50"
                  : o.disabled
                    ? "border-stone-200 opacity-40 cursor-not-allowed"
                    : "border-stone-300 hover:border-stone-500"
              }`}
            >
              <div className="font-medium text-sm">{o.label}</div>
              <div className="text-xs text-stone-500 mt-1">{o.hint}</div>
            </button>
          ))}
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-stone-700 mb-2">
          這次想探索什麼？（目標 / 想達成的效果）
        </label>
        <textarea
          value={goal}
          onChange={(e) => setGoal(e.target.value)}
          rows={5}
          placeholder={
            chapterTitle
              ? "例：揭開來客身份的一個線索，但留下更大的疑問。沈墨這章必須面對他寫不出的那段往事。"
              : "例：建立這個故事的世界觀與氣氛。主角登場，讀者要在 2000 字內決定要不要繼續讀。"
          }
          className="w-full p-3 border border-stone-300 rounded-md font-serif text-base resize-y focus:outline-none focus:ring-2 focus:ring-amber-700"
        />
      </div>

      {error && <p className="text-sm text-red-700">{error}</p>}

      <button
        type="button"
        disabled={starting || !goal.trim()}
        onClick={() => onSubmit(mode, goal.trim())}
        className="px-5 py-2 bg-amber-700 text-white rounded-md text-sm hover:bg-amber-800 disabled:opacity-40"
      >
        {starting ? "建立中…" : "開始 Design Thinking →"}
      </button>

      <p className="text-xs text-stone-400">
        過程中任一階段都可以跳過。Stage 1-3 都跳過也沒關係，Stage 4 會直接從目標寫正文。
      </p>
    </div>
  );
}

// ─── Stage card ───────────────────────────────────────────────────
function StageCard({
  index,
  stage,
  streamText,
  isGenerating,
  canGenerate,
  previousReady,
  autoRunning,
  committed,
  onGenerate,
  onAccept,
  onSkip,
}: {
  index: number;
  stage: DesignSession["stages"][number];
  streamText: string;
  isGenerating: boolean;          // this client is streaming this stage right now
  canGenerate: boolean;           // overall gate (no other manual gen running, etc.)
  previousReady: boolean;         // stage N-1 is done or skipped
  autoRunning: boolean;           // background auto-continue is active
  committed: boolean;             // session already committed to chapter
  onGenerate: () => void;
  onAccept: (text: string) => Promise<void>;
  onSkip: (note: string) => Promise<void>;
}) {
  const meta = STAGE_LABELS[index];
  // Show streamText live when client is generating; otherwise show stored output.
  const displayed = isGenerating ? streamText : (stage.output || "");
  const editable = !isGenerating && displayed.length > 0;
  const [editing, setEditing] = useState(false);
  const [editText, setEditText] = useState(displayed);
  const [skipping, setSkipping] = useState(false);
  const [skipNote, setSkipNote] = useState("");

  // Reset edit buffer when stage output changes.
  if (!isGenerating && editText !== displayed && !editing) {
    setEditText(displayed);
  }

  const accepted = stage.status === "done" && Boolean(stage.acceptedOutput);
  const skipped = stage.status === "skipped";
  // Server-side "generating" — happens during auto-continue even when the
  // client isn't streaming this stage itself.
  const serverGenerating = stage.status === "generating";
  const showGeneratingState = isGenerating || (autoRunning && serverGenerating);

  // Stage is locked: previous stage not ready, or session committed, or
  // auto-continue is running (server owns generation in that mode).
  const locked = !previousReady || autoRunning || committed;
  const showGenerateButton =
    !accepted && !skipped && !showGeneratingState && !committed;

  return (
    <div className={`bg-white border rounded-md p-4 ${
      accepted
        ? "border-emerald-300"
        : skipped
          ? "border-stone-200 opacity-70"
          : showGeneratingState
            ? "border-blue-300"
            : "border-stone-300"
    }`}>
      <div className="flex items-baseline justify-between mb-2">
        <div>
          <div className="text-xs text-stone-400">Stage {index + 1}</div>
          <h3 className="font-serif text-lg">{meta.label}</h3>
          <p className="text-xs text-stone-500 mt-0.5">{meta.hint}</p>
        </div>
        <div className="flex items-center gap-2">
          {accepted && <span className="text-xs text-emerald-700">✓ 已確認</span>}
          {skipped && <span className="text-xs text-stone-500">⤵ 已跳過</span>}
          {showGeneratingState && (
            <span className="text-xs text-blue-700 animate-pulse flex items-center gap-1">
              <span className="inline-block w-1.5 h-1.5 rounded-full bg-blue-600 animate-pulse" />
              {autoRunning ? "背景生成中…" : "生成中…"}
            </span>
          )}
          {locked && !showGeneratingState && !accepted && !skipped && (
            <span className="text-xs text-stone-400">
              {autoRunning
                ? "背景執行中"
                : committed
                  ? "已採用"
                  : "等前一階段完成"}
            </span>
          )}
        </div>
      </div>

      <div className="mt-3">
        {editing ? (
          <textarea
            value={editText}
            onChange={(e) => setEditText(e.target.value)}
            rows={Math.min(20, Math.max(8, editText.split("\n").length + 2))}
            className="w-full p-3 border border-stone-300 rounded font-serif text-sm leading-relaxed resize-y focus:outline-none focus:ring-2 focus:ring-stone-400"
          />
        ) : (
          <pre className="whitespace-pre-wrap font-serif text-sm text-stone-800 bg-stone-50 p-3 rounded border border-stone-200 max-h-96 overflow-y-auto">
            {displayed || (showGeneratingState ? "" : "（尚未生成）")}
          </pre>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2 mt-3">
        {showGenerateButton && (
          <button
            onClick={onGenerate}
            disabled={!canGenerate || locked}
            className="px-3 py-1 bg-amber-700 text-white rounded text-xs hover:bg-amber-800 disabled:opacity-40"
          >
            {isGenerating ? "生成中…" : stage.output ? "重新生成" : "✨ 生成"}
          </button>
        )}

        {editable && !accepted && !skipped && !autoRunning && !committed && (
          <>
            <button
              onClick={() => setEditing((e) => !e)}
              className="px-3 py-1 border border-stone-300 text-stone-700 rounded text-xs hover:bg-stone-100"
            >
              {editing ? "預覽" : "編輯"}
            </button>
            <button
              onClick={() => onAccept(editText)}
              className="px-3 py-1 bg-emerald-700 text-white rounded text-xs hover:bg-emerald-800"
            >
              ✓ 採用並進下一步
            </button>
            <button
              onClick={() => setSkipping(true)}
              className="px-3 py-1 text-stone-500 rounded text-xs hover:bg-stone-100"
            >
              跳過
            </button>
          </>
        )}

        {accepted && (
          <button
            onClick={() => {
              setEditText(stage.acceptedOutput ?? stage.output);
              setEditing(true);
            }}
            className="px-3 py-1 border border-stone-300 text-stone-700 rounded text-xs hover:bg-stone-100"
          >
            重新編輯
          </button>
        )}
      </div>

      {skipping && !skipped && (
        <div className="mt-3 p-3 bg-stone-50 border border-stone-200 rounded">
          <p className="text-xs text-stone-500 mb-2">
            跳過這階段？可選擇留一段備註當作下個階段的 context（也可空白）：
          </p>
          <input
            value={skipNote}
            onChange={(e) => setSkipNote(e.target.value)}
            placeholder="例：方向我已經心裡有數，直接寫意圖"
            className="w-full px-2 py-1 text-sm border border-stone-300 rounded"
          />
          <div className="flex gap-2 mt-2">
            <button
              onClick={() => {
                onSkip(skipNote);
                setSkipping(false);
                setSkipNote("");
              }}
              className="px-3 py-1 bg-stone-700 text-white rounded text-xs"
            >
              確認跳過
            </button>
            <button
              onClick={() => setSkipping(false)}
              className="px-3 py-1 text-stone-600 text-xs"
            >
              取消
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
