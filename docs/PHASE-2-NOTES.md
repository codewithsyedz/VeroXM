# Phase 2 — Media Library

What's built, an important caveat about type verification in this environment, and what's deliberately left for later.

## What's built

- **NestJS (`apps/api`)**: a `MediaModule` nested under `/projects/:projectId/media`, with `GET` (list, paginated 24/page + `search`), `POST /upload` (multipart), `PATCH /:id` (caption), and `DELETE /:id` — all behind `JwtAuthGuard`. A `StorageFactory` picks between a `LocalStorageProvider` and an `S3StorageProvider` per project, based on the project's `disk` column, exactly like the legacy app.
- **Next.js (`apps/web`)**: a project-scoped Media Library screen (`/projects/[projectId]/media`) — an upload form, a grid of files with thumbnails, inline caption editing, and delete — all wired through Server Actions (`actions.ts`) rather than hand-rolled API route proxies.
- The Projects list now links to each project's Media Library.

## The storage design: management moves now, serving stays on Laravel

This is the one architectural decision in this phase worth understanding before touching it. The new backend now **manages** media (uploads, deletes, captions, thumbnail generation) and writes to the exact same physical location and filename convention the legacy app uses (`public/{project.uuid}/{filename}`, thumbnails alongside in a `thumbnails/` folder) — sharing the same MySQL `media` table, so either stack's admin screen shows every file regardless of which one uploaded it.

But **serving** the actual file bytes over HTTP still goes through the legacy Laravel app's existing `uploads/{uuid}/{file}` route — the new stack's `LocalStorageProvider.urlFor()` deliberately builds a URL pointing back at `APP_URL` (the legacy app's own domain), not at itself. This is intentional strangler-fig sequencing: moving the *management* surface first, while the *serving* path (which is what any consumer, and every `<img>` tag, actually hits) stays put until a later phase decides how it cuts over — either by teaching the new stack to serve uploads directly, or by leaving that route on Laravel indefinitely and proxying it. Don't "fix" this without deciding that question first.

For this to actually work as a shared volume in local dev, `LOCAL_MEDIA_ROOT` (`apps/api/.env`) needs to point at the legacy repo's `storage/app/public` directory — see the comment in `apps/api/.env.example` for the relative path from this project's layout.

## An important caveat: Prisma types were never really checked here

Worth being direct about this rather than letting "the build passed" imply more than it does. I went to check why a stray `import type { Media } from '@mycms/db'` failed, and found that in this environment, `prisma generate` never got far enough to write real generated types — `node_modules/.prisma/client/index.d.ts` still has Prisma's own placeholder stub, where `PrismaClient` is literally typed as `any`. That means every `this.prisma.project.findMany(...)`-style call in both Phase 1 and Phase 2 has been syntax-checked, but **not actually type-checked against the real schema** — TypeScript let it through because the whole client is untyped here, not because it verified the shapes are correct.

Practically: the code is written correctly against the schema as I read it, and `MediaService` now uses an explicit local `MediaRow` type (not a Prisma-generated one) specifically to avoid depending on this. But once `npm run db:generate` actually completes on your machine — with real network access to `binaries.prisma.sh` — please re-run `nest build` and `npx tsc --noEmit` in `apps/web` once more. If the real generated types disagree with anything here (a column type, a nullable field), that's the moment it'll surface, and it hasn't been possible to catch from inside this session.

## Two known encoding gaps (legacy parity, not bugs)

- **BMP thumbnails**: `sharp` has no BMP encoder. A BMP upload still gets stored and appears in the library, but its "thumbnail" is just a copy of the original rather than a resized 600px version.
- **GIF thumbnails**: `sharp`'s GIF write support depends on the libvips build it's compiled against, so this is a "should work, hasn't been verified end-to-end" item rather than a confirmed gap.

Both fall back gracefully (the upload never fails because of this) rather than silently producing a broken thumbnail.

## Deliberately not in this phase

- **Per-project role authorization.** The legacy `MediaLibraryController` additionally requires `super_admin`, or an `admin{project_id}`/`editor{project_id}` role (Spatie permissions, one dynamic role per project). Phase 2's guard only checks "is this a valid logged-in user" — anyone with a session can manage any project's media right now. This needs the Spatie roles/permissions tables ported into Prisma and a real authorization check added to `MediaController` before this can replace the Laravel admin for a team with more than one project.
- **Bulk delete** (`deleteSelected` in the legacy app) and **rename-on-caption-update** (the legacy `update` endpoint can rename the file, not just its caption) — both skipped for this pass; single-file delete and caption-only update cover the MVP.

## Suggested next step

Phase 3 (Collections & Fields) is the next module per the roadmap, and the most complex remaining admin screen (the schema-builder UI). The per-project role authorization gap above is also a reasonable thing to close out before either Phase 2 or 3 goes anywhere near a real multi-user project.
