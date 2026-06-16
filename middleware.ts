import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE_NAME, verifyUserSessionToken } from "@/lib/auth/token";

// Public paths that don't require a signed-in user.
function isPublicPath(pathname: string): boolean {
  if (pathname === "/") return true;
  if (pathname === "/studio/login") return true;
  if (pathname.startsWith("/works")) return true;
  if (pathname.startsWith("/audio")) return true;
  if (pathname.startsWith("/_next")) return true;
  if (pathname === "/favicon.ico") return true;
  // Auth API endpoints (start/callback/logout/handle/status) handle their own logic.
  if (pathname.startsWith("/api/auth/")) return true;
  return false;
}

// Routes that require a signed-in user (but not necessarily a handle).
function isProtectedRoute(pathname: string): boolean {
  if (pathname.startsWith("/studio")) return true;
  if (pathname.startsWith("/api/works")) return true;
  if (pathname.startsWith("/api/ai")) return true;
  if (pathname.startsWith("/api/tts")) return true;
  if (pathname.startsWith("/api/conversations")) return true;
  return false;
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (isPublicPath(pathname)) return NextResponse.next();
  if (!isProtectedRoute(pathname)) return NextResponse.next();

  // Verify session — pure HMAC check, no DB (edge runtime compatible).
  const token = req.cookies.get(SESSION_COOKIE_NAME)?.value;
  const session = await verifyUserSessionToken(token);
  if (!session) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
    const loginUrl = req.nextUrl.clone();
    loginUrl.pathname = "/studio/login";
    loginUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
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
