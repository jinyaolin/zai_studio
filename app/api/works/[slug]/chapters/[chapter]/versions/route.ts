import { NextRequest, NextResponse } from "next/server";
import { listVersions } from "@/lib/content/chapters";
import { decodeParam } from "@/lib/utils/params";

export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest, { params }: { params: { slug: string; chapter: string } }) {
  const slug = decodeParam(params.slug);
  const chapterSlug = decodeParam(params.chapter);
  const versions = await listVersions(slug, chapterSlug);
  return NextResponse.json({ versions });
}
