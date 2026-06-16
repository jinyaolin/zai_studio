"use client";

import { useEffect, useRef, useState } from "react";
import type { AudioChunk } from "@/lib/types";

interface Paragraph {
  html: string;
  chunkIndices: number[];
}

export default function ReaderChapter({
  workSlug,
  chapterSlug,
  paragraphs,
  totalChunks,
  ttsReady,
  voice,
}: {
  workSlug: string;
  chapterSlug: string;
  paragraphs: Paragraph[];
  totalChunks: number;
  ttsReady: boolean;
  voice: string;
}) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(-1);   // which TTS chunk is playing
  const [playbackRate, setPlaybackRate] = useState(1);
  const [cacheStatus, setCacheStatus] = useState<Set<number>>(new Set()); // cached chunk indices
  const [prefetching, setPrefetching] = useState(false);
  const [loadedChunks, setLoadedChunks] = useState(0);

  // Voice is the per-work narration cache key, resolved server-side from
  // work.narration (see lib/tts/narration.ts → narrationVoiceString).
  const chunkUrl = (i: number) =>
    `/audio/${workSlug}/${chapterSlug}/${voice}/${i}.mp3`;

  // Build a flat list: chunk index → paragraph index (for highlighting).
  const chunkToParagraph = new Map<number, number>();
  paragraphs.forEach((p, pi) => p.chunkIndices.forEach((ci) => chunkToParagraph.set(ci, pi)));

  // The "play queue" is just 0, 1, 2, ..., totalChunks-1.
  const playFrom = async (chunkIndex: number) => {
    setCurrentIndex(chunkIndex);
    setPlaying(true);
    await ensureAndPlay(chunkIndex);
  };

  // Make sure chunk N's audio file exists (synthesize if needed), then play.
  async function ensureAndPlay(idx: number) {
    if (idx >= totalChunks) {
      setPlaying(false);
      setCurrentIndex(-1);
      return;
    }
    const audio = audioRef.current;
    if (!audio) return;

    // Check if already cached.
    const cached = cacheStatus.has(idx);
    if (!cached) {
      // Synthesize on-demand.
      try {
        const res = await fetch("/api/tts", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ workSlug, chapterSlug, only: [idx] }),
        });
        if (res.ok) {
          setCacheStatus((prev) => new Set(prev).add(idx));
        }
      } catch {
        // give up
      }
    }

    audio.src = chunkUrl(idx);
    audio.playbackRate = playbackRate;
    audio.play().catch(() => setPlaying(false));
  }

  // Audio ended → auto-advance.
  function onAudioEnded() {
    const next = currentIndex + 1;
    if (next < totalChunks) {
      setCurrentIndex(next);
      ensureAndPlay(next);
    } else {
      setPlaying(false);
      setCurrentIndex(-1);
    }
  }

  function togglePlay() {
    if (playing) {
      audioRef.current?.pause();
      setPlaying(false);
    } else {
      if (currentIndex === -1) {
        playFrom(0);
      } else {
        audioRef.current?.play().catch(() => {});
        setPlaying(true);
      }
    }
  }

  // Prefetch: fire background synth for all chunks.
  async function prefetchAll() {
    setPrefetching(true);
    try {
      const res = await fetch("/api/tts/prefetch", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ workSlug, chapterSlug }),
      });
      if (res.ok) {
        const data = await res.json();
        // Poll cache status until done.
        const poll = setInterval(async () => {
          let cached = 0;
          for (let i = 0; i < totalChunks; i++) {
            try {
              const r = await fetch(chunkUrl(i), { method: "HEAD" });
              if (r.ok) {
                cached++;
                setCacheStatus((prev) => {
                  const next = new Set(prev);
                  next.add(i);
                  return next;
                });
              }
            } catch {}
          }
          setLoadedChunks(cached);
          if (cached >= totalChunks) {
            clearInterval(poll);
            setPrefetching(false);
          }
        }, 3000);
      }
    } catch {
      setPrefetching(false);
    }
  }

  // Check which chunks are already cached on mount.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const cached = new Set<number>();
      // HEAD-check in small batches to avoid hammering.
      for (let i = 0; i < Math.min(totalChunks, 20); i++) {
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

  useEffect(() => {
    if (audioRef.current) audioRef.current.playbackRate = playbackRate;
  }, [playbackRate]);

  const currentParagraph =
    currentIndex >= 0 ? chunkToParagraph.get(currentIndex) ?? -1 : -1;
  const cachedCount = cacheStatus.size;

  return (
    <>
      {/* Per-paragraph text with play buttons */}
      <div className="prose-reader">
        {paragraphs.map((p, pi) => {
          const isCurrent = pi === currentParagraph && playing;
          const isCached = p.chunkIndices.every((ci) => cacheStatus.has(ci));
          return (
            <div
              key={pi}
              className={`group relative transition-colors ${
                isCurrent ? "bg-amber-50 -mx-3 px-3 rounded" : ""
              }`}
            >
              <button
                onClick={() => playFrom(p.chunkIndices[0])}
                className="absolute -left-8 top-1 opacity-0 group-hover:opacity-100 transition-opacity text-stone-400 hover:text-amber-700"
                title={isCached ? "播放此段" : "生成並播放此段"}
              >
                {isCurrent ? "❚❚" : "▶"}
              </button>
              <div dangerouslySetInnerHTML={{ __html: p.html }} />
            </div>
          );
        })}
      </div>

      <audio ref={audioRef} onEnded={onAudioEnded} className="hidden" />

      {/* Floating player */}
      <div className="fixed bottom-6 right-6 left-6 md:left-auto md:w-96 bg-white border border-stone-300 rounded-lg shadow-lg p-4 z-30">
        <div className="flex items-center gap-3">
          <button
            onClick={togglePlay}
            className="w-10 h-10 rounded-full bg-stone-900 text-stone-50 flex items-center justify-center hover:bg-stone-800 shrink-0"
          >
            {playing ? "❚❚" : "▶"}
          </button>
          <button
            onClick={() => currentIndex > 0 && playFrom(currentIndex - 1)}
            disabled={currentIndex <= 0}
            className="text-stone-500 hover:text-stone-900 disabled:opacity-30 text-sm"
          >
            ⏮
          </button>
          <button
            onClick={() => currentIndex >= 0 && playFrom(currentIndex + 1)}
            disabled={currentIndex >= totalChunks - 1}
            className="text-stone-500 hover:text-stone-900 disabled:opacity-30 text-sm"
          >
            ⏭
          </button>
          <div className="flex-1 min-w-0">
            <div className="text-xs text-stone-500">
              {currentIndex >= 0
                ? `段 ${currentIndex + 1} / ${totalChunks}`
                : `${totalChunks} 段`}
              {prefetching && ` · 預生成中 (${loadedChunks}/${totalChunks})`}
              {!prefetching && cachedCount > 0 && cachedCount < totalChunks && ` · 已快取 ${cachedCount}`}
              {!prefetching && cachedCount >= totalChunks && ` · ✓ 全部已快取`}
            </div>
            <div className="text-xs text-stone-400 truncate mt-0.5">
              {ttsReady
                ? currentParagraph >= 0
                  ? `正在播放第 ${currentParagraph + 1} 段`
                  : "點 ▶ 或點任一段左側 ▶ 開始朗讀"
                : "TTS 未啟用"}
            </div>
          </div>
          <select
            value={playbackRate}
            onChange={(e) => setPlaybackRate(Number(e.target.value))}
            className="text-xs border border-stone-300 rounded px-1 py-0.5 bg-white"
          >
            {[0.75, 1, 1.25, 1.5, 1.75, 2].map((r) => (
              <option key={r} value={r}>{r}×</option>
            ))}
          </select>
        </div>
        {ttsReady && cachedCount < totalChunks && !prefetching && (
          <button
            onClick={prefetchAll}
            className="mt-2 w-full text-xs px-3 py-1 bg-purple-700 text-white rounded hover:bg-purple-800"
          >
            🔊 預生成全部朗讀（{totalChunks - cachedCount} 段待合成）
          </button>
        )}
      </div>
    </>
  );
}
