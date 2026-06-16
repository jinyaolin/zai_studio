import Link from "next/link";
import { notFound } from "next/navigation";
import { readMemory } from "@/lib/memory/store";
import { readWork } from "@/lib/content/works";
import { decodeParam } from "@/lib/utils/params";
import MemoryEditor from "./MemoryEditor";

export const dynamic = "force-dynamic";

export default async function MemoryPage({
  params,
}: {
  params: { slug: string };
}) {
  const slug = decodeParam(params.slug);
  try {
    await readWork(slug);
  } catch {
    notFound();
  }
  const memory = await readMemory(slug);
  const encoded = encodeURIComponent(slug);

  return (
    <div className="max-w-4xl mx-auto px-8 py-10">
      <div className="mb-6">
        <Link
          href={`/studio/works/${encoded}`}
          className="text-sm text-stone-500 hover:text-stone-700"
        >
          ← 回作品
        </Link>
      </div>

      <header className="mb-8">
        <h1 className="font-serif text-3xl">記憶</h1>
        <p className="text-stone-500 text-sm mt-1 max-w-2xl">
          這些內容會自動注入到「對話」頁的 system prompt。zai 會記得角色、世界觀、情節進度與你的風格。
          檔案儲存在 <code>content/works/{slug}/memory/</code>。
        </p>
      </header>

      <MemoryEditor workSlug={slug} initialMemory={memory} />
    </div>
  );
}
