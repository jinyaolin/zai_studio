"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { marked } from "marked";
import type { Chapter, ChapterStatus } from "@/lib/types";
import { chunkForReader, stripMarkdown, type ReaderChunk } from "@/lib/tts/chunker";
import { countWords } from "@/lib/content/markdown";
import { formatWordCount } from "@/lib/utils";

interface Props {
  workSlug: string;
  chapter: Chapter;
  voice: string;
}

// Split markdown into raw paragraphs (for editing).
function splitParagraphs(md: string): string[] {
  return md
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);
}

// Join paragraphs back to full markdown.
function joinParagraphs(paras: string[]): string {
  return paras.join("\n\n");
}

export default function ParagraphEditor({ workSlug, chapter, voice }: Props) {
  const router = useRouter();
  const [paragraphs, setParagraphs] = useState<string[]>(() => splitParagraphs(chapter.content));
  const [title, setTitle] = useState(chapter.title);
  const [status, setStatus] = useState<ChapterStatus>(chapter.status);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  // TTS playback state
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playingChunk, setPlayingChunk] = useState(-1);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [cacheStatus, setCacheStatus] = useState<Set<number>>(new Set());

  // Compute reader chunks for TTS
  const fullContent = joinParagraphs(paragraphs);
  const readerChunks: ReaderChunk[] = chunkForReader(fullContent);
  const chunkToParagraph = new Map<number, number>();
  readerChunks.forEach((c) => chunkToParagraph.set(c.index, c.paragraphIndex));

  // Voice string is the per-work narration cache key (passed from page).
  // See lib/tts/narration.ts → narrationVoiceString().
  const chunkUrl = (i: number) =>
    `/audio/${workSlug}/${chapter.slug}/${voice}/${i}.mp3`;
  const totalChunks = readerChunks.length;

  // Track dirty state
  const lastSavedRef = useRef({ title: chapter.title, content: chapter.content, status: chapter.status });
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const content = joinParagraphs(paragraphs);
    const changed =
      title !== lastSavedRef.current.title ||
      content !== lastSavedRef.current.content ||
      status !== lastSavedRef.current.status;
    if (!changed) return;
    setDirty(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void save(), 700);
    return () => { if (timer.current) clearTimeout(timer.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paragraphs, title, status]);

  async function save() {
    setSaving(true);
    try {
      const content = joinParagraphs(paragraphs);
      const res = await fetch(
        `/api/works/${encodeURIComponent(workSlug)}/chapters/${encodeURIComponent(chapter.slug)}`,
        {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ title, content, status }),
        },
      );
      if (res.ok) {
        const data = await res.json();
        lastSavedRef.current = { title, content, status };
        setSavedAt(new Date().toLocaleTimeString("zh-Hant"));
        setDirty(false);
        if (data.renamedTo && data.renamedTo !== chapter.slug) {
          router.replace(`/studio/works/${encodeURIComponent(workSlug)}/editor/${encodeURIComponent(data.renamedTo)}`);
        } else {
          router.refresh();
        }
      }
    } finally {
      setSaving(false);
    }
  }

  // ── Paragraph editing ─────────────────────────────────────────
  function updateParagraph(index: number, text: string) {
    setParagraphs((prev) => prev.map((p, i) => (i === index ? text : p)));
  }

  function addParagraphAfter(index: number) {
    setParagraphs((prev) => {
      const next = [...prev];
      next.splice(index + 1, 0, "");
      return next;
    });
  }

  function deleteParagraph(index: number) {
    setParagraphs((prev) => prev.filter((_, i) => i !== index));
  }

  function moveParagraph(index: number, delta: number) {
    const target = index + delta;
    if (target < 0 || target >= paragraphs.length) return;
    setParagraphs((prev) => {
      const next = [...prev];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }

  // ── TTS playback ──────────────────────────────────────────────
  async function playChunk(idx: number) {
    if (idx >= totalChunks) {
      setPlayingChunk(-1);
      return;
    }
    setPlayingChunk(idx);
    const audio = audioRef.current;
    if (!audio) return;

    if (!cacheStatus.has(idx)) {
      try {
        const res = await fetch("/api/tts", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ workSlug, chapterSlug: chapter.slug, only: [idx] }),
        });
        if (res.ok) setCacheStatus((prev) => new Set(prev).add(idx));
      } catch {}
    }

    audio.src = chunkUrl(idx);
    audio.playbackRate = playbackRate;
    audio.play().catch(() => setPlayingChunk(-1));
  }

  function onAudioEnded() {
    const next = playingChunk + 1;
    if (next < totalChunks) {
      playChunk(next);
    } else {
      setPlayingChunk(-1);
    }
  }

  async function prefetchAll() {
    try {
      await fetch("/api/tts/prefetch", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ workSlug, chapterSlug: chapter.slug }),
      });
      // Check all cached
      const cached = new Set<number>();
      for (let i = 0; i < totalChunks; i++) {
        try {
          const r = await fetch(chunkUrl(i), { method: "HEAD" });
          if (r.ok) cached.add(i);
        } catch {}
      }
      setCacheStatus(cached);
    } catch {}
  }

  // Check cache on mount
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const cached = new Set<number>();
      for (let i = 0; i < Math.min(totalChunks, 10); i++) {
        if (cancelled) return;
        try {
          const r = await fetch(chunkUrl(i), { method: "HEAD" });
          if (r.ok) cached.add(i);
        } catch {}
      }
      if (!cancelled) setCacheStatus(cached);
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const wordCount = countWords(fullContent);
  const isFinal = status === "final";

  // Group reader chunks by paragraph for TTS lookup
  const paragraphToChunks = new Map<number, number[]>();
  readerChunks.forEach((c) => {
    const arr = paragraphToChunks.get(c.paragraphIndex) ?? [];
    arr.push(c.index);
    paragraphToChunks.set(c.paragraphIndex, arr);
  });

  return (
    <div className="space-y-4">
      {/* Title + toolbar */}
      <div className="flex items-center justify-between gap-3">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="flex-1 font-serif text-3xl bg-transparent border-0 border-b border-stone-200 focus:border-stone-500 focus:outline-none pb-2"
        />
        <div className="flex gap-2 shrink-0">
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value as ChapterStatus)}
            className="text-xs px-2 py-1 border border-stone-300 rounded bg-white"
          >
            <option value="draft">草稿</option>
            <option value="final">完稿</option>
          </select>
          <button
            onClick={prefetchAll}
            className="text-xs px-3 py-1 border border-purple-300 bg-purple-50 text-purple-800 rounded hover:bg-purple-100"
            title="背景跑完這章所有 TTS"
          >
            🔊 整章朗讀
          </button>
        </div>
      </div>

      <div className="flex items-center justify-between text-sm text-stone-500">
        <span>{formatWordCount(wordCount)} · {paragraphs.length} 段</span>
        <span>{saving ? "儲存中…" : dirty ? "未儲存" : savedAt ? `已儲存 ${savedAt}` : "已同步"}</span>
      </div>

      <audio ref={audioRef} onEnded={onAudioEnded} className="hidden" />

      {/* Paragraphs — continuous text flow, no card separation */}
      <div className="p-6 bg-white border border-stone-200 rounded-md min-h-[60vh]">
        {paragraphs.map((para, pi) => {
          const chunkIndices = paragraphToChunks.get(pi) ?? [];
          const firstChunk = chunkIndices[0] ?? -1;
          const isPlaying = chunkIndices.includes(playingChunk);
          const isCached = chunkIndices.length > 0 && chunkIndices.every((ci) => cacheStatus.has(ci));
          const html = marked.parse(para || "（空白段）", { async: false }) as string;

          return (
            <ParagraphCard
              key={pi}
              index={pi}
              markdown={para}
              html={html}
              isFinal={isFinal}
              isPlaying={isPlaying}
              isCached={isCached}
              canMoveUp={pi > 0}
              canMoveDown={pi < paragraphs.length - 1}
              onChange={(text) => updateParagraph(pi, text)}
              onPlay={() => playChunk(firstChunk)}
              onPause={() => { audioRef.current?.pause(); setPlayingChunk(-1); }}
              onAddAfter={() => addParagraphAfter(pi)}
              onDelete={() => deleteParagraph(pi)}
              onMoveUp={() => moveParagraph(pi, -1)}
              onMoveDown={() => moveParagraph(pi, 1)}
            />
          );
        })}
      </div>

      {/* Add paragraph at end */}
      {!isFinal && (
        <button
          onClick={() => setParagraphs((prev) => [...prev, ""])}
          className="w-full py-2 border border-dashed border-stone-300 rounded-md text-sm text-stone-500 hover:border-stone-500 hover:text-stone-700"
        >
          ＋ 新增段落
        </button>
      )}

      {/* Floating TTS bar */}
      <div className="fixed bottom-6 right-6 left-6 md:left-auto md:w-96 bg-white border border-stone-300 rounded-lg shadow-lg p-3 z-30">
        <div className="flex items-center gap-3">
          {playingChunk >= 0 ? (
            <>
              <button
                onClick={() => { audioRef.current?.pause(); setPlayingChunk(-1); }}
                className="w-9 h-9 rounded-full bg-stone-900 text-stone-50 flex items-center justify-center"
              >
                ❚❚
              </button>
              <span className="text-xs text-stone-500 flex-1">
                段 {playingChunk + 1} / {totalChunks}
                {cacheStatus.size >= totalChunks && totalChunks > 0 && " · ✓ 全部已快取"}
              </span>
              <button
                onClick={() => playChunk(playingChunk + 1)}
                disabled={playingChunk >= totalChunks - 1}
                className="text-stone-500 hover:text-stone-900 disabled:opacity-30 text-sm"
              >
                ⏭
              </button>
            </>
          ) : (
            <>
              <button
                onClick={() => playChunk(0)}
                className="w-9 h-9 rounded-full bg-stone-900 text-stone-50 flex items-center justify-center"
              >
                ▶
              </button>
              <span className="text-xs text-stone-500 flex-1">
                {totalChunks} 段
                {cacheStatus.size > 0 ? ` · 已快取 ${cacheStatus.size}` : ""}
              </span>
              <select
                value={playbackRate}
                onChange={(e) => setPlaybackRate(Number(e.target.value))}
                className="text-xs border border-stone-300 rounded px-1 py-0.5 bg-white"
              >
                {[0.75, 1, 1.25, 1.5, 1.75, 2].map((r) => (
                  <option key={r} value={r}>{r}×</option>
                ))}
              </select>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Single paragraph card ───────────────────────────────────────
function ParagraphCard({
  index,
  markdown,
  html,
  isFinal,
  isPlaying,
  isCached,
  canMoveUp,
  canMoveDown,
  onChange,
  onPlay,
  onPause,
  onAddAfter,
  onDelete,
  onMoveUp,
  onMoveDown,
}: {
  index: number;
  markdown: string;
  html: string;
  isFinal: boolean;
  isPlaying: boolean;
  isCached: boolean;
  canMoveUp: boolean;
  canMoveDown: boolean;
  onChange: (text: string) => void;
  onPlay: () => void;
  onPause: () => void;
  onAddAfter: () => void;
  onDelete: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [editText, setEditText] = useState(markdown);

  // Sync editText when markdown changes externally and not editing.
  useEffect(() => {
    if (!editing) setEditText(markdown);
  }, [markdown, editing]);

  return (
    <div className={`group relative transition-colors mb-1 ${
      isPlaying ? "bg-amber-50/60 -mx-3 px-3 rounded" : ""
    }`}>
      {editing ? (
        <textarea
          autoFocus
          value={editText}
          onChange={(e) => setEditText(e.target.value)}
          onBlur={() => { onChange(editText); setEditing(false); }}
          onKeyDown={(e) => {
            if (e.key === "Escape") { setEditText(markdown); setEditing(false); }
            if (e.key === "Enter" && e.metaKey) { onChange(editText); setEditing(false); }
          }}
          rows={Math.max(3, editText.split("\n").length + 1)}
          className="w-full font-serif text-base leading-relaxed resize-y focus:outline-none border-l-2 border-stone-300 pl-3 bg-stone-50/50"
        />
      ) : (
        <div
          className="prose-reader cursor-text"
          dangerouslySetInnerHTML={{ __html: html }}
          onClick={() => !isFinal && setEditing(true)}
        />
      )}

      {/* Tooltip-style action bar — floats at paragraph bottom-left, zero layout impact */}
      {!editing && (
        <div className="absolute left-0 top-full flex items-center gap-1 px-2 py-0.5 bg-stone-100 border border-stone-200 rounded shadow-sm text-[11px] opacity-0 group-hover:opacity-100 pointer-events-none group-hover:pointer-events-auto transition-opacity duration-100 z-10">
          {!isFinal && (
            <>
              <button onClick={isPlaying ? onPause : onPlay} className={`leading-none ${isPlaying ? "text-amber-700" : "text-stone-500 hover:text-stone-900"}`} title={isPlaying ? "暫停" : isCached ? "播放" : "生成"}>{isPlaying ? "❚❚" : "▶"}</button>
              <button onClick={onAddAfter} className="text-stone-500 hover:text-stone-900 leading-none" title="下方加段">＋</button>
              {canMoveUp && <button onClick={onMoveUp} className="text-stone-500 hover:text-stone-900 leading-none" title="上移">↑</button>}
              {canMoveDown && <button onClick={onMoveDown} className="text-stone-500 hover:text-stone-900 leading-none" title="下移">↓</button>}
              <button onClick={onDelete} className="text-stone-500 hover:text-red-600 leading-none" title="刪除">✕</button>
            </>
          )}
          {isFinal && (
            <button onClick={isPlaying ? onPause : onPlay} className={`leading-none ${isPlaying ? "text-amber-700" : "text-stone-500 hover:text-stone-900"}`} title={isPlaying ? "暫停" : isCached ? "播放" : "生成"}>{isPlaying ? "❚❚" : "▶"}</button>
          )}
        </div>
      )}
    </div>
  );
}
