// Server-only narration helpers — voice character discovery (node:fs) +
// cache-key hashing (node:crypto). Client components must not import this
// file; they should import from `./narration` instead.

import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";
import type { NarrationConfig } from "@/lib/types";
import { type VoiceCharacter, normalizeNarration } from "./narration";

export * from "./narration";

// ─── Voice characters ─────────────────────────────────────────────
// "default" is always present — it's the bundled zero_shot_prompt.wav on
// the Python server side. Additional voices are picked up by scanning
// COSYVOICE_VOICES_DIR (default: ~/dev/CosyVoice/voices/) for *.wav files
// paired with *.txt transcripts. The user drops new samples in there to
// expand the voice character list.

const BUNDLED_DEFAULT: VoiceCharacter = {
  id: "default",
  label: "預設女聲",
  isDefault: true,
};

export function voicesDir(): string {
  const fromEnv = process.env.COSYVOICE_VOICES_DIR;
  if (fromEnv) return path.resolve(fromEnv);
  return path.join(os.homedir(), "dev", "CosyVoice", "voices");
}

/** Scan COSYVOICE_VOICES_DIR for `*.wav` files with paired `*.txt`. */
export async function discoverVoiceCharacters(): Promise<VoiceCharacter[]> {
  const dir = voicesDir();
  const found: VoiceCharacter[] = [];
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isFile()) continue;
      if (!entry.name.toLowerCase().endsWith(".wav")) continue;
      const base = entry.name.slice(0, -4);
      const wavPath = path.join(dir, entry.name);
      const txtPath = path.join(dir, `${base}.txt`);
      try {
        await fs.access(txtPath);
      } catch {
        // No matching transcript — skip; without it CosyVoice can't clone.
        continue;
      }
      const promptText = (await fs.readFile(txtPath, "utf8")).trim();
      if (!promptText) continue;
      found.push({
        id: base,
        label: base,
        promptWav: wavPath,
        promptText,
      });
    }
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") {
      console.warn(`[narration] failed to scan ${dir}:`, (err as Error).message);
    }
  }
  return [BUNDLED_DEFAULT, ...found];
}

/**
 * Build a stable cache-key string for a narration config.
 * Format: `narrator-<voiceCharacter>-<8-char-hash>`
 *
 * Any change (voice / preset / custom instruct / speed) produces a new key,
 * which scopes cached mp3s to the exact config they were synthesized under.
 */
export function narrationVoiceString(n: NarrationConfig | undefined | null): string {
  const norm = normalizeNarration(n);
  const hash = createHash("md5")
    .update(JSON.stringify({
      v: norm.voiceCharacter,
      s: norm.stylePreset,
      c: norm.customInstruct,
      sp: norm.speed,
    }))
    .digest("hex")
    .slice(0, 8);
  return `narrator-${norm.voiceCharacter}-${hash}`;
}

/** Look up the prompt_wav / prompt_text for a voice character id. */
export async function resolveVoiceCharacter(
  id: string,
): Promise<{ promptWav?: string; promptText?: string }> {
  const voices = await discoverVoiceCharacters();
  const v = voices.find((vc) => vc.id === id) ?? BUNDLED_DEFAULT;
  return { promptWav: v.promptWav, promptText: v.promptText };
}
