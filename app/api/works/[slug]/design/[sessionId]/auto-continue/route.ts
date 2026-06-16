import { NextRequest, NextResponse } from "next/server";
import { generateStage } from "@/lib/design/generate";
import { readSession, writeSession } from "@/lib/design/session";
import { getCurrentUserId } from "@/lib/auth/session";
import { decodeParam } from "@/lib/utils/params";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 600; // up to 10 min for the whole pipeline

// Kick off background auto-continue for a design session.
// Returns immediately with the current session state; the actual stage-by-stage
// work runs detached from the request. The client polls session state to see
// progress, or just reloads the page when coming back.
//
// If autoStatus is already "running", returns 409 (don't start twice).
// If already "done", returns the session as-is (idempotent).
export async function POST(_req: NextRequest, { params }: { params: { slug: string; sessionId: string } }) {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const workSlug = decodeParam(params.slug);
  const sessionId = params.sessionId;

  let session;
  try {
    session = await readSession(userId, workSlug, sessionId);
  } catch {
    return NextResponse.json({ error: "session not found" }, { status: 404 });
  }

  if (session.committed) {
    return NextResponse.json({ session, message: "already committed" });
  }
  if (session.autoStatus === "running") {
    return NextResponse.json(
      { session, error: "auto-continue already running" },
      { status: 409 },
    );
  }

  // Mark running and kick off work detached from this request.
  const startedAt = new Date().toISOString();
  session.autoStatus = "running";
  session.autoStartedAt = startedAt;
  session.autoFinishedAt = undefined;
  session.autoError = undefined;
  // If any stage was stuck in "generating" (e.g. previous server crash),
  // reset to pending so we can re-run it.
  session.stages = session.stages.map((s) =>
    s.status === "generating" ? { ...s, status: "pending" as const } : s,
  );
  await writeSession(userId, session);

  // Fire-and-forget. The Next.js Node runtime keeps running this promise as
  // long as the server process is alive, even after the response is sent and
  // even if the client disconnects.
  void runAutoContinue(userId, workSlug, sessionId).catch(async (err) => {
    const s = await readSession(userId, workSlug, sessionId);
    s.autoStatus = "failed";
    s.autoError = (err as Error).message;
    s.autoFinishedAt = new Date().toISOString();
    await writeSession(userId, s);
  });

  return NextResponse.json({ session });
}

async function runAutoContinue(userId: string, workSlug: string, sessionId: string) {
  for (let i = 0; i < 4; i++) {
    // Re-read each iteration to pick up acceptedOutput from prior stages.
    const session = await readSession(userId, workSlug, sessionId);
    if (session.committed) return; // user committed manually while we were running
    const stage = session.stages[i];
    if (stage.status === "done" || stage.status === "skipped") continue;

    const result = await generateStage(
      { userId, workSlug, sessionId, stageIndex: i },
      { autoAccept: true }, // no human in the loop → auto-accept each output
    );
    if (!result.ok) {
      throw new Error(`Stage ${i + 1} failed: ${result.error ?? "unknown"}`);
    }
  }
  // All stages done.
  const final = await readSession(userId, workSlug, sessionId);
  final.autoStatus = "done";
  final.autoFinishedAt = new Date().toISOString();
  await writeSession(userId, final);
}

// GET returns the current session state — used by the client to poll progress.
export async function GET(_req: NextRequest, { params }: { params: { slug: string; sessionId: string } }) {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const workSlug = decodeParam(params.slug);
  try {
    const session = await readSession(userId, workSlug, params.sessionId);
    return NextResponse.json({ session });
  } catch {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
}
