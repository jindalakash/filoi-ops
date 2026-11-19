import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, verifySession } from "./lib/session";

// Optimistic check only — every page/action re-verifies the user from the database.
export async function proxy(req: NextRequest) {
  const session = await verifySession(req.cookies.get(SESSION_COOKIE)?.value);
  const isLogin = req.nextUrl.pathname.startsWith("/login");
  if (!session && !isLogin) {
    const url = new URL("/login", req.url);
    if (req.nextUrl.pathname !== "/") url.searchParams.set("next", req.nextUrl.pathname);
    return NextResponse.redirect(url);
  }
  if (session && isLogin && !req.nextUrl.searchParams.has("expired")) return NextResponse.redirect(new URL("/", req.url));
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|filoi-logo.png|.*\\.(?:png|svg|jpg|ico)$).*)"],
};
