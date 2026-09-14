# VeroXM — Next.js + Node.js Rewrite

This is the new project folder for migrating `cms.node2cloud.com` (Laravel 8 + Vue 2) to a **Next.js frontend + NestJS/Prisma backend**, kept separate from the legacy repo so the two codebases never collide during the migration.

Start here:
- [`docs/ARCHITECTURE-MIGRATION-PLAN.md`](./docs/ARCHITECTURE-MIGRATION-PLAN.md) — the full architecture audit, target design, and phased migration roadmap.
- [`docs/ART-DIRECTION.md`](./docs/ART-DIRECTION.md) — the "Aperture" cinematic-luxury art direction for the marketing site and the dashboard, as one design system.
- [`docs/PHASE-1-NOTES.md`](./docs/PHASE-1-NOTES.md) — what Phase 1 built, the auth token design, and how to run it locally.
- [`docs/PHASE-2-NOTES.md`](./docs/PHASE-2-NOTES.md) — what Phase 2 built, the storage/serving split, and an important caveat about Prisma type-checking in this environment.
- [`docs/PHASE-3-NOTES.md`](./docs/PHASE-3-NOTES.md) — what Phase 3 built (Collections & Fields schema builder) and the legacy parity decisions behind it.
- [`docs/PHASE-4-NOTES.md`](./docs/PHASE-4-NOTES.md) — what Phase 4 built (Content CRUD / the EAV engine), the legacy parity decisions, and the deliberate deviations.
- [`docs/PHASE-5-NOTES.md`](./docs/PHASE-5-NOTES.md) — what Phase 5 built (public Content API v2 + a v1 shim), the token-compatibility design, and the where[] DSL deviations.
- [`docs/PHASE-6-NOTES.md`](./docs/PHASE-6-NOTES.md) — what Phase 6 built (per-project role authorization) and the pre-cutover checklist + cutover runbook for going live.
- [`docs/DOCKER-DEV-SETUP.md`](./docs/DOCKER-DEV-SETUP.md) — run `api`, `web`, and `db` in Docker locally, each in its own container, seeded with a real copy of production data.

Legacy source (read from, never written to, during this migration): `../cms.node2cloud.com`.

## Repo layout

```
apps/web/      Next.js app — route groups (marketing) and (dashboard)
apps/api/      NestJS app — one module stub per legacy controller
packages/db/   Prisma schema, ported from the legacy MySQL schema
packages/shared-types/   Field-type registry shared by web + api
infra/         Strangler-fig reverse-proxy sketch (nginx.conf.sample)
```

Dependencies are installed (`npm install --legacy-peer-deps` — a plain
`npm install` currently hits an npm/arborist bug from NestJS's vitest
peer deps; use the flag until npm is upgraded past it). `packages/db`'s
`prisma generate` needs network access to `binaries.prisma.sh` that
this environment didn't have — run it from your normal dev machine
once `DATABASE_URL` points at a real (staging) database.

## Running it locally with Docker

```
cp .env.example .env
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env
docker compose up --build
```

Then open `http://localhost:8080`. `api`, `web`, and `db` each run in
their own container; `db` has no port published to the host — it's only
reachable from `api`/`web`, everything external goes through the
`gateway` container. See
[`docs/DOCKER-DEV-SETUP.md`](./docs/DOCKER-DEV-SETUP.md) for seeding
`db` with a real copy of production data, and for what's different
about this setup versus a real production build.

## Status

- [x] Phase 0 groundwork: architecture audit + migration plan
- [x] Phase 0 groundwork: art direction & visual concept
- [x] Repo/monorepo scaffold (`apps/web`, `apps/api`, `packages/db`) — dependencies installed
- [x] Phase 1: Auth (NextAuth + bcrypt) and Projects (read) — login screen, protected Projects list, both apps build clean
- [ ] Phase 1: verify login against a real user account (needs a live DB connection)
- [x] Phase 2: Media Library — upload/list/delete/caption, local + S3 storage providers
- [x] Phase 2/6: per-project role authorization (super_admin / admin{project} / editor{project}, ported from Spatie roles)
- [ ] Verify Prisma types once `db:generate` runs with real network access (see Phase 2 notes)
- [x] Phase 3: Collections & Fields
- [x] Phase 4: Content CRUD (EAV engine)
- [x] Phase 5: Public Content API v2 + v1 shim
- [x] Phase 6: Cutover & decommission legacy — role authorization port + cutover runbook (see Phase 6 notes; actual staging verification and DNS/nginx cutover still to be executed by the team)
