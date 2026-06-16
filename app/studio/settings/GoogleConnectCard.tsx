"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { AIProviderName } from "@/lib/auth/token-store";

interface Props {
  configured: boolean;
  connected: boolean;
  email: string | null;
  activeProvider: AIProviderName;
  geminiModel: string | null;
  zaiConfigured: boolean;
  zaiModel: string | null;
}

export default function GoogleConnectCard({
  configured,
  connected: initialConnected,
  email: initialEmail,
  activeProvider: initialProvider,
  geminiModel: initialGeminiModel,
  zaiConfigured,
  zaiModel,
}: Props) {
  const router = useRouter();
  const [connected, setConnected] = useState(initialConnected);
  const [email, setEmail] = useState(initialEmail);
  const [activeProvider, setActiveProvider] = useState<AIProviderName>(initialProvider);
  const [geminiModel, setGeminiModel] = useState(initialGeminiModel ?? "");
  const [busy, setBusy] = useState<null | "connect" | "disconnect" | "provider" | "model">(null);
  const [error, setError] = useState<string | null>(null);

  // Pick up ?google_connected=1 / ?google_error=... after OAuth redirect.
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
      setActiveProvider(data.activeProvider);
      setGeminiModel(data.geminiModel ?? "");
    } catch {}
  }

  function handleConnect() {
    setBusy("connect");
    // Browser handles the redirect; no fetch.
    window.location.href = "/api/auth/google/start";
  }

  async function handleDisconnect() {
    if (!confirm("確定要解除 Google 連線嗎？")) return;
    setBusy("disconnect");
    try {
      const res = await fetch("/api/auth/google/disconnect", { method: "POST" });
      if (res.ok) {
        setConnected(false);
        setEmail(null);
        if (activeProvider === "gemini-oauth") setActiveProvider("zai");
        router.refresh();
      }
    } finally {
      setBusy(null);
    }
  }

  async function handleProviderChange(next: AIProviderName) {
    setBusy("provider");
    setError(null);
    try {
      const res = await fetch("/api/auth/google/provider", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ provider: next }),
      });
      if (res.ok) {
        const data = await res.json();
        setActiveProvider(data.activeProvider);
        router.refresh();
      } else {
        const err = await res.json().catch(() => ({}));
        setError(err.error ?? "切換失敗");
      }
    } finally {
      setBusy(null);
    }
  }

  async function handleSaveModel() {
    setBusy("model");
    try {
      const res = await fetch("/api/auth/google/provider", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ geminiModel: geminiModel.trim() || null }),
      });
      if (res.ok) router.refresh();
    } finally {
      setBusy(null);
    }
  }

  if (!configured) {
    return (
      <div className="text-sm text-stone-600 space-y-2">
        <p>Google OAuth 尚未設定。在 <code>.env</code> 填入 <code>GOOGLE_CLIENT_ID</code> / <code>GOOGLE_CLIENT_SECRET</code> / <code>GOOGLE_REDIRECT_URI</code>。</p>
        <p className="text-stone-500">設定步驟見 <code>.env.example</code>。</p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Connection status */}
      <div className="border border-stone-300 rounded-md p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm font-medium">
              {connected ? `✓ 已連線：${email}` : "✗ 尚未連線"}
            </div>
            <div className="text-xs text-stone-500 mt-0.5">
              連線後可用 Gemini 系列模型，用量計到你的 Google 帳單
            </div>
          </div>
          <div className="flex gap-2">
            {!connected && (
              <button
                onClick={handleConnect}
                disabled={busy === "connect"}
                className="text-xs px-3 py-1.5 bg-stone-900 text-stone-50 rounded hover:bg-stone-700 disabled:opacity-40"
              >
                {busy === "connect" ? "連線中…" : "連線 Google"}
              </button>
            )}
            {connected && (
              <button
                onClick={handleDisconnect}
                disabled={busy === "disconnect"}
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

      {/* Provider selector */}
      <div className="border border-stone-300 rounded-md p-4 space-y-3">
        <div className="text-sm font-medium">使用中的 AI provider</div>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => handleProviderChange("zai")}
            disabled={busy !== null || !zaiConfigured}
            className={`text-xs px-3 py-1.5 rounded border ${
              activeProvider === "zai"
                ? "bg-stone-900 text-stone-50 border-stone-900"
                : "border-stone-300 hover:bg-stone-100"
            } disabled:opacity-40`}
          >
            z.ai {zaiModel ? `(${zaiModel})` : ""}
          </button>
          <button
            onClick={() => handleProviderChange("gemini-oauth")}
            disabled={busy !== null || !connected}
            className={`text-xs px-3 py-1.5 rounded border ${
              activeProvider === "gemini-oauth"
                ? "bg-stone-900 text-stone-50 border-stone-900"
                : "border-stone-300 hover:bg-stone-100"
            } disabled:opacity-40`}
            title={!connected ? "需先連線 Google" : undefined}
          >
            Gemini (OAuth)
          </button>
        </div>
        {!zaiConfigured && (
          <div className="text-[11px] text-amber-700">z.ai 未設定（缺 <code>ZAI_API_KEY</code>）</div>
        )}
      </div>

      {/* Gemini model override */}
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
