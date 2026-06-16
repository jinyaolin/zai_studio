import Link from "next/link";
import { queryWorksByStatus } from "@/lib/content/db";

export const dynamic = "force-dynamic";

export default function HomePage() {
  const published = queryWorksByStatus("published");
  const hasAny = published.length > 0;

  return (
    <main className="min-h-screen flex flex-col items-center justify-center gap-8 px-6">
      <div className="text-center space-y-3">
        <h1 className="font-serif text-6xl text-stone-900">zai</h1>
        <p className="text-stone-600 max-w-md">
          一個寫作、發表與朗讀的小角落。
        </p>
      </div>

      <nav className="flex gap-3">
        <Link
          href="/works"
          className="px-5 py-2.5 rounded-md bg-stone-900 text-stone-50 hover:bg-stone-800 transition"
        >
          進入作品 →
        </Link>
        <Link
          href="/studio"
          className="px-5 py-2.5 rounded-md border border-stone-300 text-stone-700 hover:bg-stone-100 transition"
        >
          創作端
        </Link>
      </nav>

      {!hasAny && (
        <p className="text-sm text-stone-500 max-w-md text-center">
          目前還沒有公開作品。先到 <Link href="/studio" className="underline">創作端</Link> 開始你的第一個故事吧。
        </p>
      )}
    </main>
  );
}
