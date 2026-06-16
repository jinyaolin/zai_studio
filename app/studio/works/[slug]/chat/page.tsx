import Link from "next/link";
import { notFound } from "next/navigation";
import { readMemory } from "@/lib/memory/store";
import { readWork } from "@/lib/content/works";
import { isAIConfigured, getCurrentModel } from "@/lib/ai/provider";
import { listConversations } from "@/lib/memory/conversations";
import { decodeParam } from "@/lib/utils/params";
import ChatPanel from "./ChatPanel";

export const dynamic = "force-dynamic";

export default async function ChatPage({
  params,
}: {
  params: { slug: string };
}) {
  const slug = decodeParam(params.slug);
  let work;
  try {
    work = await readWork(slug);
  } catch {
    notFound();
  }
  const memory = await readMemory(slug);
  const conversations = await listConversations(slug);
  const aiReady = isAIConfigured();
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
          <span>模型：{aiReady ? getCurrentModel() : "未設定"}</span>
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
            尚未設定 <code>ZAI_API_KEY</code>。請參考 <code>.env.example</code>。
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
