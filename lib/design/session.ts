import { promises as fs } from "node:fs";
import { nanoid } from "nanoid";
import type { DesignSession, DesignStage, DesignMode } from "@/lib/types";
import { designSessionPath, designSessionsDir } from "@/lib/content/design-paths";

const STAGE_NAMES = ["directions", "intent", "details", "draft"] as const;

export function emptyStages(): DesignStage[] {
  return STAGE_NAMES.map((name) => ({
    name,
    status: "pending",
    output: "",
  }));
}

export function newSession(args: {
  workSlug: string;
  chapterSlug: string | null;
  mode: DesignMode;
  goal: string;
}): DesignSession {
  const now = new Date().toISOString();
  return {
    id: nanoid(12),
    workSlug: args.workSlug,
    chapterSlug: args.chapterSlug,
    mode: args.mode,
    goal: args.goal,
    stages: emptyStages(),
    committed: false,
    createdAt: now,
    updatedAt: now,
  };
}

export async function readSession(workSlug: string, sessionId: string): Promise<DesignSession> {
  const raw = await fs.readFile(designSessionPath(workSlug, sessionId), "utf8");
  return JSON.parse(raw) as DesignSession;
}

export async function writeSession(session: DesignSession): Promise<DesignSession> {
  const updated = { ...session, updatedAt: new Date().toISOString() };
  await fs.mkdir(designSessionsDir(updated.workSlug), { recursive: true });
  await fs.writeFile(
    designSessionPath(updated.workSlug, updated.id),
    JSON.stringify(updated, null, 2) + "\n",
    "utf8",
  );
  return updated;
}

export async function listSessions(workSlug: string): Promise<DesignSession[]> {
  try {
    const entries = await fs.readdir(designSessionsDir(workSlug));
    const sessions: DesignSession[] = [];
    for (const file of entries) {
      if (!file.endsWith(".json")) continue;
      try {
        sessions.push(
          JSON.parse(
            await fs.readFile(
              designSessionPath(workSlug, file.replace(/\.json$/, "")),
              "utf8",
            ),
          ) as DesignSession,
        );
      } catch {
        // skip malformed
      }
    }
    return sessions.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw err;
  }
}

// Find the most recent in-progress (not committed) session for a chapter.
// Used to auto-resume when the author returns to the design page.
// For `fresh` sessions, we match by chapterSlug=null AND no chapter has been
// written between sessions — but for simplicity, fresh sessions are NOT auto-
// resumed (each "new chapter" intent gets its own session, deliberately).
export async function findOpenSessionForChapter(
  workSlug: string,
  chapterSlug: string,
): Promise<DesignSession | null> {
  const all = await listSessions(workSlug);
  return (
    all.find((s) => !s.committed && s.chapterSlug === chapterSlug) ?? null
  );
}

export async function deleteSession(workSlug: string, sessionId: string): Promise<void> {
  await fs.rm(designSessionPath(workSlug, sessionId), { force: true });
}

export async function updateStage(
  workSlug: string,
  sessionId: string,
  stageIndex: number,
  patch: Partial<DesignStage>,
): Promise<DesignSession> {
  if (stageIndex < 0 || stageIndex >= 4) throw new Error("invalid stage index");
  const session = await readSession(workSlug, sessionId);
  session.stages[stageIndex] = { ...session.stages[stageIndex], ...patch };
  return writeSession(session);
}
