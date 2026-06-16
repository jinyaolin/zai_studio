import NewWorkForm from "./NewWorkForm";

export const dynamic = "force-dynamic";

export default function NewWorkPage() {
  return (
    <div className="max-w-2xl mx-auto px-8 py-10">
      <h1 className="font-serif text-3xl mb-1">新作品</h1>
      <p className="text-stone-500 text-sm mb-8">
        建立後會在 <code>content/works/&lt;slug&gt;/</code> 生成完整目錄（含記憶與對話）。
      </p>
      <NewWorkForm />
    </div>
  );
}
