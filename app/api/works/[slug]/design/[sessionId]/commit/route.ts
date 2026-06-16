import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { readSession, writeSession } from "@/lib/design/session";
import { applyChapterUpdate, createChapter } from "@/lib/content/chapters";
import { syncWork } from "@/lib/content/sync";
import { readMemory, writeMemory } from "@/lib/memory/store";
import { isPatchEmpty } from "@/lib/types";
import type { Character, MemoryPatch, PlotStatus, PlotThread, WorldEntry } from "@/lib/types";
import { newMemoryId } from "@/lib/memory/id";
import { decodeParam } from "@/lib/utils/params";

export const dynamic = "force-dynamic";

const Body = z.object({
  /** When false, commit only the chapter prose and skip the memory patch. */
  applyMemoryPatch: z.boolean().optional(),
}).optional();

const VALID_PLOT_STATUS: PlotStatus[] = ["setup", "developing", "climax", "resolved"];

// Apply a MemoryPatch on top of an existing WorkMemory. Returns the new memory.
// Defensive: ignores updates for unknown IDs, drops obviously broken entries.
function applyPatch(memory: ReturnType<typeof emptyWorkMemory>, patch: MemoryPatch) {
  // Characters
  if (patch.addCharacters?.length) {
    for (const c of patch.addCharacters) {
      memory.characters.push({
        ...c,
        id: c.id?.trim() || newMemoryId(),
        name: c.name?.trim() || "未命名角色",
        aliases: c.aliases ?? [],
        role: c.role ?? "",
        description: c.description ?? "",
        traits: c.traits ?? [],
        relationships: c.relationships ?? [],
        arc: c.arc ?? "",
      });
    }
  }
  if (patch.updateCharacters?.length) {
    for (const { id, patch: p } of patch.updateCharacters) {
      const idx = memory.characters.findIndex((c) => c.id === id);
      if (idx === -1) continue;
      memory.characters[idx] = { ...memory.characters[idx], ...p, id };
    }
  }
  if (patch.removeCharacters?.length) {
    const drop = new Set(patch.removeCharacters);
    memory.characters = memory.characters.filter((c) => !drop.has(c.id));
  }

  // Worldbuilding
  if (patch.addWorldbuilding?.length) {
    for (const w of patch.addWorldbuilding) {
      memory.worldbuilding.push({
        ...w,
        id: w.id?.trim() || newMemoryId(),
        name: w.name?.trim() || "未命名條目",
        category: w.category ?? "",
        description: w.description ?? "",
        notes: w.notes ?? "",
      });
    }
  }
  if (patch.updateWorldbuilding?.length) {
    for (const { id, patch: p } of patch.updateWorldbuilding) {
      const idx = memory.worldbuilding.findIndex((w) => w.id === id);
      if (idx === -1) continue;
      memory.worldbuilding[idx] = { ...memory.worldbuilding[idx], ...p, id };
    }
  }
  if (patch.removeWorldbuilding?.length) {
    const drop = new Set(patch.removeWorldbuilding);
    memory.worldbuilding = memory.worldbuilding.filter((w) => !drop.has(w.id));
  }

  // Plot
  if (patch.addPlot?.length) {
    for (const p of patch.addPlot) {
      const status: PlotStatus = VALID_PLOT_STATUS.includes(p.status as PlotStatus)
        ? (p.status as PlotStatus)
        : "setup";
      memory.plot.push({
        ...p,
        id: p.id?.trim() || newMemoryId(),
        title: p.title?.trim() || "未命名情節線",
        status,
        summary: p.summary ?? "",
        linkedChapters: p.linkedChapters ?? [],
        foreshadowing: p.foreshadowing ?? "",
      });
    }
  }
  if (patch.updatePlot?.length) {
    for (const { id, patch: p } of patch.updatePlot) {
      const idx = memory.plot.findIndex((x) => x.id === id);
      if (idx === -1) continue;
      const merged = { ...memory.plot[idx], ...p, id } as PlotThread;
      if (p.status && !VALID_PLOT_STATUS.includes(merged.status)) {
        merged.status = memory.plot[idx].status; // revert invalid
      }
      memory.plot[idx] = merged;
    }
  }
  if (patch.removePlot?.length) {
    const drop = new Set(patch.removePlot);
    memory.plot = memory.plot.filter((p) => !drop.has(p.id));
  }

  // Style
  if (patch.styleAppend?.trim()) {
    memory.style = (memory.style ?? "") + (memory.style?.endsWith("\n") ? "" : "\n") + patch.styleAppend.trim() + "\n";
  }

  return memory;
}

