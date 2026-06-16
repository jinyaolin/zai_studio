import { redirect } from "next/navigation";
import Link from "next/link";
import { isTTSConfigured, getCurrentVoice } from "@/lib/tts/provider";
import { isGoogleConfigured } from "@/lib/auth/google-oauth";
import {
  loadGoogleTokens,
  loadAISettings,
} from "@/lib/auth/token-store";
import { getCurrentUserId } from "@/lib/auth/session";
import LogoutButton from "./LogoutButton";
import GoogleConnectCard from "./GoogleConnectCard";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const userId = await getCurrentUserId();
  if (!userId) redirect("/studio/login");

  const ttsReady = isTTSConfigured();
  const googleConfigured = isGoogleConfigured();
  const [tokenData, settings] = await Promise.all([
    loadGoogleTokens(userId),
    loadAISettings(userId),
  ]);

  return (
    <div className="max-w-2xl mx-auto px-8 py-10">
      <div className="mb-6">
        <Link href="/studio" className="text-sm text-stone-500 hover:text-stone-700">
          ← 作品列表
        </Link>
      </div>

      <h1 className="font-serif text-3xl mb-8">設定</h1>

      <section className="space-y-4">
        <h2 className="font-serif text-xl text-stone-700">AI 模型（Gemini）</h2>
        <GoogleConnectCard
          configured={googleConfigured}
          connected={tokenData !== null}
          email={tokenData?.userInfo.email ?? null}
          geminiModel={settings.geminiModel ?? null}
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

      <section>
        <LogoutButton />
      </section>
    </div>
  );
}
