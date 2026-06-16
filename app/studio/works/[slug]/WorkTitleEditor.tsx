"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

const DEBOUNCE_MS = 700;

export default function WorkTitleEditor({
  workSlug,
  initialTitle,
}: {
  workSlug: string;
  initialTitle: string;
}) {
  const router = useRouter();
  const [title, setTitle] = useState(initialTitle);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Track the "live" slug — when a draft rename happens, subsequent saves
  // must target the new slug, not the URL's stale one.
  const liveSlugRef = useRef(workSlug);
  const lastSavedRef = useRef(initialTitle);

  useEffect(() => {
    if (title === lastSavedRef.current) return;
    setDirty(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void save(title), DEBOUNCE_MS);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [title]);

  async function save(snapshot: string) {
    if (snapshot === lastSavedRef.current) return;
    setSaving(true);
    try {
      const res = await fetch(
        `/api/works/${encodeURIComponent(liveSlugRef.current)}`,
        {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ title: snapshot }),
        },
      );
      if (res.ok) {
        const { renamedTo } = await res.json();
        lastSavedRef.current = snapshot;
        setSavedAt(new Date().toLocaleTimeString("zh-Hant"));
        setDirty(false);
        if (renamedTo && renamedTo !== liveSlugRef.current) {
          liveSlugRef.current = renamedTo;
          // Swap the URL so links / future saves target the new slug.
          router.replace(`/studio/works/${encodeURIComponent(renamedTo)}`);
        } else {
          router.refresh();
        }
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex items-baseline gap-3">
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        className="font-serif text-4xl bg-transparent border-0 border-b border-transparent hover:border-stone-200 focus:border-stone-500 focus:outline-none flex-1 pb-1"
        maxLength={120}
      />
      <span className="text-xs text-stone-400 shrink-0">
        {saving ? "儲存中…" : dirty ? "未儲存" : savedAt ? `已儲存 ${savedAt}` : ""}
      </span>
    </div>
  );
}
