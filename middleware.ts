import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE_NAME, verifySessionToken } from "@/lib/auth/token";

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (pathname === "/studio/login") {
    return NextResponse.next();
  }

  // Reader side and static assets are public.
  if (
    pathname === "/" ||
    pathname.startsWith("/works") ||
    pathname.startsWith("/audio") ||
    pathname.startsWith("/_next") ||
    pathname === "/favicon.ico"
  ) {
    return NextResponse.next();
  }

  const isProtected =
    pathname.startsWith("/studio") ||
    pathname.startsWith("/api/works") ||
    pathname.startsWith("/api/ai") ||
    pathname.startsWith("/api/tts") ||
    pathname.startsWith("/api/conversations");

  if (!isProtected) return NextResponse.next();

  const token = req.cookies.get(SESSION_COOKIE_NAME)?.value;
  if (await verifySessionToken(token)) return NextResponse.next();

  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const loginUrl = req.nextUrl.clone();
  loginUrl.pathname = "/studio/login";
  loginUrl.searchParams.set("next", pathname);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: [
    "/studio/:path*",
    "/api/works/:path*",
    "/api/ai/:path*",
    "/api/tts/:path*",
    "/api/conversations/:path*",
  ],
};
