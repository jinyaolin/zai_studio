import Link from "next/link";
import { isAIConfigured, getCurrentModel } from "@/lib/ai/provider";
import { isTTSConfigured, getCurrentVoice } from "@/lib/tts/provider";
import LogoutButton from "./LogoutButton";

export const dynamic = "force-dynamic";

export default function SettingsPage() {
  const aiReady = isAIConfigured();
  const ttsReady = isTTSConfigured();

  return (
    <div className="max-w-2xl mx-auto px-8 py-10">
      <div className="mb-6">
        <Link href="/studio" className="text-sm text-stone-500 hover:text-stone-700">
          ← 作品列表
        </Link>
      </div>

      <h1 className="font-serif text-3xl mb-8">設定</h1>

      <section className="space-y-4">
        <h2 className="font-serif text-xl text-stone-700">AI 模型 (zai)</h2>
        <dl className="grid grid-cols-[120px_1fr] gap-y-2 text-sm">
          <dt className="text-stone-500">狀態</dt>
          <dd>{aiReady ? "✓ 已設定" : "✗ 未設定"}</dd>
          <dt className="text-stone-500">模型</dt>
          <dd><code>{aiReady ? getCurrentModel() : "—"}</code></dd>
          <dt className="text-stone-500">Base URL</dt>
          <dd><code>{process.env.ZAI_BASE_URL ?? "(default)"}</code></dd>
        </dl>
      </section>

      <hr className="my-8 border-stone-200" />

      <section className="space-y-4">
        <h2 className="font-serif text-xl text-stone-700">TTS 語音</h2>
        <dl className="grid grid-cols-[120px_1fr] gap-y-2 text-sm">
          <dt className="text-stone-500">狀態</dt>
          <dd>{ttsReady ? "✓ 已設定" : "✗ 未設定"}</dd>
          <dt className="text-stone-500">語音</dt>
          <dd><code>{getCurrentVoice()}</code></dd>
          <dt className="text-stone-500">模型</dt>
          <dd><code>{process.env.TTS_MODEL ?? "tts-1"}</code></dd>
        </dl>
      </section>

      <hr className="my-8 border-stone-200" />

      <section className="space-y-3">
        <h2 className="font-serif text-xl text-stone-700">變更設定</h2>
        <p className="text-sm text-stone-600">
          所有設定都在專案根目錄的 <code>.env</code>（從 <code>.env.example</code> 複製）。
          改完後重啟 dev server：<code>npm run dev</code>。
        </p>
        <pre className="text-xs bg-stone-100 p-3 rounded overflow-x-auto"><code>{`ZAI_BASE_URL=...
ZAI_API_KEY=...
ZAI_MODEL=...

TTS_BASE_URL=...
TTS_API_KEY=...
TTS_MODEL=tts-1
TTS_VOICE=alloy

AUTH_PASSWORD=...
AUTH_COOKIE_SECRET=...`}</code></pre>
      </section>

      <hr className="my-8 border-stone-200" />

      <section>
        <LogoutButton />
      </section>
    </div>
  );
}
