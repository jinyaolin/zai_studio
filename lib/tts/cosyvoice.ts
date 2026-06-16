// CosyVoice 3 TTS provider — talks to the Python FastAPI server at
// ~/dev/CosyVoice/server.py.
//
// CosyVoice 3 has no built-in speaker IDs — every synthesis is zero-shot,
// using a reference audio to clone the voice. The "voice" param from the
// upper layer is treated as an opaque cache key only; the actual voice
// selection happens via per-call `prompt_wav` / `prompt_text`.
//
// Per-work narration: callers pass a NarrationConfig via opts.narration.
// We resolve it to (a) the prompt_wav for the chosen voice character and
// (b) the instruct text from the chosen style preset (or custom text).
// When no narration is provided we fall back to env-driven defaults
// (COSYVOICE_PROMPT_WAV / COSYVOICE_INSTRUCT / COSYVOICE_SPEED) so legacy
// callers keep working.
//
// Audio format: the Python server returns WAV. We convert to MP3 via ffmpeg
// so the rest of the pipeline (which assumes .mp3) works unchanged.

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { tmpdir } from "node:os";
import { promises as fs } from "node:fs";
import path from "node:path";
import type { TTSProvider } from "./provider";
import type { NarrationConfig } from "@/lib/types";
import { normalizeNarration, resolveInstruct, resolveVoiceCharacter } from "./narration-server";

const execFileAsync = promisify(execFile);

export function getCosyVoiceBaseUrl(): string {
  return (process.env.COSYVOICE_BASE_URL ?? "http://127.0.0.1:9880").replace(/\/$/, "");
}

async function wavToMp3(wavBuffer: Buffer): Promise<Buffer> {
  const tmpWav = path.join(tmpdir(), `cosyvoice-${Date.now()}.wav`);
  const tmpMp3 = tmpWav.replace(".wav", ".mp3");
  try {
    await fs.writeFile(tmpWav, wavBuffer);
    await execFileAsync("ffmpeg", [
      "-i", tmpWav,
      "-codec:a", "libmp3lame",
      "-b:a", "48k",
      "-ar", "24000",
      "-ac", "1",
      "-y",          // overwrite
      "-loglevel", "error",
      tmpMp3,
    ]);
    return await fs.readFile(tmpMp3);
  } finally {
    await fs.rm(tmpWav, { force: true });
    await fs.rm(tmpMp3, { force: true });
  }
}

export const cosyvoiceProvider: TTSProvider = {
  name: "cosyvoice",
  async synthesize(text, _voice, opts) {
    const narration: NarrationConfig | undefined = opts?.narration;
    const norm = narration ? normalizeNarration(narration) : undefined;

    const body: Record<string, unknown> = {
      text,
      speed: norm?.speed ?? (Number(process.env.COSYVOICE_SPEED ?? "1.0") || 1.0),
    };

    // Voice character: resolve prompt_wav / prompt_text from narration, or
    // fall back to env (server-side default already covers the bundled voice).
    if (norm) {
      const vc = await resolveVoiceCharacter(norm.voiceCharacter);
      if (vc.promptWav) body.prompt_wav = vc.promptWav;
      if (vc.promptText) body.prompt_text = vc.promptText;
    }

    // Instruct text: per-work if narration is set, else env COSYVOICE_INSTRUCT.
    const instruct = norm ? resolveInstruct(norm) : process.env.COSYVOICE_INSTRUCT;
    if (instruct?.trim()) body.instruct = instruct.trim();

    const res = await fetch(`${getCosyVoiceBaseUrl()}/synthesize`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const err = await res.text().catch(() => "");
      throw new Error(`CosyVoice server error ${res.status}: ${err}`);
    }
    const wavBuffer = Buffer.from(await res.arrayBuffer());
    // Convert WAV → MP3 so the rest of the pipeline works with .mp3 files.
    try {
      return await wavToMp3(wavBuffer);
    } catch {
      // ffmpeg not available or failed — return WAV as-is. Browser will
      // still play it (content sniffing), just the file extension lies.
      return wavBuffer;
    }
  },
};

