import type { DesignSession, DesignStageName, MemoryPatch } from "@/lib/types";
import { readMemory } from "@/lib/memory/store";
import { getAdjacentChapters, listChapters, readChapter } from "@/lib/content/chapters";
import { readWork } from "@/lib/content/works";
import { getProvider } from "@/lib/ai/provider";
import { disableThinkingForDesignStage } from "@/lib/ai/thinking-policy";
import { parseMemoryPatchRaw, splitDraftAndPatch } from "@/lib/ai/proposal";
import { buildStagePrompt } from "./prompt";
import { readSession, updateStage, writeSession } from "./session";

const STAGE_INDEX_TO_NAME: DesignStageName[] = ["directions", "intent", "details", "draft"];

export interface GenerateStageContext {
  workSlug: string;
  sessionId: string;
  stageIndex: number;
}

// Load whatever context the stage prompt needs (memory, chapters, work title).
// Re-read per call so auto-continue picks up the freshest state between stages.
async function loadContext(workSlug: string, session: DesignSession, stageIndex: number) {
  const memory = await readMemory(workSlug);
  let chapter = null;
  let previousChapter = null;
  if (session.chapterSlug) {
    try {
      chapter = await readChapter(workSlug, session.chapterSlug);
      const adj = await getAdjacentChapters(workSlug, session.chapterSlug);
      previousChapter = adj.previous;
    } catch {
      // ignore
    }
  } else if (stageIndex === 3) {
    const chapters = await listChapters(workSlug);
    if (chapters.length > 0) {
      previousChapter = chapters[chapters.length - 1];
    }
  }
  let workTitle = workSlug;
  try {
    workTitle = (await readWork(workSlug)).title;
  } catch {
    // ignore
  }
  return { memory, chapter, previousChapter, workTitle };
}

// Run one stage end-to-end: mark generating → call AI → persist output.
// `onDelta` is invoked for each streamed token (optional; used by the
// streaming HTTP endpoint to forward chunks to the client).
// `signal` aborts the upstream AI call (client disconnect, etc).
//
// After successful completion, the stage is marked `done` with both `output`
// and `acceptedOutput` set — so auto-continue mode picks up the result without
// a human "accept" step.
export async function generateStage(
  ctx: GenerateStageContext,
  options?: {
    onDelta?: (text: string) => void;
    signal?: AbortSignal;
    /** When true (auto-continue mode), set acceptedOutput = output on success. */
    autoAccept?: boolean;
  },
): Promise<{ output: string; ok: boolean; error?: string }> {
  const { workSlug, sessionId, stageIndex } = ctx;
  const session = await readSession(workSlug, sessionId);
  const stageName = STAGE_INDEX_TO_NAME[stageIndex];

  // Mark generating.
  session.stages[stageIndex] = {
    ...session.stages[stageIndex],
    status: "generating",
    output: "",
    acceptedOutput: undefined,
    userEditedOutput: undefined,
  };
  await writeSession(session);

  const { memory, chapter, previousChapter, workTitle } = await loadContext(workSlug, session, stageIndex);
  const { system, user } = await buildStagePrompt({
    workSlug,
    workTitle,
    memory,
    chapter,
    previousChapter,
    session,
    stage: stageName,
  });

  let output = "";
  const provider = await getProvider();
  const temperature = stageName === "draft" ? 0.85 : 0.7;
  const disableThinking = disableThinkingForDesignStage(stageName);
  try {
    for await (const delta of provider.stream(
      [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      { temperature, signal: options?.signal, disableThinking },
    )) {
      output += delta;
      options?.onDelta?.(delta);
    }

    // Stage 4 (draft) emits prose + optional MEMORY_PATCH block. Split them
    // so prose becomes the chapter content and the patch rides along for
    // commit-time application. Other stages store the raw output verbatim.
    let storedOutput = output;
    let memoryPatch: MemoryPatch | null = null;
    if (stageName === "draft") {
      const { prose, patchRaw } = splitDraftAndPatch(output);
      if (patchRaw !== null) {
        storedOutput = prose;
        memoryPatch = patchRaw ? (parseMemoryPatchRaw<MemoryPatch>(patchRaw) ?? null) : null;
      }
    }

    await updateStage(workSlug, sessionId, stageIndex, {
      status: "done",
      output: storedOutput,
      ...(options?.autoAccept ? { acceptedOutput: storedOutput } : {}),
      ...(stageName === "draft" ? { memoryPatch } : {}),
    });
    return { output: storedOutput, ok: true };
  } catch (err) {
    // Save whatever partial output we have and revert to pending.
    await updateStage(workSlug, sessionId, stageIndex, {
      status: "pending",
      output,
    });
    return { output, ok: false, error: (err as Error).message };
  }
}
