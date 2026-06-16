import type { ChatMode, DesignStageName } from "@/lib/types";

// Per-task policy for whether to disable GLM-5.x's reasoning phase.
//
// Reasoning helps when the model needs to plan or analyze before producing
// output: writing prose, checking for contradictions, careful rewrites,
// deciding what to extract from a chapter. For divergent ideation and
// casual chat it's mostly overhead — the TTFT cost dominates.
//
// Callers pass the result as `disableThinking` in ChatOptions. The env
// `ZAI_DISABLE_THINKING` acts as a global default; this policy overrides it
// per call.

export function disableThinkingForChatMode(mode: ChatMode | undefined): boolean {
  switch (mode) {
    case "check":     // 找矛盾 — analytical, needs careful reading
    case "edit":      // 改寫 — careful revision
    case "continue":  // 續寫正文 — prose generation
      return false;
    case "brainstorm":
    case "roleplay":
    case "research":
      return true;
    default:
      return true;
  }
}

export function disableThinkingForDesignStage(stage: DesignStageName): boolean {
  switch (stage) {
    case "directions": // divergent ideation
    case "intent":     // short summary, fast is fine
    case "details":    // divergent ideation
      return true;
    case "draft":      // full prose — needs planning
      return false;
  }
}

// Memory extraction (chapter or conversation → memory JSON) is structural
// analysis of "what's new, what changed". Needs reasoning.
export const DISABLE_THINKING_FOR_EXTRACTION = false;
