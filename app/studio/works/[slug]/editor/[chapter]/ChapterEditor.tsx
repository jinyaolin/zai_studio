"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Chapter, WorkMemory } from "@/lib/types";
import ParagraphEditor from "./ParagraphEditor";
import VersionHistory from "./VersionHistory";
import MemorySyncModal from "../../design/[chapter]/MemorySyncModal";

export default function ChapterEditor({
  workSlug,
  initialChapter,
  voice,
}: {
  workSlug: string;
  initialChapter: Chapter;
  voice: string;
}) {
  const router = useRouter();
  const [versionOpen, setVersionOpen] = useState(false);
  const [syncOpen, setSyncOpen] = useState(false);
  const [memoryCache, setMemoryCache] = useState<WorkMemory | null>(null);

  async function openSyncModal() {
    const res = await fetch(`/api/works/${encodeURIComponent(workSlug)}/memory`);
    if (res.ok) {
      const { memory } = await res.json();
      setMemoryCache(memory);
      setSyncOpen(true);
    }
  }

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex gap-2">
          <button
            onClick={() => setVersionOpen(true)}
            className="text-xs px-3 py-1 border border-stone-300 rounded hover:bg-stone-100 text-stone-700"
          >
            📜 版本
          </button>
          <button
            onClick={openSyncModal}
            className="text-xs px-3 py-1 border border-stone-300 rounded hover:bg-stone-100 text-stone-700"
            title="讓 zai 讀這章，把新東西沉澇進記憶"
          >
            🧠 同步記憶
          </button>
        </div>
        <div className="flex gap-2">
          <a
            href={`/studio/works/${encodeURIComponent(workSlug)}/design/${encodeURIComponent(initialChapter.slug)}`}
            className="text-xs px-3 py-1 bg-amber-700 text-white rounded hover:bg-amber-800"
          >
            ✨ 深度創作
          </a>
        </div>
      </div>

      {/* Paragraph editor with TTS */}
      <ParagraphEditor workSlug={workSlug} chapter={initialChapter} voice={voice} />

      {/* Modals */}
      {versionOpen && (
        <VersionHistory
          workSlug={workSlug}
          chapterSlug={initialChapter.slug}
          onRestore={async () => {
            const res = await fetch(
              `/api/works/${encodeURIComponent(workSlug)}/chapters/${encodeURIComponent(initialChapter.slug)}`,
            );
            if (res.ok) router.refresh();
          }}
          onClose={() => setVersionOpen(false)}
        />
      )}

      {syncOpen && memoryCache && (
        <MemorySyncModal
          workSlug={workSlug}
          source={{ kind: "chapter", chapterSlug: initialChapter.slug }}
          currentMemory={memoryCache}
          title="🧠 從這章提取記憶…"
          onClose={() => setSyncOpen(false)}
          onApplied={() => router.refresh()}
        />
      )}
    </div>
  );
}
