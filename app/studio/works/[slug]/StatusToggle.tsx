"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { WorkStatus } from "@/lib/types";

const OPTIONS: { value: WorkStatus; label: string; cls: string }[] = [
  { value: "draft", label: "草稿", cls: "bg-stone-200 text-stone-700" },
  { value: "published", label: "發表", cls: "bg-emerald-100 text-emerald-800" },
  { value: "archived", label: "封存", cls: "bg-stone-300 text-stone-600" },
];

export default function StatusToggle({
  slug,
  status,
}: {
  slug: string;
  status: WorkStatus;
}) {
  const router = useRouter();
  const [current, setCurrent] = useState(status);

  async function change(next: WorkStatus) {
    if (next === current) return;
    setCurrent(next);
    await fetch(`/api/works/${encodeURIComponent(slug)}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ status: next }),
    });
    router.refresh();
  }

  return (
    <div className="inline-flex items-center gap-2 text-sm">
      <span className="text-stone-500">狀態：</span>
      <div className="flex gap-1">
        {OPTIONS.map((o) => (
          <button
            key={o.value}
            type="button"
            onClick={() => change(o.value)}
            className={`px-3 py-1 rounded text-xs transition ${
              current === o.value
                ? o.cls + " font-medium"
                : "text-stone-500 hover:bg-stone-200"
            }`}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}
