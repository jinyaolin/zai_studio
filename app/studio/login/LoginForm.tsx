"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export default function LoginForm({ next }: { next?: string }) {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ password }),
    });
    if (res.ok) {
      router.push(next && next.startsWith("/") ? next : "/studio");
      router.refresh();
    } else {
      setError("密碼不正確");
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <input
        type="password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        autoFocus
        placeholder="密碼"
        className="w-full px-4 py-3 border border-stone-300 rounded-md bg-white focus:outline-none focus:ring-2 focus:ring-stone-400"
      />
      {error && <p className="text-sm text-red-700">{error}</p>}
      <button
        type="submit"
        disabled={submitting || !password}
        className="w-full px-4 py-3 bg-stone-900 text-stone-50 rounded-md hover:bg-stone-800 disabled:opacity-50"
      >
        {submitting ? "登入中…" : "登入"}
      </button>
    </form>
  );
}
