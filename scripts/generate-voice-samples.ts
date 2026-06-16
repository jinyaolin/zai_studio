// Generate CosyVoice voice-character samples using Edge TTS, then convert
// to wav (16kHz mono) so CosyVoice can use them as zero-shot prompts.
//
// Usage:
//   tsx scripts/generate-voice-samples.ts
//
// Output: <COSYVOICE_VOICES_DIR>/<name>.wav + <name>.txt
// Default dir: ~/dev/CosyVoice/voices/ (auto-created)
//
// After running, restart the dev server (or just refresh the narration UI)
// and the new voice appears in the dropdown.

import { MsEdgeTTS, OUTPUT_FORMAT } from "msedge-tts";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";

const execFileAsync = promisify(execFile);

interface SampleSpec {
  /** Subdirectory / filename stem — becomes <id>.wav + <id>.txt. */
  id: string;
  /** Edge TTS voice ID. */
  voice: string;
  /** Sample transcript. 10-20 sec when spoken (~50-90 chars). */
  text: string;
}

// Multiple male voices so the user can A/B compare and pick the one that
// clones best with CosyVoice. All use the same transcript for fair comparison.
const NARRATIVE_SAMPLE =
  "夜色漸深，老茶館裡只剩我一人。窗外的雨聲不疾不徐，像是在訴說著一段被遺忘的往事。我端起茶杯，溫熱的茶湯入喉，才發覺自己已經在這裡坐了整整一個下午。";

const SAMPLES: SampleSpec[] = [
  { id: "male-mature", voice: "zh-CN-YunyangNeural", text: NARRATIVE_SAMPLE }, // 成熟厚實（新聞播報感）
  { id: "male-young", voice: "zh-CN-YunxiNeural", text: NARRATIVE_SAMPLE },    // 年輕溫暖
  { id: "male-deep", voice: "zh-CN-YunjianNeural", text: NARRATIVE_SAMPLE },   // 深沉敘事
];

function voicesDir(): string {
  const fromEnv = process.env.COSYVOICE_VOICES_DIR;
  if (fromEnv) return path.resolve(fromEnv);
  return path.join(os.homedir(), "dev", "CosyVoice", "voices");
}

async function synthToMp3(text: string, voice: string): Promise<Buffer> {
  const tts = new MsEdgeTTS();
  // Highest Edge bitrate available in msedge-tts → preserves more detail
  // before CosyVoice re-clones. (Library has no 48kHz/192kbps option.)
  await tts.setMetadata(voice, OUTPUT_FORMAT.AUDIO_24KHZ_96KBITRATE_MONO_MP3);
  const { audioStream } = tts.toStream(text);
  const chunks: Buffer[] = [];
  for await (const chunk of audioStream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  if (chunks.length === 0) {
    throw new Error(`Edge TTS produced no audio for voice ${voice}`);
  }
  return Buffer.concat(chunks);
}

async function mp3ToWav(mp3: Buffer, outPath: string): Promise<void> {
  const tmpMp3 = `${outPath}.tmp.mp3`;
  await fs.writeFile(tmpMp3, mp3);
  try {
    await execFileAsync("ffmpeg", [
      "-i", tmpMp3,
      "-ar", "24000",          // CosyVoice native rate (matches bundled asset)
      "-ac", "1",              // mono
      "-c:a", "pcm_f32le",    // 32-bit float codec
      "-sample_fmt", "flt",   // 32-bit float samples — matches bundled zero_shot_prompt.wav
      "-y",
      "-loglevel", "error",
      outPath,
    ]);
  } finally {
    await fs.rm(tmpMp3, { force: true });
  }
}

async function main() {
  const dir = voicesDir();
  await fs.mkdir(dir, { recursive: true });
  console.log(`[voices] output dir: ${dir}`);

  for (const spec of SAMPLES) {
    const wavPath = path.join(dir, `${spec.id}.wav`);
    const txtPath = path.join(dir, `${spec.id}.txt`);
    console.log(`[voices] generating ${spec.id} (${spec.voice})…`);
    const mp3 = await synthToMp3(spec.text, spec.voice);
    await mp3ToWav(mp3, wavPath);
    await fs.writeFile(txtPath, spec.text + "\n", "utf8");
    const stat = await fs.stat(wavPath);
    console.log(`[voices] ✓ ${spec.id}: ${(stat.size / 1024).toFixed(1)} KB wav + transcript`);
  }
  console.log("[voices] done. Refresh the narration settings UI to pick them up.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
