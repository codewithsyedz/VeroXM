// `next-auth/middleware`'s `withAuth()` helper passed Next's static
// "must export a function" check but then failed the exact same check
// again at actual request time under Next 16 — whatever it returns isn't
// reliably recognized as the middleware function once the runtime tries
// to invoke it, not just a re-export/interop issue like before. Rather
// than keep guessing at that wrapper's internals, this calls `getToken`
// directly — the lower-level primitive `withAuth` itself is built on, and
// a plain named `export async function middleware` that Next's runtime
// checker unambiguously recognizes either way.
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";

export async function middleware(req: NextRequest) {
  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });

  if (!token) {
    const signInUrl = new URL("/login", req.url);
    signInUrl.searchParams.set("callbackUrl", req.url);
    return NextResponse.redirect(signInUrl);
  }

  return NextResponse.next();
}

// Phase 1: only the Projects screen is gated. Add further dashboard paths
// here as they're built out in later phases.
export const config = {
  matcher: ["/projects/:path*"],
};
