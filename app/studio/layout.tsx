import Link from "next/link";
import type { ReactNode } from "react";

export const dynamic = "force-dynamic";

export default function StudioLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen flex">
      <aside className="w-56 border-r border-stone-200 bg-stone-100/60 px-4 py-6 flex flex-col gap-1 sticky top-0 h-screen">
        <Link href="/studio" className="font-serif text-2xl text-stone-900 mb-4">
          zai<span className="text-stone-400 text-sm align-top ml-1">studio</span>
        </Link>
        <nav className="flex flex-col gap-1 text-sm">
          <Link href="/studio" className="px-3 py-2 rounded-md hover:bg-stone-200/70 text-stone-700">
            作品列表
          </Link>
          <Link href="/studio/works/new" className="px-3 py-2 rounded-md hover:bg-stone-200/70 text-stone-700">
            ＋ 新作品
          </Link>
          <Link href="/studio/settings" className="px-3 py-2 rounded-md hover:bg-stone-200/70 text-stone-700">
            設定
          </Link>
        </nav>
        <div className="mt-auto pt-6">
          <Link href="/" className="text-xs text-stone-500 hover:text-stone-700">
            ← 回發表站
          </Link>
        </div>
      </aside>
      <main className="flex-1 min-w-0 bg-stone-50">{children}</main>
    </div>
  );
}
