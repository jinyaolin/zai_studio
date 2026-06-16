// Client-safe narration helpers. No node:* imports — safe to import from
// client components. Server-only stuff (voice discovery, cache-key hashing)
// lives in `narration-server.ts`.
//
// A work picks one voice character + one style preset + optional custom
// instruct + speed. These are persisted on work.json (see NarrationConfig)
// and resolve at synthesis time to:
//   - CosyVoice: which prompt_wav to clone + which instruct text to inject
//   - Edge / OpenAI: only `speed` is honored (voice character is env-driven)

import type { NarrationConfig } from "@/lib/types";

export interface StylePreset {
  id: string;
  label: string;
  /** Natural-language instruction for CosyVoice's instruct mode. */
  instruct: string;
  hint?: string;
}

export interface VoiceCharacter {
  id: string;
  label: string;
  /** Absolute path to the prompt wav (server-side). "default" maps to the bundled asset via env. */
  promptWav?: string;
  /** Corresponding transcript for the prompt wav (with <|endofprompt|> convention handled by server). */
  promptText?: string;
  /** True for the bundled default voice — its wav path is determined by the Python server's env. */
  isDefault?: boolean;
}

// ─── Style presets ────────────────────────────────────────────────
// Order matters — this is the order shown in the UI dropdown.
export const STYLE_PRESETS: StylePreset[] = [
  {
    id: "storyteller",
    label: "說書人",
    instruct: "請用說書人的語氣朗讀，抑揚頓挫分明，帶有戲劇張力，重要字詞稍微放慢強調",
    hint: "戲劇張力強，適合奇幻、懸疑、武俠",
  },
  {
    id: "plain",
    label: "平鋪直敘",
    instruct: "請用平鋪直敘的方式朗讀，語氣平穩自然，不過度戲劇化",
    hint: "中性，適合多數文類",
  },
  {
    id: "dramatic",
    label: "戲劇化",
    instruct: "請用戲劇化的語氣朗讀，情感濃烈，語氣起伏明顯，像舞臺劇獨白",
    hint: "情感強烈，適合情感濃厚的橋段",
  },
  {
    id: "warm",
    label: "溫暖",
    instruct: "請用溫暖、像在對朋友講故事的語氣朗讀，語速稍慢，帶著笑容",
    hint: "親切，適合日常、療癒、成長",
  },
  {
    id: "cold",
    label: "冷峻",
    instruct: "請用冷峻、節制的語氣朗讀，情感收斂，字句分明",
    hint: "疏離，適合冷硬派、推理、科幻",
  },
  {
    id: "mysterious",
    label: "神祕",
    instruct: "請用神祕、低語般的語氣朗讀，速度偏慢，帶著暗示感",
    hint: "懸疑、未解之謎",
  },
  {
    id: "deep",
    label: "深沉",
    instruct: "請用深沉、渾厚的嗓音朗讀，速度偏慢，語氣沉重而內斂",
    hint: "厚重、歷史感、悲劇",
  },
];

export const CUSTOM_PRESET_ID = "custom";

// ─── Pure helpers ─────────────────────────────────────────────────

export function defaultNarration(): NarrationConfig {
  return {
    voiceCharacter: "default",
    stylePreset: "plain",
    customInstruct: "",
    speed: 1.0,
  };
}

/** Normalize partial / legacy narration configs to a full one. */
export function normalizeNarration(n: NarrationConfig | undefined | null): NarrationConfig {
  const base = defaultNarration();
  if (!n) return base;
  return {
    voiceCharacter: typeof n.voiceCharacter === "string" && n.voiceCharacter ? n.voiceCharacter : base.voiceCharacter,
    stylePreset: typeof n.stylePreset === "string" && n.stylePreset ? n.stylePreset : base.stylePreset,
    customInstruct: typeof n.customInstruct === "string" ? n.customInstruct : "",
    speed: typeof n.speed === "number" && n.speed > 0 ? n.speed : base.speed,
  };
}

/** Resolve the active instruct text from preset or custom field. */
export function resolveInstruct(n: NarrationConfig): string {
  const norm = normalizeNarration(n);
  if (norm.stylePreset === CUSTOM_PRESET_ID) {
    return norm.customInstruct.trim();
  }
  const preset = STYLE_PRESETS.find((p) => p.id === norm.stylePreset);
  return preset?.instruct ?? "";
}