function emptyWorkMemory() {
  return { characters: [] as Character[], worldbuilding: [] as WorldEntry[], plot: [] as PlotThread[], style: "" };
}

// Commit the draft (stage 4) to the chapter, and — if a memory patch exists
// and the caller didn't opt out — apply the patch in the same transaction.
export async function POST(req: NextRequest, { params }: { params: { slug: string; sessionId: string } }) {
  const slug = decodeParam(params.slug);
  const session = await readSession(slug, params.sessionId);

  const draftStage = session.stages[3];
  const draft = draftStage.acceptedOutput ?? draftStage.userEditedOutput ?? draftStage.output;
  if (!draft.trim()) {
    return NextResponse.json({ error: "draft stage is empty" }, { status: 400 });
  }

  const body = await req.json().catch(() => ({}));
  const parsed = Body.safeParse(body);
  const applyMemoryPatch = parsed.success ? parsed.data?.applyMemoryPatch ?? true : true;

  // 1) Commit chapter (with version snapshot for existing chapters).
  let chapter;
  if (session.chapterSlug) {
    chapter = await applyChapterUpdate(slug, session.chapterSlug, { content: draft }, "design");
  } else {
    const title = session.goal.slice(0, 30).replace(/\s+/g, " ").trim() || "新章節";
    chapter = await createChapter(slug, { title, content: draft });
  }
  await syncWork(slug);

  // 2) Apply memory patch if present and not opted out.
  const patch = draftStage.memoryPatch;
  const patchSummary = { applied: false, added: 0, updated: 0, removed: 0, styleAppend: false, skipped: false };
  if (patch && !isPatchEmpty(patch) && applyMemoryPatch) {
    try {
      const current = await readMemory(slug);
      const before = {
        c: current.characters.length,
        w: current.worldbuilding.length,
        p: current.plot.length,
      };
      const next = applyPatch(current, patch);
      const after = {
        c: next.characters.length,
        w: next.worldbuilding.length,
        p: next.plot.length,
      };
      await writeMemory(slug, next);
      patchSummary.applied = true;
      patchSummary.added =
        Math.max(0, after.c - before.c) + Math.max(0, after.w - before.w) + Math.max(0, after.p - before.p);
      patchSummary.removed =
        Math.max(0, before.c - after.c) + Math.max(0, before.w - after.w) + Math.max(0, before.p - after.p);
      patchSummary.updated =
        (patch.updateCharacters?.length ?? 0) +
        (patch.updateWorldbuilding?.length ?? 0) +
        (patch.updatePlot?.length ?? 0);
      patchSummary.styleAppend = Boolean(patch.styleAppend?.trim());
    } catch (err) {
      // Patch apply failure shouldn't block chapter commit. Surface the error.
      return NextResponse.json(
        {
          chapter,
          sessionId: session.id,
          patchError: (err as Error).message,
        },
        { status: 200 },
      );
    }
  } else if (patch && !isPatchEmpty(patch) && !applyMemoryPatch) {
    patchSummary.skipped = true;
  }

  const committed = {
    ...session,
    chapterSlug: chapter.slug,
    committed: true,
  };
  await writeSession(committed);

  return NextResponse.json({ chapter, sessionId: session.id, patch: patchSummary });
}
