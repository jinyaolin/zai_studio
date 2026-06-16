// ─── Work (作品) ───────────────────────────────────────────────────
export type WorkType = "long" | "medium" | "short";
export type WorkStatus = "draft" | "published" | "archived";

/**
 * Per-work TTS narration settings. Stored on `work.json` so each work can
 * pick its own voice character + reading style + speed without env vars.
 *
 * - `voiceCharacter` matches an id from `lib/tts/narration.ts`'s voice list
 *   (which is discovered by scanning COSYVOICE_VOICES_DIR + the bundled
 *   default). At minimum "default" is always available.
 * - `stylePreset` matches an id from `STYLE_PRESETS`. "custom" means use
 *   `customInstruct` as-is.
 * - `customInstruct` is free-form natural-language style guidance sent to
 *   CosyVoice's instruct mode. Empty when `stylePreset !== "custom"`.
 * - `speed` 0.5 ~ 2.0; 1.0 is normal.
 */
export interface NarrationConfig {
  voiceCharacter: string;
  stylePreset: string;
  customInstruct: string;
  speed: number;
}

export interface Work {
  slug: string;
  title: string;
  type: WorkType;
  status: WorkStatus;
  synopsis: string;
  genre?: string;
  tags: string[];
  coverImage?: string;
  narration?: NarrationConfig;
  createdAt: string;
  updatedAt: string;
  publishedAt: string | null;
}

// ─── Chapter (章節) ────────────────────────────────────────────────
export type ChapterStatus = "draft" | "final";

export interface Chapter {
  slug: string;
  workSlug: string;
  order: number;
  title: string;
  content: string;
  status: ChapterStatus;
  wordCount: number;
  createdAt: string;
  updatedAt: string;
}

// ─── Memory ───────────────────────────────────────────────────────
export interface Character {
  id: string;
  name: string;
  aliases: string[];
  role: string;
  description: string;
  traits: string[];
  relationships: { characterName: string; relation: string }[];
  arc: string;
}

export interface WorldEntry {
  id: string;
  name: string;
  category: string;
  description: string;
  notes: string;
}

export type PlotStatus = "setup" | "developing" | "climax" | "resolved";

export interface PlotThread {
  id: string;
  title: string;
  status: PlotStatus;
  summary: string;
  linkedChapters: string[];
  foreshadowing: string;
}

export interface WorkMemory {
  characters: Character[];
  worldbuilding: WorldEntry[];
  plot: PlotThread[];
  style: string;
}

export function emptyMemory(): WorkMemory {
  return { characters: [], worldbuilding: [], plot: [], style: "" };
}

// ─── Conversation ──────────────────────────────────────────────────
export type ChatMode =
  | "brainstorm"
  | "continue"
  | "check"
  | "roleplay"
  | "edit"
  | "research";

export interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  mode?: ChatMode;
  attachments?: MemoryRef[];
  createdAt: string;
}

export interface Conversation {
  id: string;
  workSlug: string;
  title: string;
  messages: ChatMessage[];
  scope: ConversationScope;
  createdAt: string;
  updatedAt: string;
}

export type MemoryKind = "characters" | "worldbuilding" | "plot";

export type ConversationScope =
  | { kind: "general" }
  | { kind: "memory"; memoryKind: MemoryKind; itemId: string }
  | { kind: "chapter"; chapterSlug: string }
  | { kind: "design"; sessionId: string };

export function generalScope(): ConversationScope {
  return { kind: "general" };
}

// Some older conversations don't have a scope field — treat as general.
export function normalizeScope(scope: ConversationScope | undefined): ConversationScope {
  return scope ?? { kind: "general" };
}

export interface MemoryRef {
  kind: "character" | "world" | "plot" | "style";
  id?: string;
  snippet: string;
}

