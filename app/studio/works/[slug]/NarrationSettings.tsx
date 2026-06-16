"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { NarrationConfig } from "@/lib/types";
import { STYLE_PRESETS, CUSTOM_PRESET_ID, defaultNarration } from "@/lib/tts/narration";

interface Props {
  workSlug: string;
  initial: NarrationConfig | null | undefined;
}

interface VoiceListItem {
  id: string;
  label: string;
  isDefault: boolean;
}

export default function NarrationSettings({ workSlug, initial }: Props) {
  const router = useRouter();
  const [narration, setNarration] = useState<NarrationConfig>(() =>
    initial ? { ...defaultNarration(), ...initial } : defaultNarration(),
  );
  const [voices, setVoices] = useState<VoiceListItem[]>([
    { id: "default", label: "預設女聲", isDefault: true },
  ]);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/tts/voices");
        if (!res.ok) return;
        const data = await res.json();
        if (cancelled) return;
        if (Array.isArray(data.voices) && data.voices.length > 0) {
          setVoices(data.voices);
        }
      } catch {}
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  function update<K extends keyof NarrationConfig>(key: K, value: NarrationConfig[K]) {
    setNarration((prev) => ({ ...prev, [key]: value }));
    setDirty(true);
  }

  async function save() {
    setSaving(true);
    try {
      const res = await fetch(`/api/works/${encodeURIComponent(workSlug)}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ narration }),
      });
      if (res.ok) {
        setSavedAt(new Date().toLocaleTimeString("zh-Hant"));
        setDirty(false);
        router.refresh();
      }
    } finally {
      setSaving(false);
    }
  }

  const preset = STYLE_PRESETS.find((p) => p.id === narration.stylePreset);
  const isCustom = narration.stylePreset === CUSTOM_PRESET_ID;
  const availableVoiceIds = new Set(voices.map((v) => v.id));
  const voiceMissing = !availableVoiceIds.has(narration.voiceCharacter);

  return (
    <section className="mt-8 pt-6 border-t border-stone-200">
      <div className="flex items-baseline justify-between mb-3">
        <h2 className="font-serif text-2xl">朗讀設定</h2>
        <span className="text-xs text-stone-500">
          {saving ? "儲存中…" : dirty ? "未儲存" : savedAt ? `已儲存 ${savedAt}` : ""}
        </span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Voice character */}
        <label className="block">
          <span className="block text-xs text-stone-500 mb-1">聲音特質</span>
          <select
            value={narration.voiceCharacter}
            onChange={(e) => update("voiceCharacter", e.target.value)}
            className="w-full text-sm px-2 py-1.5 border border-stone-300 rounded bg-white"
          >
            {voices.map((v) => (
              <option key={v.id} value={v.id}>
                {v.label}
                {v.isDefault ? "（內建）" : ""}
              </option>
            ))}
          </select>
          {voiceMissing && (
            <span className="block text-[11px] text-amber-700 mt-1">
              此聲音樣本已不存在，將退回預設
            </span>
          )}
          <span className="block text-[11px] text-stone-400 mt-1">
            新增聲音：把 .wav + 同名 .txt 放進 CosyVoice/voices/
          </span>
        </label>

        {/* Style preset */}
        <label className="block">
          <span className="block text-xs text-stone-500 mb-1">朗讀風格</span>
          <select
            value={narration.stylePreset}
            onChange={(e) => update("stylePreset", e.target.value)}
            className="w-full text-sm px-2 py-1.5 border border-stone-300 rounded bg-white"
          >
            {STYLE_PRESETS.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
            <option value={CUSTOM_PRESET_ID}>⌨ 自訂</option>
          </select>
          {preset?.hint && !isCustom && (
            <span className="block text-[11px] text-stone-400 mt-1">{preset.hint}</span>
          )}
        </label>

        {/* Speed */}
        <label className="block">
          <span className="block text-xs text-stone-500 mb-1">
            語速 <span className="text-stone-700">{narration.speed.toFixed(2)}×</span>
          </span>
          <input
            type="range"
            min={0.5}
            max={2}
            step={0.05}
            value={narration.speed}
            onChange={(e) => update("speed", Number(e.target.value))}
            className="w-full mt-2"
          />
          <div className="flex justify-between text-[10px] text-stone-400 mt-0.5">
            <span>0.5×</span>
            <span>1.0×</span>
            <span>2.0×</span>
          </div>
        </label>
      </div>

      {/* Custom instruct — only shown when preset is "custom" */}
      {isCustom && (
        <label className="block mt-4">
          <span className="block text-xs text-stone-500 mb-1">
            自訂朗讀指示（送給 CosyVoice 的 instruct 文字）
          </span>
          <textarea
            value={narration.customInstruct}
            onChange={(e) => update("customInstruct", e.target.value)}
            placeholder="例如：請用說書人的語氣朗讀，遇到引號中的對話稍微變聲"
            rows={2}
            className="w-full text-sm px-3 py-2 border border-stone-300 rounded bg-white font-serif"
          />
        </label>
      )}

      <div className="flex items-center gap-3 mt-4">
        <button
          onClick={save}
          disabled={!dirty || saving}
          className="text-xs px-3 py-1.5 bg-stone-900 text-stone-50 rounded hover:bg-stone-700 disabled:opacity-40 disabled:hover:bg-stone-900"
        >
          {saving ? "儲存中…" : "儲存朗讀設定"}
        </button>
        <span className="text-[11px] text-stone-400">
          變更後，這個作品的所有章節會用新設定重新合成（舊的快取會保留但不再使用）
        </span>
      </div>
    </section>
  );
}
