import OpenAI from "openai";

// ─── Provider interface ────────────────────────────────────────────
export interface EmbeddingProvider {
  readonly name: string;
  embed(texts: string[]): Promise<number[][]>;
  /** Indicative dimension; -1 if unknown until first embed. */
  dimension(): number;
}

// ─── ZAI / OpenAI-compatible embedding API ─────────────────────────
interface ZaiEmbeddingConfig {
  baseURL?: string;
  apiKey: string;
  model: string;
  dimensions?: number;
}

function readZaiConfig(): ZaiEmbeddingConfig | null {
  const apiKey = process.env.ZAI_API_KEY;
  const model = process.env.ZAI_EMBEDDING_MODEL;
  if (!apiKey || !model) return null;
  return {
    baseURL: process.env.ZAI_BASE_URL,
    apiKey,
    model,
    dimensions: process.env.ZAI_EMBEDDING_DIM
      ? Number(process.env.ZAI_EMBEDDING_DIM)
      : undefined,
  };
}

let _client: OpenAI | null = null;
function getClient(baseURL: string | undefined, apiKey: string): OpenAI {
  if (_client) return _client;
  _client = new OpenAI({ baseURL, apiKey });
  return _client;
}

export function isEmbeddingConfigured(): boolean {
  return readZaiConfig() !== null;
}

class ZaiEmbeddingProvider implements EmbeddingProvider {
  readonly name = "zai";
  private _dim = -1;

  constructor(private cfg: ZaiEmbeddingConfig) {}

  dimension(): number {
    return this._dim;
  }

  async embed(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) return [];
    const client = getClient(this.cfg.baseURL, this.cfg.apiKey);
    const resp = await client.embeddings.create({
      model: this.cfg.model,
      input: texts,
      ...(this.cfg.dimensions ? { dimensions: this.cfg.dimensions } : {}),
    });
    const vecs = resp.data
      .sort((a, b) => a.index - b.index)
      .map((d) => d.embedding);
    if (vecs.length > 0) this._dim = vecs[0].length;
    return vecs;
  }
}

// ─── Local fallback: bigram TF-IDF-style bag-of-bigrams ────────────
// No API. Works offline. Decent for short memory items (< 500 chars).
// Not as good as real embeddings for paraphrase / semantic similarity,
// but much better than exact keyword match.

function bigrams(text: string): string[] {
  // Normalize: lowercase, strip punctuation, collapse whitespace.
  const normalized = text
    .toLowerCase()
    .replace(/[\s，。！？、；：""''《》（）()【】「」『』.,!?;:"']/g, "")
    .replace(/[^\p{L}\p{N}]/gu, "");
  const result: string[] = [];
  const chars = Array.from(normalized);
  for (let i = 0; i < chars.length - 1; i++) {
    result.push(chars[i] + chars[i + 1]);
  }
  return result;
}

class LocalEmbeddingProvider implements EmbeddingProvider {
  readonly name = "local";
  dimension(): number {
    return -1; // sparse, dynamic per call
  }

  async embed(texts: string[]): Promise<number[][]> {
    // Build a shared bigram vocabulary across the batch so cosine is meaningful.
    const allBigrams = texts.map(bigrams);
    const vocab = new Map<string, number>();
    for (const bg of allBigrams) {
      const seen = new Set(bg);
      // IDF-ish: count documents containing each bigram
      for (const b of seen) {
        vocab.set(b, (vocab.get(b) ?? 0) + 1);
      }
    }
    const N = texts.length;
    const keys = Array.from(vocab.keys());

    return allBigrams.map((bg) => {
      const counts = new Map<string, number>();
      for (const b of bg) counts.set(b, (counts.get(b) ?? 0) + 1);
      const maxCount = Math.max(1, ...counts.values());
      const vec = new Array(keys.length).fill(0);
      for (let i = 0; i < keys.length; i++) {
        const k = keys[i];
        const tf = (counts.get(k) ?? 0) / maxCount;
        const df = vocab.get(k) ?? 1;
        const idf = Math.log((N + 1) / df);
        vec[i] = tf * idf;
      }
      // L2 normalize so cosine is just dot product.
      const norm = Math.sqrt(vec.reduce((s, x) => s + x * x, 0)) || 1;
      return vec.map((x) => x / norm);
    });
  }
}

// ─── Provider selection ───────────────────────────────────────────
let _provider: EmbeddingProvider | null = null;

export function getEmbeddingProvider(): EmbeddingProvider {
  if (_provider) return _provider;
  const cfg = readZaiConfig();
  _provider = cfg ? new ZaiEmbeddingProvider(cfg) : new LocalEmbeddingProvider();
  return _provider;
}

export function describeEmbeddingProvider(): string {
  return getEmbeddingProvider().name;
}

// ─── Math ─────────────────────────────────────────────────────────
export function cosine(a: number[], b: number[]): number {
  if (a.length !== b.length) return 0;
  let dot = 0;
  for (let i = 0; i < a.length; i++) dot += a[i] * b[i];
  return dot; // vectors are pre-normalized
}

export interface Scored<T> {
  item: T;
  score: number;
}

export function topKByCosine<T>(
  query: number[],
  candidates: { item: T; vector: number[] }[],
  k: number,
): Scored<T>[] {
  return candidates
    .map((c) => ({ item: c.item, score: cosine(query, c.vector) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, k);
}
