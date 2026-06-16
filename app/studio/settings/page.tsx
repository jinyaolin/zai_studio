import Link from "next/link";
import { isAIConfigured, getCurrentModel } from "@/lib/ai/provider";
import { isTTSConfigured, getCurrentVoice } from "@/lib/tts/provider";
import { isGoogleConfigured } from "@/lib/auth/google-oauth";
import { loadAISettings, loadGoogleTokens } from "@/lib/auth/token-store";
import LogoutButton from "./LogoutButton";
import GoogleConnectCard from "./GoogleConnectCard";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const aiReady = isAIConfigured();
  const ttsReady = isTTSConfigured();
  const googleConfigured = isGoogleConfigured();
  const [settings, tokenData] = await Promise.all([loadAISettings(), loadGoogleTokens()]);
  const connected = tokenData !== null;
  const connectedEmail = tokenData?.userInfo.email ?? null;

  return (
    <div className="max-w-2xl mx-auto px-8 py-10">
      <div className="mb-6">
        <Link href="/studio" className="text-sm text-stone-500 hover:text-stone-700">
          ← 作品列表
        </Link>
      </div>

      <h1 className="font-serif text-3xl mb-8">設定</h1>

      {/* Active provider selector */}
      <section className="space-y-4">
        <h2 className="font-serif text-xl text-stone-700">AI 模型</h2>
        <GoogleConnectCard
          configured={googleConfigured}
          connected={connected}
          email={connectedEmail}
          activeProvider={settings.activeProvider}
          geminiModel={settings.geminiModel ?? null}
          zaiConfigured={aiReady}
          zaiModel={aiReady ? getCurrentModel() : null}
        />
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
        <h2 className="font-serif text-xl text-stone-700">環境變數</h2>
        <p className="text-sm text-stone-600">
          z.ai / TTS / CosyVoice 的設定都在專案根目錄的 <code>.env</code>（從 <code>.env.example</code> 複製）。
          Google OAuth 也在那裡。改完後重啟 dev server：<code>npm run dev</code>。
        </p>
      </section>

      <hr className="my-8 border-stone-200" />

      <section>
        <LogoutButton />
      </section>
    </div>
  );
}
