import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // packages/db ships raw TypeScript (no build step) — Next.js needs to
  // transpile it itself rather than treating it as pre-built.
  transpilePackages: ["@mycms/db", "@mycms/shared-types"],

  // This app is only ever reached through the nginx `gateway` container
  // (docker-compose.yml), which proxies http://localhost:8080 -> web:3000.
  // Next.js's built-in Server Actions CSRF check rejects every action
  // request whose Origin isn't in this allowlist — without it, EVERY
  // create/update action fails with "Invalid Server Actions request.",
  // reproducibly, regardless of browser cache/session (confirmed via a
  // fresh incognito window and a raw curl replay, both rejected
  // server-side with the same error). Add any other external host/port
  // this app gets served through (a deployed domain, a different local
  // port) to this list as well.
  experimental: {
    serverActions: {
      allowedOrigins: ["localhost:8080"],
    },
  },
};

export default nextConfig;
