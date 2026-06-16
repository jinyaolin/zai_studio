"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type {
  Character,
  MemoryKind,
  PlotThread,
  WorkMemory,
  WorldEntry,
} from "@/lib/types";
import { newMemoryId } from "@/lib/memory/id";
import MemoryItemDiscussion from "./MemoryItemDiscussion";

type Tab = "characters" | "world" | "plot" | "style";

const TAB_LABEL: Record<Tab, string> = {
  characters: "角色",
  world: "世界觀",
  plot: "情節",
  style: "風格",
};

export default function MemoryEditor({
  workSlug,
  initialMemory,
}: {
  workSlug: string;
  initialMemory: WorkMemory;
}) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("characters");
  const [memory, setMemory] = useState<WorkMemory>(initialMemory);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);

  async function persist(next: WorkMemory) {
    setMemory(next);
    setSaving(true);
    try {
      const res = await fetch(`/api/works/${encodeURIComponent(workSlug)}/memory`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(next),
      });
      if (res.ok) {
        setSavedAt(new Date().toLocaleTimeString("zh-Hant"));
        router.refresh();
      }
    } finally {
      setSaving(false);
    }
  }

  // When a discussion produces a proposal and the user adopts it, merge it
  // back into the matching slice and persist.
  async function adoptItem(kind: MemoryKind, item: Character | WorldEntry | PlotThread) {
    const next: WorkMemory = { ...memory };
    if (kind === "characters") {
      next.characters = memory.characters.map((c) =>
        c.id === item.id ? (item as Character) : c,
      );
    } else if (kind === "worldbuilding") {
      next.worldbuilding = memory.worldbuilding.map((w) =>
        w.id === item.id ? (item as WorldEntry) : w,
      );
    } else if (kind === "plot") {
      next.plot = memory.plot.map((p) => (p.id === item.id ? (item as PlotThread) : p));
    }
    await persist(next);
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div className="flex gap-1">
          {(Object.keys(TAB_LABEL) as Tab[]).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className={`px-4 py-1.5 rounded-md text-sm transition ${
                tab === t
                  ? "bg-stone-900 text-stone-50"
                  : "text-stone-600 hover:bg-stone-200"
              }`}
            >
              {TAB_LABEL[t]}
              <span className="text-xs ml-2 opacity-60">
                {t === "characters"
                  ? memory.characters.length
                  : t === "world"
                    ? memory.worldbuilding.length
                    : t === "plot"
                      ? memory.plot.length
                      : memory.style.trim()
                        ? "✓"
                        : ""}
              </span>
            </button>
          ))}
        </div>
        <div className="text-xs text-stone-400">
          {saving ? "儲存中…" : savedAt ? `已儲存 ${savedAt}` : ""}
        </div>
      </div>

      {tab === "characters" && (
        <CharactersTab
          workSlug={workSlug}
          characters={memory.characters}
          onChange={(characters) => persist({ ...memory, characters })}
          onAdopt={(item) => adoptItem("characters", item)}
        />
      )}
      {tab === "world" && (
        <WorldTab
          workSlug={workSlug}
          entries={memory.worldbuilding}
          onChange={(worldbuilding) => persist({ ...memory, worldbuilding })}
          onAdopt={(item) => adoptItem("worldbuilding", item)}
        />
      )}
      {tab === "plot" && (
        <PlotTab
          workSlug={workSlug}
          threads={memory.plot}
          onChange={(plot) => persist({ ...memory, plot })}
          onAdopt={(item) => adoptItem("plot", item)}
        />
      )}
      {tab === "style" && (
        <StyleTab
          style={memory.style}
          onChange={(style) => persist({ ...memory, style })}
        />
      )}
    </div>
  );
}

// ─── shared discussion toggle hook ────────────────────────────────
function useExpanded() {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  function toggle(id: string) {
    setExpandedId((prev) => (prev === id ? null : id));
  }
  return { expandedId, toggle };
}

function DiscussionToggle({
  open,
  onClick,
}: {
  open: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`text-xs px-2 py-0.5 rounded transition ${
        open
          ? "bg-stone-900 text-stone-50"
          : "text-stone-500 hover:bg-stone-200"
      }`}
    >
      💬 {open ? "收起討論" : "與 zai 討論"}
    </button>
  );
}

