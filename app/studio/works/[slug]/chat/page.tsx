import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { readMemory } from "@/lib/memory/store";
import { readWork } from "@/lib/content/works";
import { isAIConfiguredForUser } from "@/lib/ai/provider";
import { listConversations } from "@/lib/memory/conversations";
import { decodeParam } from "@/lib/utils/params";
import { getCurrentUserId } from "@/lib/auth/session";
import ChatPanel from "./ChatPanel";

export const dynamic = "force-dynamic";

export default async function ChatPage({
  params,
}: {
  params: { slug: string };
}) {
  const userId = await getCurrentUserId();
  if (!userId) redirect("/studio/login");

  const slug = decodeParam(params.slug);
  let work;
  try {
    work = await readWork(userId, slug);
  } catch {
    notFound();
  }
  const memory = await readMemory(userId, slug);
  const conversations = await listConversations(userId, slug);
  const aiReady = await isAIConfiguredForUser(userId);
  const encoded = encodeURIComponent(slug);

  const memoryStats = [
    `角色 ${memory.characters.length}`,
    `世界觀 ${memory.worldbuilding.length}`,
    `情節線 ${memory.plot.length}`,
    memory.style.trim() ? "風格 ✓" : "風格 —",
  ];

  return (
    <div className="max-w-5xl mx-auto px-8 py-10">
      <div className="mb-6">
        <Link
          href={`/studio/works/${encoded}`}
          className="text-sm text-stone-500 hover:text-stone-700"
        >
          ← 回作品
        </Link>
      </div>

      <header className="mb-6">
        <h1 className="font-serif text-3xl">對話 · {work.title}</h1>
        <div className="flex flex-wrap gap-3 mt-2 text-xs text-stone-500">
          <span>模型：{aiReady ? "(gemini)" : "未連結"}</span>
          <span>·</span>
          <span>{memoryStats.join(" · ")}</span>
          <span>·</span>
          <Link
            href={`/studio/works/${encoded}/memory`}
            className="underline hover:text-stone-700"
          >
            編輯記憶
          </Link>
        </div>
        {!aiReady && (
          <p className="mt-3 text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded px-3 py-2">
            尚未連結 Google 帳號。請到 <Link href="/studio/settings" className="underline">設定</Link> 頁面進行 OAuth 連結。
          </p>
        )}
      </header>

      <ChatPanel
        workSlug={slug}
        initialConversations={conversations.map((c) => ({
          id: c.id,
          title: c.title,
          updatedAt: c.updatedAt,
        }))}
      />
    </div>
  );
}
