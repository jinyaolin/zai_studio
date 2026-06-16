import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { readMemory, writeMemory } from "@/lib/memory/store";
import { emptyMemory } from "@/lib/types";
import type { PlotStatus, WorkMemory } from "@/lib/types";
import { decodeParam } from "@/lib/utils/params";
import { newMemoryId } from "@/lib/memory/id";
import { getCurrentUserId } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

// Lenient input schema — AI-generated memory JSON is often missing optional
// fields or uses slightly wrong enum values. We coerce / default aggressively
// rather than reject, so the author doesn't get stuck when "採用" silently
// 400s. `.passthrough()` keeps unknown fields (we strip them in normalize()).
const MemorySchema = z.object({
  characters: z.array(
    z
      .object({
        id: z.string().optional(),
        name: z.string().optional(),
        aliases: z.array(z.string()).default([]),
        role: z.string().default(""),
        description: z.string().default(""),
        traits: z.array(z.string()).default([]),
        relationships: z
          .array(
            z.object({
              characterName: z.string().default(""),
              relation: z.string().default(""),
            }),
          )
          .default([]),
        arc: z.string().default(""),
      })
      .passthrough(),
  ),
  worldbuilding: z.array(
    z
      .object({
        id: z.string().optional(),
        name: z.string().optional(),
        category: z.string().default(""),
        description: z.string().default(""),
        notes: z.string().default(""),
      })
      .passthrough(),
  ),
  plot: z.array(
    z
      .object({
        id: z.string().optional(),
        title: z.string().optional(),
        status: z.string().default("setup"),
        summary: z.string().default(""),
        linkedChapters: z.array(z.string()).default([]),
        foreshadowing: z.string().default(""),
      })
      .passthrough(),
  ),
  style: z.string().default(""),
});

const VALID_PLOT_STATUS: PlotStatus[] = ["setup", "developing", "climax", "resolved"];

// Apply runtime fixups the lenient schema can't express:
//   - missing id → generate one
//   - missing name/title → placeholder so the entry is visible
//   - invalid plot status → fall back to "setup"
//   - drop entries that are completely empty (no name AND no description)
function normalize(parsed: z.infer<typeof MemorySchema>): WorkMemory {
  const characters = parsed.characters
    .map((c) => ({
      id: c.id?.trim() || newMemoryId(),
      name: c.name?.trim() || "未命名角色",
      aliases: c.aliases,
      role: c.role,
      description: c.description,
      traits: c.traits,
      relationships: c.relationships,
      arc: c.arc,
    }))
    .filter((c) => !(c.name === "未命名角色" && !c.description));

  const worldbuilding = parsed.worldbuilding
    .map((w) => ({
      id: w.id?.trim() || newMemoryId(),
      name: w.name?.trim() || "未命名條目",
      category: w.category,
      description: w.description,
      notes: w.notes,
    }))
    .filter((w) => !(w.name === "未命名條目" && !w.description));

  const plot = parsed.plot
    .map((p) => ({
      id: p.id?.trim() || newMemoryId(),
      title: p.title?.trim() || "未命名情節線",
      status: (VALID_PLOT_STATUS.includes(p.status as PlotStatus)
        ? (p.status as PlotStatus)
        : "setup") as PlotStatus,
      summary: p.summary,
      linkedChapters: p.linkedChapters,
      foreshadowing: p.foreshadowing,
    }))
    .filter((p) => !(p.title === "未命名情節線" && !p.summary));

  return { characters, worldbuilding, plot, style: parsed.style };
}

export async function GET(_req: NextRequest, { params }: { params: { slug: string } }) {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const slug = decodeParam(params.slug);
  try {
    const memory = await readMemory(userId, slug);
    return NextResponse.json({ memory });
  } catch {
    return NextResponse.json({ memory: emptyMemory() });
  }
}

export async function PUT(req: NextRequest, { params }: { params: { slug: string } }) {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const slug = decodeParam(params.slug);
  const body = await req.json().catch(() => null);
  const parsed = MemorySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const memory = normalize(parsed.data);
  await writeMemory(userId, slug, memory);
  return NextResponse.json({ memory });
}