// ─── Characters ───────────────────────────────────────────────────
function CharactersTab({
  workSlug,
  characters,
  onChange,
  onAdopt,
}: {
  workSlug: string;
  characters: Character[];
  onChange: (next: Character[]) => void;
  onAdopt: (item: Character) => Promise<void>;
}) {
  const { expandedId, toggle } = useExpanded();
  function update(id: string, patch: Partial<Character>) {
    onChange(characters.map((c) => (c.id === id ? { ...c, ...patch } : c)));
  }
  function add() {
    onChange([
      ...characters,
      {
        id: newMemoryId(),
        name: "新角色",
        aliases: [],
        role: "",
        description: "",
        traits: [],
        relationships: [],
        arc: "",
      },
    ]);
  }
  function remove(id: string) {
    onChange(characters.filter((c) => c.id !== id));
  }

  return (
    <div className="space-y-4">
      {characters.map((c) => (
        <div key={c.id} className="p-4 bg-white border border-stone-200 rounded-md space-y-3">
          <div className="flex gap-3">
            <input
              value={c.name}
              onChange={(e) => update(c.id, { name: e.target.value })}
              className="font-serif text-xl bg-transparent border-b border-stone-200 focus:border-stone-500 focus:outline-none flex-1"
              placeholder="姓名"
            />
            <input
              value={c.role}
              onChange={(e) => update(c.id, { role: e.target.value })}
              className="text-sm px-2 py-1 border border-stone-200 rounded w-32"
              placeholder="定位（主角／反派…）"
            />
            <DiscussionToggle open={expandedId === c.id} onClick={() => toggle(c.id)} />
            <button onClick={() => remove(c.id)} className="text-xs text-red-700 hover:underline self-center">
              刪除
            </button>
          </div>
          <input
            value={c.aliases.join("、")}
            onChange={(e) => update(c.id, { aliases: e.target.value.split(/[、,]/).map((s) => s.trim()).filter(Boolean) })}
            className="w-full text-sm px-2 py-1 border border-stone-200 rounded"
            placeholder="別名（以、分隔）"
          />
          <textarea
            value={c.description}
            onChange={(e) => update(c.id, { description: e.target.value })}
            rows={2}
            className="w-full text-sm px-2 py-1 border border-stone-200 rounded resize-y"
            placeholder="外貌、個性、關鍵細節…"
          />
          <div className="grid grid-cols-2 gap-3">
            <input
              value={c.traits.join("、")}
              onChange={(e) => update(c.id, { traits: e.target.value.split(/[、,]/).map((s) => s.trim()).filter(Boolean) })}
              className="text-sm px-2 py-1 border border-stone-200 rounded"
              placeholder="性格特質（以、分隔）"
            />
            <input
              value={c.arc}
              onChange={(e) => update(c.id, { arc: e.target.value })}
              className="text-sm px-2 py-1 border border-stone-200 rounded"
              placeholder="角色弧（這部作品裡他要走到哪）"
            />
          </div>

          {expandedId === c.id && (
            <MemoryItemDiscussion
              workSlug={workSlug}
              kind="characters"
              itemId={c.id}
              onAdopt={async (item) => onAdopt(item as Character)}
            />
          )}
        </div>
      ))}
      <button
        onClick={add}
        className="w-full py-2 border border-dashed border-stone-300 rounded-md text-sm text-stone-500 hover:border-stone-500 hover:text-stone-700"
      >
        ＋ 新增角色
      </button>
    </div>
  );
}

// ─── Worldbuilding ────────────────────────────────────────────────
function WorldTab({
  workSlug,
  entries,
  onChange,
  onAdopt,
}: {
  workSlug: string;
  entries: WorldEntry[];
  onChange: (next: WorldEntry[]) => void;
  onAdopt: (item: WorldEntry) => Promise<void>;
}) {
  const { expandedId, toggle } = useExpanded();
  function update(id: string, patch: Partial<WorldEntry>) {
    onChange(entries.map((w) => (w.id === id ? { ...w, ...patch } : w)));
  }
  function add() {
    onChange([
      ...entries,
      { id: newMemoryId(), name: "新條目", category: "地點", description: "", notes: "" },
    ]);
  }
  function remove(id: string) {
    onChange(entries.filter((w) => w.id !== id));
  }
  return (
    <div className="space-y-3">
      {entries.map((w) => (
        <div key={w.id} className="p-4 bg-white border border-stone-200 rounded-md space-y-2">
          <div className="flex gap-3">
            <input
              value={w.name}
              onChange={(e) => update(w.id, { name: e.target.value })}
              className="font-serif text-lg bg-transparent border-b border-stone-200 focus:border-stone-500 focus:outline-none flex-1"
              placeholder="名稱"
            />
            <input
              value={w.category}
              onChange={(e) => update(w.id, { category: e.target.value })}
              className="text-sm px-2 py-1 border border-stone-200 rounded w-32"
              placeholder="分類（地點／物件／規則…）"
            />
            <DiscussionToggle open={expandedId === w.id} onClick={() => toggle(w.id)} />
            <button onClick={() => remove(w.id)} className="text-xs text-red-700 hover:underline self-center">刪除</button>
          </div>
          <textarea
            value={w.description}
            onChange={(e) => update(w.id, { description: e.target.value })}
            rows={2}
            className="w-full text-sm px-2 py-1 border border-stone-200 rounded resize-y"
            placeholder="描述"
          />
          <input
            value={w.notes}
            onChange={(e) => update(w.id, { notes: e.target.value })}
            className="w-full text-sm px-2 py-1 border border-stone-200 rounded"
            placeholder="備註（給自己看的）"
          />

          {expandedId === w.id && (
            <MemoryItemDiscussion
              workSlug={workSlug}
              kind="worldbuilding"
              itemId={w.id}
              onAdopt={async (item) => onAdopt(item as WorldEntry)}
            />
          )}
        </div>
      ))}
      <button
        onClick={add}
        className="w-full py-2 border border-dashed border-stone-300 rounded-md text-sm text-stone-500 hover:border-stone-500 hover:text-stone-700"
      >
        ＋ 新增條目
      </button>
    </div>
  );
}

