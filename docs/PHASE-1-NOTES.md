# Phase 1 — Auth, Users, Projects (read)

What's built, how to run it, and what's deliberately left for later.

## What's built

- **NestJS (`apps/api`)**: a `PrismaModule` (global, manages the DB connection lifecycle), an `AuthModule` with a `JwtAuthGuard`, and a read-only `ProjectsModule` — `GET /projects` (list) and `GET /projects/:id` (detail, with its collections), both guarded.
- **Next.js (`apps/web`)**: NextAuth (`next-auth@4`, the current stable release — v5/Auth.js is still in beta on npm) with a Credentials provider that looks users up via Prisma and checks their password with `bcryptjs`; a `/login` page; middleware protecting `/projects/*`; and the Projects list screen (`(dashboard)/projects/page.tsx`) now actually fetching from the NestJS API instead of showing placeholder text.
- Styling is plain Tailwind defaults, not the Aperture art direction — you asked to prioritize the functional migration over visual polish for this phase, so the two haven't been merged yet. Whenever you want to fold the design system in, get me on that track and I'll go back through with a follow-up pass.

## The two-token design (worth understanding before touching auth code)

There are two different signed tokens in play, on purpose:

1. **NextAuth's own session token** — a browser-facing httpOnly cookie, internal to NextAuth (encrypted JWE format). This is what keeps a human logged into the Next.js admin panel. Nothing outside NextAuth is meant to parse this.
2. **A short-lived API token** — a plain HS256 JWT, minted in NextAuth's `jwt` callback (`apps/web/src/lib/auth.ts`) right after a successful login, containing just the user id and email, 15-minute expiry. This is what Next.js's server components attach as `Authorization: Bearer ...` when calling the NestJS API, and it's what `JwtAuthGuard` (`apps/api/src/auth/jwt-auth.guard.ts`) verifies.

Why two tokens instead of one: NextAuth's session format is an implementation detail that can change between versions, and isn't designed to be verified by a separate service. A plain, explicitly-shared-secret JWT is a much smaller, more stable contract between the two apps. Both apps read the shared secret from `API_JWT_SECRET` — it must be identical in both `.env` files.

## Running it locally

1. Copy the three `.env.example` files (`packages/db/`, `apps/api/`, `apps/web/`) to `.env` and fill in a real `DATABASE_URL` — ideally a **staging copy** of the production database, not production itself, until you've verified everything against real data. `API_JWT_SECRET` must be identical in `apps/api/.env` and `apps/web/.env`; `NEXTAUTH_SECRET` is separate and only needs to be set in `apps/web/.env`.
2. `npm run db:generate` (from the repo root) — this needs real network access to `binaries.prisma.sh`. It's blocked from this session's device-bridge shell (confirmed: even the checksum-only fetch gets a 403), so run this one from your own terminal on your Mac, not through Claude. It should work fine there since your Mac's own internet access isn't restricted the way this bridged session's is.
3. `npm run dev:api` and `npm run dev:web` (two terminals, or two tabs) — the api on :4000, the web app on :3000.
4. Log in at `/login` with an existing user's email and current password. This is the one thing I could not verify end-to-end from here (no live DB connection available in this session) — Laravel's default bcrypt hashes (`$2y$...`) and `bcryptjs`'s comparison are documented-compatible, but please confirm against one real account before trusting it broadly.

## Two environment quirks hit while building this (not code bugs)

- `npm install` needs `--legacy-peer-deps` — an npm/arborist bug triggered by NestJS's vitest peer dependencies, unrelated to anything in this project.
- `next build`'s production build fetches the Geist font from `fonts.googleapis.com` at build time; that host wasn't reachable from this session's shell either. `npx tsc --noEmit` (clean) is what I used instead to verify the Next.js code type-checks correctly. This should build fine on a machine with normal internet access — flag it to me if it doesn't.

Both `apps/api` (`nest build`) and `apps/web` (`tsc --noEmit`) currently compile cleanly.

**Amendment, from Phase 2:** "compiles cleanly" needs a caveat I didn't have yet when I wrote this. `prisma generate` never actually completed in this environment, so `PrismaClient` here is still Prisma's own untyped placeholder (`type PrismaClient = any`) — meaning `ProjectsService`'s Prisma calls were syntax-checked, not type-checked against the real schema. See "An important caveat" in `docs/PHASE-2-NOTES.md` for the full explanation. Worth a `nest build` re-check once `db:generate` actually runs against real network access.

## Deliberately not in this phase

Per the migration roadmap, Phase 1 is read-only for Projects and doesn't yet include: Project create/update/delete, locales, user assignment, or API-token management (all still Laravel-only for now); the Users self-service profile screens; or anything from Collections/Content/Media (Phases 2-4). The exit criteria for this phase is being able to log in and browse the project list on the new stack in staging — write paths and the rest of the admin surface come next.

## Suggested next step

Phase 2 (Media Library) per the roadmap — it's the most self-contained remaining module and a good next build. Alternatively, if you'd rather see the Aperture visual direction actually applied to what's here before going further, that's a reasonable detour too.
