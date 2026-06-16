import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { makeSessionToken, setSessionCookie, verifyPassword } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

const Body = z.object({ password: z.string() });

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const parsed = Body.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid" }, { status: 400 });
  }
  if (!verifyPassword(parsed.data.password)) {
    return NextResponse.json({ error: "wrong password" }, { status: 401 });
  }
  await setSessionCookie(await makeSessionToken());
  return NextResponse.json({ ok: true });
}
