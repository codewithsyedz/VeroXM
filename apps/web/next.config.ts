import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // packages/db ships raw TypeScript (no build step) — Next.js needs to
  // transpile it itself rather than treating it as pre-built.
  transpilePackages: ["@mycms/db", "@mycms/shared-types"],

  // Lets a second `next dev` instance of this SAME app run alongside the
  // main one (docker-compose.yml's `web-marketing` service, added so the
  // marketing site can be reached on its own domain -- see gateway.conf's
  // second server{} block) without the two clobbering each other's build
  // cache. Both containers bind-mount the same host source tree, so
  // without this they'd both write to the same ./.next directory at once
  // -- `web-marketing` sets NEXT_DIST_DIR=.next-marketing; `web` leaves it
  // unset and keeps the default ./.next.
  distDir: process.env.NEXT_DIST_DIR || ".next",

  // This app is reached through the nginx `gateway` container
  // (docker-compose.yml), which proxies http://localhost:8080 -> web:3000
  // (dashboard/admin) and http://veroxm.local:8080 -> web-marketing:3000
  // (public marketing site, same app, second container -- see
  // docker/nginx/gateway.conf). Next.js's built-in Server Actions CSRF
  // check rejects every action request whose Origin isn't in this
  // allowlist — without it, EVERY create/update action (including the
  // marketing site's "Book a Demo" form) fails with "Invalid Server
  // Actions request.", reproducibly, regardless of browser cache/session
  // (confirmed via a fresh incognito window and a raw curl replay, both
  // rejected server-side with the same error). Add any other external
  // host/port this app gets served through (a deployed domain, a
  // different local port) to this list as well.
  experimental: {
    serverActions: {
      allowedOrigins: ["localhost:8080", "veroxm.local:8080"],
    },
  },
};

export default nextConfig;