// ─── Plot ─────────────────────────────────────────────────────────
const PLOT_STATUS = {
  setup: "鋪陳",
  developing: "發展",
  climax: "高潮",
  resolved: "收束",
} as const;

function PlotTab({
  workSlug,
  threads,
  onChange,
  onAdopt,
}: {
  workSlug: string;
  threads: PlotThread[];
  onChange: (next: PlotThread[]) => void;
  onAdopt: (item: PlotThread) => Promise<void>;
}) {
  const { expandedId, toggle } = useExpanded();
  function update(id: string, patch: Partial<PlotThread>) {
    onChange(threads.map((p) => (p.id === id ? { ...p, ...patch } : p)));
  }
  function add() {
    onChange([
      ...threads,
      {
        id: newMemoryId(),
        title: "新情節線",
        status: "setup",
        summary: "",
        linkedChapters: [],
        foreshadowing: "",
      },
    ]);
  }
  function remove(id: string) {
    onChange(threads.filter((p) => p.id !== id));
  }
  return (
    <div className="space-y-3">
      {threads.map((p) => (
        <div key={p.id} className="p-4 bg-white border border-stone-200 rounded-md space-y-2">
          <div className="flex gap-3">
            <input
              value={p.title}
              onChange={(e) => update(p.id, { title: e.target.value })}
              className="font-serif text-lg bg-transparent border-b border-stone-200 focus:border-stone-500 focus:outline-none flex-1"
              placeholder="情節線標題"
            />
            <select
              value={p.status}
              onChange={(e) => update(p.id, { status: e.target.value as PlotThread["status"] })}
              className="text-sm px-2 py-1 border border-stone-200 rounded bg-white"
            >
              {(Object.keys(PLOT_STATUS) as (keyof typeof PLOT_STATUS)[]).map((k) => (
                <option key={k} value={k}>{PLOT_STATUS[k]}</option>
              ))}
            </select>
            <DiscussionToggle open={expandedId === p.id} onClick={() => toggle(p.id)} />
            <button onClick={() => remove(p.id)} className="text-xs text-red-700 hover:underline self-center">刪除</button>
          </div>
          <textarea
            value={p.summary}
            onChange={(e) => update(p.id, { summary: e.target.value })}
            rows={2}
            className="w-full text-sm px-2 py-1 border border-stone-200 rounded resize-y"
            placeholder="這條情節線在做什麼？"
          />
          <input
            value={p.foreshadowing}
            onChange={(e) => update(p.id, { foreshadowing: e.target.value })}
            className="w-full text-sm px-2 py-1 border border-stone-200 rounded"
            placeholder="伏筆／給未來的提醒"
          />

          {expandedId === p.id && (
            <MemoryItemDiscussion
              workSlug={workSlug}
              kind="plot"
              itemId={p.id}
              onAdopt={async (item) => onAdopt(item as PlotThread)}
            />
          )}
        </div>
      ))}
      <button
        onClick={add}
        className="w-full py-2 border border-dashed border-stone-300 rounded-md text-sm text-stone-500 hover:border-stone-500 hover:text-stone-700"
      >
        ＋ 新增情節線
      </button>
    </div>
  );
}

// ─── Style ────────────────────────────────────────────────────────
function StyleTab({
  style,
  onChange,
}: {
  style: string;
  onChange: (next: string) => void;
}) {
  return (
    <div>
      <p className="text-sm text-stone-500 mb-3">
        寫在這裡的會整段放進每次對話的 system prompt。建議包含：語氣、POV、用字偏好、motif、禁忌。
      </p>
      <textarea
        value={style}
        onChange={(e) => onChange(e.target.value)}
        rows={20}
        className="w-full p-4 bg-white border border-stone-200 rounded-md font-mono text-sm leading-relaxed resize-y focus:outline-none focus:ring-2 focus:ring-stone-400"
        placeholder={"# 風格指南\n\n- 視角：第三人稱有限\n- 語氣：節制、留白\n- motif：雨、傘、舊信\n- 禁忌：不直接點破超自然元素\n"}
      />
    </div>
  );
}