// ─── AI Provider ───────────────────────────────────────────────────
export interface ProviderChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface ChatOptions {
  mode?: ChatMode;
  temperature?: number;
  maxTokens?: number;
  signal?: AbortSignal;
  /**
   * Override the env-level thinking-disable behavior for this call.
   * - `true`  → send `thinking: { type: "disabled" }` (faster, less reasoning)
   * - `false` → send nothing (z.ai GLM-5.x default: reasoning on)
   * - undefined → fall back to ZAI_DISABLE_THINKING env var
   *
   * Per-call policy: heavy reasoning tasks (writing, checking, extraction)
   * pass `false` even when the env default is `true`; lightweight chat passes
   * `true` for fast TTFT.
   */
  disableThinking?: boolean;
}

export interface ChatResponse {
  content: string;
}

// ─── Chapter Versions ─────────────────────────────────────────────
export interface ChapterVersion {
  timestamp: string;     // ISO-8601, used as id
  reason: string;        // "manual" | "design" | "ai-edit" | custom
  title: string;
  status: ChapterStatus;
  wordCount: number;
  sizeBytes: number;
}

// ─── Design Thinking ──────────────────────────────────────────────
export type DesignMode = "continue" | "rewrite" | "fresh";

export type DesignStageName = "directions" | "intent" | "details" | "draft";

export type DesignStageStatus = "pending" | "generating" | "done" | "skipped";

export interface DesignStage {
  name: DesignStageName;
  status: DesignStageStatus;
  /** Output produced by zai (markdown). Empty until status === "done". */
  output: string;
  /** If the user edited the output before locking it in, this is their version. */
  userEditedOutput?: string;
  /** What was actually accepted as context for the next stage. */
  acceptedOutput?: string;
  /**
   * For Stage 4 (draft) only: structured memory patch parsed out of the model
   * output (the `<MEMORY_PATCH>...</MEMORY_PATCH>` block after the prose).
   * Applied to memory when the session is committed. Absent on older sessions.
   */
  memoryPatch?: MemoryPatch | null;
  updatedAt?: string;
}

// Structured diff the model emits alongside Stage 4 draft prose. Only entries
// that need to change are listed; untouched entries aren't repeated.
export interface MemoryPatch {
  addCharacters?: Character[];
  updateCharacters?: Array<{ id: string; patch: Partial<Character> }>;
  removeCharacters?: string[]; // by id

  addWorldbuilding?: WorldEntry[];
  updateWorldbuilding?: Array<{ id: string; patch: Partial<WorldEntry> }>;
  removeWorldbuilding?: string[];

  addPlot?: PlotThread[];
  updatePlot?: Array<{ id: string; patch: Partial<PlotThread> }>;
  removePlot?: string[];

  /** Text to append to style.md (NOT a replacement). */
  styleAppend?: string;
}

export function emptyMemoryPatch(): MemoryPatch {
  return {};
}

export function isPatchEmpty(p: MemoryPatch | null | undefined): boolean {
  if (!p) return true;
  return (
    (p.addCharacters?.length ?? 0) === 0 &&
    (p.updateCharacters?.length ?? 0) === 0 &&
    (p.removeCharacters?.length ?? 0) === 0 &&
    (p.addWorldbuilding?.length ?? 0) === 0 &&
    (p.updateWorldbuilding?.length ?? 0) === 0 &&
    (p.removeWorldbuilding?.length ?? 0) === 0 &&
    (p.addPlot?.length ?? 0) === 0 &&
    (p.updatePlot?.length ?? 0) === 0 &&
    (p.removePlot?.length ?? 0) === 0 &&
    !p.styleAppend?.trim()
  );
}

export interface DesignSession {
  id: string;
  workSlug: string;
  chapterSlug: string | null;    // null for "fresh / new chapter"
  mode: DesignMode;
  goal: string;
  stages: DesignStage[];         // length 4
  committed: boolean;
  /** Background auto-continue state. Absent on older sessions = "idle". */
  autoStatus?: "running" | "done" | "failed";
  autoStartedAt?: string;
  autoFinishedAt?: string;
  autoError?: string;
  createdAt: string;
  updatedAt: string;
}

// ─── TTS ───────────────────────────────────────────────────────────
export interface AudioChunk {
  index: number;
  text: string;
  url: string;
  cached: boolean;
}

export interface AudioManifest {
  workSlug: string;
  chapterSlug: string;
  voice: string;
  chunks: AudioChunk[];
}
