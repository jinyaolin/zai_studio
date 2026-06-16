"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

interface Props {
  configured: boolean;
  connected: boolean;
  email: string | null;
  geminiModel: string | null;
}

export default function GoogleConnectCard({
  configured,
  connected: initialConnected,
  email: initialEmail,
  geminiModel: initialGeminiModel,
}: Props) {
  const router = useRouter();
  const [connected, setConnected] = useState(initialConnected);
  const [email, setEmail] = useState(initialEmail);
  const [geminiModel, setGeminiModel] = useState(initialGeminiModel ?? "");
  const [busy, setBusy] = useState<null | "connect" | "disconnect" | "model">(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("google_connected")) {
      params.delete("google_connected");
      router.replace(`/studio/settings?${params.toString()}`);
      refreshStatus();
    }
    const err = params.get("google_error");
    if (err) {
      setError(decodeURIComponent(err));
      params.delete("google_error");
      router.replace(`/studio/settings?${params.toString()}`);
    }
  }, [router]);

  async function refreshStatus() {
    try {
      const res = await fetch("/api/auth/google/status");
      if (!res.ok) return;
      const data = await res.json();
      setConnected(Boolean(data.connected));
      setEmail(data.email ?? null);
      setGeminiModel(data.geminiModel ?? "");
    } catch {}
  }

  function handleConnect() {
    setBusy("connect");
    window.location.href = "/api/auth/google/start";
  }

  async function handleDisconnect() {
    if (!confirm("確定要解除 Google 連線嗎？所有 AI 功能會停止，直到重新連線。")) return;
    setBusy("disconnect");
    try {
      const res = await fetch("/api/auth/google/disconnect", { method: "POST" });
      if (res.ok) {
        setConnected(false);
        setEmail(null);
        router.refresh();
      }
    } finally {
      setBusy(null);
    }
  }

  async function handleSaveModel() {
    setBusy("model");
    try {
      await fetch("/api/auth/google/model", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ geminiModel: geminiModel.trim() || null }),
      });
      router.refresh();
    } finally {
      setBusy(null);
    }
  }

  if (!configured) {
    return (
      <div className="text-sm text-stone-600 space-y-2">
        <p>Google OAuth 尚未設定。請在 <code>.env</code> 填入 <code>GOOGLE_CLIENT_ID</code> / <code>GOOGLE_CLIENT_SECRET</code> / <code>GOOGLE_REDIRECT_URI</code> 並重啟 server。</p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="border border-stone-300 rounded-md p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm font-medium">
              {connected ? `✓ 已連線：${email}` : "✗ 尚未連線"}
            </div>
            <div className="text-xs text-stone-500 mt-0.5">
              連線後可用你的 Gemini quota 進行 AI 創作（chat / Design / 記憶擷取）
            </div>
          </div>
          <div className="flex gap-2">
            {!connected && (
              <button
                onClick={handleConnect}
                disabled={busy !== null}
                className="text-xs px-3 py-1.5 bg-stone-900 text-stone-50 rounded hover:bg-stone-700 disabled:opacity-40"
              >
                {busy === "connect" ? "連線中…" : "連線 Google"}
              </button>
            )}
            {connected && (
              <button
                onClick={handleDisconnect}
                disabled={busy !== null}
                className="text-xs px-3 py-1.5 border border-stone-300 rounded hover:bg-stone-100 disabled:opacity-40"
              >
                {busy === "disconnect" ? "處理中…" : "解除連線"}
              </button>
            )}
          </div>
        </div>
        {error && (
          <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded px-2 py-1">
            {error}
          </div>
        )}
      </div>

      <div className="border border-stone-300 rounded-md p-4 space-y-2">
        <label className="block">
          <div className="text-sm font-medium mb-1">Gemini 模型（可選）</div>
          <input
            type="text"
            value={geminiModel}
            onChange={(e) => setGeminiModel(e.target.value)}
            placeholder="gemini-2.5-pro（預設）/ gemini-2.5-flash / gemini-2.0-flash-exp"
            className="w-full text-sm px-2 py-1.5 border border-stone-300 rounded bg-white font-mono"
          />
        </label>
        <div className="flex items-center gap-3">
          <button
            onClick={handleSaveModel}
            disabled={busy !== null}
            className="text-xs px-3 py-1 border border-stone-300 rounded hover:bg-stone-100 disabled:opacity-40"
          >
            {busy === "model" ? "儲存中…" : "儲存模型"}
          </button>
          <span className="text-[11px] text-stone-400">空白走預設（gemini-2.5-pro）</span>
        </div>
      </div>
    </div>
  );
}
