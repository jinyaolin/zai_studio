import { promises as fs } from "node:fs";
import path from "node:path";
import OpenAI from "openai";
import { MsEdgeTTS, OUTPUT_FORMAT } from "msedge-tts";
import { audioChunkPath } from "@/lib/content/paths";
import type { AudioChunk, NarrationConfig } from "@/lib/types";
import { analyzeChunkProsody, isDialogueHeavy } from "./prosody";
import { cosyvoiceProvider } from "./cosyvoice";

export type TTSProviderName = "openai" | "edge" | "cosyvoice";

export interface SynthesizeOptions {
  /**
   * Per-work narration config. When set, the provider uses it to pick the
   * voice character + style instruct + speed. When undefined, the provider
   * falls back to env-driven defaults (legacy behavior).
   */
  narration?: NarrationConfig;
}

export interface TTSProvider {
  name: TTSProviderName;
  synthesize(text: string, voice: string, opts?: SynthesizeOptions): Promise<Buffer>;
}

// ─── Provider selection ───────────────────────────────────────────
export function getTTSProviderName(): TTSProviderName {
  const v = (process.env.TTS_PROVIDER ?? "edge").toLowerCase();
  if (v === "openai") return "openai";
  if (v === "cosyvoice") return "cosyvoice";
  return "edge";
}

export function isTTSConfigured(): boolean {
  const name = getTTSProviderName();
  if (name === "edge") return true;        // no setup
  if (name === "cosyvoice") return true;   // server might be down but UI shouldn't hide; user can start it
  return Boolean(process.env.TTS_API_KEY); // openai
}

export function getCurrentVoice(): string {
  const name = getTTSProviderName();
  if (name === "edge") return process.env.TTS_VOICE ?? "zh-TW-HsiaoChenNeural";
  if (name === "cosyvoice") return process.env.TTS_VOICE ?? "中文女";
  return process.env.TTS_VOICE ?? "alloy";
}

// ─── OpenAI (or any OpenAI-compatible endpoint) ────────────────────
interface OpenAIConfig {
  baseURL?: string;
  apiKey: string;
  model: string;
}

function readOpenAIConfig(): OpenAIConfig {
  const apiKey = process.env.TTS_API_KEY;
  if (!apiKey) throw new Error("TTS_API_KEY is not set. See .env.example.");
  return {
    baseURL: process.env.TTS_BASE_URL,
    apiKey,
    model: process.env.TTS_MODEL ?? "tts-1",
  };
}

let _openaiClient: OpenAI | null = null;
function getOpenAIClient(): OpenAI {
  if (_openaiClient) return _openaiClient;
  const cfg = readOpenAIConfig();
  _openaiClient = new OpenAI({ baseURL: cfg.baseURL, apiKey: cfg.apiKey });
  return _openaiClient;
}

const openaiProvider: TTSProvider = {
  name: "openai",
  async synthesize(text, voice) {
    const client = getOpenAIClient();
    const model = readOpenAIConfig().model;
    const response = await client.audio.speech.create({
      model,
      voice: voice as Parameters<typeof client.audio.speech.create>[0]["voice"],
      input: text,
      response_format: "mp3",
    });
    return Buffer.from(await response.arrayBuffer());
  },
};

// ─── Edge TTS (free, Azure-powered, no API key) ───────────────────
// Voice list: https://learn.microsoft.com/azure/ai-services/speech-service/language-support
// Taiwan Mandarin: zh-TW-HsiaoChenNeural, zh-TW-HsiaoYenNeural, zh-TW-YunJheNeural
// Mainland Mandarin: zh-CN-XiaoxiaoNeural (most natural), zh-CN-YunxiNeural, etc.

const edgeProvider: TTSProvider = {
  name: "edge",
  async synthesize(text, voice) {
    // Pick the voice for this chunk: if a dialogue voice is configured AND
    // this chunk reads like spoken lines, swap to it.
    const dialogueVoice = process.env.TTS_DIALOGUE_VOICE;
    const useDialogueVoice = dialogueVoice && isDialogueHeavy(text);
    const activeVoice = useDialogueVoice ? dialogueVoice! : voice;

    const tts = new MsEdgeTTS();
    await tts.setMetadata(activeVoice, OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3);

    // Prosody: rate / pitch tuned by content (narration slows down, action
    // speeds up, dialogue is neutral, questions lift). Disable with
    // TTS_SSML_ENHANCEMENT=false.
    const enhance = process.env.TTS_SSML_ENHANCEMENT !== "false";
    const options = enhance ? analyzeChunkProsody(text) : undefined;

    const { audioStream } = tts.toStream(text, options);
    const chunks: Buffer[] = [];
    for await (const chunk of audioStream) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    if (chunks.length === 0) {
      throw new Error("Edge TTS produced no audio (text may be empty or rejected).");
    }
    return Buffer.concat(chunks);
  },
};

export function getTTSProvider(): TTSProvider {
  const name = getTTSProviderName();
  if (name === "openai") return openaiProvider;
  if (name === "cosyvoice") return cosyvoiceProvider;
  return edgeProvider;
}

// ─── Cached file writer ───────────────────────────────────────────
// Splits chapter text → per-paragraph synthesis → cached mp3 files.
// Provider-agnostic; the voice string is opaque to this layer.
export async function ensureChunk(
  userId: string,
  workSlug: string,
  chapterSlug: string,
  index: number,
  voice: string,
  text: string,
  opts?: SynthesizeOptions,
): Promise<AudioChunk> {
  const filePath = audioChunkPath(userId, workSlug, chapterSlug, index, voice);
  const publicUrl = `/audio/${userId}/${workSlug}/${chapterSlug}/${voice}/${index}.mp3`;
  try {
    await fs.access(filePath);
    return { index, text, url: publicUrl, cached: true };
  } catch {
    // not cached — synthesize
  }

  const provider = getTTSProvider();
  const buf = await provider.synthesize(text, voice, opts);
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, buf);
  return { index, text, url: publicUrl, cached: false };
}
