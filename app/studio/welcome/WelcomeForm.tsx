"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { handleSlugify } from "@/lib/content/handle";

interface Props {
  email: string;
  suggested: string;
}

export default function WelcomeForm({ email, suggested }: Props) {
  const router = useRouter();
  const [handle, setHandle] = useState(suggested);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const cleaned = handleSlugify(handle);
    if (!cleaned) {
      setError("代稱不能為空");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/handle", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ handle: cleaned }),
      });
      if (res.ok) {
        router.push("/studio");
        router.refresh();
      } else {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? "設定失敗");
        setBusy(false);
      }
    } catch {
      setError("網路錯誤");
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div className="text-sm text-stone-500">
        登入 email：<code className="text-stone-700">{email}</code>
      </div>
      <div>
        <label className="block text-xs text-stone-500 mb-1">使用者代稱</label>
        <div className="flex items-center gap-2">
          <span className="text-sm text-stone-500">/works/</span>
          <input
            type="text"
            value={handle}
            onChange={(e) => setHandle(e.target.value)}
            onBlur={() => setHandle(handleSlugify(handle))}
            autoFocus
            placeholder="your-name"
            className="flex-1 px-3 py-2 border border-stone-300 rounded bg-white font-mono text-sm"
          />
        </div>
        <p className="text-xs text-stone-400 mt-1">
          只能小寫英數字、連字號、底線。鎖定後不能改。
        </p>
      </div>
      {error && <p className="text-sm text-red-700">{error}</p>}
      <button
        type="submit"
        disabled={busy || !handle.trim()}
        className="w-full px-4 py-3 bg-stone-900 text-stone-50 rounded-md hover:bg-stone-800 disabled:opacity-50"
      >
        {busy ? "設定中…" : "確認，開始創作"}
      </button>
    </form>
  );
}
